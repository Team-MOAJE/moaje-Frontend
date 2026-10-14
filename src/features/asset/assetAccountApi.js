// Asset 계좌 API 통신 레이어 (API-11 계좌 상세+거래, API-12 거래 단건, API-13 거래 목록, API-14 계좌 Refresh).
// 기준: docs/moaje-frontend-api-guide-20261011(최신화).pdf(20261014 반영), 백엔드 moaje-asset 소스(AccountController, AccountDetailModels 읽기 확인).
//
// 이 모듈은 HTTP 호출·응답 검증/변환만 담당한다. 화면/Redux를 알지 못한다.
//
// 계약
// - 공통 규칙(직접 응답, 큰 정수 id 문자열 보관, 오류 분류)은 assetResponse.js를 따른다.
// - 거래 금액(amount)은 부호 없는 절대값이다. 입금/출금 방향은 type(DEPOSIT/WITHDRAW/TRANSFER/REVERSAL)으로 판단한다. 여기서 부호를 붙이지 않는다.
// - 거래 목록은 50건 고정 커서 방식이다. 다음 페이지는 응답의 nextCursor를 lastTransactionId로 보낸다. 기간 필터·size 파라미터는 서버에 없다.
// - createdAt/lastSyncedAt은 서버 문자열(타임존 없는 LocalDateTime)을 변환 없이 보존한다.
// - 계좌 상태: syncStatus가 RECONCILING이면 refreshing=true, STALE이면 refreshFailed=true와 message가 함께 온다. 서버 값을 그대로 전달한다.
// - API-14는 본문 없는 POST다(빈 객체를 보내지 않는다). Banking을 거쳐 Mock Banking을 조회하므로 느릴 수 있고 자동 재시도하지 않는다.
// - 오류 본문은 Spring ProblemDetail(title=코드, detail)이다. 현재 공통 오류 분류는 HTTP status까지만 구분한다(title/detail 읽기는 별도 승인 항목).
import apiClient from '../../services/apiClient';
import { API_ENDPOINTS } from '../../constants/apiEndpoints';
import { quoteLargeIntegers } from '../../utils/losslessJson';
import {
  ACCOUNT_STATUSES,
  ACCOUNT_SYNC_STATUSES,
  ASSET_REQUEST_ERROR,
  TRANSACTION_CATEGORIES,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
  invalidResponse,
  isBoolean,
  isDateTimeString,
  isFiniteNumber,
  isAccountNumber,
  isNonEmptyString,
  isString,
  isValidLongId,
  oneOf,
  optionalField,
  optionalId,
  requestError,
  requireAccountId,
  requireField,
  requireId,
  requireObject,
  requireTransactionId,
} from './assetResponse';

// ── 응답 검증/변환 ───────────────────────────────────────────

// 거래 1건 (API-11 transactionHistory[], API-12, API-13 transactions[]).
export const mapAccountTransaction = (item, field = 'transaction') => {
  requireObject(item, field);

  return {
    transactionId: requireId(item, 'transactionId', field),
    publicTransactionId: requireField(item, 'publicTransactionId', isNonEmptyString, field),
    type: requireField(item, 'type', oneOf(TRANSACTION_TYPES), field),
    ...mapMoney(item, 'amount', field, { allowNegative: false }),
    targetAccountId: optionalField(item, 'targetAccountId', isString, field),
    status: requireField(item, 'status', oneOf(TRANSACTION_STATUSES), field),
    merchantName: optionalField(item, 'merchantName', isString, field),
    categoryCode: requireField(item, 'categoryCode', oneOf(TRANSACTION_CATEGORIES), field),
    createdAt: requireField(item, 'createdAt', isDateTimeString, field),
  };
};

const mapTransactionList = (value, field) => {
  if (!Array.isArray(value)) throw invalidResponse(field);
  return value.map((item, index) => mapAccountTransaction(item, `${field}[${index}]`));
};

// 커서 필드: hasNext=true면 nextCursor가 있어야 다음 페이지를 요청할 수 있다. 어긋나면 응답 오류로 본다.
const readCursor = (body, field) => {
  const nextCursor = optionalId(body, 'nextCursor', field);
  const hasNext = requireField(body, 'hasNext', isBoolean, field);
  if (hasNext && nextCursor === null) throw invalidResponse(`${field}.nextCursor`);
  return { nextCursor, hasNext };
};

// ── 금액(balance·amount) 원문 보존: API-11~14, API-52 ──────────
// 서버 balance·amount는 JSON 숫자(BigDecimal, 예: 12345.6789 / 10000.0000)다. JSON.parse를 거치면 소수부와 자릿수가 사라지거나
// 반올림되어 "정수처럼 보이는" 값과 구별할 수 없다. 그래서 이 모듈의 요청에서만 파싱 전에 "balance"·"amount" 키의 숫자 원문을
// 표식이 붙은 문자열로 감싸 매퍼가 원문으로 정확 여부를 판정한다. 응답 계약(JSON 숫자)은 바꾸지 않는다.
// 표식 없는 JSON 문자열 금액("10000")은 서버 계약 위반이므로 매퍼가 거부한다.
const MONEY_TOKEN_PREFIX = '#balance-token#';
const MONEY_KEY_LITERALS = Object.freeze(['"balance"', '"amount"']);
const NUMBER_TOKEN = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/;

// 문자열 리터럴 바깥의 키 뒤 숫자 원문을 표식 문자열로 감싼다. 다른 키·값은 건드리지 않는다.
const quoteMoneyTokens = (text, keyLiterals) => {
  let result = '';
  let index = 0;
  const length = text.length;

  while (index < length) {
    if (text[index] !== '"') {
      result += text[index];
      index += 1;
      continue;
    }

    let end = index + 1;
    while (end < length) {
      if (text[end] === '\\') end += 2;
      else if (text[end] === '"') break;
      else end += 1;
    }
    const literal = text.slice(index, end + 1);
    result += literal;
    index = end + 1;

    if (!keyLiterals.includes(literal)) continue;

    let cursor = index;
    while (cursor < length && /\s/.test(text[cursor])) cursor += 1;
    if (text[cursor] !== ':') continue;
    cursor += 1;
    while (cursor < length && /\s/.test(text[cursor])) cursor += 1;

    const match = NUMBER_TOKEN.exec(text.slice(cursor, cursor + 64));
    if (!match) continue;
    result += `${text.slice(index, cursor)}"${MONEY_TOKEN_PREFIX}${match[0]}"`;
    index = cursor + match[0].length;
  }

  return result;
};

// API-52 목록 테스트 호환용 export(balance 키만 대상).
export const quoteBalanceTokens = text => quoteMoneyTokens(text, ['"balance"']);

// 이 모듈 요청 전용 transformResponse. 큰 정수 id 보호(quoteLargeIntegers)와 금액 원문 보존을 함께 적용한다.
// 파싱 실패 시 axios 기본 동작처럼 원문을 돌려주며, 매퍼가 invalidResponse로 거부한다.
export const accountMoneyTransformResponse = data => {
  if (typeof data !== 'string' || data === '') return data;
  try {
    return JSON.parse(quoteLargeIntegers(quoteMoneyTokens(data, MONEY_KEY_LITERALS)));
  } catch {
    return data;
  }
};
export const accountListTransformResponse = accountMoneyTransformResponse;

const MONEY_REQUEST_OPTIONS = Object.freeze({
  responseFormat: 'raw',
  transformResponse: [accountMoneyTransformResponse],
});

// 금액 필드: 표식 문자열(원문)만 정확 판정 대상이다. 정수(또는 소수부가 모두 0)이고 안전 정수 범위면 exact.
// 그 밖(소수부 있음, 지수 표기, 범위 초과, transform 미적용 Number)은 반올림·절사 없이 값=null, exact=false.
// allowNegative=false(거래 amount)이면 음수는 서버 계약 위반으로 거부한다.
const EXACT_INTEGER_TOKEN = /^-?\d+(\.0+)?$/;

const readMoney = (item, key, field, allowNegative) => {
  const value = requireField(
    item,
    key,
    v => isFiniteNumber(v) || (typeof v === 'string' && v.startsWith(MONEY_TOKEN_PREFIX)),
    field
  );
  if (typeof value === 'number') {
    if (!allowNegative && value < 0) throw invalidResponse(`${field}.${key}`);
    return { value: null, exact: false };
  }

  const token = value.slice(MONEY_TOKEN_PREFIX.length);
  if (!NUMBER_TOKEN.test(token) || NUMBER_TOKEN.exec(token)[0] !== token) {
    throw invalidResponse(`${field}.${key}`);
  }
  if (!allowNegative && token.startsWith('-') && /[1-9]/.test(token)) {
    throw invalidResponse(`${field}.${key}`);
  }
  if (!EXACT_INTEGER_TOKEN.test(token)) return { value: null, exact: false };

  const parsed = Number(token.split('.')[0]);
  if (!Number.isSafeInteger(parsed)) return { value: null, exact: false };
  return { value: parsed === 0 ? 0 : parsed, exact: true };
};

// { balance, balanceExact } / { amount, amountExact } 형태로 펼친다.
const mapMoney = (item, key, field, { allowNegative = true } = {}) => {
  const { value, exact } = readMoney(item, key, field, allowNegative);
  return { [key]: value, [`${key}Exact`]: exact };
};

const mapBalance = (item, field) => mapMoney(item, 'balance', field);

// API-52 계좌 1건(최신 명세 20261014): { accountId, bankCode, bankName, balance, status }.
// syncStatus·lastSyncedAt·createdAt은 목록 응답에서 제거됐으므로 읽지도, 만들지도 않는다(없는 값은 호출부에서 null).
const mapAccountListItem = (item, field) => {
  requireObject(item, field);

  return {
    accountId: requireId(item, 'accountId', field),
    bankCode: optionalField(item, 'bankCode', isString, field),
    bankName: optionalField(item, 'bankName', isString, field),
    // 서버가 마스킹한 표시용 번호(예: **********1234). 전체 번호는 목록에 오지 않으며 앱도 마스킹을 만들지 않는다.
    maskedAccountNumber: optionalField(item, 'maskedAccountNumber', isString, field),
    ...mapBalance(item, field),
    status: requireField(item, 'status', oneOf(ACCOUNT_STATUSES), field),
  };
};

// API-52 응답. 최신 명세는 루트 배열이다(구 소스의 { accounts: [...] } 객체형은 계약이 아니므로 거부한다).
// 빈 배열은 정상이다. 서버 순서를 유지하고, 호출부 호환을 위해 { accounts }로 감싸 돌려준다.
export const mapAccountListResponse = body => {
  const field = 'accountList';
  if (!Array.isArray(body)) throw invalidResponse(field);
  return {
    accounts: body.map((item, index) => mapAccountListItem(item, `${field}[${index}]`)),
  };
};

// API-11 / API-14 응답 (두 API의 본문 형식이 같다).
export const mapAccountDetailResponse = (body, field = 'accountDetail') => {
  requireObject(body, field);

  return {
    accountId: requireId(body, 'accountId', field),
    bankCode: optionalField(body, 'bankCode', isString, field),
    bankName: optionalField(body, 'bankName', isString, field),
    // 실제 계좌번호(서버가 14자리 숫자 문자열로 보장). 없으면 null이며 다른 필드로 대신 만들지 않는다.
    // 구버전 displayAccountNumber/maskedAccountNumber는 최신 서버에서 제거되어 읽지 않는다.
    accountNumber: optionalField(body, 'accountNumber', isAccountNumber, field),
    ...mapBalance(body, field),
    syncStatus: requireField(body, 'syncStatus', oneOf(ACCOUNT_SYNC_STATUSES), field),
    refreshing: requireField(body, 'refreshing', isBoolean, field),
    refreshFailed: requireField(body, 'refreshFailed', isBoolean, field),
    message: optionalField(body, 'message', isString, field),
    lastSyncedAt: optionalField(body, 'lastSyncedAt', isDateTimeString, field),
    transactionHistory: mapTransactionList(
      requireField(body, 'transactionHistory', Array.isArray, field),
      `${field}.transactionHistory`
    ),
    ...readCursor(body, field),
  };
};

// API-12 응답.
export const mapAccountTransactionResponse = body =>
  mapAccountTransaction(body, 'accountTransaction');

// API-13 응답. 빈 배열은 정상이다(가짜 거래를 만들지 않음). 서버가 준 순서(최신순)를 유지한다.
export const mapAccountTransactionsResponse = body => {
  const field = 'accountTransactions';
  requireObject(body, field);

  return {
    transactions: mapTransactionList(
      requireField(body, 'transactions', Array.isArray, field),
      `${field}.transactions`
    ),
    ...readCursor(body, field),
  };
};

// ── 요청 구성/검증 ───────────────────────────────────────────

// API-13 쿼리. 입력: { lastTransactionId? }(이전 응답의 nextCursor 문자열). 첫 페이지는 키를 보내지 않는다.
export const buildTransactionsQuery = query => {
  const lastTransactionId = query?.lastTransactionId;
  if (lastTransactionId === undefined || lastTransactionId === null) return {};

  if (!isValidLongId(lastTransactionId)) {
    throw requestError(
      ASSET_REQUEST_ERROR.INVALID_CURSOR,
      'lastTransactionId는 숫자로만 이루어진 문자열이어야 합니다.'
    );
  }
  return { lastTransactionId };
};

// ── API 함수 ─────────────────────────────────────────────────

// API-52 GET /api/v1/assets/accounts (경로·쿼리·본문 없음, 자동 재시도 없음)
export const fetchAccountList = async () => {
  const body = await apiClient.get(API_ENDPOINTS.ASSET.ACCOUNTS, {
    responseFormat: 'raw',
    transformResponse: [accountListTransformResponse],
  });
  return mapAccountListResponse(body);
};

// API-11 GET /api/v1/assets/accounts/{accountId}/detail
export const fetchAccountDetail = async accountId => {
  requireAccountId(accountId);
  const body = await apiClient.get(
    API_ENDPOINTS.ASSET.ACCOUNT_DETAIL(accountId),
    MONEY_REQUEST_OPTIONS
  );
  return mapAccountDetailResponse(body);
};

// API-12 GET /api/v1/assets/accounts/{accountId}/{transactionId}/transaction
export const fetchAccountTransaction = async (accountId, transactionId) => {
  requireAccountId(accountId);
  requireTransactionId(transactionId);
  const body = await apiClient.get(
    API_ENDPOINTS.ASSET.ACCOUNT_TRANSACTION(accountId, transactionId),
    MONEY_REQUEST_OPTIONS
  );
  return mapAccountTransactionResponse(body);
};

// API-13 GET /api/v1/assets/accounts/{accountId}/transactions?lastTransactionId=
export const fetchAccountTransactions = async (accountId, query) => {
  requireAccountId(accountId);
  const params = buildTransactionsQuery(query);
  const body = await apiClient.get(API_ENDPOINTS.ASSET.ACCOUNT_TRANSACTIONS(accountId), {
    ...MONEY_REQUEST_OPTIONS,
    params,
  });
  return mapAccountTransactionsResponse(body);
};

// API-14 POST /api/v1/assets/accounts/{accountId}/refresh (본문 없음)
export const refreshAccount = async accountId => {
  requireAccountId(accountId);
  const body = await apiClient.post(
    API_ENDPOINTS.ASSET.ACCOUNT_REFRESH(accountId),
    undefined,
    MONEY_REQUEST_OPTIONS
  );
  return mapAccountDetailResponse(body, 'accountRefresh');
};
