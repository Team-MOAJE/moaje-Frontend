// Banking·Asset API 통신 레이어(bankingApi, assetAccountApi, cashflowApi)가 함께 쓰는 검증 도구.
// 기준: docs/moaje-frontend-api-guide-20261011.pdf API-09~17, 백엔드 moaje-banking·moaje-asset 소스(읽기 확인).
//
// 공통 계약
// - Banking·Asset은 Envelope 없는 직접 응답이므로 요청마다 responseFormat: 'raw'를 쓰고, 구조를 여기서 검증한 뒤 camelCase 모델로 돌려준다.
//   검증에 실패한 응답은 정상 데이터로 돌려주지 않고 invalidResponse로 reject한다(값 보정·항목 제외·기본값 대입 없음).
// - accountId·transactionId·transferId·nextCursor는 TSID Long(2^53 초과 가능)이다. 요청별 transformResponse(losslessTransformResponse)로
//   16자리 이상 정수를 문자열로 받고, 모든 id는 "양의 정수 숫자 문자열"로만 보관한다. Number로 바꾸지 않는다.
//   15자리 이하 id는 JSON 숫자로 와도 안전하므로 문자열로 정규화해 받는다.
// - 서버가 명세상 "문자열/null"로 정의한 필드(bankCode, message, nextCursor 등)는 키가 없거나 null이면 null로 읽는다
//   (Jackson 설정에 따라 null 필드가 생략될 수 있다). 필수 필드는 키 누락도 오류다.
import { API_ERROR_KIND, createApiError } from '../../services/apiResponse';
import { losslessTransformResponse } from '../../utils/losslessJson';
import {
  ONBOARDING_ERROR_TYPE,
  OnboardingRequestError,
  getOnboardingErrorType,
  isValidOnboardingUserId,
} from '../onboarding/onboardingApi';

// 모든 Banking·Asset 요청: 직접 응답 + 큰 정수 id를 잃지 않는 파싱.
export const ASSET_REQUEST_OPTIONS = Object.freeze({
  responseFormat: 'raw',
  transformResponse: [losslessTransformResponse],
});

export const ASSET_REQUEST_ERROR = Object.freeze({
  INVALID_ACCOUNT_ID: 'INVALID_ACCOUNT_ID',
  INVALID_TRANSACTION_ID: 'INVALID_TRANSACTION_ID',
  INVALID_CURSOR: 'INVALID_CURSOR',
  INVALID_INPUT: 'INVALID_INPUT',
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  INVALID_YEAR_MONTH: 'INVALID_YEAR_MONTH',
});

// 서비스 공통 오류 분류(네트워크·타임아웃·401·403·404·4xx·5xx·invalidResponse)를 그대로 쓴다.
// 409(IDEMPOTENCY_KEY_CONFLICT 등)는 CLIENT_ERROR로 분류되며 세부 구분은 error.code(Banking 본문 code)를 본다.
// 계좌 상세(API-11/14)에서 실제 계좌번호 조회에 실패하면 서버가 상세 전체를 502로 내린다(ProblemDetail title).
export const ACCOUNT_NUMBER_UNAVAILABLE_CODE = 'ACCOUNT_NUMBER_UNAVAILABLE';
export const isAccountNumberUnavailableError = error =>
  error?.status === 502 && error?.code === ACCOUNT_NUMBER_UNAVAILABLE_CODE;

export const ASSET_ERROR_TYPE = ONBOARDING_ERROR_TYPE;
export const getAssetErrorType = getOnboardingErrorType;

export const requestError = (code, message) => new OnboardingRequestError(code, message);

// ── 요청 입력 검증 ───────────────────────────────────────────

// 양의 Long 숫자 문자열(1 ~ 2^63-1)만 허용한다. Number 입력은 거부한다(이미 반올림됐을 수 있음).
export const isValidLongId = isValidOnboardingUserId;

export const requireAccountId = value => {
  if (!isValidLongId(value)) {
    throw requestError(
      ASSET_REQUEST_ERROR.INVALID_ACCOUNT_ID,
      'accountId는 숫자로만 이루어진 문자열이어야 합니다.'
    );
  }
  return value;
};

export const requireTransactionId = value => {
  if (!isValidLongId(value)) {
    throw requestError(
      ASSET_REQUEST_ERROR.INVALID_TRANSACTION_ID,
      'transactionId는 숫자로만 이루어진 문자열이어야 합니다.'
    );
  }
  return value;
};

export const isPlainObject = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const requireInputObject = (input, name) => {
  if (!isPlainObject(input)) {
    throw requestError(ASSET_REQUEST_ERROR.INVALID_INPUT, `${name} 입력은 객체여야 합니다.`);
  }
  return input;
};

export const isNonEmptyString = value => typeof value === 'string' && value.trim() !== '';

// 원 단위 금액: 0 이상의 안전 정수(JS Number). Banking·Asset 금액은 숫자 타입이다.
export const isNonNegativeSafeInteger = value => Number.isSafeInteger(value) && value >= 0;

// ── 응답 검증 ────────────────────────────────────────────────

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

// 2xx를 받았지만 본문이 명세와 다를 때. 어느 필드가 문제인지(값은 제외)만 invalidField로 남긴다.
export const invalidResponse = field => {
  const error = createApiError({
    kind: API_ERROR_KIND.BUSINESS,
    message: '서버 응답 형식을 해석할 수 없습니다.',
  });
  error.invalidResponse = true;
  error.invalidField = field;
  return error;
};

export const requireObject = (value, field) => {
  if (!isPlainObject(value)) throw invalidResponse(field);
  return value;
};

// 필수 필드: 키가 있고 조건을 만족해야 한다. 없는 값을 기본값으로 채우지 않는다.
export const requireField = (object, key, predicate, field) => {
  if (!hasOwn(object, key) || !predicate(object[key])) throw invalidResponse(`${field}.${key}`);
  return object[key];
};

// 명세상 "값/null" 필드: 키가 없거나 null이면 null, 값이 있으면 조건을 만족해야 한다.
export const optionalField = (object, key, predicate, field) => {
  const value = hasOwn(object, key) ? object[key] : null;
  if (value === null) return null;
  if (!predicate(value)) throw invalidResponse(`${field}.${key}`);
  return value;
};

export const isString = value => typeof value === 'string';
// 실제 계좌번호: 서버가 보장하는 14자리 숫자 문자열(앞자리 0 보존을 위해 문자열). Number 변환 금지.
export const isAccountNumber = value => typeof value === 'string' && /^[0-9]{14}$/.test(value);
export const isBoolean = value => typeof value === 'boolean';
export const isFiniteNumber = value => typeof value === 'number' && Number.isFinite(value);

// 응답 id → 숫자 문자열. 16자리 이상은 losslessTransformResponse가 문자열로 넘기고, 15자리 이하는 안전한 JSON 숫자로 온다.
// 안전 범위를 넘는 JSON 숫자는 이미 반올림된 값이므로 거부한다.
export const toIdString = value => {
  if (typeof value === 'string') return isValidLongId(value) ? value : null;
  if (Number.isSafeInteger(value) && value >= 1) return String(value);
  return null;
};

const isIdValue = value => toIdString(value) !== null;

export const requireId = (object, key, field) =>
  toIdString(requireField(object, key, isIdValue, field));

export const optionalId = (object, key, field) => {
  const value = optionalField(object, key, isIdValue, field);
  return value === null ? null : toIdString(value);
};

export const oneOf = values => {
  const set = new Set(values);
  return value => typeof value === 'string' && set.has(value);
};

// 명세 enum (API-11~17)
export const ACCOUNT_SYNC_STATUSES = Object.freeze([
  'SYNCED',
  'SYNC_REQUIRED',
  'RECONCILING',
  'STALE',
]);
// API-52 계좌 목록의 status (서버가 상태와 관계없이 전부 내려준다).
export const ACCOUNT_STATUSES = Object.freeze(['ACTIVE', 'SUSPENDED', 'CLOSED']);
export const TRANSACTION_TYPES = Object.freeze(['DEPOSIT', 'WITHDRAW', 'TRANSFER', 'REVERSAL']);
export const TRANSACTION_STATUSES = Object.freeze([
  'PENDING',
  'SUCCESS',
  'CANCELED',
  'UNKNOWN',
  'FAILED',
]);
export const TRANSACTION_CATEGORIES = Object.freeze([
  'INCOME',
  'FOOD',
  'CAFE',
  'TRANSPORT',
  'CULTURE',
  'SHOPPING',
  'STUDY',
  'HOUSING',
  'TRANSFER',
  'OTHER',
  'UNCATEGORIZED',
]);

// 날짜: 서버 값을 변환 없이 보존한다(Asset createdAt은 타임존 없는 LocalDateTime, Banking은 Instant).
export const isDateTimeString = value => isNonEmptyString(value);

export const YEAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
export const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
