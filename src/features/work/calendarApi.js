// Work 학교 학사 일정 API 통신 레이어 (API-18 학교 목록, API-19 일정 자동 동기화, API-20 일정 전체 조회).
// 기준: docs/moaje-frontend-api-guide-20261011.pdf, 백엔드 moaje-work 소스(endpoints/calendar.py, schemas/spending.py 읽기 확인).
//
// 이 모듈은 HTTP 호출·요청 본문 구성·응답 검증/변환만 담당한다. 화면/Redux/AsyncStorage를 알지 못한다.
//
// 계약
// - 세 API 모두 Envelope 없는 직접 응답(배열 또는 객체)이므로 responseFormat: 'raw'를 명시하고 이 모듈에서 구조를 검증한 뒤
//   camelCase 모델로 변환한다. 검증에 실패한 응답은 정상 데이터로 돌려주지 않고 invalidResponse로 reject한다
//   (값 보정·항목 제외·기본값 대입 없음).
// - API-20은 API-45(직접 등록 일정 조회)의 상위 호환이다. 같은 academic_schedule 테이블을 읽고 is_auto(자동 동기화 여부)를 더한다.
//   날짜는 str(datetime)이라 "2026-03-02 00:00:00"처럼 공백 구분이다(API-19는 ISO "T" 구분). 변환 없이 보존한다.
// - 금액은 서버가 str(Decimal)로 직렬화한 문자열이다. Number로 바꾸지 않는다.
// - user_id는 숫자 문자열이다(JS 안전 정수 범위 초과). 경로에는 문자열 그대로, API-19 본문에는 숫자 리터럴 원문으로 넣는다.
//   응답의 user_id와 일정 id(TSID)는 JSON 파싱 중 정밀도가 손실되므로 읽지도 반환하지도 않는다.
// - API-19는 POST이며 서버가 같은 기간의 기존 자동 일정(is_auto=true)을 지우고 다시 넣는다(직접 등록 일정은 유지).
//   이 모듈은 어떤 요청도 자동 재시도하지 않고 멱등 키도 쓰지 않는다. 호출은 사용자 버튼 동작이 결정한다.
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
import { MAX_YEAR, MIN_YEAR, buildSchedulesQuery } from './spendingApi';

export const CALENDAR_REQUEST_ERROR = Object.freeze({
  INVALID_UNIVERSITY_ID: 'INVALID_UNIVERSITY_ID',
  INVALID_YEAR: 'INVALID_YEAR',
  INVALID_SEMESTER: 'INVALID_SEMESTER',
  INVALID_INPUT: 'INVALID_INPUT',
});

const RAW = { responseFormat: 'raw' };

// 응답 금액: 원 단위 정수 또는 소수 문자열(음수 허용). 선행 0·공백·쉼표·지수 표기·'+' 부호 불허.
const AMOUNT_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

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
const isBoolean = value => typeof value === 'boolean';
const isAmountString = value => typeof value === 'string' && AMOUNT_PATTERN.test(value);
// 학교 id는 작은 정수여야 한다. 안전 정수 범위를 넘으면 파싱 중 이미 정밀도가 손실된 값이므로 거부한다.
const isSafePositiveInteger = value => Number.isSafeInteger(value) && value >= 1;

// 필드가 반드시 존재하고(키 누락 불가) 조건을 만족해야 한다. 없는 값을 기본값으로 채우지 않는다.
const requireField = (object, key, predicate, field) => {
  if (!hasOwn(object, key) || !predicate(object[key])) throw invalidResponse(`${field}.${key}`);
  return object[key];
};

const requireObject = (value, field) => {
  if (!isPlainObject(value)) throw invalidResponse(field);
  return value;
};

// API-18 응답. 빈 배열은 정상이다. 서버가 준 순서(이름순)를 유지한다.
export const mapUniversitiesResponse = body => {
  if (!Array.isArray(body)) throw invalidResponse('universities');

  return body.map((item, index) => {
    const field = `universities[${index}]`;
    requireObject(item, field);

    return {
      universityId: requireField(item, 'id', isSafePositiveInteger, field),
      name: requireField(item, 'name', isNonEmptyString, field),
      shortName: requireField(item, 'short_name', isString, field),
      region: requireField(item, 'region', isNullableString, field),
    };
  });
};

// API-19 응답의 일정 항목. id·user_id는 정밀도 손실 값이므로 읽지 않는다. is_auto는 이 응답에 없다(항상 자동 일정).
const mapSyncedScheduleItem = (item, field) => {
  requireObject(item, field);

  return {
    eventType: requireField(item, 'event_type', isNonEmptyString, field),
    eventName: requireField(item, 'event_name', isString, field),
    startDate: requireField(item, 'start_date', isNonEmptyString, field),
    endDate: requireField(item, 'end_date', isNonEmptyString, field),
    expectedExtraSpend: requireField(item, 'expected_extra_spend', isAmountString, field),
  };
};

// API-19 응답. user_id는 사용하지 않는다.
export const mapSyncResponse = body => {
  const field = 'calendarSync';
  requireObject(body, field);

  const schedulesRaw = requireField(body, 'schedules', Array.isArray, field);

  return {
    universityName: requireField(body, 'university_name', isNonEmptyString, field),
    year: requireField(body, 'year', Number.isInteger, field),
    semester: requireField(body, 'semester', Number.isInteger, field),
    syncedCount: requireField(body, 'synced_count', isNonNegativeInteger, field),
    schedules: schedulesRaw.map((item, index) =>
      mapSyncedScheduleItem(item, `calendarSync.schedules[${index}]`)
    ),
  };
};

// API-20 항목. id는 정밀도 손실 값이므로 읽지 않는다.
export const mapCalendarScheduleItem = (item, field = 'schedule') => {
  requireObject(item, field);

  return {
    eventType: requireField(item, 'event_type', isNonEmptyString, field),
    eventName: requireField(item, 'event_name', isString, field),
    // 서버 datetime 문자열("2026-03-02 00:00:00")을 변환 없이 보존한다.
    startDate: requireField(item, 'start_date', isNonEmptyString, field),
    endDate: requireField(item, 'end_date', isNonEmptyString, field),
    expectedExtraSpend: requireField(item, 'expected_extra_spend', isAmountString, field),
    isAuto: requireField(item, 'is_auto', isBoolean, field),
  };
};

// API-20 응답. 빈 배열은 정상이다. 서버가 준 순서(시작일 오름차순)를 유지한다.
export const mapCalendarSchedulesResponse = body => {
  if (!Array.isArray(body)) throw invalidResponse('calendarSchedules');
  return body.map((item, index) => mapCalendarScheduleItem(item, `calendarSchedules[${index}]`));
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

// API-19 요청 본문(JSON 문자열). 입력: { universityId, year, semester } (camelCase).
// user_id는 서버 스키마상 JSON 숫자여야 하지만 JS Number로는 정확히 표현할 수 없으므로, 검증된 숫자 문자열을 숫자 리터럴로
// 그대로 이어 붙인다(숫자만 통과하므로 주입 불가). 서버는 year·semester 범위를 검증하지 않으므로 UI와 같은 범위로 막는다.
export const buildSyncRequestBody = (userId, input) => {
  requireUserId(userId);

  if (!isPlainObject(input)) {
    throw requestError(CALENDAR_REQUEST_ERROR.INVALID_INPUT, '동기화 입력은 객체여야 합니다.');
  }

  const { universityId, year, semester } = input;

  if (!isSafePositiveInteger(universityId)) {
    throw requestError(CALENDAR_REQUEST_ERROR.INVALID_UNIVERSITY_ID, '학교를 선택해 주세요.');
  }
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw requestError(
      CALENDAR_REQUEST_ERROR.INVALID_YEAR,
      `year는 ${MIN_YEAR}~${MAX_YEAR} 사이의 정수여야 합니다.`
    );
  }
  if (semester !== 1 && semester !== 2) {
    throw requestError(CALENDAR_REQUEST_ERROR.INVALID_SEMESTER, 'semester는 1 또는 2여야 합니다.');
  }

  const rest = JSON.stringify({ university_id: universityId, year, semester }).slice(1);
  return `{"user_id":${userId},${rest}`;
};

// ── API 함수 ─────────────────────────────────────────────────

// API-18 GET /api/v1/work/calendar/universities → 학교 배열(서버 순서 유지)
export const fetchUniversities = async () => {
  const body = await apiClient.get(API_ENDPOINTS.WORK.CALENDAR.UNIVERSITIES, RAW);
  return mapUniversitiesResponse(body);
};

// API-19 POST /api/v1/work/calendar/sync
// 자동 재시도·멱등 키 없음. 사용자 버튼 동작에서만 호출한다. 성공 시 서버가 저장한 일정(id 제외)을 돌려준다.
export const syncCalendar = async (userId, input) => {
  const requestBody = buildSyncRequestBody(userId, input);
  const body = await apiClient.post(API_ENDPOINTS.WORK.CALENDAR.SYNC, requestBody, {
    ...RAW,
    headers: { [API_HEADERS.CONTENT_TYPE]: 'application/json' },
  });
  return mapSyncResponse(body);
};

// API-20 GET /api/v1/work/calendar/{user_id}/schedules?year&limit&offset → 일정 배열(서버 순서 유지)
// 쿼리 규칙(year 2020~2030, limit 1~500, offset ≥ 0)은 API-45와 같아 buildSchedulesQuery를 재사용한다.
export const fetchCalendarSchedules = async (userId, query) => {
  requireUserId(userId);
  const params = buildSchedulesQuery(query);
  const body = await apiClient.get(API_ENDPOINTS.WORK.CALENDAR.SCHEDULES(userId), {
    ...RAW,
    params,
  });
  return mapCalendarSchedulesResponse(body);
};

// ── 오류 종류 구분 ───────────────────────────────────────────
// Work 서비스 공통 분류를 그대로 쓴다. 네트워크·타임아웃·5xx를 "데이터 없음"으로 오인하지 않도록 호출부가 이 값으로 분기한다.

export const CALENDAR_ERROR_TYPE = ONBOARDING_ERROR_TYPE;
export const getCalendarErrorType = getOnboardingErrorType;
