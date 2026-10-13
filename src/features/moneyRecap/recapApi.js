// Work Money Recap API 통신 레이어 (API-37 월 목록, API-38 월별 Recap).
// 기준: docs/moaje-frontend-api-guide-20261011.pdf p.39~41, 백엔드 moaje-work 소스(읽기 확인).
//
// 이 모듈은 HTTP 호출·응답 검증/변환만 담당한다. 화면/Redux/AsyncStorage를 알지 못하며 아직 앱 흐름에
// 연결되어 있지 않다(연결은 후속 단계).
//
// 계약
// - 두 API 모두 GET, 요청 본문 없음, Envelope 없는 직접 객체 응답이므로 responseFormat: 'raw'를 명시하고
//   이 모듈에서 구조를 검증한 뒤 camelCase 모델로 변환한다. 검증에 실패한 응답은 정상 데이터로 돌려주지
//   않고 invalidResponse로 reject한다(값 보정·항목 제외·기본값 대입 없음).
// - user_id는 숫자 문자열이다(Auth user_id는 JS 안전 정수 범위 초과). 경로에는 문자열 그대로 넣는다.
//   응답의 user_id는 JSON 파싱 중 정밀도가 손실되므로 읽지도 반환하지도 않는다.
// - 금액(total_*, net_saving, categories[].amount)은 문자열이다. 서버가 str(Decimal)로 직렬화하므로
//   "200000"뿐 아니라 "200000.0000"(Numeric(18,4))도 정상이다. 이 모듈은 Number로 변환하지 않고
//   문자열 그대로 전달한다(표시 변환은 화면 로직의 책임).
// - share(0~1 비율)도 문자열이며 형식이 잘못되면 0 등으로 대체하지 않고 응답 전체를 거부한다.
// - API-38은 GET이지만 서버가 조회할 때마다 RECAP_VIEW 지표를 기록한다. 그래서 어떤 요청도 자동 재시도하지
//   않는다. 다시 조회할지는 호출부(사용자 동작)가 결정한다.
// - API-37은 Recap이 없으면 200 + months [] 이다. API-38은 해당 월 집계가 없으면 404이며 '없음'으로
//   취급할지는 호출부가 NOT_FOUND 오류 종류로 판단한다(이 모듈은 오류를 정상값으로 바꾸지 않는다).
// - 월 목록은 서버가 준 순서(최신순)를 그대로 유지한다. 재정렬하지 않는다.
import apiClient from '../../services/apiClient';
import { API_ENDPOINTS } from '../../constants/apiEndpoints';
import { API_ERROR_KIND, createApiError } from '../../services/apiResponse';
import {
  ONBOARDING_ERROR_TYPE,
  ONBOARDING_REQUEST_ERROR,
  OnboardingRequestError,
  getOnboardingErrorType,
  isValidOnboardingUserId,
} from '../onboarding/onboardingApi';

// 요청을 보내기 전 검증 실패 코드(userId는 ONBOARDING_REQUEST_ERROR.INVALID_USER_ID를 그대로 쓴다).
export const RECAP_REQUEST_ERROR = Object.freeze({
  INVALID_YEAR_MONTH: 'INVALID_YEAR_MONTH',
});

// 명세: year_month는 YYYY-MM. 서버는 월 범위를 검증하지 않지만(2026-13 → 404) 프론트는 01~12만 보낸다.
const YEAR_MONTH_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/;
// 금액: 원 단위 정수 또는 소수 문자열(음수 허용). 선행 0·공백·쉼표·지수 표기·'+' 부호·'1.' '.5' 불허.
const AMOUNT_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
// 비율: 0 이상 1 이하의 10진 문자열. "0", "0.5000", "1", "1.0000"만 허용.
const SHARE_PATTERN = /^(?:0(?:\.\d+)?|1(?:\.0+)?)$/;

export const isValidRecapYearMonth = value =>
  typeof value === 'string' && YEAR_MONTH_PATTERN.test(value);

// ── 응답 검증/변환 ───────────────────────────────────────────

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

// 2xx를 받았지만 본문이 명세와 다를 때. 어느 필드가 문제인지(값은 제외)만 invalidField로 남긴다.
const invalidResponse = field => {
  const error = createApiError({
    kind: API_ERROR_KIND.BUSINESS,
    message: '서버 응답 형식을 해석할 수 없습니다.',
  });
  error.invalidResponse = true;
  error.invalidField = field;
  return error;
};

const isString = value => typeof value === 'string';
const isNonEmptyString = value => typeof value === 'string' && value.trim() !== '';
const isNonNegativeInteger = value => Number.isInteger(value) && value >= 0;
const isAmountString = value => typeof value === 'string' && AMOUNT_PATTERN.test(value);
const isShareString = value => typeof value === 'string' && SHARE_PATTERN.test(value);
const isBoolean = value => typeof value === 'boolean';
const isNullableNonEmptyString = value => value === null || isNonEmptyString(value);
const isNullableString = value => value === null || isString(value);
const isStringArray = value => Array.isArray(value) && value.every(isString);

// 필드가 반드시 존재하고(키 누락 불가) 조건을 만족해야 한다. 없는 값을 기본값으로 채우지 않는다.
const requireField = (object, key, predicate, field) => {
  if (!hasOwn(object, key) || !predicate(object[key])) throw invalidResponse(`${field}.${key}`);
  return object[key];
};

// API-37 응답. 응답의 user_id는 정밀도 손실 값이므로 사용하지 않는다. 서버가 준 순서(최신순) 그대로 반환한다.
export const mapRecapMonthsResponse = body => {
  const field = 'recapMonths';
  if (!isPlainObject(body)) throw invalidResponse(field);

  const months = requireField(body, 'months', Array.isArray, field);
  if (!months.every(isValidRecapYearMonth) || new Set(months).size !== months.length) {
    throw invalidResponse(`${field}.months`);
  }
  return [...months];
};

// categories[] / top_category 공통 항목. amount·share는 문자열 그대로 보존한다.
const mapCategory = (category, field) => {
  if (!isPlainObject(category)) throw invalidResponse(field);

  return {
    code: requireField(category, 'code', isNonEmptyString, field),
    label: requireField(category, 'label', isNonEmptyString, field),
    amount: requireField(category, 'amount', isAmountString, field),
    share: requireField(category, 'share', isShareString, field),
  };
};

const mapCoverage = (coverage, field) => {
  if (!isPlainObject(coverage)) throw invalidResponse(field);

  return {
    totalTx: requireField(coverage, 'total_tx', isNonNegativeInteger, field),
    classifiedTx: requireField(coverage, 'classified_tx', isNonNegativeInteger, field),
    unclassifiedShare: requireField(coverage, 'unclassified_share', isShareString, field),
    isReliable: requireField(coverage, 'is_reliable', isBoolean, field),
    note: requireField(coverage, 'note', isString, field),
  };
};

// API-38 응답. expectedYearMonth가 있으면 응답의 year_month가 요청한 월과 같아야 한다(다른 월 응답 방지).
// tx_count 등 명세에 없는 필드는 읽지 않는다.
export const mapRecapResponse = (body, expectedYearMonth) => {
  const field = 'recap';
  if (!isPlainObject(body)) throw invalidResponse(field);

  const yearMonth = requireField(body, 'year_month', isValidRecapYearMonth, field);
  if (expectedYearMonth !== undefined && yearMonth !== expectedYearMonth) {
    throw invalidResponse(`${field}.year_month`);
  }

  const categories = requireField(body, 'categories', Array.isArray, field).map((category, index) =>
    mapCategory(category, `categories[${index}]`)
  );
  if (new Set(categories.map(category => category.code)).size !== categories.length) {
    throw invalidResponse(`${field}.categories`);
  }

  // null = 데이터 부족. 있으면 categories[]와 같은 항목 형식이어야 한다.
  const topCategory = requireField(
    body,
    'top_category',
    value => value === null || isPlainObject(value),
    field
  );

  return {
    yearMonth,
    revision: requireField(body, 'revision', isNonNegativeInteger, field),
    totalIncome: requireField(body, 'total_income', isAmountString, field),
    totalExpense: requireField(body, 'total_expense', isAmountString, field),
    totalTransfer: requireField(body, 'total_transfer', isAmountString, field),
    netSaving: requireField(body, 'net_saving', isAmountString, field),
    categories,
    topCategory: topCategory === null ? null : mapCategory(topCategory, 'top_category'),
    // 데이터가 충분할 때만 서버가 채운다. 없으면 null 그대로(프론트가 별명을 만들지 않는다).
    nickname: requireField(body, 'nickname', isNullableNonEmptyString, field),
    nicknameReason: requireField(body, 'nickname_reason', isNullableString, field),
    coverage: mapCoverage(requireField(body, 'coverage', isPlainObject, field), 'coverage'),
    insights: requireField(body, 'insights', isStringArray, field),
  };
};

// ── API 함수 ─────────────────────────────────────────────────

const requireUserId = userId => {
  if (!isValidOnboardingUserId(userId)) {
    throw new OnboardingRequestError(
      ONBOARDING_REQUEST_ERROR.INVALID_USER_ID,
      'user_id는 숫자로만 이루어진 문자열이어야 합니다.'
    );
  }
};

const requireYearMonth = yearMonth => {
  if (!isValidRecapYearMonth(yearMonth)) {
    throw new OnboardingRequestError(
      RECAP_REQUEST_ERROR.INVALID_YEAR_MONTH,
      'year_month는 YYYY-MM 형식(월 01~12)의 문자열이어야 합니다.'
    );
  }
};

// API-37 GET /api/v1/work/recap/{user_id}/months → 'YYYY-MM' 문자열 배열(최신순). Recap이 없으면 [].
// limit 쿼리는 보내지 않는다(서버 기본값 사용).
export const fetchRecapMonths = async userId => {
  requireUserId(userId);

  const body = await apiClient.get(API_ENDPOINTS.WORK.RECAP_MONTHS(userId), {
    responseFormat: 'raw',
  });
  return mapRecapMonthsResponse(body);
};

// API-38 GET /api/v1/work/recap/{user_id}/{year_month}
// 해당 월 집계가 없으면 서버가 404를 준다(getRecapErrorType → NOT_FOUND). 이 함수는 그것을 정상값으로 바꾸지 않는다.
export const fetchRecap = async (userId, yearMonth) => {
  requireUserId(userId);
  requireYearMonth(yearMonth);

  const body = await apiClient.get(API_ENDPOINTS.WORK.RECAP(userId, yearMonth), {
    responseFormat: 'raw',
  });
  return mapRecapResponse(body, yearMonth);
};

// ── 오류 종류 구분 ───────────────────────────────────────────
// Work 서비스 공통 분류를 그대로 쓴다. 네트워크·타임아웃·5xx를 "Recap 없음"으로 오인하지 않도록
// 호출부가 이 값으로 분기한다(NOT_FOUND만 API-38의 '해당 월 집계 없음').

export const RECAP_ERROR_TYPE = ONBOARDING_ERROR_TYPE;
export const getRecapErrorType = getOnboardingErrorType;
