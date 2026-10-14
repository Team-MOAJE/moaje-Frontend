// Work 학기 소비 분석 API 통신 레이어 (API-42 예비비, API-43 소비 프로필, API-44 일정 등록, API-45 일정 목록, API-46 학기 리포트).
// 기준: docs/moaje-frontend-api-guide-20261011.pdf p.44~50, 백엔드 moaje-work 소스(endpoints/spending.py, schemas/spending.py,
// services/ai/report_service.py 읽기 확인).
//
// 이 모듈은 HTTP 호출·요청 본문 구성·응답 검증/변환만 담당한다. 화면/Redux/AsyncStorage를 알지 못한다.
//
// 계약
// - 다섯 API 모두 Envelope 없는 직접 응답(객체 또는 배열)이므로 responseFormat: 'raw'를 명시하고 이 모듈에서 구조를 검증한 뒤
//   camelCase 모델로 변환한다. 검증에 실패한 응답은 정상 데이터로 돌려주지 않고 invalidResponse로 reject한다
//   (값 보정·항목 제외·기본값 대입 없음).
// - 금액·비율은 서버가 str(Decimal)로 직렬화한 문자열이다(예: "50000.0000"). Number로 변환하지 않고 문자열 그대로 전달한다.
//   점수·등급·총평·뱃지도 서버 값 그대로이며 프론트에서 재계산하지 않는다.
// - user_id는 숫자 문자열이다(Auth user_id는 JS 안전 정수 범위 초과). 경로에는 문자열 그대로 넣는다. API-44 본문의 user_id는
//   서버 스키마상 JSON 숫자이므로, 검증된 숫자 문자열을 숫자 리터럴로 그대로 이어 붙인 JSON 문자열로 보낸다(API-31과 같은 방식).
//   응답의 user_id와 일정 id(TSID)는 JSON 파싱 중 정밀도가 손실되므로 읽지도 반환하지도 않는다.
// - API-46의 "spend" 이름이 붙은 필드(peak/lowest_spend_*, events[].avg_daily_spend/total_spend)는 실제 거래 금액이 아니라
//   Daily Limit 계산 기록(ai_analysis_log)의 평균이다. 그래서 모델에서는 peakLimit*/lowestLimit*/avgDailyLimit/totalLimit처럼
//   실제 의미에 맞는 이름으로 옮긴다(값은 그대로).
// - API-44는 POST이고 서버에 멱등성이 없다. 이 모듈은 어떤 요청도 자동 재시도하지 않고 멱등 키도 쓰지 않는다.
//   등록 여부는 호출부(사용자 버튼 동작)가 결정한다.
import apiClient from '../../services/apiClient';
import { API_ENDPOINTS } from '../../constants/apiEndpoints';
import { API_HEADERS } from '../../constants/apiHeaders';
import { API_ERROR_KIND, createApiError } from '../../services/apiResponse';
import {
  ONBOARDING_ERROR_TYPE,
  ONBOARDING_REQUEST_ERROR,
  OnboardingRequestError,
  getOnboardingErrorType,
  isValidOnboardingUserId,
} from '../onboarding/onboardingApi';

// 서버 enum(models/spending.py EventType). 알 수 없는 문자열이 응답에 오더라도 거부하지 않고 그대로 전달한다.
export const EVENT_TYPE = Object.freeze({
  EXAM: 'EXAM',
  MT: 'MT',
  FESTIVAL: 'FESTIVAL',
  VACATION: 'VACATION',
  EMPLOYMENT: 'EMPLOYMENT',
  SEMESTER_START: 'SEMESTER_START',
  SEMESTER_END: 'SEMESTER_END',
  MIDTERM: 'MIDTERM',
  FINAL: 'FINAL',
  HOLIDAY: 'HOLIDAY',
});

const EVENT_TYPE_VALUES = Object.freeze(Object.values(EVENT_TYPE));

// 서버 입력 범위(Query/Field 제약).
export const MIN_YEAR = 2020;
export const MAX_YEAR = 2030;
export const MAX_SCHEDULE_LIMIT = 500;
export const MAX_EVENT_NAME_LENGTH = 100;

// 요청을 보내기 전 검증 실패 코드(userId는 ONBOARDING_REQUEST_ERROR.INVALID_USER_ID를 그대로 쓴다).
export const SPENDING_REQUEST_ERROR = Object.freeze({
  INVALID_EVENT_TYPE: 'INVALID_EVENT_TYPE',
  INVALID_EVENT_NAME: 'INVALID_EVENT_NAME',
  INVALID_DATE: 'INVALID_DATE',
  INVALID_DATE_RANGE: 'INVALID_DATE_RANGE',
  INVALID_EXTRA_SPEND: 'INVALID_EXTRA_SPEND',
  INVALID_YEAR: 'INVALID_YEAR',
  INVALID_SEMESTER: 'INVALID_SEMESTER',
  INVALID_PAGING: 'INVALID_PAGING',
  INVALID_INPUT: 'INVALID_INPUT',
});

const RAW = { responseFormat: 'raw' };

// 요청 값: 0 이상 정수 문자열(선행 0·공백·쉼표·소수·부호 불허, "0"은 허용).
const NON_NEGATIVE_INTEGER_STRING_PATTERN = /^(?:0|[1-9]\d*)$/;
// 응답 금액: 원 단위 정수 또는 소수 문자열(음수 허용). 선행 0·공백·쉼표·지수 표기·'+' 부호 불허.
const AMOUNT_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
// 비율: 0 이상 1 이하의 10진 문자열.
const SHARE_PATTERN = /^(?:0(?:\.\d+)?|1(?:\.0+)?)$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// 'YYYY-MM-DD'가 실제 달력에 존재하는 날짜인지(윤년 포함). 시간대 변환 없이 UTC 기준 Date로만 대조한다.
export const isRealIsoDate = value => {
  if (typeof value !== 'string') return false;
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return false;

  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
};

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
const isNullableString = value => value === null || typeof value === 'string';
const isNonNegativeInteger = value => Number.isInteger(value) && value >= 0;
const isHour = value => Number.isInteger(value) && value >= 0 && value <= 23;
const isAmountString = value => typeof value === 'string' && AMOUNT_PATTERN.test(value);
const isShareString = value => typeof value === 'string' && SHARE_PATTERN.test(value);
const isNullableAmountString = value => value === null || isAmountString(value);
const isStringArray = value => Array.isArray(value) && value.every(isString);

// 필드가 반드시 존재하고(키 누락 불가) 조건을 만족해야 한다. 없는 값을 기본값으로 채우지 않는다.
const requireField = (object, key, predicate, field) => {
  if (!hasOwn(object, key) || !predicate(object[key])) throw invalidResponse(`${field}.${key}`);
  return object[key];
};

const requireObject = (value, field) => {
  if (!isPlainObject(value)) throw invalidResponse(field);
  return value;
};

// API-42 응답. user_id는 정밀도 손실 값이므로 사용하지 않는다.
export const mapEventBufferResponse = body => {
  const field = 'eventBuffer';
  requireObject(body, field);
  return requireField(body, 'event_buffer', isAmountString, field);
};

// API-43 응답. last_analyzed_at은 시간대 정보가 없는 서버 시각 문자열 그대로 보존한다.
export const mapSpendingProfileResponse = body => {
  const field = 'spendingProfile';
  requireObject(body, field);

  return {
    avgDailyAmount: requireField(body, 'avg_daily_amount', isAmountString, field),
    peakSpendHour: requireField(body, 'peak_spend_hour', isHour, field),
    // 명세는 null 가능으로 표기하고 서버 스키마는 필수 문자열이다. 둘 다 수용하고 null은 그대로 전달한다.
    topCategory: requireField(body, 'top_category', isNullableString, field),
    riskScoreBaseline: requireField(body, 'risk_score_baseline', isAmountString, field),
    lastAnalyzedAt: requireField(body, 'last_analyzed_at', isNonEmptyString, field),
  };
};

// API-44 응답 / API-45 항목 공통. id·user_id는 정밀도 손실 값이므로 읽지 않는다.
export const mapScheduleItem = (item, field = 'schedule') => {
  requireObject(item, field);

  return {
    eventType: requireField(item, 'event_type', isNonEmptyString, field),
    eventName: requireField(item, 'event_name', isString, field),
    // 서버 datetime 문자열("2026-10-19T00:00:00")을 변환 없이 보존한다.
    startDate: requireField(item, 'start_date', isNonEmptyString, field),
    endDate: requireField(item, 'end_date', isNonEmptyString, field),
    expectedExtraSpend: requireField(item, 'expected_extra_spend', isAmountString, field),
  };
};

// API-45 응답. 빈 배열은 정상이다. 서버가 준 순서(시작일 오름차순)를 유지한다.
export const mapSchedulesResponse = body => {
  if (!Array.isArray(body)) throw invalidResponse('schedules');
  return body.map((item, index) => mapScheduleItem(item, `schedules[${index}]`));
};

const mapReportSpending = (spending, field) => {
  requireObject(spending, field);

  return {
    // 프로필의 분석된 거래 수(기록이 없으면 Daily Limit 기록 일수로 대체된 값일 수 있다).
    totalTxCount: requireField(spending, 'total_tx_count', isNonNegativeInteger, field),
    // 아래 Limit 필드는 서버 이름이 spend/limit이지만 모두 Daily Limit 계산 기록 기준 값이다.
    avgDailyLimit: requireField(spending, 'avg_daily_limit', isAmountString, field),
    peakLimitDate: requireField(spending, 'peak_spend_date', isNonEmptyString, field),
    peakLimitAmount: requireField(spending, 'peak_spend_amount', isAmountString, field),
    lowestLimitDate: requireField(spending, 'lowest_spend_date', isNonEmptyString, field),
    lowestLimitAmount: requireField(spending, 'lowest_spend_amount', isAmountString, field),
    peakSpendHour: requireField(spending, 'peak_spend_hour', isHour, field),
    topCategory: requireField(spending, 'top_category', isString, field),
    totalLogDays: requireField(spending, 'total_log_days', isNonNegativeInteger, field),
    dailyLimitComplianceRate: requireField(
      spending,
      'daily_limit_compliance_rate',
      isShareString,
      field
    ),
    // null = 기록이 1일 이하이거나 평균이 0이라 계산 불가(오류 아님).
    dailyLimitCv: requireField(spending, 'daily_limit_cv', isNullableAmountString, field),
  };
};

const mapReportFds = (fds, field) => {
  requireObject(fds, field);

  return {
    totalDetected: requireField(fds, 'total_detected', isNonNegativeInteger, field),
    highCount: requireField(fds, 'high_count', isNonNegativeInteger, field),
    mediumCount: requireField(fds, 'medium_count', isNonNegativeInteger, field),
    safetyScore: requireField(fds, 'safety_score', isNonNegativeInteger, field),
    safetyGrade: requireField(fds, 'safety_grade', isNonEmptyString, field),
    topReason: requireField(fds, 'top_reason', isString, field),
  };
};

const mapReportEvent = (event, field) => {
  requireObject(event, field);

  return {
    eventType: requireField(event, 'event_type', isNonEmptyString, field),
    eventName: requireField(event, 'event_name', isString, field),
    startDate: requireField(event, 'start_date', isNonEmptyString, field),
    endDate: requireField(event, 'end_date', isNonEmptyString, field),
    periodDays: requireField(event, 'period_days', isNonNegativeInteger, field),
    // 이벤트 기간의 Daily Limit 기록 평균 / 평균 × 일수. 실제 지출 금액이 아니다.
    avgDailyLimit: requireField(event, 'avg_daily_spend', isAmountString, field),
    totalLimit: requireField(event, 'total_spend', isAmountString, field),
    // 이벤트 평균 한도 ÷ 학기 평균 한도. 1.0 = 평소와 동일.
    vsNormalRatio: requireField(event, 'vs_normal_ratio', isAmountString, field),
  };
};

const mapScoreBreakdown = (breakdown, field) => {
  requireObject(breakdown, field);

  return {
    safetyScore: requireField(breakdown, 'safety_score', isNonNegativeInteger, field),
    dailyLimitScore: requireField(breakdown, 'daily_limit_score', isNonNegativeInteger, field),
    eventScore: requireField(breakdown, 'event_score', isNonNegativeInteger, field),
    regularityScore: requireField(breakdown, 'regularity_score', isNonNegativeInteger, field),
    total: requireField(breakdown, 'total', isNonNegativeInteger, field),
  };
};

// API-46 응답. 응답의 user_id는 사용하지 않는다. overall_grade는 A/B/C/D 외에 "N/A"(미평가)가 올 수 있어 문자열로 받는다.
export const mapSemesterReportResponse = body => {
  const field = 'semesterReport';
  requireObject(body, field);

  const eventsRaw = requireField(body, 'events', Array.isArray, field);

  return {
    year: requireField(body, 'year', Number.isInteger, field),
    semester: requireField(body, 'semester', Number.isInteger, field),
    periodLabel: requireField(body, 'period_label', isNonEmptyString, field),
    periodStart: requireField(body, 'period_start', isNonEmptyString, field),
    periodEnd: requireField(body, 'period_end', isNonEmptyString, field),
    spending: mapReportSpending(requireField(body, 'spending', isPlainObject, field), 'spending'),
    fds: mapReportFds(requireField(body, 'fds', isPlainObject, field), 'fds'),
    events: eventsRaw.map((event, index) => mapReportEvent(event, `events[${index}]`)),
    scoreBreakdown: mapScoreBreakdown(
      requireField(body, 'score_breakdown', isPlainObject, field),
      'scoreBreakdown'
    ),
    overallGrade: requireField(body, 'overall_grade', isNonEmptyString, field),
    overallScore: requireField(body, 'overall_score', isNonNegativeInteger, field),
    summaryMessage: requireField(body, 'summary_message', isString, field),
    badges: requireField(body, 'badges', isStringArray, field),
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

const isYear = value => Number.isInteger(value) && value >= MIN_YEAR && value <= MAX_YEAR;

const requireYear = year => {
  if (!isYear(year)) {
    throw requestError(
      SPENDING_REQUEST_ERROR.INVALID_YEAR,
      `year는 ${MIN_YEAR}~${MAX_YEAR} 사이의 정수여야 합니다.`
    );
  }
};

// API-44 요청 본문(JSON 문자열). 입력: { eventType, eventName, startDate, endDate, expectedExtraSpend? } (camelCase).
// user_id는 서버 스키마상 JSON 숫자여야 하지만 JS Number로는 정확히 표현할 수 없으므로, 검증된 숫자 문자열을 숫자 리터럴로
// 그대로 이어 붙인다(숫자만 통과하므로 주입 불가). axios는 Content-Type이 application/json이고 data가 유효한 JSON 문자열이면
// 원문을 그대로 전송한다.
// - expectedExtraSpend가 비어 있으면(undefined/null/'') 키를 보내지 않는다(서버 기본값 0).
// - 종료일 < 시작일 거부는 서버 규칙이 아니라 클라이언트 UI 가드다(서버는 검증하지 않는다).
export const buildScheduleRequestBody = (userId, input) => {
  requireUserId(userId);

  if (!isPlainObject(input)) {
    throw requestError(SPENDING_REQUEST_ERROR.INVALID_INPUT, '일정 입력은 객체여야 합니다.');
  }

  const { eventType, eventName, startDate, endDate, expectedExtraSpend } = input;

  if (!EVENT_TYPE_VALUES.includes(eventType)) {
    throw requestError(SPENDING_REQUEST_ERROR.INVALID_EVENT_TYPE, '일정 유형이 올바르지 않습니다.');
  }

  const name = typeof eventName === 'string' ? eventName.trim() : '';
  if (name === '' || name.length > MAX_EVENT_NAME_LENGTH) {
    throw requestError(
      SPENDING_REQUEST_ERROR.INVALID_EVENT_NAME,
      `일정 이름은 1~${MAX_EVENT_NAME_LENGTH}자여야 합니다.`
    );
  }

  if (!isRealIsoDate(startDate) || !isRealIsoDate(endDate)) {
    throw requestError(
      SPENDING_REQUEST_ERROR.INVALID_DATE,
      '날짜는 실제로 존재하는 YYYY-MM-DD 형식이어야 합니다.'
    );
  }
  // 같은 형식(YYYY-MM-DD)의 문자열은 사전식 비교가 날짜 순서와 같다.
  if (endDate < startDate) {
    throw requestError(
      SPENDING_REQUEST_ERROR.INVALID_DATE_RANGE,
      '종료일은 시작일보다 빠를 수 없습니다.'
    );
  }

  const body = {
    event_type: eventType,
    event_name: name,
    start_date: startDate,
    end_date: endDate,
  };

  if (
    expectedExtraSpend !== undefined &&
    expectedExtraSpend !== null &&
    expectedExtraSpend !== ''
  ) {
    if (
      typeof expectedExtraSpend !== 'string' ||
      !NON_NEGATIVE_INTEGER_STRING_PATTERN.test(expectedExtraSpend)
    ) {
      throw requestError(
        SPENDING_REQUEST_ERROR.INVALID_EXTRA_SPEND,
        '예상 추가 지출은 0 이상의 정수 문자열이어야 합니다.'
      );
    }
    body.expected_extra_spend = expectedExtraSpend;
  }

  return `{"user_id":${userId},${JSON.stringify(body).slice(1)}`;
};

// API-45 쿼리. 지정하지 않은 값은 키를 보내지 않는다(서버 기본값 사용).
export const buildSchedulesQuery = ({ year, limit, offset } = {}) => {
  const params = {};

  if (year !== undefined && year !== null) {
    requireYear(year);
    params.year = year;
  }
  if (limit !== undefined && limit !== null) {
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SCHEDULE_LIMIT) {
      throw requestError(
        SPENDING_REQUEST_ERROR.INVALID_PAGING,
        `limit은 1~${MAX_SCHEDULE_LIMIT} 사이의 정수여야 합니다.`
      );
    }
    params.limit = limit;
  }
  if (offset !== undefined && offset !== null) {
    if (!Number.isInteger(offset) || offset < 0) {
      throw requestError(
        SPENDING_REQUEST_ERROR.INVALID_PAGING,
        'offset은 0 이상의 정수여야 합니다.'
      );
    }
    params.offset = offset;
  }
  return params;
};

// API-46 쿼리. 서버 기본값(year=2026, semester=1)에 의존하지 않도록 둘 다 필수로 받는다.
export const buildReportQuery = ({ year, semester } = {}) => {
  requireYear(year);
  if (semester !== 1 && semester !== 2) {
    throw requestError(SPENDING_REQUEST_ERROR.INVALID_SEMESTER, 'semester는 1 또는 2여야 합니다.');
  }
  return { year, semester };
};

// ── API 함수 ─────────────────────────────────────────────────

// API-42 GET /api/v1/work/spending/{user_id}/event-buffer → 금액 문자열
export const fetchEventBuffer = async userId => {
  requireUserId(userId);
  const body = await apiClient.get(API_ENDPOINTS.WORK.SPENDING.EVENT_BUFFER(userId), RAW);
  return mapEventBufferResponse(body);
};

// API-43 GET /api/v1/work/spending/{user_id}/profile
// 서버는 프로필이 없으면 기본값으로 생성해 반환한다. 응답만으로는 기본값 여부를 알 수 없다.
export const fetchSpendingProfile = async userId => {
  requireUserId(userId);
  const body = await apiClient.get(API_ENDPOINTS.WORK.SPENDING.PROFILE(userId), RAW);
  return mapSpendingProfileResponse(body);
};

// API-44 POST /api/v1/work/spending/schedule
// 자동 재시도·멱등 키 없음. 사용자 버튼 동작에서만 호출한다. 성공 시 서버가 저장한 일정(id 제외)을 돌려준다.
export const createAcademicSchedule = async (userId, input) => {
  const requestBody = buildScheduleRequestBody(userId, input);
  const body = await apiClient.post(API_ENDPOINTS.WORK.SPENDING.SCHEDULE, requestBody, {
    ...RAW,
    headers: { [API_HEADERS.CONTENT_TYPE]: 'application/json' },
  });
  return mapScheduleItem(body, 'createdSchedule');
};

// API-45 GET /api/v1/work/spending/{user_id}/schedules?year&limit&offset → 일정 배열(서버 순서 유지)
export const fetchAcademicSchedules = async (userId, query) => {
  requireUserId(userId);
  const params = buildSchedulesQuery(query);
  const body = await apiClient.get(API_ENDPOINTS.WORK.SPENDING.SCHEDULES(userId), {
    ...RAW,
    params,
  });
  return mapSchedulesResponse(body);
};

// API-46 GET /api/v1/work/spending/{user_id}/report?year&semester
export const fetchSemesterReport = async (userId, query) => {
  requireUserId(userId);
  const params = buildReportQuery(query);
  const body = await apiClient.get(API_ENDPOINTS.WORK.SPENDING.REPORT(userId), {
    ...RAW,
    params,
  });
  return mapSemesterReportResponse(body);
};

// ── 오류 종류 구분 ───────────────────────────────────────────
// Work 서비스 공통 분류를 그대로 쓴다. 네트워크·타임아웃·5xx를 "데이터 없음"으로 오인하지 않도록 호출부가 이 값으로 분기한다.

export const SPENDING_ERROR_TYPE = ONBOARDING_ERROR_TYPE;
export const getSpendingErrorType = getOnboardingErrorType;
