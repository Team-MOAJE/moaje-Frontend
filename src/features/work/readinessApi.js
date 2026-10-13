// Work 사회인 준비도 API 통신 레이어 (API-36).
// 기준: docs/moaje-frontend-api-guide-20261011.pdf p.38~39, 백엔드 moaje-work 소스(읽기 확인).
//
// 이 모듈은 HTTP 호출·응답 검증/변환만 담당한다. 화면/Redux/AsyncStorage를 알지 못하며 아직 앱 흐름에
// 연결되어 있지 않다(연결은 후속 단계).
//
// 계약
// - 응답은 Envelope 없이 직접 객체이므로 responseFormat: 'raw'를 명시하고 이 모듈에서 구조를 검증한 뒤
//   camelCase 모델로 변환한다. 검증에 실패한 응답은 정상 데이터로 돌려주지 않고 invalidResponse로 reject한다.
// - 준비도는 서버가 계산한다. percent/level/level_label/items/message/disclaimer는 받은 값 그대로 전달하고
//   프론트에서 재계산·보정·기본값 채움을 하지 않는다.
// - 요청 본문은 항상 빈 객체 {}다. 모든 입력(monthly_*, deposit, move_in_cost, current_asset)을 생략하면
//   서버가 기준값과 Asset 조회 자산을 쓴다. 프론트의 계좌 잔액 합계 등을 current_asset으로 보내지 않는다.
// - user_id는 숫자 문자열이다(Auth user_id는 JS 안전 정수 범위 초과). 경로에는 문자열 그대로 넣고 본문에는
//   넣지 않는다. 응답의 user_id는 JSON 파싱 중 정밀도가 손실되므로 읽지도 반환하지도 않는다.
// - 서버는 조회할 때마다 준비도 조회 지표(READINESS_VIEW)를 기록한다. 그래서 어떤 요청도 자동 재시도하지
//   않는다. 다시 조회할지는 호출부(사용자 동작)가 결정한다.
// - Asset 조회 실패는 오류가 아니라 200 + asset_source 'UNAVAILABLE'로 내려온다.
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

// 명세: asset_source 값. 알 수 없는 문자열이 오더라도 응답을 거부하지는 않고 그대로 전달한다
// (화면이 모르는 값에는 별도 안내를 하지 않는다).
export const ASSET_SOURCE = Object.freeze({
  INPUT: 'INPUT',
  ASSET_SERVICE: 'ASSET_SERVICE',
  NOT_LINKED: 'NOT_LINKED',
  UNAVAILABLE: 'UNAVAILABLE',
});

// 명세: percent 0~100, level 1~5.
export const MIN_PERCENT = 0;
export const MAX_PERCENT = 100;
export const MIN_LEVEL = 1;
export const MAX_LEVEL = 5;

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

const isIntegerInRange = (value, min, max) =>
  Number.isInteger(value) && value >= min && value <= max;
const isNonNegativeInteger = value => Number.isInteger(value) && value >= 0;
const isNonEmptyString = value => typeof value === 'string' && value.trim() !== '';
const isString = value => typeof value === 'string';
const isNullableNonNegativeInteger = value => value === null || isNonNegativeInteger(value);
const isNonEmptyStringArray = value => Array.isArray(value) && value.every(isNonEmptyString);

// 필드가 반드시 존재하고(키 누락 불가) 조건을 만족해야 한다. 없는 값을 기본값으로 채우지 않는다.
const requireField = (object, key, predicate, field) => {
  if (!hasOwn(object, key) || !predicate(object[key])) throw invalidResponse(`${field}.${key}`);
  return object[key];
};

const mapReadinessItem = (item, index) => {
  const field = `items[${index}]`;
  if (!isPlainObject(item)) throw invalidResponse(field);

  return {
    key: requireField(item, 'key', isNonEmptyString, field),
    label: requireField(item, 'label', isNonEmptyString, field),
    weight: requireField(item, 'weight', isNonNegativeInteger, field),
    // null = 데이터가 없어 평가에서 제외된 항목. 0점과 구분해 그대로 보존한다.
    score: requireField(item, 'score', isNullableNonNegativeInteger, field),
    detail: requireField(item, 'detail', isString, field),
  };
};

// API-36 응답. 응답의 user_id는 정밀도 손실 값이므로 사용하지 않는다.
export const mapReadinessResponse = body => {
  const field = 'readiness';
  if (!isPlainObject(body)) throw invalidResponse(field);

  const items = requireField(body, 'items', Array.isArray, field).map(mapReadinessItem);
  if (new Set(items.map(item => item.key)).size !== items.length) {
    throw invalidResponse(`${field}.items`);
  }

  return {
    percent: requireField(
      body,
      'percent',
      value => isIntegerInRange(value, MIN_PERCENT, MAX_PERCENT),
      field
    ),
    level: requireField(
      body,
      'level',
      value => isIntegerInRange(value, MIN_LEVEL, MAX_LEVEL),
      field
    ),
    levelLabel: requireField(body, 'level_label', isNonEmptyString, field),
    items,
    evaluated: requireField(body, 'evaluated', isNonEmptyStringArray, field),
    excluded: requireField(body, 'excluded', isNonEmptyStringArray, field),
    assetSource: requireField(body, 'asset_source', isNonEmptyString, field),
    message: requireField(body, 'message', isNonEmptyString, field),
    // 앱 내부 참고 지표임을 알리는 문구. 비어 있는 응답은 신뢰하지 않는다.
    disclaimer: requireField(body, 'disclaimer', isNonEmptyString, field),
  };
};

// ── API 함수 ─────────────────────────────────────────────────

// API-36 POST /api/v1/work/readiness/{user_id}
export const fetchReadiness = async userId => {
  if (!isValidOnboardingUserId(userId)) {
    throw new OnboardingRequestError(
      ONBOARDING_REQUEST_ERROR.INVALID_USER_ID,
      'user_id는 숫자로만 이루어진 문자열이어야 합니다.'
    );
  }

  const body = await apiClient.post(
    API_ENDPOINTS.WORK.READINESS(userId),
    {},
    { responseFormat: 'raw' }
  );
  return mapReadinessResponse(body);
};

// ── 오류 종류 구분 ───────────────────────────────────────────
// Work 서비스 공통 분류(요청 검증 실패/네트워크/타임아웃/401/403/422/5xx/응답 형식 오류 등)를 그대로 쓴다.
// 네트워크·타임아웃·5xx를 "준비도 없음"으로 오인하지 않도록 호출부가 이 값으로 분기한다.

export const READINESS_ERROR_TYPE = ONBOARDING_ERROR_TYPE;
export const getReadinessErrorType = getOnboardingErrorType;
