// Banking API 통신 레이어 (API-09 Mock 계좌 개설, API-10 송금 요청).
// 기준: docs/moaje-frontend-api-guide-20261011(최신화).pdf(20261014 반영), 백엔드 moaje-banking 소스(AccountController, TransferController 읽기 확인).
//
// 이 모듈은 HTTP 호출·요청 본문 구성·응답 검증/변환만 담당한다. 화면/Redux를 알지 못한다.
//
// 계약
// - 공통 규칙(직접 응답, 큰 정수 id 문자열 보관, 오류 분류)은 assetResponse.js를 따른다.
// - API-09: 서버가 소유자를 JWT(Principal)에서 정한다. 본문 userId는 구버전 호환용이라 보내지 않는다.
//   ci·phoneNumber·userName은 개인정보라 로그·오류 메시지·Redux에 남기지 않는다. 부작용이 있는 POST이므로 자동 재시도하지 않는다.
// - API-10: Idempotency-Key 헤더가 필수다(없으면 400 MISSING_IDEMPOTENCY_KEY). 같은 송금 의도의 재시도는 같은 키를,
//   새 송금은 새 키를 쓴다. apiClient가 요청 시작 시 키를 config에 고정하므로 내부 refresh 재전송에서도 키가 유지된다.
//   이 모듈은 네트워크 오류에도 자동 재실행하지 않는다. 호출부는 응답 status(ACCEPTED/PROCESSING/COMPLETED/FAILED/REVERSED)를
//   구분해 처리해야 하며, 응답을 받았다는 사실만으로 송금 성공으로 취급하지 않는다.
// - withdrawalAccountId는 TSID Long이며 최신 명세(20261014)부터 JSON 문자열로 보낸다(Number 변환 금지).
// - 금액은 원 단위 양의 정수(JSON 숫자). currency 기본값은 서버와 같은 'KRW'이다.
import apiClient from '../../services/apiClient';
import { API_ENDPOINTS } from '../../constants/apiEndpoints';
import { API_HEADERS } from '../../constants/apiHeaders';
import { ensureIdempotencyKey } from '../../utils/idempotencyKey';
import {
  ASSET_REQUEST_ERROR,
  ASSET_REQUEST_OPTIONS,
  isAccountNumber,
  isDateTimeString,
  isNonEmptyString,
  isNonNegativeSafeInteger,
  isString,
  oneOf,
  optionalField,
  requestError,
  requireAccountId,
  requireField,
  requireId,
  requireInputObject,
  requireObject,
} from './assetResponse';

export const BANKING_ACCOUNT_STATUS = Object.freeze({ ACTIVE: 'ACTIVE', CANCELED: 'CANCELED' });
export const TRANSFER_STATUS = Object.freeze({
  ACCEPTED: 'ACCEPTED',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  REVERSED: 'REVERSED',
});

export const DEFAULT_TRANSFER_CURRENCY = 'KRW';

const JSON_BODY_HEADERS = Object.freeze({ [API_HEADERS.CONTENT_TYPE]: 'application/json' });

// ── 응답 검증/변환 ───────────────────────────────────────────

// API-09 응답. userId는 소유자 확인용 문자열이며 그대로 보존한다.
export const mapOpenAccountResponse = body => {
  const field = 'openAccount';
  requireObject(body, field);

  return {
    accountId: requireId(body, 'accountId', field),
    userId: requireField(body, 'userId', isNonEmptyString, field),
    bankCode: requireField(body, 'bankCode', isNonEmptyString, field),
    bankName: optionalField(body, 'bankName', isString, field),
    // 개설된 실제 계좌번호(14자리 숫자 문자열, 최신 서버 필수). 로그·오류 메시지에 값을 넣지 않는다.
    accountNumber: requireField(body, 'accountNumber', isAccountNumber, field),
    productName: requireField(body, 'productName', isNonEmptyString, field),
    balance: requireField(body, 'balance', isNonNegativeSafeInteger, field),
    status: requireField(body, 'status', oneOf(Object.values(BANKING_ACCOUNT_STATUS)), field),
    createdAt: requireField(body, 'createdAt', isDateTimeString, field),
    canceledAt: optionalField(body, 'canceledAt', isDateTimeString, field),
  };
};

// API-10 응답.
export const mapTransferResponse = body => {
  const field = 'transfer';
  requireObject(body, field);

  return {
    transferId: requireId(body, 'transferId', field),
    publicTransferId: requireField(body, 'publicTransferId', isNonEmptyString, field),
    status: requireField(body, 'status', oneOf(Object.values(TRANSFER_STATUS)), field),
    message: requireField(body, 'message', isString, field),
    externalTransactionId: optionalField(body, 'externalTransactionId', isNonEmptyString, field),
  };
};

// ── 요청 구성/검증 ───────────────────────────────────────────

const requireNonEmpty = (value, name) => {
  if (!isNonEmptyString(value)) {
    throw requestError(
      ASSET_REQUEST_ERROR.INVALID_INPUT,
      `${name}은(는) 비어 있지 않은 문자열이어야 합니다.`
    );
  }
  return value;
};

const MAX_BANK_CODE_LENGTH = 20;
const MAX_BANK_NAME_LENGTH = 100;

// API-09 요청 본문(JSON 문자열). 입력: { ci, userName, phoneNumber, bankCode, bankName, productName, initialBalance }.
// bankName은 최신 명세(20261014)에서 필수다(≤100자, bankCode ≤20자). 오류 메시지에는 입력 값을 넣지 않는다(개인정보).
export const buildOpenAccountRequestBody = input => {
  requireInputObject(input, '계좌 개설');
  const { ci, userName, phoneNumber, bankCode, bankName, productName, initialBalance } = input;

  requireNonEmpty(ci, 'ci');
  requireNonEmpty(userName, 'userName');
  requireNonEmpty(phoneNumber, 'phoneNumber');
  requireNonEmpty(bankCode, 'bankCode');
  requireNonEmpty(bankName, 'bankName');
  if (bankCode.length > MAX_BANK_CODE_LENGTH || bankName.length > MAX_BANK_NAME_LENGTH) {
    throw requestError(
      ASSET_REQUEST_ERROR.INVALID_INPUT,
      'bankCode는 20자, bankName은 100자 이하여야 합니다.'
    );
  }
  requireNonEmpty(productName, 'productName');
  if (!isNonNegativeSafeInteger(initialBalance)) {
    throw requestError(
      ASSET_REQUEST_ERROR.INVALID_AMOUNT,
      'initialBalance는 0 이상의 정수(원)여야 합니다.'
    );
  }

  return JSON.stringify({
    ci,
    userName,
    phoneNumber,
    bankCode,
    bankName,
    productName,
    initialBalance,
  });
};

// API-10 요청 본문(JSON 문자열). 입력: { withdrawalAccountId(숫자 문자열), depositBankCode, depositAccountNumber, amount, currency? }.
// 은행명·메모 등 명세에 없는 필드는 보내지 않는다.
export const buildTransferRequestBody = input => {
  requireInputObject(input, '송금');
  const { withdrawalAccountId, depositBankCode, depositAccountNumber, amount } = input;
  const currency = input.currency ?? DEFAULT_TRANSFER_CURRENCY;

  requireAccountId(withdrawalAccountId);
  requireNonEmpty(depositBankCode, 'depositBankCode');
  requireNonEmpty(depositAccountNumber, 'depositAccountNumber');
  requireNonEmpty(currency, 'currency');
  if (!Number.isSafeInteger(amount) || amount < 1) {
    throw requestError(
      ASSET_REQUEST_ERROR.INVALID_AMOUNT,
      'amount는 1 이상의 정수(원)여야 합니다.'
    );
  }

  // 최신 명세(20261014): withdrawalAccountId는 JSON 문자열. 검증된 숫자 문자열을 Number 변환 없이 그대로 담는다.
  return JSON.stringify({
    withdrawalAccountId,
    depositBankCode,
    depositAccountNumber,
    amount,
    currency,
  });
};

// ── API 함수 ─────────────────────────────────────────────────

// API-09 POST /api/v1/banking/accounts (HTTP 201)
// 자동 재시도·멱등 키 없음. 사용자 동작에서만 호출한다. 성공 시 서버가 만든 계좌(accountId 포함)를 돌려준다.
export const openBankingAccount = async input => {
  const requestBody = buildOpenAccountRequestBody(input);
  const body = await apiClient.post(API_ENDPOINTS.BANKING.ACCOUNTS, requestBody, {
    ...ASSET_REQUEST_OPTIONS,
    headers: JSON_BODY_HEADERS,
  });
  return mapOpenAccountResponse(body);
};

// API-10 POST /api/v1/banking/transfers
// idempotencyKey: 같은 송금 의도를 다시 보낼 때 처음 쓴 키를 그대로 전달한다. 비어 있으면 새 키를 만든다.
// 반환: { transfer, idempotencyKey } — 호출부가 키를 보관했다가 재시도에 사용한다(오류 시에는 호출부가 보낸 키를 계속 쓴다).
export const requestTransfer = async (input, { idempotencyKey } = {}) => {
  const requestBody = buildTransferRequestBody(input);
  const key = ensureIdempotencyKey(idempotencyKey);
  const body = await apiClient.post(API_ENDPOINTS.BANKING.TRANSFERS, requestBody, {
    ...ASSET_REQUEST_OPTIONS,
    headers: JSON_BODY_HEADERS,
    idempotent: true,
    idempotencyKey: key,
  });
  return { transfer: mapTransferResponse(body), idempotencyKey: key };
};
