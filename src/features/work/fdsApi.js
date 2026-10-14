// Work 이상거래(FDS) API 통신 레이어 (API-25 탐지 로그, API-26 알림 목록, API-27 알림 확인, API-28 소비 안전도 점수).
// 기준: docs/moaje-frontend-api-guide-20261011.pdf, 백엔드 moaje-work 소스(endpoints/fds.py, schemas/fds.py 읽기 확인).
//
// 이 모듈은 HTTP 호출·요청 구성·응답 검증/변환만 담당한다. 화면/Redux/AsyncStorage를 알지 못한다.
// API-21(POST fds/detect)은 의도적으로 연동하지 않는다. 서버가 송금 성공 이벤트(Kafka)를 받아 자동으로 탐지·로그·알림을
// 만들기 때문에 프론트가 다시 호출하면 수동/테스트 용도의 중복 탐지만 만든다.
//
// 계약
// - 네 API 모두 Envelope 없는 직접 응답(객체 또는 배열)이므로 responseFormat: 'raw'를 명시하고 이 모듈에서 구조를 검증한 뒤
//   camelCase 모델로 변환한다. 검증에 실패한 응답은 정상 데이터로 돌려주지 않고 invalidResponse로 reject한다.
// - 로그·알림의 id는 TSID(64bit)이며 JSON 숫자로 내려온다. 기본 JSON.parse는 이를 반올림하므로 API-27 경로에 쓰면 다른 알림을
//   가리킨다. 그래서 FDS 요청은 요청별 transformResponse(losslessTransformResponse)로 16자리 이상 정수를 문자열로 받아 id를
//   문자열로 보관한다. 모든 id는 숫자 문자열로 검증된 뒤에만 경로에 들어간다.
// - 금액·위험 점수는 서버가 str(Decimal)로 직렬화한 문자열이다. Number로 바꾸지 않는다. 안전도 점수·등급·메시지는 서버 값 그대로이며
//   프론트에서 재계산하지 않는다.
// - 시각은 str(datetime)("2026-10-11 03:00:00", 시간대 없음)이다. 변환 없이 보존한다.
// - API-27은 PATCH이며 본문이 없다. 서버는 재확인도 200으로 처리(멱등, confirmed_at 갱신)한다. 이 모듈은 자동 재시도하지 않는다.
import apiClient from '../../services/apiClient';
import { API_ENDPOINTS } from '../../constants/apiEndpoints';
import { API_ERROR_KIND, createApiError } from '../../services/apiResponse';
import { losslessTransformResponse } from '../../utils/losslessJson';
import {
  ONBOARDING_ERROR_TYPE,
  ONBOARDING_REQUEST_ERROR,
  OnboardingRequestError,
  getOnboardingErrorType,
  isValidOnboardingUserId,
} from '../onboarding/onboardingApi';

export const MAX_FDS_LIMIT = 100;

export const FDS_REQUEST_ERROR = Object.freeze({
  INVALID_ALERT_ID: 'INVALID_ALERT_ID',
  INVALID_PAGING: 'INVALID_PAGING',
  INVALID_UNREAD: 'INVALID_UNREAD',
});

// 모든 FDS 요청: 직접 응답 + 큰 정수 id를 잃지 않는 파싱.
const REQUEST_OPTIONS = Object.freeze({
  responseFormat: 'raw',
  transformResponse: [losslessTransformResponse],
});

// 응답 금액·점수: 원 단위 정수 또는 소수 문자열(음수 불허가 아니므로 부호는 허용). 선행 0·공백·쉼표·지수 표기 불허.
const AMOUNT_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

// ── 응답 검증/변환 ───────────────────────────────────────────

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

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
const isNullableString = value => value === null || typeof value === 'string';
const isNullableNonEmptyString = value => value === null || isNonEmptyString(value);
const isNonNegativeInteger = value => Number.isInteger(value) && value >= 0;
const isBoolean = value => typeof value === 'boolean';
const isAmountString = value => typeof value === 'string' && AMOUNT_PATTERN.test(value);

// id: 16자리 이상은 문자열, 그보다 작으면 JSON 숫자로 온다. 어느 쪽이든 숫자 문자열로 통일한다.
// 안전 정수 범위를 넘는 JSON 숫자가 그대로 도착했다면(파서가 적용되지 않은 응답) 이미 반올림된 값이므로 거부한다.
const toIdString = value => {
  if (typeof value === 'string') return isValidOnboardingUserId(value) ? value : null;
  if (Number.isSafeInteger(value) && value >= 1) return String(value);
  return null;
};

const requireIdField = (object, key, field) => {
  const id = hasOwn(object, key) ? toIdString(object[key]) : null;
  if (id === null) throw invalidResponse(`${field}.${key}`);
  return id;
};

// 필드가 반드시 존재하고(키 누락 불가) 조건을 만족해야 한다. 없는 값을 기본값으로 채우지 않는다.
const requireField = (object, key, predicate, field) => {
  if (!hasOwn(object, key) || !predicate(object[key])) throw invalidResponse(`${field}.${key}`);
  return object[key];
};

const requireObject = (value, field) => {
  if (!isPlainObject(value)) throw invalidResponse(field);
  return value;
};

// API-25 항목. 서버는 merchant·occurred_at을 로그 응답에 담지 않는다.
const mapLogItem = (item, field) => {
  requireObject(item, field);

  return {
    logId: requireIdField(item, 'id', field),
    transactionId: requireField(item, 'transaction_id', isString, field),
    amount: requireField(item, 'amount', isAmountString, field),
    riskScore: requireField(item, 'risk_score', isAmountString, field),
    riskLevel: requireField(item, 'risk_level', isNonEmptyString, field),
    reasonCode: requireField(item, 'reason_code', isNullableString, field),
    isAlerted: requireField(item, 'is_alerted', isBoolean, field),
    createdAt: requireField(item, 'created_at', isNonEmptyString, field),
  };
};

// API-25 응답. 빈 배열은 정상이다. 서버가 준 순서(최신순)를 유지한다.
export const mapFdsLogsResponse = body => {
  if (!Array.isArray(body)) throw invalidResponse('fdsLogs');
  return body.map((item, index) => mapLogItem(item, `fdsLogs[${index}]`));
};

const mapAlertItem = (item, field) => {
  requireObject(item, field);

  return {
    alertId: requireIdField(item, 'id', field),
    transactionId: requireField(item, 'transaction_id', isString, field),
    amount: requireField(item, 'amount', isAmountString, field),
    merchant: requireField(item, 'merchant', isNullableString, field),
    riskLevel: requireField(item, 'risk_level', isNonEmptyString, field),
    reasonCode: requireField(item, 'reason_code', isNullableString, field),
    message: requireField(item, 'message', isString, field),
    isConfirmed: requireField(item, 'is_confirmed', isBoolean, field),
    confirmedAt: requireField(item, 'confirmed_at', isNullableNonEmptyString, field),
    createdAt: requireField(item, 'created_at', isNonEmptyString, field),
  };
};

// API-26 응답. total/unread는 limit·필터와 무관한 서버 집계다. 알림이 없어도 정상 객체(total 0)로 온다.
// 응답의 user_id는 사용하지 않는다.
export const mapFdsAlertsResponse = body => {
  const field = 'fdsAlerts';
  requireObject(body, field);

  const alertsRaw = requireField(body, 'alerts', Array.isArray, field);

  return {
    total: requireField(body, 'total', isNonNegativeInteger, field),
    unread: requireField(body, 'unread', isNonNegativeInteger, field),
    returned: requireField(body, 'returned', isNonNegativeInteger, field),
    alerts: alertsRaw.map((item, index) => mapAlertItem(item, `fdsAlerts.alerts[${index}]`)),
  };
};

// API-27 응답. 요청한 alert_id와 응답의 alert_id가 같아야 한다(다른 알림이 확인 처리됐다고 표시하지 않기 위해).
// message(서버 안내 문구)는 사용하지 않는다.
export const mapAlertConfirmResponse = (body, requestedAlertId) => {
  const field = 'alertConfirm';
  requireObject(body, field);

  const alertId = requireIdField(body, 'alert_id', field);
  if (alertId !== requestedAlertId) throw invalidResponse(`${field}.alert_id`);
  if (requireField(body, 'is_confirmed', isBoolean, field) !== true) {
    throw invalidResponse(`${field}.is_confirmed`);
  }

  return {
    alertId,
    isConfirmed: true,
    confirmedAt: requireField(body, 'confirmed_at', isNonEmptyString, field),
  };
};

// API-28 응답. 점수·등급·이모지·메시지는 서버 값 그대로 전달한다. 응답의 user_id는 사용하지 않는다.
export const mapSafetyScoreResponse = body => {
  const field = 'safetyScore';
  requireObject(body, field);

  return {
    safetyScore: requireField(body, 'safety_score', isNonNegativeInteger, field),
    grade: requireField(body, 'grade', isNonEmptyString, field),
    emoji: requireField(body, 'emoji', isString, field),
    totalTx: requireField(body, 'total_tx', isNonNegativeInteger, field),
    highCount: requireField(body, 'high_count', isNonNegativeInteger, field),
    mediumCount: requireField(body, 'medium_count', isNonNegativeInteger, field),
    periodDays: requireField(body, 'period_days', isNonNegativeInteger, field),
    message: requireField(body, 'message', isString, field),
  };
};

// ── 요청 구성/검증 ───────────────────────────────────────────

const requestError = (code, message) => new OnboardingRequestError(code, message);

const requireUserId = userId => {
  if (!isValidOnboardingUserId(userId)) {
    throw requestError(
      ONBOARDING_REQUEST_ERROR.INVALID_USER_ID,
      'user_id는 숫자로만 이루어진 문자열이어야 합니다.'
    );
  }
};

const requireAlertId = alertId => {
  if (!isValidOnboardingUserId(alertId)) {
    throw requestError(
      FDS_REQUEST_ERROR.INVALID_ALERT_ID,
      'alert_id는 숫자로만 이루어진 문자열이어야 합니다.'
    );
  }
};

const readLimit = limit => {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_FDS_LIMIT) {
    throw requestError(
      FDS_REQUEST_ERROR.INVALID_PAGING,
      `limit은 1~${MAX_FDS_LIMIT} 사이의 정수여야 합니다.`
    );
  }
  return limit;
};

// API-25 쿼리. 지정하지 않은 값은 키를 보내지 않는다(서버 기본값 20). offset은 서버가 지원하지 않는다.
export const buildFdsLogsQuery = ({ limit } = {}) => {
  const params = {};
  if (limit !== undefined && limit !== null) params.limit = readLimit(limit);
  return params;
};

// API-26 쿼리. unread는 true일 때만 보낸다(서버 기본값 false = 전체).
export const buildFdsAlertsQuery = ({ limit, unread } = {}) => {
  const params = {};
  if (limit !== undefined && limit !== null) params.limit = readLimit(limit);
  if (unread !== undefined && unread !== null) {
    if (typeof unread !== 'boolean') {
      throw requestError(FDS_REQUEST_ERROR.INVALID_UNREAD, 'unread는 true/false여야 합니다.');
    }
    if (unread) params.unread = true;
  }
  return params;
};

// ── API 함수 ─────────────────────────────────────────────────

// API-25 GET /api/v1/work/fds/{user_id}/logs?limit → 로그 배열(최신순)
export const fetchFdsLogs = async (userId, query) => {
  requireUserId(userId);
  const params = buildFdsLogsQuery(query);
  const body = await apiClient.get(API_ENDPOINTS.WORK.FDS.LOGS(userId), {
    ...REQUEST_OPTIONS,
    params,
  });
  return mapFdsLogsResponse(body);
};

// API-26 GET /api/v1/work/fds/{user_id}/alerts?limit&unread → { total, unread, returned, alerts }
export const fetchFdsAlerts = async (userId, query) => {
  requireUserId(userId);
  const params = buildFdsAlertsQuery(query);
  const body = await apiClient.get(API_ENDPOINTS.WORK.FDS.ALERTS(userId), {
    ...REQUEST_OPTIONS,
    params,
  });
  return mapFdsAlertsResponse(body);
};

// API-27 PATCH /api/v1/work/fds/{user_id}/alerts/{alert_id}/confirm
// 본문 없음, 자동 재시도·멱등 키 없음. 사용자의 '확인' 버튼 탭에서만 호출한다.
export const confirmFdsAlert = async (userId, alertId) => {
  requireUserId(userId);
  requireAlertId(alertId);
  const body = await apiClient.patch(
    API_ENDPOINTS.WORK.FDS.ALERT_CONFIRM(userId, alertId),
    undefined,
    REQUEST_OPTIONS
  );
  return mapAlertConfirmResponse(body, alertId);
};

// API-28 GET /api/v1/work/fds/{user_id}/safety-score
export const fetchSafetyScore = async userId => {
  requireUserId(userId);
  const body = await apiClient.get(API_ENDPOINTS.WORK.FDS.SAFETY_SCORE(userId), REQUEST_OPTIONS);
  return mapSafetyScoreResponse(body);
};

// ── 오류 종류 구분 ───────────────────────────────────────────

export const FDS_ERROR_TYPE = ONBOARDING_ERROR_TYPE;
export const getFdsErrorType = getOnboardingErrorType;
