// Work 이상거래(FDS) API 통신 레이어(API-25~28) 단위 테스트 (모의 Gateway 사용, 실제 서버 호출 없음)
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/fdsApi.test.mjs
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
const fdsApiModule = await import('../../src/features/work/fdsApi.js');
const {
  FDS_ERROR_TYPE,
  FDS_REQUEST_ERROR,
  buildFdsAlertsQuery,
  buildFdsLogsQuery,
  confirmFdsAlert,
  fetchFdsAlerts,
  fetchFdsLogs,
  fetchSafetyScore,
  getFdsErrorType,
} = fdsApiModule;

// JS Number로는 정확히 표현할 수 없는 크기의 user_id / TSID alert id
const BIG_UID = '123456789012345678';
const BIG_ALERT_ID = '1234567890123456789'; // 19자리. Number(...)는 1234567890123456800
const OTHER_ALERT_ID = '1234567890123456788'; // Number로는 BIG_ALERT_ID와 같은 값이 되는 이웃 id
const logsPath = uid => `/api/v1/work/fds/${uid}/logs`;
const alertsPath = uid => `/api/v1/work/fds/${uid}/alerts`;
const confirmPath = (uid, aid) => `/api/v1/work/fds/${uid}/alerts/${aid}/confirm`;
const scorePath = uid => `/api/v1/work/fds/${uid}/safety-score`;

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

// 서버가 보내는 JSON 원문 그대로 응답한다(큰 정수 리터럴 보존).
const rawJsonRoute =
  (rawBody, extra = {}) =>
  () => ({ rawBody, ...extra });

// ── 픽스처 (서버 소스 endpoints/fds.py 형태) ─────────────────

const logFixture = (overrides = {}) => ({
  id: 7,
  transaction_id: 'tx-1',
  amount: '10000.0000',
  risk_score: '0.1500',
  risk_level: 'LOW',
  reason_code: 'NORMAL',
  is_alerted: false,
  created_at: '2026-10-11 03:00:00',
  ...overrides,
});

const alertFixture = (overrides = {}) => ({
  id: 8,
  transaction_id: 'work-fds-1-1',
  amount: '900000.0000',
  merchant: null,
  risk_level: 'HIGH',
  reason_code: 'RULE_ABNORMAL_AMOUNT(z=4.2)',
  message: '🚨 이상 거래가 감지됐어요.',
  is_confirmed: false,
  confirmed_at: null,
  created_at: '2026-10-11 03:00:00',
  ...overrides,
});

const alertsFixture = (overrides = {}) => ({
  user_id: 123,
  total: 1,
  unread: 1,
  returned: 1,
  alerts: [alertFixture()],
  ...overrides,
});

const scoreFixture = (overrides = {}) => ({
  user_id: 123,
  safety_score: 92,
  grade: 'A',
  emoji: '🛡️',
  total_tx: 12,
  high_count: 0,
  medium_count: 1,
  period_days: 30,
  message: '안전한 소비 습관이에요.',
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

test('엔드포인트 상수: 명세 경로와 일치, API-21(detect) 상수·함수는 두지 않음', () => {
  assert.equal(API_ENDPOINTS.WORK.FDS.LOGS(BIG_UID), logsPath(BIG_UID));
  assert.equal(API_ENDPOINTS.WORK.FDS.ALERTS(BIG_UID), alertsPath(BIG_UID));
  assert.equal(
    API_ENDPOINTS.WORK.FDS.ALERT_CONFIRM(BIG_UID, BIG_ALERT_ID),
    confirmPath(BIG_UID, BIG_ALERT_ID)
  );
  assert.equal(API_ENDPOINTS.WORK.FDS.SAFETY_SCORE(BIG_UID), scorePath(BIG_UID));
  assert.equal('DETECT' in API_ENDPOINTS.WORK.FDS, false);
  assert.equal(
    Object.keys(fdsApiModule).some(name => /detect/i.test(name)),
    false
  );
});

// ── API-25 ───────────────────────────────────────────────────

test('API-25: GET, Bearer 첨부, limit 전달, 로그를 서버 순서대로 변환(금액·점수·시각 문자열 보존)', async () => {
  gateway.route(
    'GET',
    logsPath(BIG_UID),
    jsonRoute([
      logFixture({ id: 2, transaction_id: 'tx-2', risk_level: 'HIGH', is_alerted: true }),
      logFixture({ reason_code: null }),
    ])
  );

  const logs = await fetchFdsLogs(BIG_UID, { limit: 30 });

  const [request] = gateway.requestsTo(logsPath(BIG_UID));
  assert.equal(request.method, 'GET');
  assert.equal(request.headers.authorization, 'Bearer valid');
  assert.equal(request.body, undefined);
  assert.equal(new URLSearchParams(request.query).get('limit'), '30');
  assert.equal(new URLSearchParams(request.query).has('offset'), false, 'offset 미지원');

  assert.equal(logs.length, 2);
  assert.deepEqual(logs[0], {
    logId: '2',
    transactionId: 'tx-2',
    amount: '10000.0000',
    riskScore: '0.1500',
    riskLevel: 'HIGH',
    reasonCode: 'NORMAL',
    isAlerted: true,
    createdAt: '2026-10-11 03:00:00',
  });
  assert.equal(logs[1].reasonCode, null);
});

test('API-25: 큰 TSID id를 문자열로 정확히 보존, 빈 배열은 정상', async () => {
  gateway.route(
    'GET',
    logsPath(BIG_UID),
    rawJsonRoute(
      `[{"id":${BIG_ALERT_ID},"transaction_id":"t","amount":"1.0000","risk_score":"0.1000","risk_level":"LOW","reason_code":null,"is_alerted":false,"created_at":"2026-10-11 03:00:00"}]`
    )
  );
  const [log] = await fetchFdsLogs(BIG_UID);
  assert.equal(log.logId, BIG_ALERT_ID);
  assert.equal(gateway.requestsTo(logsPath(BIG_UID))[0].query, '', '쿼리 미지정 시 키 없음');

  gateway.route('GET', logsPath(BIG_UID), jsonRoute([]));
  assert.deepEqual(await fetchFdsLogs(BIG_UID), []);
});

test('API-25: 응답 형식 위반 → invalidResponse', async () => {
  for (const body of [
    { logs: [] },
    [logFixture({ amount: 10000 })],
    [logFixture({ is_alerted: 'false' })],
    [logFixture({ created_at: '' })],
    [logFixture({ id: 0 })],
    [logFixture({ id: 'abc' })],
  ]) {
    gateway.route('GET', logsPath(BIG_UID), jsonRoute(body));
    const error = await rejectionOf(fetchFdsLogs(BIG_UID));
    assert.equal(error.invalidResponse, true, JSON.stringify(body));
  }
});

test('API-25: limit 범위(1~100) 위반은 요청 전 거부', () => {
  for (const limit of [0, 101, 1.5, '20', -1]) {
    assert.throws(() => buildFdsLogsQuery({ limit }), /limit/, String(limit));
  }
  assert.deepEqual(buildFdsLogsQuery({ limit: 100 }), { limit: 100 });
  assert.deepEqual(buildFdsLogsQuery(), {});
});

// ── API-26 ───────────────────────────────────────────────────

test('API-26: GET, limit·unread 전달, 객체 응답 변환(집계 total/unread 보존, 응답 user_id 무시)', async () => {
  gateway.route(
    'GET',
    alertsPath(BIG_UID),
    jsonRoute(
      alertsFixture({
        total: 5,
        unread: 2,
        returned: 1,
        alerts: [
          alertFixture({
            id: 9,
            merchant: '편의점',
            is_confirmed: true,
            confirmed_at: '2026-10-11 04:00:00',
          }),
        ],
      })
    )
  );

  const result = await fetchFdsAlerts(BIG_UID, { limit: 20, unread: true });

  const [request] = gateway.requestsTo(alertsPath(BIG_UID));
  assert.equal(request.method, 'GET');
  assert.equal(request.headers.authorization, 'Bearer valid');
  const query = new URLSearchParams(request.query);
  assert.equal(query.get('limit'), '20');
  assert.equal(query.get('unread'), 'true');

  assert.equal(result.total, 5);
  assert.equal(result.unread, 2);
  assert.equal(result.returned, 1);
  assert.deepEqual(result.alerts[0], {
    alertId: '9',
    transactionId: 'work-fds-1-1',
    amount: '900000.0000',
    merchant: '편의점',
    riskLevel: 'HIGH',
    reasonCode: 'RULE_ABNORMAL_AMOUNT(z=4.2)',
    message: '🚨 이상 거래가 감지됐어요.',
    isConfirmed: true,
    confirmedAt: '2026-10-11 04:00:00',
    createdAt: '2026-10-11 03:00:00',
  });
  assert.equal('userId' in result, false);
});

test('API-26: unread 미지정/false면 키를 보내지 않고 limit도 지정한 경우만 전달', async () => {
  gateway.route('GET', alertsPath(BIG_UID), jsonRoute(alertsFixture()));

  await fetchFdsAlerts(BIG_UID);
  await fetchFdsAlerts(BIG_UID, { unread: false });

  const [first, second] = gateway.requestsTo(alertsPath(BIG_UID));
  assert.equal(first.query, '');
  assert.equal(second.query, '');
});

test('API-26: 알림 없음(total 0, 빈 배열)은 정상 응답 — 가짜 알림·오류로 바꾸지 않음', async () => {
  gateway.route(
    'GET',
    alertsPath(BIG_UID),
    jsonRoute({ user_id: 1, total: 0, unread: 0, returned: 0, alerts: [] })
  );
  assert.deepEqual(await fetchFdsAlerts(BIG_UID), {
    total: 0,
    unread: 0,
    returned: 0,
    alerts: [],
  });
});

test('API-26: TSID alert id를 문자열로 정확히 보존(JSON.parse였다면 이웃 id와 구분 불가)', async () => {
  assert.equal(
    String(Number(BIG_ALERT_ID)),
    String(Number(OTHER_ALERT_ID)),
    '전제: Number는 둘을 구분 못 함'
  );

  gateway.route(
    'GET',
    alertsPath(BIG_UID),
    rawJsonRoute(
      `{"user_id":${BIG_UID},"total":2,"unread":2,"returned":2,"alerts":[` +
        `{"id":${BIG_ALERT_ID},"transaction_id":"a","amount":"1.0000","merchant":null,"risk_level":"HIGH","reason_code":null,"message":"m","is_confirmed":false,"confirmed_at":null,"created_at":"2026-10-11 03:00:00"},` +
        `{"id":${OTHER_ALERT_ID},"transaction_id":"b","amount":"2.0000","merchant":null,"risk_level":"MEDIUM","reason_code":null,"message":"m","is_confirmed":false,"confirmed_at":null,"created_at":"2026-10-11 03:00:01"}]}`
    )
  );

  const { alerts } = await fetchFdsAlerts(BIG_UID);

  assert.deepEqual(
    alerts.map(alert => alert.alertId),
    [BIG_ALERT_ID, OTHER_ALERT_ID]
  );
});

test('API-26: 응답 형식 위반 → invalidResponse', async () => {
  for (const body of [
    [],
    alertsFixture({ total: '1' }),
    alertsFixture({ alerts: {} }),
    alertsFixture({ alerts: [alertFixture({ amount: 900000 })] }),
    alertsFixture({ alerts: [alertFixture({ is_confirmed: 0 })] }),
    alertsFixture({ alerts: [alertFixture({ confirmed_at: '' })] }),
    alertsFixture({ alerts: [alertFixture({ merchant: undefined })] }),
    { user_id: 1, total: 0, unread: 0, alerts: [] }, // returned 누락
  ]) {
    gateway.route('GET', alertsPath(BIG_UID), jsonRoute(body));
    const error = await rejectionOf(fetchFdsAlerts(BIG_UID));
    assert.equal(error.invalidResponse, true, JSON.stringify(body));
  }
});

test('API-26: 쿼리 검증', () => {
  for (const limit of [0, 101, 2.5, '20']) {
    assert.throws(() => buildFdsAlertsQuery({ limit }), /limit/);
  }
  for (const unread of ['true', 1, 0]) {
    try {
      buildFdsAlertsQuery({ unread });
      assert.fail('거부되어야 함');
    } catch (error) {
      assert.equal(error.code, FDS_REQUEST_ERROR.INVALID_UNREAD);
    }
  }
  assert.deepEqual(buildFdsAlertsQuery({ limit: 50, unread: true }), { limit: 50, unread: true });
});

// ── API-27 ───────────────────────────────────────────────────

test('API-27: PATCH, 본문 없음, 큰 alert id가 경로에 정확히 들어가고 응답 alert_id 대조', async () => {
  gateway.route(
    'PATCH',
    confirmPath(BIG_UID, BIG_ALERT_ID),
    rawJsonRoute(
      `{"alert_id":${BIG_ALERT_ID},"is_confirmed":true,"confirmed_at":"2026-10-11 05:00:00","message":"✅ 알림이 확인 처리됐습니다."}`
    )
  );

  const result = await confirmFdsAlert(BIG_UID, BIG_ALERT_ID);

  assert.deepEqual(result, {
    alertId: BIG_ALERT_ID,
    isConfirmed: true,
    confirmedAt: '2026-10-11 05:00:00',
  });
  const requests = gateway.requestsTo(confirmPath(BIG_UID, BIG_ALERT_ID));
  assert.equal(requests.length, 1, '경로가 원문 id와 정확히 같고 요청은 1회');
  const [request] = requests;
  assert.equal(request.method, 'PATCH');
  assert.equal(request.headers.authorization, 'Bearer valid');
  assert.equal(request.rawBody, undefined, '본문 없음');
  assert.equal(request.headers['idempotency-key'], undefined);
  assert.equal(request.query, '');
  // 이웃 id 경로로는 요청이 나가지 않았다.
  assert.equal(gateway.requestsTo(confirmPath(BIG_UID, OTHER_ALERT_ID)).length, 0);
});

test('API-27: 작은 alert id(JSON 숫자)도 정상, 응답 alert_id가 다르면 invalidResponse', async () => {
  gateway.route(
    'PATCH',
    confirmPath(BIG_UID, '8'),
    jsonRoute({
      alert_id: 8,
      is_confirmed: true,
      confirmed_at: '2026-10-11 05:00:00',
      message: 'm',
    })
  );
  assert.equal((await confirmFdsAlert(BIG_UID, '8')).alertId, '8');

  for (const body of [
    { alert_id: 9, is_confirmed: true, confirmed_at: '2026-10-11 05:00:00' },
    { alert_id: 8, is_confirmed: false, confirmed_at: '2026-10-11 05:00:00' },
    { alert_id: 8, is_confirmed: true },
    { alert_id: 8, is_confirmed: true, confirmed_at: '' },
    [],
  ]) {
    gateway.route('PATCH', confirmPath(BIG_UID, '8'), jsonRoute(body));
    const error = await rejectionOf(confirmFdsAlert(BIG_UID, '8'));
    assert.equal(error.invalidResponse, true, JSON.stringify(body));
  }
});

test('API-27: 잘못된 user_id/alert_id는 요청 전 거부(서버 요청 0회)', async () => {
  for (const [userId, alertId] of [
    [BIG_UID, 8],
    [BIG_UID, ''],
    [BIG_UID, '0'],
    [BIG_UID, '08'],
    [BIG_UID, '8/confirm'],
    [BIG_UID, '../8'],
    [BIG_UID, '9223372036854775808'],
    [BIG_UID, undefined],
    [123, '8'],
    ['abc', '8'],
  ]) {
    const error = await rejectionOf(confirmFdsAlert(userId, alertId));
    assert.equal(
      getFdsErrorType(error),
      FDS_ERROR_TYPE.INVALID_REQUEST,
      JSON.stringify([userId, alertId])
    );
  }
  assert.equal(gateway.requests.length, 0);
});

test('API-27: 403/404/422/500 분류, 어떤 경우에도 자동 재시도 없음', async () => {
  for (const [status, type] of [
    [403, FDS_ERROR_TYPE.FORBIDDEN],
    [404, FDS_ERROR_TYPE.NOT_FOUND],
    [422, FDS_ERROR_TYPE.VALIDATION],
    [500, FDS_ERROR_TYPE.SERVER],
  ]) {
    gateway.requests.length = 0;
    gateway.route('PATCH', confirmPath(BIG_UID, '8'), jsonRoute({ detail: 'x' }, { status }));
    const error = await rejectionOf(confirmFdsAlert(BIG_UID, '8'));
    assert.equal(getFdsErrorType(error), type);
    assert.equal(gateway.requestsTo(confirmPath(BIG_UID, '8')).length, 1, '재시도 없음');
  }
});

test('API-27: 응답 지연 → TIMEOUT, 연결 끊김 → NETWORK', async () => {
  gateway.route('PATCH', confirmPath(BIG_UID, '8'), jsonRoute({}, { delay: 600 }));
  assert.equal(
    getFdsErrorType(await rejectionOf(confirmFdsAlert(BIG_UID, '8'))),
    FDS_ERROR_TYPE.TIMEOUT
  );
  gateway.route('PATCH', confirmPath(BIG_UID, '8'), () => ({ destroy: true }));
  assert.equal(
    getFdsErrorType(await rejectionOf(confirmFdsAlert(BIG_UID, '8'))),
    FDS_ERROR_TYPE.NETWORK
  );
});

// ── API-28 ───────────────────────────────────────────────────

test('API-28: GET, 서버 점수·등급·메시지를 그대로 전달(재계산 없음)', async () => {
  gateway.route('GET', scorePath(BIG_UID), jsonRoute(scoreFixture()));

  const score = await fetchSafetyScore(BIG_UID);

  assert.deepEqual(score, {
    safetyScore: 92,
    grade: 'A',
    emoji: '🛡️',
    totalTx: 12,
    highCount: 0,
    mediumCount: 1,
    periodDays: 30,
    message: '안전한 소비 습관이에요.',
  });
  const [request] = gateway.requestsTo(scorePath(BIG_UID));
  assert.equal(request.method, 'GET');
  assert.equal(request.headers.authorization, 'Bearer valid');
  assert.equal(request.query, '');
});

test('API-28: 거래 0건(100점/A)도 서버 값 그대로 전달', async () => {
  gateway.route(
    'GET',
    scorePath(BIG_UID),
    jsonRoute(scoreFixture({ safety_score: 100, total_tx: 0, high_count: 0, medium_count: 0 }))
  );
  const score = await fetchSafetyScore(BIG_UID);
  assert.equal(score.safetyScore, 100);
  assert.equal(score.grade, 'A');
  assert.equal(score.totalTx, 0);
});

test('API-28: 서버가 주지 않는 필드(top_category 등)는 읽지 않고, 응답 형식 위반은 invalidResponse', async () => {
  gateway.route(
    'GET',
    scorePath(BIG_UID),
    jsonRoute(scoreFixture({ top_category: '식비', risk_score_baseline: '0.1' }))
  );
  const score = await fetchSafetyScore(BIG_UID);
  assert.equal('topCategory' in score, false);

  for (const body of [
    [],
    scoreFixture({ safety_score: '92' }),
    scoreFixture({ safety_score: -1 }),
    scoreFixture({ grade: '' }),
    scoreFixture({ total_tx: null }),
    scoreFixture({ message: null }),
  ]) {
    gateway.route('GET', scorePath(BIG_UID), jsonRoute(body));
    const error = await rejectionOf(fetchSafetyScore(BIG_UID));
    assert.equal(error.invalidResponse, true, JSON.stringify(body));
  }
});

// ── 공통 오류/인증 ───────────────────────────────────────────

const READ_APIS = [
  ['API-25', uid => fetchFdsLogs(uid), logsPath],
  ['API-26', uid => fetchFdsAlerts(uid), alertsPath],
  ['API-28', uid => fetchSafetyScore(uid), scorePath],
];

for (const [name, call, pathOf] of READ_APIS) {
  test(`${name}: 403/404/422/500 분류 및 자동 재시도 없음`, async () => {
    for (const [status, type] of [
      [403, FDS_ERROR_TYPE.FORBIDDEN],
      [404, FDS_ERROR_TYPE.NOT_FOUND],
      [422, FDS_ERROR_TYPE.VALIDATION],
      [500, FDS_ERROR_TYPE.SERVER],
    ]) {
      gateway.requests.length = 0;
      gateway.route('GET', pathOf(BIG_UID), jsonRoute({ detail: 'x' }, { status }));
      const error = await rejectionOf(call(BIG_UID));
      assert.equal(getFdsErrorType(error), type);
      assert.equal(gateway.requestsTo(pathOf(BIG_UID)).length, 1, '재시도 없음');
    }
  });

  test(`${name}: 5xx 오류 본문({code,message})이 파싱 변환 때문에 깨지지 않음`, async () => {
    gateway.route(
      'GET',
      pathOf(BIG_UID),
      jsonRoute(
        { code: 'DB_ERROR', message: '오류', service: 'moaje-work-service' },
        { status: 500 }
      )
    );
    const error = await rejectionOf(call(BIG_UID));
    assert.equal(error.status, 500);
    assert.equal(error.code, 'DB_ERROR');
  });

  test(`${name}: 응답 지연 → TIMEOUT, 연결 끊김 → NETWORK`, async () => {
    gateway.route('GET', pathOf(BIG_UID), jsonRoute({}, { delay: 600 }));
    assert.equal(getFdsErrorType(await rejectionOf(call(BIG_UID))), FDS_ERROR_TYPE.TIMEOUT);

    gateway.route('GET', pathOf(BIG_UID), () => ({ destroy: true }));
    assert.equal(getFdsErrorType(await rejectionOf(call(BIG_UID))), FDS_ERROR_TYPE.NETWORK);
  });

  test(`${name}: 잘못된 user_id는 요청 전 거부`, async () => {
    for (const userId of [123, '', '0123', 'abc', '9223372036854775808', undefined]) {
      gateway.requests.length = 0;
      const error = await rejectionOf(call(userId));
      assert.equal(getFdsErrorType(error), FDS_ERROR_TYPE.INVALID_REQUEST);
      assert.equal(gateway.requests.length, 0);
    }
  });
}

test('토큰이 없으면 401 → UNAUTHORIZED (API-25/26/27/28)', async () => {
  await tokenService.clearTokens();
  gateway.route('GET', logsPath(BIG_UID), jsonRoute([]));
  gateway.route('GET', alertsPath(BIG_UID), jsonRoute(alertsFixture()));
  gateway.route('PATCH', confirmPath(BIG_UID, '8'), jsonRoute({}));
  gateway.route('GET', scorePath(BIG_UID), jsonRoute(scoreFixture()));

  for (const call of [
    () => fetchFdsLogs(BIG_UID),
    () => fetchFdsAlerts(BIG_UID),
    () => confirmFdsAlert(BIG_UID, '8'),
    () => fetchSafetyScore(BIG_UID),
  ]) {
    const error = await rejectionOf(call());
    assert.equal(getFdsErrorType(error), FDS_ERROR_TYPE.UNAUTHORIZED);
  }
});

test('실제 서버 미호출: 모든 요청 목적지는 모의 Gateway(127.0.0.1)뿐', () => {
  assert.ok(everRequested.length > 0);
  assert.ok(everRequested.every(entry => entry.host === '127.0.0.1'));
});

test('매퍼: 안전 정수 범위를 넘는 JSON 숫자 id(파서 미적용 = 이미 반올림)는 거부', () => {
  const { mapFdsAlertsResponse, mapFdsLogsResponse } = fdsApiModule;
  assert.throws(
    () => mapFdsLogsResponse([logFixture({ id: 2 ** 62 })]),
    error => error.invalidResponse === true
  );
  assert.throws(
    () => mapFdsAlertsResponse(alertsFixture({ alerts: [alertFixture({ id: 2 ** 62 })] })),
    error => error.invalidResponse === true
  );
});
