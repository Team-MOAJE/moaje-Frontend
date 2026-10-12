// 로그아웃(API-08) + 인증 상태 경합 방지 테스트 (모의 Gateway·스텁 사용, 실제 서버 호출 없음)
// 실행: npm run test:api
// 서버 오류 코드(401/400/423 등)는 Docker 소스 분석 결과이며 실요청 검증 전이다.
// 토큰·전화번호·PIN은 모의 서버 전용 가짜 값이며 출력하지 않는다.
import { test, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { configureStore } from '@reduxjs/toolkit';
import { MockGateway, authEnvelope } from './mockGateway.mjs';
import {
  __store as secureStore,
  __control as secureControl,
  __resetControl as resetSecureControl,
  __createGate as createGate,
} from './stubs/expoSecureStore.mjs';
import {
  __store as asyncStore,
  __control as asyncControl,
  __resetControl as resetAsyncControl,
} from './stubs/asyncStorage.mjs';

const gateway = new MockGateway();
const baseURL = await gateway.listen();

process.env.EXPO_PUBLIC_API_BASE_URL = baseURL;
process.env.EXPO_PUBLIC_API_TIMEOUT = '1500';

const { default: apiClient, setSessionExpiredHandler } =
  await import('../../src/services/apiClient.js');
const tokenService = await import('../../src/services/tokenService.js');
const { loginUser, registerUser, logoutUser, restoreSession, fetchCurrentUser } =
  await import('../../src/features/auth/authApi.js');
const { default: authReducer, logout } = await import('../../src/features/auth/authSlice.js');

const LOGIN = '/api/v1/auth/login';
const REGISTER = '/api/v1/auth/register';
const LOGOUT = '/api/v1/auth/logout';
const ME = '/api/v1/auth/me';
const WORK_X = '/api/v1/work/x';
const ACCESS_KEY = 'ACCESS_TOKEN';
const REFRESH_KEY = 'REFRESH_TOKEN';
const MARKER_KEY = '@auth:logoutPending';

const A = { access: 'A-access', refresh: 'A-refresh', userId: '1' };
const B = { access: 'B-access', refresh: 'B-refresh', userId: '2' };
const CREDENTIALS = { phoneNumber: '01000000000', pin: '012345' };

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const waitFor = async (condition, timeoutMs = 3000) => {
  const end = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > end) assert.fail('waitFor 시간 초과');
    await sleep(5);
  }
};

let expiredCalls = 0;
const gates = [];

const makeGate = () => {
  const gate = createGate();
  gates.push(gate);
  return gate;
};

// 세션 만료 알림은 store.js와 같은 방식(logout 디스패치)으로 연결한다.
const createStore = () => {
  const store = configureStore({ reducer: { auth: authReducer } });
  setSessionExpiredHandler(() => {
    expiredCalls += 1;
    store.dispatch(logout());
  });
  return store;
};

const routeLogin = (tokens, { delay, status = 200, body } = {}) =>
  gateway.route('POST', LOGIN, () => {
    gateway.validTokens.add(tokens.access);
    return {
      public: true,
      delay,
      status,
      body:
        body ??
        authEnvelope({
          access_token: tokens.access,
          refresh_token: tokens.refresh,
          token_type: 'bearer',
          expires_in: 1800,
          onboarding_completed: false,
        }),
    };
  });

const routeMe = (delays = {}) =>
  gateway.route('GET', ME, ({ record }) => {
    const token = (record.headers.authorization ?? '').replace(/^Bearer /, '');
    const owner = [A, B].find(item => item.access === token);
    return {
      delay: delays[token],
      body: authEnvelope({
        user_id: owner?.userId ?? '9',
        name: '테스트',
        phone_number: '+821000000000',
        onboarding_completed: false,
      }),
    };
  });

const routeLogout = ({ delay, status = 200, body, rawBody, destroy } = {}) =>
  gateway.route('POST', LOGOUT, () => ({
    public: true,
    delay,
    status,
    destroy,
    rawBody,
    body:
      rawBody !== undefined
        ? undefined
        : (body ?? authEnvelope(null, { code: 'AUTH-200-003', message: '로그아웃 완료' })),
  }));

const routeWorkOk = () => gateway.route('GET', WORK_X, () => ({ body: { ok: true } }));

const loginAs = async (store, tokens) => {
  routeLogin(tokens);
  const action = await store.dispatch(loginUser(CREDENTIALS));
  assert.equal(action.meta.requestStatus, 'fulfilled');
  assert.equal(store.getState().auth.isAuthenticated, true);
};

// 로그인 없이 저장소에 세션을 만든다(인증 상태 Redux와 무관한 토큰 계층 테스트용).
const beginTokens = async tokens => {
  gateway.validTokens.add(tokens.access);
  return tokenService.beginSession(tokens.access, tokens.refresh);
};

const storedKeys = () => [ACCESS_KEY, REFRESH_KEY].filter(key => secureStore.has(key));
const storedValues = () => [...secureStore.values()];

const assertNoStoredTokens = () => {
  const present = storedValues().filter(value => value !== '');
  assert.deepEqual(present, [], '저장소에 토큰이 남아 있습니다.');
};

const assertLoggedOut = store => {
  const { auth } = store.getState();
  assert.equal(auth.isAuthenticated, false);
  assert.equal(auth.user, null);
  assert.equal(auth.isAppUnlocked, false);
};

const logoutRequests = () => gateway.requestsTo(LOGOUT);

beforeEach(() => {
  gateway.reset();
  resetSecureControl();
  resetAsyncControl();
  tokenService.__testing.resetLimits();
  tokenService.__testing.setLimits({ deleteRetryDelayMs: 10 });
  tokenService.__testing.resetProcessState();
  secureStore.clear();
  asyncStore.clear();
  expiredCalls = 0;
  routeMe();
  routeLogout();
  routeWorkOk();
});

afterEach(async () => {
  while (gates.length) gates.pop().release();
  await sleep(40);
});

after(async () => {
  await gateway.close();
});

// ── A. 로그아웃 기본 ──────────────────────────────────────────

test('A1~A3: POST /api/v1/auth/logout, 본문 {refresh_token}만, Authorization 없음, 로컬·Redux 정리', async () => {
  const store = createStore();
  await loginAs(store, A);

  const result = await store.dispatch(logoutUser()).unwrap();

  assert.equal(logoutRequests().length, 1);
  const request = logoutRequests()[0];
  assert.deepEqual(request.body, { refresh_token: A.refresh });
  assert.equal(request.headers.authorization, undefined);

  assert.deepEqual(Object.keys(result).sort(), [
    'localCleared',
    'markerWritten',
    'serverError',
    'serverLoggedOut',
    'timedOut',
  ]);
  assert.equal(result.serverLoggedOut, true);
  assert.equal(result.localCleared, true);
  assert.equal(result.serverError, null);
  assert.equal(result.timedOut, false);

  assertNoStoredTokens();
  assert.equal(await tokenService.getAccessToken(), null);
  assertLoggedOut(store);

  const serialized = JSON.stringify([result, store.getState()]);
  assert.equal(serialized.includes(A.access), false);
  assert.equal(serialized.includes(A.refresh), false);
  assert.equal(asyncStore.has(MARKER_KEY), false, '정리가 끝나면 표식이 제거되어야 합니다.');
});

const SERVER_ERROR_CASES = [
  [
    '401 AUTH-401-005 + RE_LOGIN',
    () =>
      routeLogout({
        status: 401,
        body: authEnvelope(null, {
          success: false,
          status: 401,
          code: 'AUTH-401-005',
          error: { reason: 'invalid', details: [], requiredAction: 'RE_LOGIN' },
        }),
      }),
    401,
  ],
  [
    '400',
    () =>
      routeLogout({
        status: 400,
        body: authEnvelope(null, { success: false, status: 400, code: 'AUTH-400-002' }),
      }),
    400,
  ],
  ['503', () => routeLogout({ status: 503, body: { code: 'UNAVAILABLE' } }), 503],
  ['타임아웃', () => routeLogout({ delay: 600 }), null],
  ['연결 끊김', () => routeLogout({ destroy: true }), null],
];

for (const [name, setup, status] of SERVER_ERROR_CASES) {
  test(`A4: 서버 오류(${name}) → 로컬 정리, serverLoggedOut=false, 요청 1건, refresh 0건, 만료 알림 0건`, async () => {
    tokenService.__testing.setLimits({ requestTimeoutMs: 200 });
    const store = createStore();
    await loginAs(store, A);
    setup();

    const result = await store.dispatch(logoutUser()).unwrap();

    assert.equal(result.serverLoggedOut, false);
    assert.equal(result.localCleared, true);
    assert.deepEqual(Object.keys(result.serverError).sort(), ['code', 'kind', 'status', 'traceId']);
    assert.equal(result.serverError.status, status);
    assert.equal(logoutRequests().length, 1);
    assert.equal(gateway.refreshCount, 0);
    assert.equal(expiredCalls, 0);
    assertNoStoredTokens();
    assertLoggedOut(store);
    assert.equal(JSON.stringify(result).includes(A.refresh), false);
  });
}

test('A5: HTTP 200이어도 success:false 이거나 envelope가 아니면 serverLoggedOut=false', async () => {
  for (const response of [
    { body: authEnvelope(null, { success: false, code: 'AUTH-400-002' }) },
    { body: { ok: true } },
  ]) {
    const store = createStore();
    await loginAs(store, A);
    routeLogout(response);

    const result = await store.dispatch(logoutUser()).unwrap();

    assert.equal(result.serverLoggedOut, false);
    assert.equal(result.localCleared, true);
    assertNoStoredTokens();
    assertLoggedOut(store);
  }
});

test('A6: 저장된 refresh 토큰이 없으면 서버 요청 없이 로컬 정리', async () => {
  const store = createStore();
  await loginAs(store, A);
  secureStore.delete(REFRESH_KEY);

  const result = await store.dispatch(logoutUser()).unwrap();

  assert.equal(logoutRequests().length, 0);
  assert.equal(result.serverLoggedOut, false);
  assert.equal(result.localCleared, true);
  assertNoStoredTokens();
  assertLoggedOut(store);
});

test('A7: 로그아웃 연타 → 서버 요청 1건', async () => {
  const store = createStore();
  await loginAs(store, A);
  routeLogout({ delay: 120 });

  const [first, second] = await Promise.all([
    store.dispatch(logoutUser()).unwrap(),
    store.dispatch(logoutUser()).unwrap(),
  ]);

  assert.equal(logoutRequests().length, 1);
  assert.deepEqual(first, second);
  assertLoggedOut(store);
});

// ── B. Refresh 회귀 ───────────────────────────────────────────

test('B10: 로그아웃(폐기)된 refresh 토큰으로 재발급 → 서버 거부 → SESSION_EXPIRED', async () => {
  await beginTokens(A);
  gateway.refreshMode = 'reject';

  await assert.rejects(tokenService.refreshAccessToken(), error => {
    assert.equal(error.kind, 'SESSION_EXPIRED');
    return true;
  });
  assertNoStoredTokens();
});

// ── C. 로그아웃 ↔ Refresh 경합 ────────────────────────────────

test('C11: 로그아웃 시작 후 새 refresh 차단 — 진행 중이던 요청의 뒤늦은 401도 refresh 0건', async () => {
  const store = createStore();
  await loginAs(store, A);
  gateway.validTokens.delete(A.access);
  gateway.route('GET', WORK_X, () => ({ delay: 200, body: { ok: true } }));
  routeLogout({ delay: 300 });
  tokenService.__testing.setLimits({ requestTimeoutMs: 1500 });

  const inflight = apiClient.get(WORK_X).catch(error => error);
  await waitFor(() => gateway.requestsTo(WORK_X).length === 1);

  const logoutPromise = store.dispatch(logoutUser());
  await waitFor(() => logoutRequests().length === 1);

  await assert.rejects(tokenService.refreshAccessToken(), error => error.kind === 'CANCELED');
  await logoutPromise;
  const error = await inflight;

  assert.equal(error.kind, 'CANCELED');
  assert.equal(gateway.refreshCount, 0);
  assert.equal(expiredCalls, 0);
});

test('C12: 진행 중인 refresh를 기다린 뒤 회전된 새 refresh 토큰으로 서버 로그아웃, 저장소는 비어 있음', async () => {
  const store = createStore();
  await loginAs(store, A);
  gateway.validTokens.delete(A.access);
  gateway.refreshDelay = 200;

  const request = apiClient.get(WORK_X).catch(error => error);
  await waitFor(() => gateway.refreshCount === 1);

  const result = await store.dispatch(logoutUser()).unwrap();
  await request;

  assert.equal(logoutRequests().length, 1);
  assert.equal(logoutRequests()[0].body.refresh_token, 'refresh-1');
  assert.equal(result.localCleared, true);
  assertNoStoredTokens();
  assertLoggedOut(store);
});

test('C13: refresh 대기 상한 초과 → 기존 토큰으로 로그아웃, 늦게 도착한 refresh 결과는 저장하지 않음', async () => {
  tokenService.__testing.setLimits({ refreshWaitMs: 100, requestTimeoutMs: 300 });
  const store = createStore();
  await loginAs(store, A);
  gateway.validTokens.delete(A.access);
  gateway.refreshDelay = 400;

  const request = apiClient.get(WORK_X).catch(error => error);
  await waitFor(() => gateway.refreshCount === 1);

  const startedAt = Date.now();
  await store.dispatch(logoutUser()).unwrap();
  const elapsed = Date.now() - startedAt;

  assert.equal(logoutRequests()[0].body.refresh_token, A.refresh);
  assert.ok(elapsed < 100 + 300 + 500, `로그아웃 소요 ${elapsed}ms`);

  await sleep(600);
  assertNoStoredTokens();
  assert.equal((await request).kind, 'CANCELED');
});

test('C14: 서버 로그아웃 요청 중 refresh 시작 시도 → 모두 CANCELED, /refresh 0건', async () => {
  const store = createStore();
  await loginAs(store, A);
  routeLogout({ delay: 300 });
  tokenService.__testing.setLimits({ requestTimeoutMs: 1500 });

  const logoutPromise = store.dispatch(logoutUser());
  await waitFor(() => logoutRequests().length === 1);

  await assert.rejects(tokenService.refreshAccessToken(), error => error.kind === 'CANCELED');
  const error = await apiClient.get(WORK_X).catch(e => e);
  assert.notEqual(error.kind, 'SESSION_EXPIRED');

  await logoutPromise;
  assert.equal(gateway.refreshCount, 0);
});

test('C15: refresh 응답이 로그아웃 완료 후 도착 → 저장하지 않고 요청은 CANCELED, 만료 알림 0건', async () => {
  tokenService.__testing.setLimits({ refreshWaitMs: 20 });
  const store = createStore();
  await loginAs(store, A);
  gateway.validTokens.delete(A.access);
  gateway.refreshDelay = 300;

  const request = apiClient.get(WORK_X).catch(error => error);
  await waitFor(() => gateway.refreshCount === 1);

  await store.dispatch(logoutUser()).unwrap();
  await sleep(500);

  assertNoStoredTokens();
  assert.equal((await request).kind, 'CANCELED');
  assert.equal(expiredCalls, 0);
  assertLoggedOut(store);
});

// ── D. 저장 작업 자체의 경합 ──────────────────────────────────

test('D16: 저장 지연 중 삭제 → 모든 작업 종료 후 저장소에 키가 남지 않음', async () => {
  secureControl.delay.set = 150;
  const writing = tokenService.setTokens('x-access', 'x-refresh');
  await sleep(20);
  secureControl.delay.set = 0;

  await tokenService.clearTokens();
  await writing;
  await sleep(30);

  assert.deepEqual(storedKeys(), []);
});

test('D17: 삭제가 저장보다 먼저 끝나는 네이티브 순서를 모사해도 호출 순서대로 완료', async () => {
  secureControl.delay.set = 100;
  const writing = tokenService.setTokens('x-access', 'x-refresh');
  await sleep(10);
  secureControl.delay.set = 0;
  await tokenService.clearTokens();
  await writing;

  const log = secureControl.log;
  assert.ok(
    log.indexOf(`set:${REFRESH_KEY}:end`) < log.indexOf(`delete:${ACCESS_KEY}:start`),
    `호출 순서: ${log.join(' ')}`
  );
  assert.deepEqual(storedKeys(), []);
});

test('D18: 읽기 중 삭제 → null, 지워진 값이 메모리에 되살아나지 않음', async () => {
  secureStore.set(ACCESS_KEY, 'stale-access');
  secureControl.delay.get = 100;

  const reading = tokenService.getAccessToken();
  await sleep(10);
  secureControl.delay.get = 0;
  await tokenService.clearTokens();

  assert.equal(await reading, null);
  assert.equal(await tokenService.getAccessToken(), null);
  assert.deepEqual(storedKeys(), []);
});

test('D19: 쓰기 작업 하나가 실패해도 다음 작업(삭제·저장)이 실행됨', async () => {
  secureControl.fail.set = 1;
  await assert.rejects(tokenService.setTokens('x-access', 'x-refresh'));

  await tokenService.clearTokens();
  await tokenService.setTokens('c-access', 'c-refresh');

  assert.equal(secureStore.get(ACCESS_KEY), 'c-access');
});

// ── E. Redux·비동기 요청 경합 ─────────────────────────────────

test('E20: 로그아웃 이후 /me 도착 → loginUser·fetchCurrentUser 모두 CANCELED, 미인증 유지', async () => {
  routeMe({ [A.access]: 300 });
  const store = createStore();
  routeLogin(A);

  const loginPromise = store.dispatch(loginUser(CREDENTIALS));
  await waitFor(() => gateway.requestsTo(ME).length === 1);
  await store.dispatch(logoutUser()).unwrap();

  const loginAction = await loginPromise;
  assert.equal(loginAction.meta.requestStatus, 'rejected');
  assert.equal(loginAction.payload.kind, 'CANCELED');
  assert.equal(loginAction.payload.retryable, false);
  assertLoggedOut(store);
  assertNoStoredTokens();

  // fetchCurrentUser 변형
  await beginTokens(A);
  const fetchPromise = store.dispatch(fetchCurrentUser());
  await waitFor(() => gateway.requestsTo(ME).length === 2);
  await store.dispatch(logoutUser()).unwrap();

  const fetchAction = await fetchPromise;
  assert.equal(fetchAction.meta.requestStatus, 'rejected');
  assertLoggedOut(store);
  assertNoStoredTokens();
});

test('E21: 로그아웃 이후 restoreSession 완료 → null, 미인증, 복원 완료 표시, 토큰 되살리지 않음', async () => {
  routeMe({ [A.access]: 300 });
  const store = createStore();
  await beginTokens(A);

  const restorePromise = store.dispatch(restoreSession());
  await waitFor(() => gateway.requestsTo(ME).length === 1);
  await store.dispatch(logoutUser()).unwrap();

  const action = await restorePromise;
  assert.equal(action.payload, null);
  assert.equal(store.getState().auth.isSessionRestored, true);
  assertLoggedOut(store);
  assertNoStoredTokens();
});

test('E22: 로그아웃 진행 중 도착한 로그인 응답은 거부(토큰 미저장), 로그인 직후 로그아웃은 새 세션이 대상, 완료 후 로그인은 정상', async () => {
  const store = createStore();
  await loginAs(store, A);
  routeLogout({ delay: 400 });
  tokenService.__testing.setLimits({ requestTimeoutMs: 1500 });

  // (a) 로그아웃(closing) 중 시작한 로그인의 응답이 로그아웃 종료 전에 도착
  const logoutPromise = store.dispatch(logoutUser());
  await waitFor(() => logoutRequests().length === 1);
  routeLogin(B, { delay: 100 });
  const duringLogout = await store.dispatch(loginUser(CREDENTIALS));
  await logoutPromise;

  assert.equal(duringLogout.meta.requestStatus, 'rejected');
  assert.equal(duringLogout.payload.kind, 'CANCELED');
  assertNoStoredTokens();
  assertLoggedOut(store);

  // (c) 로그아웃 완료 후 로그인은 정상
  routeLogout();
  await loginAs(store, B);
  assert.equal(secureStore.get(ACCESS_KEY), B.access);

  // (b) 로그인 직후 로그아웃 → 새 세션 refresh 토큰이 대상
  await store.dispatch(logoutUser()).unwrap();
  assert.equal(logoutRequests().at(-1).body.refresh_token, B.refresh);
  assertNoStoredTokens();
});

test('E23: 이전 세션 401 ↔ 새 로그인 → refresh 0건, 새 토큰으로 재전송 0건, 새 세션 유지', async () => {
  const store = createStore();
  await loginAs(store, A);
  gateway.validTokens.delete(A.access);
  gateway.route('GET', WORK_X, () => ({ delay: 300, body: { ok: true } }));

  const oldRequest = apiClient.get(WORK_X).catch(error => error);
  await waitFor(() => gateway.requestsTo(WORK_X).length === 1);

  await store.dispatch(logoutUser()).unwrap();
  await loginAs(store, B);
  const error = await oldRequest;

  assert.equal(error.kind, 'CANCELED');
  assert.equal(gateway.requestsTo(WORK_X).length, 1, '새 토큰으로 재전송되면 안 됩니다.');
  assert.equal(gateway.refreshCount, 0);
  assert.equal(secureStore.get(ACCESS_KEY), B.access);
  assert.equal(secureStore.get(REFRESH_KEY), B.refresh);
  assert.equal(store.getState().auth.isAuthenticated, true);
  assert.equal(expiredCalls, 0);
});

test('E24: 이전 세션 refresh에 합류하지 않고, 이전 refresh 종료가 새 promise 포인터를 지우지 않음', async () => {
  tokenService.__testing.setLimits({ refreshWaitMs: 20 });
  const store = createStore();
  await loginAs(store, A);
  gateway.validTokens.delete(A.access);
  gateway.refreshDelay = 300;

  const oldRequest = apiClient.get(WORK_X).catch(error => error);
  await waitFor(() => gateway.refreshCount === 1);

  await store.dispatch(logoutUser()).unwrap();
  await loginAs(store, B);
  gateway.validTokens.delete(B.access);

  const newRequests = [1, 2, 3].map(() => apiClient.get(WORK_X));
  await waitFor(() => gateway.refreshCount === 2);

  // 이전 세션 refresh가 끝난 뒤(≈300ms)에 시작한 요청도 새 세션의 진행 중 refresh에 합류해야 한다.
  await sleep(240);
  newRequests.push(apiClient.get(WORK_X));

  const results = await Promise.all(newRequests);
  assert.deepEqual(results, [{ ok: true }, { ok: true }, { ok: true }, { ok: true }]);
  assert.equal((await oldRequest).kind, 'CANCELED');
  assert.equal(gateway.refreshCount, 2, 'refresh는 이전 세션 1회 + 새 세션 1회여야 합니다.');
  assert.equal(secureStore.get(ACCESS_KEY), 'access-2');
  assert.equal(store.getState().auth.isAuthenticated, true);
  assert.equal(expiredCalls, 0);
});

test('E25: 이전 세션 refresh 거부가 새 세션을 로그아웃시키지 않음', async () => {
  tokenService.__testing.setLimits({ refreshWaitMs: 20 });
  const store = createStore();
  await loginAs(store, A);
  gateway.validTokens.delete(A.access);
  gateway.refreshMode = 'reject';
  gateway.refreshDelay = 300;

  const oldRequest = apiClient.get(WORK_X).catch(error => error);
  await waitFor(() => gateway.refreshCount === 1);

  await store.dispatch(logoutUser()).unwrap();
  await loginAs(store, B);
  const error = await oldRequest;

  assert.equal(error.kind, 'CANCELED');
  assert.equal(expiredCalls, 0);
  assert.equal(secureStore.get(ACCESS_KEY), B.access);
  assert.equal(store.getState().auth.isAuthenticated, true);
});

test('E26/T3-a: 이전 세션의 RE_LOGIN 응답이 새 세션 토큰을 지우지 않고 알림도 없음', async () => {
  const store = createStore();
  await loginAs(store, A);
  gateway.route('GET', WORK_X, () => ({
    public: true,
    delay: 300,
    status: 401,
    body: authEnvelope(null, {
      success: false,
      status: 401,
      code: 'AUTH-401-005',
      error: { reason: 'x', details: [], requiredAction: 'RE_LOGIN' },
    }),
  }));

  const oldRequest = apiClient.get(WORK_X).catch(error => error);
  await waitFor(() => gateway.requestsTo(WORK_X).length === 1);

  await store.dispatch(logoutUser()).unwrap();
  await loginAs(store, B);
  const error = await oldRequest;

  assert.equal(error.requiredAction, 'RE_LOGIN');
  assert.equal(secureStore.get(ACCESS_KEY), B.access);
  assert.equal(expiredCalls, 0);
  assert.equal(store.getState().auth.isAuthenticated, true);
});

// ── F. 삭제 실패 / RE_LOGIN ───────────────────────────────────

test('F27: 삭제가 1회 실패한 뒤 재시도에 성공 → localCleared=true', async () => {
  const store = createStore();
  await loginAs(store, A);
  secureControl.fail.delete = 1;

  const result = await store.dispatch(logoutUser()).unwrap();

  assert.equal(result.localCleared, true);
  assertNoStoredTokens();
  assertLoggedOut(store);
});

test('F28: 삭제가 계속 실패 → 빈 문자열 덮어쓰기로 읽기 함수가 null 반환', async () => {
  const store = createStore();
  await loginAs(store, A);
  secureControl.fail.delete = Infinity;

  const result = await store.dispatch(logoutUser()).unwrap();

  assert.equal(result.localCleared, true);
  assert.equal(secureStore.get(ACCESS_KEY), '');
  assert.equal(await tokenService.getAccessToken(), null);
  assert.equal(await tokenService.getRefreshToken(), null);
  assertLoggedOut(store);
});

test('F29/T4-b: 삭제·덮어쓰기 모두 실패 → 같은 실행에서 읽기 null, 복원 안 함, Redux 초기화, 표식 유지', async () => {
  const store = createStore();
  await loginAs(store, A);
  secureControl.fail.delete = Infinity;
  secureControl.fail.set = Infinity;

  const result = await store.dispatch(logoutUser()).unwrap();

  assert.equal(result.localCleared, false);
  assertLoggedOut(store);
  assert.equal(await tokenService.getAccessToken(), null);
  assert.equal(await tokenService.getRefreshToken(), null);
  assert.equal(asyncStore.get(MARKER_KEY), 'true');

  const meBefore = gateway.requestsTo(ME).length;
  const restored = await store.dispatch(restoreSession());
  assert.equal(restored.payload, null);
  assert.equal(gateway.requestsTo(ME).length, meBefore);
});

test('F30: 표식 + 남은 토큰 + 새 실행 → /me 0건, 미인증, 정리 재시도 성공 시 표식 제거', async () => {
  secureStore.set(ACCESS_KEY, A.access);
  secureStore.set(REFRESH_KEY, A.refresh);
  gateway.validTokens.add(A.access);
  asyncStore.set(MARKER_KEY, 'true');
  const store = createStore();

  const action = await store.dispatch(restoreSession());

  assert.equal(action.payload, null);
  assert.equal(gateway.requestsTo(ME).length, 0);
  assert.equal(store.getState().auth.isSessionRestored, true);
  assertLoggedOut(store);
  assertNoStoredTokens();
  assert.equal(asyncStore.has(MARKER_KEY), false);
});

test('F31/T3-b: 인증 API의 RE_LOGIN → 토큰 삭제 + 만료 알림 1회로 Redux 초기화 (로그아웃 요청의 RE_LOGIN은 알림 0회)', async () => {
  const store = createStore();
  await loginAs(store, A);
  gateway.route('GET', WORK_X, () => ({
    status: 401,
    body: authEnvelope(null, {
      success: false,
      status: 401,
      code: 'AUTH-401-005',
      error: { reason: 'x', details: [], requiredAction: 'RE_LOGIN' },
    }),
  }));

  const error = await apiClient.get(WORK_X).catch(e => e);

  assert.equal(error.requiredAction, 'RE_LOGIN');
  assert.equal(expiredCalls, 1);
  assertNoStoredTokens();
  assertLoggedOut(store);
});

test('F32/T3-c/T3-d: RE_LOGIN 정리가 영구 실패해도 원래 오류를 유지하고 Redux는 초기화, 읽기는 null', async () => {
  const store = createStore();
  await loginAs(store, A);
  gateway.route('GET', WORK_X, () => ({
    status: 401,
    body: authEnvelope(null, {
      success: false,
      status: 401,
      code: 'AUTH-401-005',
      error: { reason: 'x', details: [], requiredAction: 'RE_LOGIN' },
    }),
  }));
  secureControl.fail.delete = Infinity;
  secureControl.fail.set = Infinity;

  const error = await apiClient.get(WORK_X).catch(e => e);

  assert.equal(error.requiredAction, 'RE_LOGIN');
  assert.equal(error.kind, 'BUSINESS');
  assert.equal(expiredCalls, 1);
  assertLoggedOut(store);
  assert.equal(await tokenService.getAccessToken(), null);
  assert.equal(asyncStore.get(MARKER_KEY), 'true');
});

// ── T1. 10초 상한 이후 남은 작업의 안전성 ─────────────────────

test('T1-a/T6-a: 상한으로 먼저 끝난 로그아웃 뒤 B 로그인 → 지연된 이전 정리가 재개돼도 B 세션 유지', async () => {
  tokenService.__testing.setLimits({ hardCapMs: 150, requestTimeoutMs: 80, queueWaitMs: 50 });
  const store = createStore();
  await loginAs(store, A);
  const { gate, release } = makeGate();
  secureControl.stall.delete = gate;

  const result = await store.dispatch(logoutUser()).unwrap();
  assert.equal(result.timedOut, true);
  assert.equal(result.localCleared, false);
  assertLoggedOut(store);
  assert.equal(tokenService.isLogoutInProgress(), false);

  routeLogin(B);
  const loginPromise = store.dispatch(loginUser(CREDENTIALS));
  await sleep(60);
  secureControl.stall.delete = null;
  release();

  const action = await loginPromise;
  assert.equal(action.meta.requestStatus, 'fulfilled');
  await sleep(60);

  assert.equal(secureStore.get(ACCESS_KEY), B.access);
  assert.equal(secureStore.get(REFRESH_KEY), B.refresh);
  assert.equal(await tokenService.getAccessToken(), B.access);
  assert.equal(store.getState().auth.isAuthenticated, true);
  assert.equal(tokenService.isLogoutInProgress(), false);
});

for (const [label, failDelete] of [
  ['T1-b', false],
  ['T1-c', true],
]) {
  test(`${label}: 삭제 작업이 큐 대기 중일 때 B 로그인 → 이전 삭제는 no-op${failDelete ? '(삭제 실패 설정에도 B 차단 플래그 없음)' : ''}`, async () => {
    tokenService.__testing.setLimits({ hardCapMs: 150, requestTimeoutMs: 80, queueWaitMs: 40 });
    const store = createStore();
    await loginAs(store, A);

    secureControl.delay.set = 300;
    const slowWrite = tokenService.setTokens('A2-access', 'A2-refresh');
    await sleep(10);
    secureControl.delay.set = 0;
    if (failDelete) secureControl.fail.delete = Infinity;

    const result = await store.dispatch(logoutUser()).unwrap();
    assert.equal(result.timedOut, true);

    routeLogin(B);
    const action = await store.dispatch(loginUser(CREDENTIALS));
    await slowWrite;
    await sleep(60);

    assert.equal(action.meta.requestStatus, 'fulfilled');
    assert.equal(secureStore.get(ACCESS_KEY), B.access);
    assert.equal(await tokenService.getAccessToken(), B.access);
    assert.equal(await tokenService.getRefreshToken(), B.refresh);
    assert.equal(store.getState().auth.isAuthenticated, true);
  });
}

test('T1-d: 상한으로 해제된 뒤 새 로그아웃이 시작되고 이전 run이 늦게 끝나도 phase를 바꾸지 않음', async () => {
  tokenService.__testing.setLimits({ hardCapMs: 120, requestTimeoutMs: 600, queueWaitMs: 40 });
  const store = createStore();
  await loginAs(store, A);
  const { gate, release } = makeGate();
  secureControl.stall.delete = gate;

  const first = await store.dispatch(logoutUser()).unwrap();
  assert.equal(first.timedOut, true);
  assert.equal(tokenService.isLogoutInProgress(), false);

  routeLogout({ delay: 400 });
  tokenService.__testing.setLimits({ hardCapMs: 3000 });
  const secondPromise = store.dispatch(logoutUser());
  await waitFor(() => logoutRequests().length === 2);
  assert.equal(tokenService.isLogoutInProgress(), true);

  secureControl.stall.delete = null;
  release();
  await sleep(120);
  assert.equal(tokenService.isLogoutInProgress(), true, '이전 run이 phase를 해제하면 안 됩니다.');

  await secondPromise;
  assert.equal(tokenService.isLogoutInProgress(), false);
});

test('T1-e: 저장소 호출이 멈춘 상태의 로그인 → STORAGE_BUSY 거부, 정지 해제 후에도 토큰 미저장, 이후 로그인은 정상', async () => {
  tokenService.__testing.setLimits({ beginSessionWaitMs: 100 });
  const store = createStore();
  routeLogin(B);
  const { gate, release } = makeGate();
  secureControl.stall.set = gate;

  const startedAt = Date.now();
  const action = await store.dispatch(loginUser(CREDENTIALS));
  assert.ok(Date.now() - startedAt < 1000);
  assert.equal(action.meta.requestStatus, 'rejected');
  assert.equal(action.payload.kind, 'CANCELED');
  assertLoggedOut(store);

  secureControl.stall.set = null;
  release();
  await sleep(150);
  assertNoStoredTokens();

  const retry = await store.dispatch(loginUser(CREDENTIALS));
  assert.equal(retry.meta.requestStatus, 'fulfilled');
  assert.equal(secureStore.get(ACCESS_KEY), B.access);
});

// ── T2. 로그아웃 완료 후 도착하는 이전 login/register 응답 ────

test('T2-a: 로그아웃이 시작·완료된 뒤 도착한 이전 login 응답 → CANCELED, 토큰 없음, /me 0건', async () => {
  const store = createStore();
  routeLogin(B, { delay: 300 });

  const loginPromise = store.dispatch(loginUser(CREDENTIALS));
  await waitFor(() => gateway.requestsTo(LOGIN).length === 1);
  await store.dispatch(logoutUser()).unwrap();

  const action = await loginPromise;
  assert.equal(action.meta.requestStatus, 'rejected');
  assert.equal(action.payload.kind, 'CANCELED');
  assertNoStoredTokens();
  assertLoggedOut(store);
  assert.equal(gateway.requestsTo(ME).length, 0);
});

test('T2-b: 같은 순서의 register 응답도 거부', async () => {
  const store = createStore();
  gateway.route('POST', REGISTER, () => ({
    public: true,
    delay: 300,
    status: 201,
    body: authEnvelope(
      {
        access_token: B.access,
        refresh_token: B.refresh,
        token_type: 'bearer',
        expires_in: 1800,
        onboarding_completed: false,
        user_id: B.userId,
        phone_number: '+821000000000',
        name: '테스트',
      },
      { status: 201, code: 'AUTH-201-001' }
    ),
  }));
  const terms = [
    { type: 'service-terms', version: 'v1', confirmed: true },
    { type: 'privacy-consent', version: 'v1', confirmed: true },
  ];

  const registerPromise = store.dispatch(
    registerUser({
      ...CREDENTIALS,
      name: '테스트',
      pinConfirm: CREDENTIALS.pin,
      termsRecords: terms,
    })
  );
  await waitFor(() => gateway.requestsTo(REGISTER).length === 1);
  await store.dispatch(logoutUser()).unwrap();

  const action = await registerPromise;
  assert.equal(action.meta.requestStatus, 'rejected');
  assertNoStoredTokens();
  assertLoggedOut(store);
});

test('T2-e: 로그인 POST 도중 다른 정리로 세션이 바뀌면 거부(안전한 방향), 재시도하면 성공', async () => {
  const store = createStore();
  routeLogin(B, { delay: 200 });

  const loginPromise = store.dispatch(loginUser(CREDENTIALS));
  await waitFor(() => gateway.requestsTo(LOGIN).length === 1);
  await tokenService.clearTokens();

  const rejected = await loginPromise;
  assert.equal(rejected.meta.requestStatus, 'rejected');
  assertNoStoredTokens();

  routeLogin(B);
  const retry = await store.dispatch(loginUser(CREDENTIALS));
  assert.equal(retry.meta.requestStatus, 'fulfilled');
  assert.equal(secureStore.get(ACCESS_KEY), B.access);
});

// ── T4. 로그아웃 대기 표식 ────────────────────────────────────

test('T4-a: 로그아웃 시작 직후(삭제 중) 표식이 이미 기록되어 있고, 정상 정리 후 제거됨', async () => {
  const store = createStore();
  await loginAs(store, A);
  routeLogout({ delay: 300 });
  tokenService.__testing.setLimits({ requestTimeoutMs: 1500 });

  const logoutPromise = store.dispatch(logoutUser());
  await waitFor(() => logoutRequests().length === 1);
  assert.equal(asyncStore.get(MARKER_KEY), 'true');

  await logoutPromise;
  assert.equal(asyncStore.has(MARKER_KEY), false);
});

test('T4-c: 삭제 도중 프로세스 종료를 모사 → 새 실행은 복원하지 않고 /me 0건, 정리 재시도 후 표식 제거', async () => {
  tokenService.__testing.setLimits({ hardCapMs: 120, requestTimeoutMs: 80, queueWaitMs: 40 });
  const store = createStore();
  await loginAs(store, A);
  const { gate } = makeGate();
  secureControl.stall.delete = gate;

  const result = await store.dispatch(logoutUser()).unwrap();
  assert.equal(result.timedOut, true);
  assert.equal(asyncStore.get(MARKER_KEY), 'true');
  assert.ok(storedValues().includes(A.access), '삭제가 멈춰 토큰이 남아 있는 상태');

  // 새 실행: 메모리 상태는 사라지고 저장소(SecureStore·AsyncStorage)는 그대로, 네이티브 정지는 풀린 상태
  secureControl.stall.delete = null;
  tokenService.__testing.resetProcessState();
  tokenService.__testing.resetLimits();
  const meBefore = gateway.requestsTo(ME).length;
  const freshStore = createStore();

  const action = await freshStore.dispatch(restoreSession());

  assert.equal(action.payload, null);
  assert.equal(gateway.requestsTo(ME).length, meBefore);
  assertNoStoredTokens();
  assert.equal(asyncStore.has(MARKER_KEY), false);
  assertLoggedOut(freshStore);
});

test('T4-d: 신규 로그인은 토큰 저장이 끝난 뒤에 표식을 제거하고, 저장·삭제가 모두 실패하면 표식을 유지', async () => {
  asyncStore.set(MARKER_KEY, 'true');
  const store = createStore();
  routeLogin(B);
  const { gate, release } = makeGate();
  secureControl.stall.set = gate;

  const loginPromise = store.dispatch(loginUser(CREDENTIALS));
  await waitFor(() => secureControl.log.some(entry => entry.startsWith('set:')));
  await sleep(30);
  assert.equal(asyncStore.get(MARKER_KEY), 'true', '토큰 저장 전에는 표식을 지우면 안 됩니다.');

  secureControl.stall.set = null;
  release();
  const action = await loginPromise;
  assert.equal(action.meta.requestStatus, 'fulfilled');
  assert.equal(asyncStore.has(MARKER_KEY), false);

  // 저장 실패 + 삭제 실패 → 표식 유지
  await store.dispatch(logoutUser()).unwrap();
  asyncStore.set(MARKER_KEY, 'true');
  secureControl.fail.set = Infinity;
  secureControl.fail.delete = Infinity;
  const failed = await store.dispatch(loginUser(CREDENTIALS));
  assert.equal(failed.meta.requestStatus, 'rejected');
  assert.equal(asyncStore.get(MARKER_KEY), 'true');
});

test('T4-e: 표식 쓰기가 실패해도 로그아웃은 계속 진행되고 markerWritten=false로 보고', async () => {
  const store = createStore();
  await loginAs(store, A);
  asyncControl.fail.set = Infinity;

  const result = await store.dispatch(logoutUser()).unwrap();

  assert.equal(result.markerWritten, false);
  assert.equal(result.localCleared, true);
  assertNoStoredTokens();
  assertLoggedOut(store);
});

// ── T5. 알림 직전 세션 소유권 ─────────────────────────────────

const routeReLoginWork = () =>
  gateway.route('GET', WORK_X, () => ({
    status: 401,
    body: authEnvelope(null, {
      success: false,
      status: 401,
      code: 'AUTH-401-005',
      error: { reason: 'x', details: [], requiredAction: 'RE_LOGIN' },
    }),
  }));

test('T5-a: RE_LOGIN 정리(삭제 지연) 중 B 로그인 완료 → 삭제 종료 후에도 알림 0회, B 유지', async () => {
  const store = createStore();
  await loginAs(store, A);
  routeReLoginWork();
  secureControl.delay.delete = 300;

  const request = apiClient.get(WORK_X).catch(error => error);
  await waitFor(() => secureControl.log.some(entry => entry.startsWith('delete:')));

  secureControl.delay.set = 0;
  const loginAction = await loginAs(store, B).then(() => null);
  void loginAction;
  const error = await request;

  assert.equal(error.requiredAction, 'RE_LOGIN');
  assert.equal(expiredCalls, 0);
  assert.equal(secureStore.get(ACCESS_KEY), B.access);
  assert.equal(store.getState().auth.isAuthenticated, true);
});

for (const concurrent of [1, 3]) {
  test(`T5-b/c: refresh 거부 정리(삭제 지연) 중 B 로그인 → ${concurrent}개 대기 요청 모두 알림 0회, B 유지`, async () => {
    const store = createStore();
    await loginAs(store, A);
    gateway.validTokens.delete(A.access);
    gateway.refreshMode = 'reject';
    gateway.refreshDelay = 30;
    secureControl.delay.delete = 300;

    const requests = Array.from({ length: concurrent }, () =>
      apiClient.get(WORK_X).catch(error => error)
    );
    await waitFor(() => secureControl.log.some(entry => entry.startsWith('delete:')));

    gateway.refreshMode = 'ok';
    await loginAs(store, B);
    const errors = await Promise.all(requests);

    for (const error of errors) assert.ok(['SESSION_EXPIRED', 'CANCELED'].includes(error.kind));
    assert.equal(expiredCalls, 0);
    assert.equal(secureStore.get(ACCESS_KEY), B.access);
    assert.equal(store.getState().auth.isAuthenticated, true);
  });
}

test('T5-d: B의 로그인 POST가 진행 중(epoch 동일)일 때 알림이 나가도 B 로그인은 정상 완료', async () => {
  const store = createStore();
  await loginAs(store, A);
  routeReLoginWork();
  secureControl.delay.delete = 150;

  const request = apiClient.get(WORK_X).catch(error => error);
  await waitFor(() => secureControl.log.some(entry => entry.startsWith('delete:')));

  routeLogin(B, { delay: 350 });
  const loginAction = await store.dispatch(loginUser(CREDENTIALS));
  await request;

  assert.equal(loginAction.meta.requestStatus, 'fulfilled');
  assert.equal(expiredCalls, 1);
  assert.equal(store.getState().auth.isAuthenticated, true);
  assert.equal(secureStore.get(ACCESS_KEY), B.access);
});

// ── T6. 오래된 Redux 액션 ─────────────────────────────────────

test('T6-b: 이전 restoreSession(null)이 B 로그인 이후 도착해도 B 인증·로딩 상태를 바꾸지 않음', async () => {
  routeMe({ [A.access]: 400 });
  const store = createStore();
  await beginTokens(A);

  const restorePromise = store.dispatch(restoreSession());
  await waitFor(() => gateway.requestsTo(ME).length === 1);
  await store.dispatch(logoutUser()).unwrap();
  await loginAs(store, B);

  const action = await restorePromise;

  assert.equal(action.payload, null);
  const { auth } = store.getState();
  assert.equal(auth.isSessionRestored, true);
  assert.equal(auth.isAuthenticated, true);
  assert.equal(auth.user.userId, B.userId);
  assert.equal(auth.isLoading, false);
  assert.equal(auth.error, null);
});

test('T6-c: 이전 login rejected가 새 로그인 상태(error·isLoading)를 바꾸지 않음', async () => {
  const store = createStore();
  let calls = 0;
  gateway.route('POST', LOGIN, () => {
    calls += 1;
    gateway.validTokens.add(B.access);
    if (calls === 1) {
      return {
        public: true,
        delay: 300,
        status: 422,
        body: authEnvelope(null, { success: false, status: 422, code: 'AUTH-422-001' }),
      };
    }
    return {
      public: true,
      body: authEnvelope({
        access_token: B.access,
        refresh_token: B.refresh,
        token_type: 'bearer',
        expires_in: 1800,
        onboarding_completed: false,
      }),
    };
  });

  const first = store.dispatch(loginUser(CREDENTIALS));
  await waitFor(() => calls === 1);
  const second = await store.dispatch(loginUser(CREDENTIALS));
  assert.equal(second.meta.requestStatus, 'fulfilled');

  await first;
  const { auth } = store.getState();
  assert.equal(auth.isAuthenticated, true);
  assert.equal(auth.error, null);
  assert.equal(auth.isLoading, false);
});

test('T6-d: 로그아웃 이전에 시작된 요청의 늦은 fulfilled 액션은 리듀서가 무시', async () => {
  const store = createStore();
  const stale = fetchCurrentUser.fulfilled({ user: { userId: 'x' } }, 'old-request-id');

  store.dispatch(logoutUser.pending('logout-id'));
  store.dispatch(stale);

  assertLoggedOut(store);
});

// ── T7. RE_LOGIN·refresh 거부 정리 중 영구 삭제 실패 + 재실행 ──

test('T7-a: RE_LOGIN 정리 삭제가 영구 실패 → failed, Redux 초기화, 표식 유지 → 새 실행은 복원 안 함', async () => {
  const store = createStore();
  await loginAs(store, A);
  routeReLoginWork();
  secureControl.fail.delete = Infinity;
  secureControl.fail.set = Infinity;

  await apiClient.get(WORK_X).catch(error => error);

  assert.equal(expiredCalls, 1);
  assertLoggedOut(store);
  assert.equal(asyncStore.get(MARKER_KEY), 'true');
  assert.ok(storedValues().includes(A.access), '삭제 실패로 토큰이 남아 있는 상태');

  // 새 실행: 저장소는 정상 동작
  resetSecureControl();
  tokenService.__testing.resetProcessState();
  gateway.validTokens.add(A.access);
  const meBefore = gateway.requestsTo(ME).length;
  const freshStore = createStore();

  const action = await freshStore.dispatch(restoreSession());

  assert.equal(action.payload, null);
  assert.equal(gateway.requestsTo(ME).length, meBefore);
  assertNoStoredTokens();
  assert.equal(asyncStore.has(MARKER_KEY), false);
});

test('T7-b: refresh 거부 정리 삭제가 영구 실패해도 같은 결과(Redux 초기화, 표식 유지, 재실행 시 복원 안 함)', async () => {
  const store = createStore();
  await loginAs(store, A);
  gateway.validTokens.delete(A.access);
  gateway.refreshMode = 'reject';
  gateway.refreshDelay = 20;
  secureControl.fail.delete = Infinity;
  secureControl.fail.set = Infinity;

  const error = await apiClient.get(WORK_X).catch(e => e);

  assert.equal(error.kind, 'SESSION_EXPIRED');
  assert.equal(expiredCalls, 1);
  assertLoggedOut(store);
  assert.equal(asyncStore.get(MARKER_KEY), 'true');

  resetSecureControl();
  tokenService.__testing.resetProcessState();
  const freshStore = createStore();
  const action = await freshStore.dispatch(restoreSession());

  assert.equal(action.payload, null);
  assertNoStoredTokens();
  assert.equal(asyncStore.has(MARKER_KEY), false);
});

test('T7-c: RE_LOGIN 정리가 성공하면 표식이 남지 않음', async () => {
  const store = createStore();
  await loginAs(store, A);
  routeReLoginWork();

  await apiClient.get(WORK_X).catch(error => error);

  assert.equal(expiredCalls, 1);
  assertNoStoredTokens();
  assert.equal(asyncStore.has(MARKER_KEY), false);
});

test('T7-d(알려진 한계): 표식 쓰기와 삭제가 모두 실패한 채 재실행하면 남은 토큰으로 복원될 수 있음', async () => {
  const store = createStore();
  await loginAs(store, A);
  routeReLoginWork();
  asyncControl.fail.set = Infinity;
  secureControl.fail.delete = Infinity;
  secureControl.fail.set = Infinity;

  await apiClient.get(WORK_X).catch(error => error);
  assert.equal(asyncStore.has(MARKER_KEY), false);

  resetSecureControl();
  resetAsyncControl();
  tokenService.__testing.resetProcessState();
  gateway.validTokens.add(A.access);
  const freshStore = createStore();
  const action = await freshStore.dispatch(restoreSession());

  // 보장되지 않는 영역: 표식이 없으므로 /me로 복원된다(보고서 한계 항목).
  assert.ok(action.payload === null || action.payload.user.userId === A.userId);
});

test('T7-e: authApi 실패 경로(/me 세션 무효) 정리가 영구 실패해도 표식 유지', async () => {
  const store = createStore();
  await beginTokens(A);
  gateway.route('GET', ME, () => ({
    public: true,
    status: 401,
    body: authEnvelope(null, {
      success: false,
      status: 401,
      code: 'AUTH-401-001',
      error: { reason: 'x', details: [], requiredAction: 'RE_LOGIN' },
    }),
  }));
  secureControl.fail.delete = Infinity;
  secureControl.fail.set = Infinity;

  const action = await store.dispatch(fetchCurrentUser());

  assert.equal(action.meta.requestStatus, 'rejected');
  assert.equal(action.payload.retryable, false);
  assert.equal(asyncStore.get(MARKER_KEY), 'true');
  assert.equal(await tokenService.getAccessToken(), null);
});
