// Work 학기 소비 분석 API 통신 레이어(API-42~46) 단위 테스트 (모의 Gateway 사용, 실제 서버 호출 없음)
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/spendingApi.test.mjs
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
const { API_ERROR_KIND } = await import('../../src/services/apiResponse.js');
const { OnboardingRequestError, ONBOARDING_REQUEST_ERROR } =
  await import('../../src/features/onboarding/onboardingApi.js');
const {
  EVENT_TYPE,
  SPENDING_ERROR_TYPE,
  SPENDING_REQUEST_ERROR,
  buildReportQuery,
  buildScheduleRequestBody,
  buildSchedulesQuery,
  createAcademicSchedule,
  fetchAcademicSchedules,
  fetchEventBuffer,
  fetchSemesterReport,
  fetchSpendingProfile,
  getSpendingErrorType,
  isRealIsoDate,
  mapSemesterReportResponse,
} = await import('../../src/features/work/spendingApi.js');

// JS Number로는 정확히 표현할 수 없는 크기의 user_id (Number('123456789012345678') === 123456789012345680)
const BIG_UID = '123456789012345678';
const bufferPath = uid => `/api/v1/work/spending/${uid}/event-buffer`;
const profilePath = uid => `/api/v1/work/spending/${uid}/profile`;
const SCHEDULE_PATH = '/api/v1/work/spending/schedule';
const schedulesPath = uid => `/api/v1/work/spending/${uid}/schedules`;
const reportPath = uid => `/api/v1/work/spending/${uid}/report`;

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

// ── 픽스처 (서버 소스 schemas/spending.py 형태) ──────────────

const profileFixture = (overrides = {}) => ({
  user_id: 123,
  avg_daily_amount: '10000.0000',
  peak_spend_hour: 12,
  top_category: '식비',
  risk_score_baseline: '0.10',
  last_analyzed_at: '2026-10-11T03:00:00',
  ...overrides,
});

const scheduleFixture = (overrides = {}) => ({
  id: 4611686018427387904,
  user_id: 123,
  event_type: 'MT',
  event_name: '학과 MT',
  start_date: '2026-10-19T00:00:00',
  end_date: '2026-10-23T00:00:00',
  expected_extra_spend: '50000.0000',
  ...overrides,
});

const reportFixture = (overrides = {}) => ({
  user_id: 123,
  year: 2026,
  semester: 2,
  period_label: '2026년 2학기',
  period_start: '2026-09-01',
  period_end: '2026-12-20',
  spending: {
    total_tx_count: 12,
    avg_daily_limit: '10000',
    peak_spend_date: '2026-09-15',
    peak_spend_amount: '20000.0000',
    lowest_spend_date: '2026-09-01',
    lowest_spend_amount: '5000.0000',
    peak_spend_hour: 12,
    top_category: '식비',
    total_log_days: 10,
    daily_limit_compliance_rate: '0.8',
    daily_limit_cv: '0.512',
  },
  fds: {
    total_detected: 2,
    high_count: 1,
    medium_count: 1,
    safety_score: 29,
    safety_grade: 'B',
    top_reason: 'AMOUNT_SPIKE',
  },
  events: [
    {
      event_type: 'MIDTERM',
      event_name: '중간고사',
      start_date: '2026-10-19',
      end_date: '2026-10-23',
      period_days: 5,
      avg_daily_spend: '12000',
      total_spend: '60000',
      vs_normal_ratio: '1.20',
    },
  ],
  score_breakdown: {
    safety_score: 29,
    daily_limit_score: 22,
    event_score: 20,
    regularity_score: 7,
    total: 78,
  },
  overall_grade: 'B',
  overall_score: 78,
  summary_message: '✅ 안정적인 소비 습관을 유지했어요.',
  badges: ['🛡️ 완벽 안전 — 이상거래 0건'],
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

test('엔드포인트 상수: 명세 경로(Gateway /api/v1/work/spending/...)와 일치', () => {
  assert.equal(API_ENDPOINTS.WORK.SPENDING.EVENT_BUFFER(BIG_UID), bufferPath(BIG_UID));
  assert.equal(API_ENDPOINTS.WORK.SPENDING.PROFILE(BIG_UID), profilePath(BIG_UID));
  assert.equal(API_ENDPOINTS.WORK.SPENDING.SCHEDULE, SCHEDULE_PATH);
  assert.equal(API_ENDPOINTS.WORK.SPENDING.SCHEDULES(BIG_UID), schedulesPath(BIG_UID));
  assert.equal(API_ENDPOINTS.WORK.SPENDING.REPORT(BIG_UID), reportPath(BIG_UID));
});

// ── API-42 ───────────────────────────────────────────────────

test('API-42: GET, Bearer 첨부, 본문·멱등 키 없음, 금액 문자열을 그대로 반환(응답 user_id 무시)', async () => {
  gateway.route(
    'GET',
    bufferPath(BIG_UID),
    jsonRoute({ user_id: 123, event_buffer: '50000.0000' })
  );

  const buffer = await fetchEventBuffer(BIG_UID);

  assert.equal(buffer, '50000.0000', '소수 자릿수를 바꾸지 않음');
  const [request] = gateway.requestsTo(bufferPath(BIG_UID));
  assert.equal(request.method, 'GET');
  assert.equal(request.headers.authorization, 'Bearer valid');
  assert.equal(request.body, undefined);
  assert.equal(request.headers['idempotency-key'], undefined);
});

test('API-42: "0"도 정상 값(가짜 오류·더미로 바꾸지 않음)', async () => {
  gateway.route('GET', bufferPath(BIG_UID), jsonRoute({ user_id: 1, event_buffer: '0' }));
  assert.equal(await fetchEventBuffer(BIG_UID), '0');
});

test('API-42: 응답 형식 위반(필드 누락·숫자 타입·객체 아님) → invalidResponse', async () => {
  for (const body of [{ user_id: 1 }, { event_buffer: 50000 }, { event_buffer: '5,000' }, []]) {
    gateway.route('GET', bufferPath(BIG_UID), jsonRoute(body));
    const error = await rejectionOf(fetchEventBuffer(BIG_UID));
    assert.equal(error.invalidResponse, true);
    assert.equal(getSpendingErrorType(error), SPENDING_ERROR_TYPE.INVALID_RESPONSE);
  }
});

// ── API-43 ───────────────────────────────────────────────────

test('API-43: camelCase 변환, Decimal 문자열·서버 시각 문자열을 그대로 보존', async () => {
  gateway.route('GET', profilePath(BIG_UID), jsonRoute(profileFixture()));

  const profile = await fetchSpendingProfile(BIG_UID);

  assert.deepEqual(profile, {
    avgDailyAmount: '10000.0000',
    peakSpendHour: 12,
    topCategory: '식비',
    riskScoreBaseline: '0.10',
    lastAnalyzedAt: '2026-10-11T03:00:00',
  });
  assert.equal('userId' in profile, false, '정밀도 손실 user_id는 반환하지 않음');
});

test('API-43: top_category null 수용, 시간대 범위(0~23) 밖·숫자 금액은 거부', async () => {
  gateway.route('GET', profilePath(BIG_UID), jsonRoute(profileFixture({ top_category: null })));
  assert.equal((await fetchSpendingProfile(BIG_UID)).topCategory, null);

  for (const override of [
    { peak_spend_hour: 24 },
    { avg_daily_amount: 10000 },
    { last_analyzed_at: '' },
  ]) {
    gateway.route('GET', profilePath(BIG_UID), jsonRoute(profileFixture(override)));
    const error = await rejectionOf(fetchSpendingProfile(BIG_UID));
    assert.equal(error.invalidResponse, true);
  }
});

// ── API-44 ───────────────────────────────────────────────────

const validInput = (overrides = {}) => ({
  eventType: EVENT_TYPE.MT,
  eventName: '  학과 MT  ',
  startDate: '2026-10-19',
  endDate: '2026-10-23',
  expectedExtraSpend: '50000',
  ...overrides,
});

test('API-44 본문: user_id는 숫자 리터럴 원문, 이름 trim, 키 이름은 명세(snake_case)와 일치', () => {
  const raw = buildScheduleRequestBody(BIG_UID, validInput());

  assert.ok(
    raw.startsWith(`{"user_id":${BIG_UID},`),
    'user_id가 문자열이 아닌 숫자 리터럴이며 정밀도 유지'
  );
  assert.deepEqual(JSON.parse(raw), {
    user_id: Number(BIG_UID), // 검증용 파싱일 뿐이며 전송 원문은 위 raw다
    event_type: 'MT',
    event_name: '학과 MT',
    start_date: '2026-10-19',
    end_date: '2026-10-23',
    expected_extra_spend: '50000',
  });
});

test('API-44 본문: expected_extra_spend 비어 있으면 키 생략, "0"은 전송', () => {
  for (const empty of [undefined, null, '']) {
    const body = JSON.parse(
      buildScheduleRequestBody(BIG_UID, validInput({ expectedExtraSpend: empty }))
    );
    assert.equal('expected_extra_spend' in body, false);
  }
  const zero = JSON.parse(
    buildScheduleRequestBody(BIG_UID, validInput({ expectedExtraSpend: '0' }))
  );
  assert.equal(zero.expected_extra_spend, '0');
});

test('API-44 본문: 요청 전 검증 실패(요청 안 함) — 코드별 구분, 입력 값은 메시지에 없음', () => {
  const cases = [
    [{ eventType: 'UNKNOWN' }, SPENDING_REQUEST_ERROR.INVALID_EVENT_TYPE],
    [{ eventName: '   ' }, SPENDING_REQUEST_ERROR.INVALID_EVENT_NAME],
    [{ eventName: 'a'.repeat(101) }, SPENDING_REQUEST_ERROR.INVALID_EVENT_NAME],
    [{ startDate: '2026-02-30' }, SPENDING_REQUEST_ERROR.INVALID_DATE],
    [{ endDate: '2026/10/23' }, SPENDING_REQUEST_ERROR.INVALID_DATE],
    [{ startDate: '2026-10-24' }, SPENDING_REQUEST_ERROR.INVALID_DATE_RANGE],
    [{ expectedExtraSpend: '-1' }, SPENDING_REQUEST_ERROR.INVALID_EXTRA_SPEND],
    [{ expectedExtraSpend: '1,000' }, SPENDING_REQUEST_ERROR.INVALID_EXTRA_SPEND],
    [{ expectedExtraSpend: 50000 }, SPENDING_REQUEST_ERROR.INVALID_EXTRA_SPEND],
  ];
  for (const [override, code] of cases) {
    let error;
    try {
      buildScheduleRequestBody(BIG_UID, validInput(override));
    } catch (e) {
      error = e;
    }
    assert.ok(error instanceof OnboardingRequestError, JSON.stringify(override));
    assert.equal(error.code, code);
    assert.equal(getSpendingErrorType(error), SPENDING_ERROR_TYPE.INVALID_REQUEST);
  }
  assert.equal(
    buildScheduleRequestBody(BIG_UID, validInput({ eventName: 'a'.repeat(100) })).length > 0,
    true
  );
  assert.throws(
    () => buildScheduleRequestBody(123456789, validInput()),
    error => error.code === ONBOARDING_REQUEST_ERROR.INVALID_USER_ID
  );
});

test('isRealIsoDate: 윤년·월 말일·형식 검증', () => {
  assert.equal(isRealIsoDate('2028-02-29'), true);
  assert.equal(isRealIsoDate('2026-02-29'), false);
  assert.equal(isRealIsoDate('2026-04-31'), false);
  assert.equal(isRealIsoDate('2026-13-01'), false);
  assert.equal(isRealIsoDate('2026-1-1'), false);
  assert.equal(isRealIsoDate(20261001), false);
});

test('API-44: POST 원문에 user_id 숫자 리터럴 유지, Bearer·JSON 헤더, 멱등 키 없음, 201 응답은 id 없이 변환', async () => {
  gateway.route('POST', SCHEDULE_PATH, jsonRoute(scheduleFixture(), { status: 201 }));

  const created = await createAcademicSchedule(BIG_UID, validInput());

  const [request] = gateway.requestsTo(SCHEDULE_PATH);
  assert.equal(request.method, 'POST');
  assert.equal(request.headers.authorization, 'Bearer valid');
  assert.match(request.headers['content-type'], /^application\/json/);
  assert.ok(
    request.rawBody.startsWith(`{"user_id":${BIG_UID},`),
    '전송 원문의 user_id 정밀도 유지'
  );
  assert.equal(request.headers['idempotency-key'], undefined);
  assert.deepEqual(created, {
    eventType: 'MT',
    eventName: '학과 MT',
    startDate: '2026-10-19T00:00:00',
    endDate: '2026-10-23T00:00:00',
    expectedExtraSpend: '50000.0000',
  });
  assert.equal('id' in created, false);
});

test('API-44: 검증 실패는 요청 자체를 보내지 않음', async () => {
  gateway.route('POST', SCHEDULE_PATH, jsonRoute(scheduleFixture(), { status: 201 }));
  await rejectionOf(createAcademicSchedule(BIG_UID, validInput({ eventName: '' })));
  assert.equal(gateway.requestsTo(SCHEDULE_PATH).length, 0);
});

test('API-44: 응답 지연 → TIMEOUT, 자동 재시도 없음(요청 정확히 1회)', async () => {
  gateway.route('POST', SCHEDULE_PATH, jsonRoute(scheduleFixture(), { status: 201, delay: 600 }));

  const error = await rejectionOf(createAcademicSchedule(BIG_UID, validInput()));

  assert.equal(error.kind, API_ERROR_KIND.TIMEOUT);
  assert.equal(getSpendingErrorType(error), SPENDING_ERROR_TYPE.TIMEOUT);
  await new Promise(resolve => setTimeout(resolve, 900));
  assert.equal(gateway.requestsTo(SCHEDULE_PATH).length, 1, '재시도 없음');
});

test('API-44: 5xx → SERVER, 422 → VALIDATION, 403 → FORBIDDEN, 재시도 없음', async () => {
  for (const [status, type] of [
    [500, SPENDING_ERROR_TYPE.SERVER],
    [422, SPENDING_ERROR_TYPE.VALIDATION],
    [403, SPENDING_ERROR_TYPE.FORBIDDEN],
  ]) {
    gateway.requests.length = 0;
    gateway.route('POST', SCHEDULE_PATH, jsonRoute({ detail: 'x' }, { status }));
    const error = await rejectionOf(createAcademicSchedule(BIG_UID, validInput()));
    assert.equal(getSpendingErrorType(error), type);
    assert.equal(gateway.requestsTo(SCHEDULE_PATH).length, 1);
  }
});

// ── API-45 ───────────────────────────────────────────────────

test('API-45: 쿼리(year/limit/offset)가 정확히 전달되고 배열을 서버 순서대로 변환', async () => {
  gateway.route(
    'GET',
    schedulesPath(BIG_UID),
    jsonRoute([
      scheduleFixture({ event_name: 'A' }),
      scheduleFixture({ event_name: 'B', event_type: 'EXAM' }),
    ])
  );

  const list = await fetchAcademicSchedules(BIG_UID, { year: 2026, limit: 50, offset: 100 });

  const [request] = gateway.requestsTo(schedulesPath(BIG_UID));
  const query = new URLSearchParams(request.query);
  assert.equal(query.get('year'), '2026');
  assert.equal(query.get('limit'), '50');
  assert.equal(query.get('offset'), '100');
  assert.deepEqual(
    list.map(item => item.eventName),
    ['A', 'B']
  );
  assert.ok(list.every(item => !('id' in item) && !('userId' in item)));
});

test('API-45: 쿼리를 지정하지 않으면 키를 보내지 않음, 빈 배열은 정상', async () => {
  gateway.route('GET', schedulesPath(BIG_UID), jsonRoute([]));

  const list = await fetchAcademicSchedules(BIG_UID);

  assert.deepEqual(list, []);
  assert.equal(gateway.requestsTo(schedulesPath(BIG_UID))[0].query, '');
});

test('API-45: 쿼리 범위 위반은 요청 전 거부', () => {
  for (const query of [
    { year: 2019 },
    { year: 2031 },
    { year: '2026' },
    { limit: 0 },
    { limit: 501 },
    { offset: -1 },
    { offset: 1.5 },
  ]) {
    assert.throws(() => buildSchedulesQuery(query), OnboardingRequestError, JSON.stringify(query));
  }
  assert.deepEqual(buildSchedulesQuery({ year: 2020, limit: 500, offset: 0 }), {
    year: 2020,
    limit: 500,
    offset: 0,
  });
});

test('API-45: 항목 형식 위반·배열 아님 → invalidResponse', async () => {
  for (const body of [
    {},
    [scheduleFixture({ expected_extra_spend: 5 })],
    [scheduleFixture({ start_date: null })],
  ]) {
    gateway.route('GET', schedulesPath(BIG_UID), jsonRoute(body));
    const error = await rejectionOf(fetchAcademicSchedules(BIG_UID));
    assert.equal(error.invalidResponse, true);
  }
});

// ── API-46 ───────────────────────────────────────────────────

test('API-46: year/semester를 항상 명시 전송, 서버 의미에 맞는 이름으로 변환(값은 그대로)', async () => {
  gateway.route('GET', reportPath(BIG_UID), jsonRoute(reportFixture()));

  const report = await fetchSemesterReport(BIG_UID, { year: 2026, semester: 2 });

  const query = new URLSearchParams(gateway.requestsTo(reportPath(BIG_UID))[0].query);
  assert.equal(query.get('year'), '2026');
  assert.equal(query.get('semester'), '2');

  assert.equal(report.periodLabel, '2026년 2학기');
  assert.equal(report.overallGrade, 'B');
  assert.equal(report.overallScore, 78);
  assert.deepEqual(report.scoreBreakdown, {
    safetyScore: 29,
    dailyLimitScore: 22,
    eventScore: 20,
    regularityScore: 7,
    total: 78,
  });
  assert.equal(report.spending.avgDailyLimit, '10000');
  assert.equal(report.spending.peakLimitAmount, '20000.0000');
  assert.equal(report.spending.lowestLimitAmount, '5000.0000');
  assert.equal(report.spending.dailyLimitCv, '0.512');
  assert.equal(
    'peakSpendAmount' in report.spending,
    false,
    '소비 금액으로 오해될 이름을 쓰지 않음'
  );
  assert.deepEqual(report.events[0], {
    eventType: 'MIDTERM',
    eventName: '중간고사',
    startDate: '2026-10-19',
    endDate: '2026-10-23',
    periodDays: 5,
    avgDailyLimit: '12000',
    totalLimit: '60000',
    vsNormalRatio: '1.20',
  });
  assert.equal(report.summaryMessage, '✅ 안정적인 소비 습관을 유지했어요.');
  assert.deepEqual(report.badges, ['🛡️ 완벽 안전 — 이상거래 0건']);
  assert.equal('userId' in report, false);
});

test('API-46: "N/A" 등급·빈 events/badges·cv null은 정상 응답', async () => {
  gateway.route(
    'GET',
    reportPath(BIG_UID),
    jsonRoute(
      reportFixture({
        overall_grade: 'N/A',
        overall_score: 0,
        events: [],
        badges: [],
        spending: { ...reportFixture().spending, daily_limit_cv: null, total_log_days: 0 },
      })
    )
  );

  const report = await fetchSemesterReport(BIG_UID, { year: 2026, semester: 1 });

  assert.equal(report.overallGrade, 'N/A');
  assert.deepEqual(report.events, []);
  assert.deepEqual(report.badges, []);
  assert.equal(report.spending.dailyLimitCv, null);
});

test('API-46: 필수 필드 누락·타입 위반은 값을 보정하지 않고 invalidResponse', () => {
  const cases = [
    (() => {
      const body = reportFixture();
      delete body.score_breakdown;
      return body;
    })(),
    reportFixture({ overall_score: '78' }),
    reportFixture({ badges: [1] }),
    reportFixture({ events: {} }),
    reportFixture({
      spending: { ...reportFixture().spending, daily_limit_compliance_rate: '1.5' },
    }),
    reportFixture({ fds: { ...reportFixture().fds, safety_grade: '' } }),
    [],
  ];
  for (const body of cases) {
    assert.throws(
      () => mapSemesterReportResponse(body),
      error => error.invalidResponse === true
    );
  }
});

test('API-46 쿼리: 범위 밖·미지정은 요청 전 거부(서버 기본값 의존 없음)', () => {
  for (const query of [
    undefined,
    {},
    { year: 2026 },
    { semester: 1 },
    { year: 2026, semester: 3 },
    { year: 2026, semester: '1' },
    { year: 2031, semester: 1 },
  ]) {
    assert.throws(() => buildReportQuery(query), OnboardingRequestError, JSON.stringify(query));
  }
  assert.deepEqual(buildReportQuery({ year: 2026, semester: 1 }), { year: 2026, semester: 1 });
});

// ── 공통 오류/인증 ───────────────────────────────────────────

const READ_APIS = [
  ['API-42', () => fetchEventBuffer(BIG_UID), 'GET', bufferPath(BIG_UID)],
  ['API-43', () => fetchSpendingProfile(BIG_UID), 'GET', profilePath(BIG_UID)],
  ['API-45', () => fetchAcademicSchedules(BIG_UID), 'GET', schedulesPath(BIG_UID)],
  [
    'API-46',
    () => fetchSemesterReport(BIG_UID, { year: 2026, semester: 1 }),
    'GET',
    reportPath(BIG_UID),
  ],
];

for (const [name, call, method, path] of READ_APIS) {
  test(`${name}: 403/404/422/500 분류 및 자동 재시도 없음`, async () => {
    for (const [status, type] of [
      [403, SPENDING_ERROR_TYPE.FORBIDDEN],
      [404, SPENDING_ERROR_TYPE.NOT_FOUND],
      [422, SPENDING_ERROR_TYPE.VALIDATION],
      [500, SPENDING_ERROR_TYPE.SERVER],
    ]) {
      gateway.requests.length = 0;
      gateway.route(method, path, jsonRoute({ detail: 'x' }, { status }));
      const error = await rejectionOf(call());
      assert.equal(getSpendingErrorType(error), type);
      assert.equal(gateway.requestsTo(path).length, 1, '재시도 없음');
    }
  });

  test(`${name}: 응답 지연 → TIMEOUT, 연결 끊김 → NETWORK`, async () => {
    gateway.route(method, path, jsonRoute({}, { delay: 600 }));
    assert.equal(getSpendingErrorType(await rejectionOf(call())), SPENDING_ERROR_TYPE.TIMEOUT);

    gateway.route(method, path, () => ({ destroy: true }));
    assert.equal(getSpendingErrorType(await rejectionOf(call())), SPENDING_ERROR_TYPE.NETWORK);
  });

  test(`${name}: 잘못된 user_id는 요청 전 거부`, async () => {
    for (const userId of [123, '', '0123', 'abc', '9223372036854775808', undefined]) {
      gateway.requests.length = 0;
      const fn = {
        'API-42': () => fetchEventBuffer(userId),
        'API-43': () => fetchSpendingProfile(userId),
        'API-45': () => fetchAcademicSchedules(userId),
        'API-46': () => fetchSemesterReport(userId, { year: 2026, semester: 1 }),
      }[name];
      const error = await rejectionOf(fn());
      assert.equal(getSpendingErrorType(error), SPENDING_ERROR_TYPE.INVALID_REQUEST);
      assert.equal(gateway.requests.length, 0);
    }
  });
}

test('토큰이 없으면 401 → UNAUTHORIZED', async () => {
  await tokenService.clearTokens();
  gateway.route('GET', bufferPath(BIG_UID), jsonRoute({ event_buffer: '0' }));
  const error = await rejectionOf(fetchEventBuffer(BIG_UID));
  assert.equal(getSpendingErrorType(error), SPENDING_ERROR_TYPE.UNAUTHORIZED);
});

test('실제 서버 미호출: 모든 요청 목적지는 모의 Gateway(127.0.0.1)뿐', () => {
  assert.ok(everRequested.length > 0);
  assert.ok(everRequested.every(entry => entry.host === '127.0.0.1'));
});
