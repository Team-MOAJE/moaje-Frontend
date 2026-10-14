// Work 학교 학사 일정 API 통신 레이어(API-18~20) 단위 테스트 (모의 Gateway 사용, 실제 서버 호출 없음)
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/calendarApi.test.mjs
// user_id·토큰은 모의 서버 전용 가짜 값이다.
import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { MockGateway } from './mockGateway.mjs';

// ── 실제 서버 미호출 검증용 감시 ─────────────────────────────
const everRequested = [];

const hostOf = target => {
  if (typeof target === 'string') return new URL(target).hostname;
  if (target instanceof URL) return target.hostname;
  return target?.hostname ?? target?.host ?? null;
};

const installRequestSpy = (mod, protocol) => {
  const original = mod.request;
  mod.request = function spiedRequest(...args) {
    everRequested.push({ protocol, host: hostOf(args[0]) });
    return original.apply(this, args);
  };
};

installRequestSpy(http, 'http');
installRequestSpy(https, 'https');

// ── 환경 ─────────────────────────────────────────────────────
const gateway = new MockGateway();
const baseURL = await gateway.listen();

process.env.EXPO_PUBLIC_API_BASE_URL = baseURL;
process.env.EXPO_PUBLIC_API_TIMEOUT = '300';

const tokenService = await import('../../src/services/tokenService.js');
const { API_ENDPOINTS } = await import('../../src/constants/apiEndpoints.js');
const { OnboardingRequestError } = await import('../../src/features/onboarding/onboardingApi.js');
const {
  CALENDAR_ERROR_TYPE,
  CALENDAR_REQUEST_ERROR,
  buildSyncRequestBody,
  fetchCalendarSchedules,
  fetchUniversities,
  getCalendarErrorType,
  syncCalendar,
} = await import('../../src/features/work/calendarApi.js');

// JS Number로는 정확히 표현할 수 없는 크기의 user_id
const BIG_UID = '123456789012345678';
const UNIVERSITIES_PATH = '/api/v1/work/calendar/universities';
const SYNC_PATH = '/api/v1/work/calendar/sync';
const schedulesPath = uid => `/api/v1/work/calendar/${uid}/schedules`;

const rejectionOf = async promise => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail('요청이 실패해야 하는데 성공했습니다.');
};

const jsonRoute =
  (body, extra = {}) =>
  () => ({ body, ...extra });

// ── 픽스처 (서버 소스 endpoints/calendar.py 형태) ────────────

const universityFixture = (overrides = {}) => ({
  id: 1,
  name: '한신대학교',
  short_name: '한신대',
  region: '경기',
  ...overrides,
});

// 일정 id는 TSID라 JS Number로 정확히 표현되지 않는다(응답에서 읽지 않는다).
const syncedScheduleFixture = (overrides = {}) => ({
  id: 4611686018427387904,
  user_id: 123,
  event_type: 'MIDTERM',
  event_name: '중간고사',
  start_date: '2026-04-20T00:00:00',
  end_date: '2026-04-24T00:00:00',
  expected_extra_spend: '45000.0000',
  ...overrides,
});

const syncFixture = (overrides = {}) => ({
  user_id: 123,
  university_name: '한신대학교',
  year: 2026,
  semester: 1,
  synced_count: 2,
  schedules: [syncedScheduleFixture(), syncedScheduleFixture({ event_name: '기말고사' })],
  ...overrides,
});

const calendarScheduleFixture = (overrides = {}) => ({
  id: 4611686018427387904,
  event_type: 'SEMESTER_START',
  event_name: '개강',
  start_date: '2026-03-02 00:00:00',
  end_date: '2026-03-02 00:00:00',
  expected_extra_spend: '0.0000',
  is_auto: true,
  ...overrides,
});

after(async () => {
  await gateway.close();
});

beforeEach(async () => {
  gateway.reset();
  await tokenService.clearTokens();
  gateway.validTokens.add('valid');
  await tokenService.setTokens('valid', 'refresh-0');
});

// ── 엔드포인트 ───────────────────────────────────────────────

test('엔드포인트 상수: 명세 경로(Gateway /api/v1/work/calendar/...)와 일치', () => {
  assert.equal(API_ENDPOINTS.WORK.CALENDAR.UNIVERSITIES, UNIVERSITIES_PATH);
  assert.equal(API_ENDPOINTS.WORK.CALENDAR.SYNC, SYNC_PATH);
  assert.equal(API_ENDPOINTS.WORK.CALENDAR.SCHEDULES(BIG_UID), schedulesPath(BIG_UID));
});

// ── API-18 ───────────────────────────────────────────────────

test('API-18: GET, Bearer 첨부, 본문 없음, 학교 배열을 서버 순서대로 camelCase 변환', async () => {
  gateway.route(
    'GET',
    UNIVERSITIES_PATH,
    jsonRoute([
      universityFixture(),
      universityFixture({ id: 2, name: '서울대학교', short_name: '서울대', region: null }),
    ])
  );

  const list = await fetchUniversities();

  assert.deepEqual(list, [
    { universityId: 1, name: '한신대학교', shortName: '한신대', region: '경기' },
    { universityId: 2, name: '서울대학교', shortName: '서울대', region: null },
  ]);
  const [request] = gateway.requestsTo(UNIVERSITIES_PATH);
  assert.equal(request.method, 'GET');
  assert.equal(request.headers.authorization, 'Bearer valid');
  assert.equal(request.body, undefined);
  assert.equal(request.query, '');
});

test('API-18: 빈 배열은 정상(가짜 학교를 만들지 않음)', async () => {
  gateway.route('GET', UNIVERSITIES_PATH, jsonRoute([]));
  assert.deepEqual(await fetchUniversities(), []);
});

test('API-18: 응답 형식 위반(배열 아님·id 타입/범위·필드 누락) → invalidResponse', async () => {
  for (const body of [
    { universities: [] },
    [universityFixture({ id: '1' })],
    [universityFixture({ id: 0 })],
    [universityFixture({ id: 4611686018427387904 })], // 안전 정수 범위 초과 = 이미 반올림된 값
    [universityFixture({ name: '' })],
    [{ id: 1, name: '한신대학교', short_name: '한신대' }], // region 키 누락
  ]) {
    gateway.route('GET', UNIVERSITIES_PATH, jsonRoute(body));
    const error = await rejectionOf(fetchUniversities());
    assert.equal(error.invalidResponse, true, JSON.stringify(body));
    assert.equal(getCalendarErrorType(error), CALENDAR_ERROR_TYPE.INVALID_RESPONSE);
  }
});

// ── API-19 ───────────────────────────────────────────────────

test('API-19: 본문 키 이름·user_id 숫자 리터럴 원문, 응답 변환(응답 id·user_id 무시)', async () => {
  gateway.route('POST', SYNC_PATH, jsonRoute(syncFixture()));

  const result = await syncCalendar(BIG_UID, { universityId: 1, year: 2026, semester: 1 });

  const [request] = gateway.requestsTo(SYNC_PATH);
  assert.equal(request.method, 'POST');
  assert.equal(request.headers.authorization, 'Bearer valid');
  assert.equal(request.headers['content-type'], 'application/json');
  assert.equal(request.headers['idempotency-key'], undefined);
  assert.equal(
    request.rawBody,
    `{"user_id":${BIG_UID},"university_id":1,"year":2026,"semester":1}`,
    'user_id는 숫자 리터럴 원문(문자열 아님, 반올림 없음)'
  );

  assert.equal(result.universityName, '한신대학교');
  assert.equal(result.year, 2026);
  assert.equal(result.semester, 1);
  assert.equal(result.syncedCount, 2);
  assert.equal(result.schedules.length, 2);
  assert.deepEqual(result.schedules[0], {
    eventType: 'MIDTERM',
    eventName: '중간고사',
    startDate: '2026-04-20T00:00:00',
    endDate: '2026-04-24T00:00:00',
    expectedExtraSpend: '45000.0000',
  });
  assert.ok(result.schedules.every(item => !('id' in item) && !('userId' in item)));
});

test('API-19: synced_count 0·빈 schedules도 정상', async () => {
  gateway.route('POST', SYNC_PATH, jsonRoute(syncFixture({ synced_count: 0, schedules: [] })));
  const result = await syncCalendar(BIG_UID, { universityId: 1, year: 2026, semester: 2 });
  assert.equal(result.syncedCount, 0);
  assert.deepEqual(result.schedules, []);
});

test('API-19: 요청 전 검증 실패는 서버 요청을 만들지 않음', async () => {
  for (const [userId, input] of [
    [123, { universityId: 1, year: 2026, semester: 1 }],
    ['0123', { universityId: 1, year: 2026, semester: 1 }],
    [BIG_UID, undefined],
    [BIG_UID, { year: 2026, semester: 1 }],
    [BIG_UID, { universityId: '1', year: 2026, semester: 1 }],
    [BIG_UID, { universityId: 0, year: 2026, semester: 1 }],
    [BIG_UID, { universityId: 1.5, year: 2026, semester: 1 }],
    [BIG_UID, { universityId: 1, year: 2019, semester: 1 }],
    [BIG_UID, { universityId: 1, year: '2026', semester: 1 }],
    [BIG_UID, { universityId: 1, year: 2026, semester: 3 }],
    [BIG_UID, { universityId: 1, year: 2026, semester: '1' }],
  ]) {
    const error = await rejectionOf(syncCalendar(userId, input));
    assert.ok(error instanceof OnboardingRequestError, JSON.stringify([userId, input]));
    assert.equal(getCalendarErrorType(error), CALENDAR_ERROR_TYPE.INVALID_REQUEST);
  }
  assert.equal(gateway.requests.length, 0);
});

test('API-19: 요청 검증 코드', () => {
  const code = input => {
    try {
      buildSyncRequestBody(BIG_UID, input);
    } catch (error) {
      return error.code;
    }
    return null;
  };
  assert.equal(
    code({ universityId: 'x', year: 2026, semester: 1 }),
    CALENDAR_REQUEST_ERROR.INVALID_UNIVERSITY_ID
  );
  assert.equal(
    code({ universityId: 1, year: 1999, semester: 1 }),
    CALENDAR_REQUEST_ERROR.INVALID_YEAR
  );
  assert.equal(
    code({ universityId: 1, year: 2026, semester: 0 }),
    CALENDAR_REQUEST_ERROR.INVALID_SEMESTER
  );
  assert.equal(code(null), CALENDAR_REQUEST_ERROR.INVALID_INPUT);
});

test('API-19: 응답 형식 위반 → invalidResponse(성공으로 가장하지 않음)', async () => {
  for (const body of [
    [],
    syncFixture({ synced_count: '2' }),
    syncFixture({ synced_count: -1 }),
    syncFixture({ university_name: '' }),
    syncFixture({ schedules: {} }),
    syncFixture({ schedules: [syncedScheduleFixture({ expected_extra_spend: 45000 })] }),
    { user_id: 1, university_name: '한신대학교', year: 2026, semester: 1 }, // schedules 누락
  ]) {
    gateway.route('POST', SYNC_PATH, jsonRoute(body));
    const error = await rejectionOf(
      syncCalendar(BIG_UID, { universityId: 1, year: 2026, semester: 1 })
    );
    assert.equal(error.invalidResponse, true, JSON.stringify(body));
  }
});

test('API-19: 404(일정 없음)·403·422·500 분류, 어떤 경우에도 자동 재시도 없음', async () => {
  for (const [status, type] of [
    [403, CALENDAR_ERROR_TYPE.FORBIDDEN],
    [404, CALENDAR_ERROR_TYPE.NOT_FOUND],
    [422, CALENDAR_ERROR_TYPE.VALIDATION],
    [500, CALENDAR_ERROR_TYPE.SERVER],
  ]) {
    gateway.requests.length = 0;
    gateway.route('POST', SYNC_PATH, jsonRoute({ detail: 'x' }, { status }));
    const error = await rejectionOf(
      syncCalendar(BIG_UID, { universityId: 1, year: 2026, semester: 1 })
    );
    assert.equal(getCalendarErrorType(error), type);
    assert.equal(gateway.requestsTo(SYNC_PATH).length, 1, '재시도 없음');
  }
});

test('API-19: 응답 지연 → TIMEOUT, 연결 끊김 → NETWORK (각각 요청 1회)', async () => {
  gateway.route('POST', SYNC_PATH, jsonRoute({}, { delay: 600 }));
  assert.equal(
    getCalendarErrorType(
      await rejectionOf(syncCalendar(BIG_UID, { universityId: 1, year: 2026, semester: 1 }))
    ),
    CALENDAR_ERROR_TYPE.TIMEOUT
  );
  assert.equal(gateway.requestsTo(SYNC_PATH).length, 1);

  gateway.route('POST', SYNC_PATH, () => ({ destroy: true }));
  assert.equal(
    getCalendarErrorType(
      await rejectionOf(syncCalendar(BIG_UID, { universityId: 1, year: 2026, semester: 1 }))
    ),
    CALENDAR_ERROR_TYPE.NETWORK
  );
  assert.equal(gateway.requestsTo(SYNC_PATH).length, 2);
});

// ── API-20 ───────────────────────────────────────────────────

test('API-20: 쿼리(year/limit/offset) 전달, 배열을 서버 순서대로 변환, 공백 구분 시각·is_auto 보존', async () => {
  gateway.route(
    'GET',
    schedulesPath(BIG_UID),
    jsonRoute([
      calendarScheduleFixture({ event_name: 'A' }),
      calendarScheduleFixture({ event_name: 'B', event_type: 'MT', is_auto: false }),
    ])
  );

  const list = await fetchCalendarSchedules(BIG_UID, { year: 2026, limit: 50, offset: 100 });

  const [request] = gateway.requestsTo(schedulesPath(BIG_UID));
  assert.equal(request.method, 'GET');
  assert.equal(request.headers.authorization, 'Bearer valid');
  const query = new URLSearchParams(request.query);
  assert.equal(query.get('year'), '2026');
  assert.equal(query.get('limit'), '50');
  assert.equal(query.get('offset'), '100');
  assert.deepEqual(
    list.map(item => [item.eventName, item.isAuto]),
    [
      ['A', true],
      ['B', false],
    ]
  );
  assert.equal(list[0].startDate, '2026-03-02 00:00:00', '시각 변환 없음');
  assert.equal(list[0].expectedExtraSpend, '0.0000');
  assert.ok(list.every(item => !('id' in item) && !('userId' in item)));
});

test('API-20: 쿼리 미지정 시 키를 보내지 않음, 빈 배열은 정상', async () => {
  gateway.route('GET', schedulesPath(BIG_UID), jsonRoute([]));
  assert.deepEqual(await fetchCalendarSchedules(BIG_UID), []);
  assert.equal(gateway.requestsTo(schedulesPath(BIG_UID))[0].query, '');
});

test('API-20: 쿼리 범위 위반·잘못된 user_id는 요청 전 거부', async () => {
  for (const [userId, query] of [
    [BIG_UID, { year: 2019 }],
    [BIG_UID, { year: 2031 }],
    [BIG_UID, { limit: 0 }],
    [BIG_UID, { limit: 501 }],
    [BIG_UID, { offset: -1 }],
    [123, undefined],
    ['0123', undefined],
    [undefined, undefined],
  ]) {
    const error = await rejectionOf(fetchCalendarSchedules(userId, query));
    assert.equal(
      getCalendarErrorType(error),
      CALENDAR_ERROR_TYPE.INVALID_REQUEST,
      JSON.stringify([userId, query])
    );
  }
  assert.equal(gateway.requests.length, 0);
});

test('API-20: 응답 형식 위반(is_auto 누락·타입, 금액 숫자, 배열 아님) → invalidResponse', async () => {
  const withoutIsAuto = calendarScheduleFixture();
  delete withoutIsAuto.is_auto;

  for (const body of [
    { schedules: [] },
    [withoutIsAuto],
    [calendarScheduleFixture({ is_auto: 'true' })],
    [calendarScheduleFixture({ expected_extra_spend: 0 })],
    [calendarScheduleFixture({ start_date: '' })],
  ]) {
    gateway.route('GET', schedulesPath(BIG_UID), jsonRoute(body));
    const error = await rejectionOf(fetchCalendarSchedules(BIG_UID));
    assert.equal(error.invalidResponse, true, JSON.stringify(body));
  }
});

// ── 공통 오류/인증 ───────────────────────────────────────────

const READ_APIS = [
  ['API-18', () => fetchUniversities(), UNIVERSITIES_PATH],
  ['API-20', () => fetchCalendarSchedules(BIG_UID), schedulesPath(BIG_UID)],
];

for (const [name, call, path] of READ_APIS) {
  test(`${name}: 403/404/422/500 분류 및 자동 재시도 없음`, async () => {
    for (const [status, type] of [
      [403, CALENDAR_ERROR_TYPE.FORBIDDEN],
      [404, CALENDAR_ERROR_TYPE.NOT_FOUND],
      [422, CALENDAR_ERROR_TYPE.VALIDATION],
      [500, CALENDAR_ERROR_TYPE.SERVER],
    ]) {
      gateway.requests.length = 0;
      gateway.route('GET', path, jsonRoute({ detail: 'x' }, { status }));
      const error = await rejectionOf(call());
      assert.equal(getCalendarErrorType(error), type);
      assert.equal(gateway.requestsTo(path).length, 1, '재시도 없음');
    }
  });

  test(`${name}: 응답 지연 → TIMEOUT, 연결 끊김 → NETWORK`, async () => {
    gateway.route('GET', path, jsonRoute({}, { delay: 600 }));
    assert.equal(getCalendarErrorType(await rejectionOf(call())), CALENDAR_ERROR_TYPE.TIMEOUT);

    gateway.route('GET', path, () => ({ destroy: true }));
    assert.equal(getCalendarErrorType(await rejectionOf(call())), CALENDAR_ERROR_TYPE.NETWORK);
  });
}

test('토큰이 없으면 401 → UNAUTHORIZED (API-18/19/20)', async () => {
  await tokenService.clearTokens();
  gateway.route('GET', UNIVERSITIES_PATH, jsonRoute([]));
  gateway.route('POST', SYNC_PATH, jsonRoute(syncFixture()));
  gateway.route('GET', schedulesPath(BIG_UID), jsonRoute([]));

  for (const call of [
    () => fetchUniversities(),
    () => syncCalendar(BIG_UID, { universityId: 1, year: 2026, semester: 1 }),
    () => fetchCalendarSchedules(BIG_UID),
  ]) {
    const error = await rejectionOf(call());
    assert.equal(getCalendarErrorType(error), CALENDAR_ERROR_TYPE.UNAUTHORIZED);
  }
});

test('실제 서버 미호출: 모든 요청 목적지는 모의 Gateway(127.0.0.1)뿐', () => {
  assert.ok(everRequested.length > 0);
  assert.ok(everRequested.every(entry => entry.host === '127.0.0.1'));
});
