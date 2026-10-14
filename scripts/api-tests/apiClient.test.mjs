// 공통 API 통신 계층 단위 테스트 (모의 Gateway 사용, 실제 서버 호출 없음)
// 실행: npm run test:api
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MockGateway, authEnvelope } from './mockGateway.mjs';
import { __store as secureStore } from './stubs/expoSecureStore.mjs';

const gateway = new MockGateway();
const baseURL = await gateway.listen();

// apiClient/tokenService는 모듈 로드 시점에 env를 읽으므로 import 전에 설정한다.
process.env.EXPO_PUBLIC_API_BASE_URL = baseURL;
process.env.EXPO_PUBLIC_API_TIMEOUT = '3000';

const { default: apiClient, setSessionExpiredHandler } =
  await import('../../src/services/apiClient.js');
const tokenService = await import('../../src/services/tokenService.js');
const { API_ERROR_KIND } = await import('../../src/services/apiResponse.js');
const { transferFunds } = await import('../../src/features/asset/assetApi.js');

const ACCESS_KEY = 'ACCESS_TOKEN';
const REFRESH_KEY = 'REFRESH_TOKEN';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let sessionExpiredCalls = 0;
setSessionExpiredHandler(() => {
  sessionExpiredCalls += 1;
});

const rejectionOf = async promise => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail('요청이 실패해야 하는데 성공했습니다.');
};

const okRoute = body => () => ({ body });

before(() => {});
after(async () => {
  await gateway.close();
});

beforeEach(async () => {
  gateway.reset();
  await tokenService.clearTokens();
  sessionExpiredCalls = 0;
});

// 만료된 access token + 유효한 refresh token 상태로 시작
const startWithExpiredAccessToken = async () => {
  await tokenService.setTokens('expired-access', 'refresh-0');
};

// ── 서비스별 응답 형식 ─────────────────────────────────────────

test('Auth envelope: success=true면 data만 반환', async () => {
  gateway.validTokens.add('valid');
  await tokenService.setTokens('valid', 'refresh-0');
  gateway.route('GET', '/api/v1/auth/me', () => ({
    body: authEnvelope({ user_id: '123', onboarding_completed: false, name: '테스트' }),
  }));
  const data = await apiClient.get('/api/v1/auth/me');
  assert.deepEqual(data, { user_id: '123', onboarding_completed: false, name: '테스트' });
});

test('Auth envelope: data=null인 정상 응답은 null 그대로 반환', async () => {
  gateway.route('POST', '/api/v1/auth/login', () => ({ public: true, body: authEnvelope(null) }));
  assert.equal(await apiClient.post('/api/v1/auth/login', { phone_number: 'x', pin: 'y' }), null);
});

test('Auth envelope: HTTP 200이어도 success=false면 BUSINESS 오류', async () => {
  gateway.route('POST', '/api/v1/auth/login', () => ({
    public: true,
    body: authEnvelope(null, { success: false, code: 'AUTH-400-001', message: '입력값 오류' }),
  }));
  const error = await rejectionOf(apiClient.post('/api/v1/auth/login', {}));
  assert.equal(error.kind, API_ERROR_KIND.BUSINESS);
  assert.equal(error.code, 'AUTH-400-001');
  assert.equal(error.message, '입력값 오류');
  assert.equal(error.traceId, 'trace-envelope');
});

test('Auth 경로가 envelope가 아닌 본문을 주면 성공으로 취급하지 않음', async () => {
  gateway.route('POST', '/api/v1/auth/login', () => ({ public: true, body: { foo: 1 } }));
  const error = await rejectionOf(apiClient.post('/api/v1/auth/login', {}));
  assert.equal(error.kind, API_ERROR_KIND.BUSINESS);
});

test('Banking·Asset: 객체를 가공 없이 반환 (success 필드 요구 안 함)', async () => {
  gateway.validTokens.add('valid');
  await tokenService.setTokens('valid', 'refresh-0');
  const detail = { accountId: 1, balance: 0, transactionHistory: [], hasNext: false };
  gateway.route('GET', '/api/v1/assets/accounts/1/detail', okRoute(detail));
  const transfer = { transferId: 456, status: 'PROCESSING', externalTransactionId: null };
  gateway.route('POST', '/api/v1/banking/transfers', okRoute(transfer));

  assert.deepEqual(await apiClient.get('/api/v1/assets/accounts/1/detail'), detail);
  assert.deepEqual(
    await apiClient.post('/api/v1/banking/transfers', { amount: 1 }, { idempotent: true }),
    transfer
  );
});

test('Work: 배열·객체·빈 배열·null을 그대로 반환', async () => {
  gateway.validTokens.add('valid');
  await tokenService.setTokens('valid', 'refresh-0');
  gateway.route('GET', '/api/v1/work/calendar/universities', okRoute(['A대학', 'B대학']));
  gateway.route('GET', '/api/v1/work/onboarding/questions', okRoute([]));
  gateway.route(
    'GET',
    '/api/v1/work/onboarding/1/progress',
    okRoute({ answered_count: 0, is_completed: false })
  );
  gateway.route('GET', '/api/v1/work/recap/1/months', () => ({ rawBody: 'null' }));

  assert.deepEqual(await apiClient.get('/api/v1/work/calendar/universities'), ['A대학', 'B대학']);
  assert.deepEqual(await apiClient.get('/api/v1/work/onboarding/questions'), []);
  assert.deepEqual(await apiClient.get('/api/v1/work/onboarding/1/progress'), {
    answered_count: 0,
    is_completed: false,
  });
  assert.equal(await apiClient.get('/api/v1/work/recap/1/months'), null);
});

// ── 헤더 ─────────────────────────────────────────────────────

test('JWT 필요 API에는 Bearer 자동 첨부, 공개 Auth API에는 미첨부', async () => {
  gateway.validTokens.add('valid');
  await tokenService.setTokens('valid', 'refresh-0');
  gateway.route('GET', '/api/v1/work/onboarding/questions', okRoute([]));
  gateway.route('POST', '/api/v1/auth/login', () => ({ public: true, body: authEnvelope({}) }));

  await apiClient.get('/api/v1/work/onboarding/questions');
  await apiClient.post('/api/v1/auth/login', { phone_number: '01000000000', pin: '000000' });

  const [workReq] = gateway.requestsTo('/api/v1/work/onboarding/questions');
  const [loginReq] = gateway.requestsTo('/api/v1/auth/login');
  assert.equal(workReq.headers.authorization, 'Bearer valid');
  assert.equal(workReq.headers['content-type'], undefined, 'GET에는 Content-Type 없음');
  assert.equal(loginReq.headers.authorization, undefined);
  assert.match(loginReq.headers['content-type'], /application\/json/);
  assert.equal(loginReq.body.pin, '000000', 'PIN 앞자리 0 보존(문자열)');
});

// ── 오류 구분 ─────────────────────────────────────────────────

test('네트워크 미도달 → NETWORK', async () => {
  const error = await rejectionOf(apiClient.get('/api/v1/x', { baseURL: 'http://127.0.0.1:1' }));
  assert.equal(error.kind, API_ERROR_KIND.NETWORK);
  assert.equal(error.isNetworkError, true);
  assert.equal(error.status, null);
});

test('응답 지연 → TIMEOUT', async () => {
  gateway.route('GET', '/api/v1/slow', () => ({ public: true, delay: 500, body: {} }));
  const error = await rejectionOf(apiClient.get('/api/v1/slow', { timeout: 100 }));
  assert.equal(error.kind, API_ERROR_KIND.TIMEOUT);
});

test('토큰 없이 보호 API → AUTH_REQUIRED, refresh 시도 안 함', async () => {
  gateway.route('GET', '/api/v1/auth/me', okRoute({}));
  const error = await rejectionOf(apiClient.get('/api/v1/auth/me'));
  assert.equal(error.kind, API_ERROR_KIND.AUTH_REQUIRED);
  assert.equal(error.status, 401);
  assert.equal(error.code, 'UNAUTHENTICATED');
  assert.equal(error.traceId, 'trace-header', 'X-Trace-Id 헤더 보존');
  assert.equal(gateway.refreshCount, 0);
});

test('HTTP 4xx(비 envelope) / 5xx(envelope·본문 없음) 구분과 traceId 보존', async () => {
  gateway.route('GET', '/api/v1/e404', () => ({
    public: true,
    status: 404,
    body: { code: 'NOT_FOUND' },
  }));
  gateway.route('GET', '/api/v1/e500', () => ({
    public: true,
    status: 500,
    body: authEnvelope(null, { success: false, status: 500, code: 'AUTH-500-001' }),
  }));
  gateway.route('GET', '/api/v1/e503', () => ({ public: true, status: 503, rawBody: '' }));

  const e404 = await rejectionOf(apiClient.get('/api/v1/e404'));
  assert.equal(e404.kind, API_ERROR_KIND.HTTP_4XX);
  assert.equal(e404.status, 404);
  assert.equal(e404.code, 'NOT_FOUND');

  const e500 = await rejectionOf(apiClient.get('/api/v1/e500'));
  assert.equal(e500.kind, API_ERROR_KIND.HTTP_5XX);
  assert.equal(e500.code, 'AUTH-500-001');
  assert.equal(e500.traceId, 'trace-envelope');

  const e503 = await rejectionOf(apiClient.get('/api/v1/e503'));
  assert.equal(e503.kind, API_ERROR_KIND.HTTP_5XX);
  assert.equal(e503.traceId, 'trace-header');
});

test('로그인 실패(Auth 401 envelope)는 토큰 만료로 보지 않음 → refresh 없음', async () => {
  await tokenService.setTokens('valid', 'refresh-0');
  gateway.route('POST', '/api/v1/auth/login', () => ({
    public: true,
    status: 401,
    body: authEnvelope(null, { success: false, status: 401, code: 'AUTH-401-003' }),
  }));
  const error = await rejectionOf(apiClient.post('/api/v1/auth/login', {}));
  assert.equal(error.kind, API_ERROR_KIND.BUSINESS);
  assert.equal(error.code, 'AUTH-401-003');
  assert.equal(gateway.refreshCount, 0);
});

test('인증된 Auth API의 업무 401(예: PIN 불일치)은 재시도하지 않음', async () => {
  gateway.validTokens.add('valid');
  await tokenService.setTokens('valid', 'refresh-0');
  gateway.route('POST', '/api/v1/auth/pin/change', () => ({
    status: 401,
    body: authEnvelope(null, { success: false, status: 401, code: 'AUTH-401-003' }),
  }));
  await rejectionOf(apiClient.post('/api/v1/auth/pin/change', { current_pin: '000000' }));
  assert.equal(gateway.requestsTo('/api/v1/auth/pin/change').length, 1);
  assert.equal(gateway.refreshCount, 0);
});

// ── 토큰 갱신 ─────────────────────────────────────────────────

test('INVALID_TOKEN → refresh 1회 → 새 토큰으로 재시도 성공, 회전된 토큰 저장', async () => {
  await startWithExpiredAccessToken();
  gateway.route('GET', '/api/v1/work/onboarding/questions', okRoute([{ question_no: 1 }]));

  const data = await apiClient.get('/api/v1/work/onboarding/questions');
  assert.deepEqual(data, [{ question_no: 1 }]);
  assert.equal(gateway.refreshCount, 1);

  const [refreshReq] = gateway.requestsTo('/api/v1/auth/refresh');
  assert.deepEqual(refreshReq.body, { refresh_token: 'refresh-0' });
  assert.equal(refreshReq.headers.authorization, undefined, 'refresh 요청에는 Bearer 미첨부');

  const sent = gateway.requestsTo('/api/v1/work/onboarding/questions');
  assert.deepEqual(
    sent.map(r => r.headers.authorization),
    ['Bearer expired-access', 'Bearer access-1']
  );
  assert.equal(secureStore.get(ACCESS_KEY), 'access-1');
  assert.equal(secureStore.get(REFRESH_KEY), 'refresh-1');
});

test('refresh 응답의 refresh_token이 null이면 기존 refresh token 유지', async () => {
  await startWithExpiredAccessToken();
  gateway.rotateRefreshToken = false;
  gateway.route('GET', '/api/v1/work/onboarding/questions', okRoute([]));
  await apiClient.get('/api/v1/work/onboarding/questions');
  assert.equal(secureStore.get(REFRESH_KEY), 'refresh-0');
});

test('동시 요청 5개가 모두 만료 → refresh는 1번만 실행되고 모두 성공', async () => {
  await startWithExpiredAccessToken();
  gateway.refreshDelay = 150;
  gateway.route('GET', '/api/v1/work/onboarding/questions', okRoute([]));

  const results = await Promise.all(
    Array.from({ length: 5 }, () => apiClient.get('/api/v1/work/onboarding/questions'))
  );
  assert.equal(results.length, 5);
  assert.equal(gateway.refreshCount, 1);
  const retried = gateway
    .requestsTo('/api/v1/work/onboarding/questions')
    .filter(r => r.headers.authorization === 'Bearer access-1');
  assert.equal(retried.length, 5);
});

test('refreshAccessToken 동시 직접 호출(인터셉터·thunk 혼재)도 서버 refresh는 1번', async () => {
  await startWithExpiredAccessToken();
  gateway.refreshDelay = 100;
  const tokens = await Promise.all([
    tokenService.refreshAccessToken(),
    tokenService.refreshAccessToken(),
    tokenService.refreshAccessToken(),
  ]);
  assert.deepEqual(tokens, ['access-1', 'access-1', 'access-1']);
  assert.equal(gateway.refreshCount, 1);
  assert.equal(tokenService.getPendingRefresh(), null, '완료 후 진행 중 상태 해제');
});

test('뒤늦은 401: 갱신 완료 후 구 토큰 요청의 401은 refresh 없이 현재 토큰으로 재시도', async () => {
  await startWithExpiredAccessToken();
  gateway.refreshDelay = 50;
  gateway.route('GET', '/api/v1/fast', okRoute({ ok: 'fast' }));
  // 구 토큰으로 보낸 요청이 refresh 완료(약 50ms) 이후인 400ms 뒤에야 401을 받는다.
  gateway.route('GET', '/api/v1/slow', ({ record }) =>
    record.headers.authorization === 'Bearer expired-access'
      ? { delay: 400, body: { ok: 'slow' } }
      : { body: { ok: 'slow' } }
  );

  const [fast, slow] = await Promise.all([
    apiClient.get('/api/v1/fast'),
    apiClient.get('/api/v1/slow'),
  ]);
  assert.deepEqual(fast, { ok: 'fast' });
  assert.deepEqual(slow, { ok: 'slow' });
  assert.equal(gateway.refreshCount, 1, '뒤늦은 401은 추가 refresh를 만들지 않음');
  assert.deepEqual(
    gateway.requestsTo('/api/v1/slow').map(r => r.headers.authorization),
    ['Bearer expired-access', 'Bearer access-1']
  );
});

test('무한 재시도 방지: 새 토큰도 거부되면 refresh 1회·재시도 1회 후 종료', async () => {
  await startWithExpiredAccessToken();
  gateway.rejectAllTokens = true;
  gateway.route('GET', '/api/v1/work/onboarding/questions', okRoute([]));

  const error = await rejectionOf(apiClient.get('/api/v1/work/onboarding/questions'));
  assert.equal(error.kind, API_ERROR_KIND.TOKEN_INVALID);
  assert.equal(gateway.refreshCount, 1);
  assert.equal(gateway.requestsTo('/api/v1/work/onboarding/questions').length, 2);
});

test('무한 재시도 방지: 뒤늦은 401 → 토큰 교체 → refresh → 그래도 401이면 최대 3번 전송 후 종료', async () => {
  await startWithExpiredAccessToken();
  gateway.rejectAllTokens = true;
  gateway.route('GET', '/api/v1/slow', () => ({ delay: 200, body: {} }));

  const pending = apiClient.get('/api/v1/slow');
  // 요청이 날아가는 동안 다른 경로로 토큰이 바뀐 상황(예: 다른 요청의 갱신 완료)
  await new Promise(resolve => setTimeout(resolve, 50));
  await tokenService.setTokens('newer-access', 'refresh-0');

  const error = await rejectionOf(pending);
  assert.equal(error.kind, API_ERROR_KIND.TOKEN_INVALID);
  assert.deepEqual(
    gateway.requestsTo('/api/v1/slow').map(r => r.headers.authorization),
    ['Bearer expired-access', 'Bearer newer-access', 'Bearer access-1']
  );
  assert.equal(gateway.refreshCount, 1);
});

test('refresh 거부(401 RE_LOGIN) → 토큰 삭제, SESSION_EXPIRED, 세션 만료 알림 1회', async () => {
  await startWithExpiredAccessToken();
  gateway.refreshMode = 'reject';
  gateway.refreshDelay = 100;
  gateway.route('GET', '/api/v1/work/onboarding/questions', okRoute([]));

  const errors = await Promise.all(
    Array.from({ length: 3 }, () => rejectionOf(apiClient.get('/api/v1/work/onboarding/questions')))
  );
  for (const error of errors) {
    assert.equal(error.kind, API_ERROR_KIND.SESSION_EXPIRED);
    assert.equal(error.requiredAction, 'RE_LOGIN');
    assert.equal(error.code, 'AUTH-401-005');
  }
  assert.equal(gateway.refreshCount, 1);
  assert.equal(sessionExpiredCalls, 1);
  assert.equal(secureStore.has(ACCESS_KEY), false);
  assert.equal(secureStore.has(REFRESH_KEY), false);
  assert.equal(await tokenService.getAccessToken(), null);
});

test('refresh 중 네트워크 오류 → NETWORK 오류, 토큰 유지, 세션 만료 처리 안 함', async () => {
  await startWithExpiredAccessToken();
  gateway.refreshMode = 'network';
  gateway.route('GET', '/api/v1/work/onboarding/questions', okRoute([]));

  const error = await rejectionOf(apiClient.get('/api/v1/work/onboarding/questions'));
  assert.equal(error.kind, API_ERROR_KIND.NETWORK);
  assert.equal(sessionExpiredCalls, 0);
  assert.equal(secureStore.get(ACCESS_KEY), 'expired-access');
  assert.equal(secureStore.get(REFRESH_KEY), 'refresh-0');
});

test('refresh token이 없으면 서버 호출 없이 SESSION_EXPIRED', async () => {
  secureStore.set(ACCESS_KEY, 'expired-access');
  gateway.route('GET', '/api/v1/work/onboarding/questions', okRoute([]));
  const error = await rejectionOf(apiClient.get('/api/v1/work/onboarding/questions'));
  assert.equal(error.kind, API_ERROR_KIND.SESSION_EXPIRED);
  assert.equal(gateway.refreshCount, 0);
});

// ── Idempotency-Key ──────────────────────────────────────────

test('Idempotency-Key: refresh 후 재전송에도 최초 키 유지 (UUID가 아닌 문자열 키 그대로)', async () => {
  await startWithExpiredAccessToken();
  gateway.route(
    'POST',
    '/api/v1/banking/transfers',
    okRoute({ transferId: 1, status: 'ACCEPTED' })
  );

  await apiClient.post(
    '/api/v1/banking/transfers',
    { withdrawalAccountId: 1, amount: 10000 },
    { idempotent: true, idempotencyKey: 'demo-transfer-001' }
  );
  const sent = gateway.requestsTo('/api/v1/banking/transfers');
  assert.equal(sent.length, 2);
  assert.deepEqual(
    sent.map(r => r.headers['idempotency-key']),
    ['demo-transfer-001', 'demo-transfer-001']
  );
});

test('Idempotency-Key: 키 없는 새 송금은 매번 새 키, 각 송금의 재시도는 자기 키 유지', async () => {
  await startWithExpiredAccessToken();
  gateway.refreshDelay = 100;
  gateway.route(
    'POST',
    '/api/v1/banking/transfers',
    okRoute({ transferId: 1, status: 'ACCEPTED' })
  );

  await Promise.all([
    apiClient.post('/api/v1/banking/transfers', { amount: 1 }, { idempotent: true }),
    apiClient.post('/api/v1/banking/transfers', { amount: 2 }, { idempotent: true }),
  ]);

  const sent = gateway.requestsTo('/api/v1/banking/transfers');
  assert.equal(sent.length, 4);
  const keysByAmount = new Map();
  for (const r of sent) {
    assert.match(r.headers['idempotency-key'], UUID_V4);
    const keys = keysByAmount.get(r.body.amount) ?? new Set();
    keys.add(r.headers['idempotency-key']);
    keysByAmount.set(r.body.amount, keys);
  }
  assert.equal(keysByAmount.get(1).size, 1, '송금 1의 재시도는 같은 키');
  assert.equal(keysByAmount.get(2).size, 1, '송금 2의 재시도는 같은 키');
  assert.notEqual([...keysByAmount.get(1)][0], [...keysByAmount.get(2)][0], '새 송금은 다른 키');
});

test('Idempotency-Key: 뒤늦은 401로 토큰 교체 재시도해도 키 유지', async () => {
  await startWithExpiredAccessToken();
  gateway.route('POST', '/api/v1/fast', okRoute({}));
  gateway.route('POST', '/api/v1/banking/transfers', ({ record }) =>
    record.headers.authorization === 'Bearer expired-access'
      ? { delay: 300, body: {} }
      : { body: { transferId: 9, status: 'COMPLETED' } }
  );

  await Promise.all([
    apiClient.post('/api/v1/fast', {}),
    apiClient.post(
      '/api/v1/banking/transfers',
      { amount: 3 },
      { idempotent: true, idempotencyKey: 'late-key-1' }
    ),
  ]);
  const sent = gateway.requestsTo('/api/v1/banking/transfers');
  assert.deepEqual(
    sent.map(r => [r.headers.authorization, r.headers['idempotency-key']]),
    [
      ['Bearer expired-access', 'late-key-1'],
      ['Bearer access-1', 'late-key-1'],
    ]
  );
  assert.equal(gateway.refreshCount, 1);
});

test('transferFunds: 실패 시 사용한 키를 반환 → 같은 키로 재시도 가능 (모의 서버만 호출)', async () => {
  gateway.validTokens.add('valid');
  await tokenService.setTokens('valid', 'refresh-0');
  gateway.route('POST', '/api/v1/banking/transfers', () => ({
    status: 500,
    body: { code: 'TEMP' },
  }));

  const getState = () => ({ asset: { transferLoading: false } });
  const run = arg => transferFunds(arg)(() => {}, getState, undefined);
  const input = {
    withdrawalAccountId: '123',
    depositBankCode: '001',
    depositAccountNumber: '110123456789',
    amount: 1000,
  };

  const first = await run(input);
  assert.equal(first.type, 'asset/transferFunds/rejected');
  const generatedKey = first.payload.idempotencyKey;
  assert.match(generatedKey, UUID_V4);

  const retry = await run({ ...input, idempotencyKey: generatedKey });
  assert.equal(retry.payload.idempotencyKey, generatedKey);

  const custom = await run({ ...input, idempotencyKey: 'demo-transfer-001' });
  assert.equal(custom.payload.idempotencyKey, 'demo-transfer-001');
  assert.equal(custom.payload.kind, API_ERROR_KIND.HTTP_5XX);

  assert.deepEqual(
    gateway.requestsTo('/api/v1/banking/transfers').map(r => r.headers['idempotency-key']),
    [generatedKey, generatedKey, 'demo-transfer-001']
  );
  assert.equal(
    gateway.requestsTo('/api/v1/banking/transfers').every(r => r.body.idempotencyKey === undefined),
    true,
    '키는 본문이 아닌 헤더로만 전송'
  );
});
