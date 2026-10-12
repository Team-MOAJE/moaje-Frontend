// 앱 잠금 해제(API-50) 통신·토큰 계층 테스트 (1부). 모의 Gateway·스텁 사용, 실제 서버 호출 없음.
// 실행: npm run test:api
// 서버 동작(401 AUTH-401-005 모호 응답, 423 잠금, Refresh 회전)은 Auth 소스 분석 결과이며 실요청 검증 전이다.
// 토큰·전화번호·PIN은 모의 서버 전용 가짜 값이며 출력하지 않는다.
import { test, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { configureStore } from '@reduxjs/toolkit';
import { MockGateway, authEnvelope } from './mockGateway.mjs';
import {
  __store as secureStore,
  __control as secureControl,
  __resetControl as resetSecureControl,
} from './stubs/expoSecureStore.mjs';
import {
  __store as asyncStore,
  __resetControl as resetAsyncControl,
} from './stubs/asyncStorage.mjs';

const gateway = new MockGateway();
const baseURL = await gateway.listen();

process.env.EXPO_PUBLIC_API_BASE_URL = baseURL;
process.env.EXPO_PUBLIC_API_TIMEOUT = '1500';

const { default: apiClient, setSessionExpiredHandler } =
  await import('../../src/services/apiClient.js');
const tokenService = await import('../../src/services/tokenService.js');
const { logoutUser, restoreSession } = await import('../../src/features/auth/authApi.js');
const { default: authReducer, logout } = await import('../../src/features/auth/authSlice.js');
const { API_ENDPOINTS } = await import('../../src/constants/apiEndpoints.js');

const UNLOCK = '/api/v1/auth/session/unlock';
const LOGOUT = '/api/v1/auth/logout';
const REFRESH = '/api/v1/auth/refresh';
const ME = '/api/v1/auth/me';
const WORK_X = '/api/v1/work/x';
const ACCESS_KEY = 'ACCESS_TOKEN';
const REFRESH_KEY = 'REFRESH_TOKEN';
const PIN = '012345'; // 앞자리 0 보존 확인용
const WRONG_PIN = '999999';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const waitFor = async (condition, timeoutMs = 3000) => {
  const end = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > end) assert.fail('waitFor 시간 초과');
    await sleep(5);
  }
};

// ── 서버 모사: 활성 Refresh Token 집합 + 회전 ───────────────────
const server = {
  active: new Set(), // 서버에서 아직 유효한 Refresh Token
  seq: 0,
  unlockCalls: 0,
  mode: 'ok', // 'ok' | 'locked' | 'network' | 'server-error' | 'malformed'
  unlockDelay: 0,
};

const issue = () => {
  server.seq += 1;
  const tokens = { access: `S-access-${server.seq}`, refresh: `S-refresh-${server.seq}` };
  server.active.add(tokens.refresh);
  gateway.validTokens.add(tokens.access);
  return tokens;
};

const rejectEnvelope = (status, code, requiredAction) =>
  authEnvelope(null, {
    success: false,
    status,
    code,
    message: '실패',
    error: { reason: 'test', details: [], requiredAction },
  });

const installServer = () => {
  gateway.refreshOverride = ({ record }) => {
    const presented = record.body?.refresh_token;
    if (!server.active.has(presented)) {
      return { status: 401, body: rejectEnvelope(401, 'AUTH-401-005', 'RE_LOGIN') };
    }
    server.active.delete(presented);
    const next = issue();
    return {
      body: authEnvelope(
        {
          access_token: next.access,
          refresh_token: next.refresh,
          token_type: 'bearer',
          expires_in: 1800,
          onboarding_completed: null,
        },
        { code: 'AUTH-200-002' }
      ),
    };
  };

  gateway.route('POST', UNLOCK, ({ record }) => {
    server.unlockCalls += 1;
    const { refresh_token: presented, pin } = record.body ?? {};

    if (server.mode === 'network') return { public: true, destroy: true };
    if (server.mode === 'server-error') return { public: true, status: 503, body: { code: 'X' } };
    if (server.mode === 'malformed') return { public: true, body: { ok: true } };
    if (server.mode === 'locked') {
      return { public: true, status: 423, body: rejectEnvelope(423, 'AUTH-423-001', 'NONE') };
    }

    // 잘못된 PIN과 무효한 Refresh Token은 같은 응답(401 AUTH-401-005, RE_LOGIN)이다.
    if (!server.active.has(presented) || pin !== PIN) {
      return { public: true, status: 401, body: rejectEnvelope(401, 'AUTH-401-005', 'RE_LOGIN') };
    }

    server.active.delete(presented); // 서버는 요청을 받는 즉시 이전 토큰을 폐기하고 새 토큰을 발급한다.
    const next = issue();
    return {
      public: true,
      delay: server.unlockDelay,
      body: authEnvelope(
        {
          access_token: next.access,
          refresh_token: next.refresh,
          token_type: 'bearer',
          expires_in: 1800,
          onboarding_completed: false,
        },
        { code: 'AUTH-200-010' }
      ),
    };
  });

  gateway.route('POST', LOGOUT, ({ record }) => {
    server.active.delete(record.body?.refresh_token);
    return { public: true, body: authEnvelope(null, { code: 'AUTH-200-003' }) };
  });

  gateway.route('GET', ME, () => ({
    body: authEnvelope({
      user_id: '1',
      name: '테스트',
      phone_number: '+821000000000',
      onboarding_completed: false,
    }),
  }));

  gateway.route('GET', WORK_X, () => ({ body: { ok: true } }));
};

let expiredCalls = 0;

const createStore = () => {
  const store = configureStore({ reducer: { auth: authReducer } });
  setSessionExpiredHandler(() => {
    expiredCalls += 1;
    store.dispatch(logout());
  });
  return store;
};

const startSession = async () => {
  const tokens = issue();
  await tokenService.beginSession(tokens.access, tokens.refresh);
  return tokens;
};

const storedRefresh = () => secureStore.get(REFRESH_KEY) ?? null;
const storedAccess = () => secureStore.get(ACCESS_KEY) ?? null;

const assertNoStoredTokens = () => {
  const present = [...secureStore.values()].filter(value => value !== '');
  assert.deepEqual(present, [], '저장소에 토큰이 남아 있습니다.');
};

const requests = path => gateway.requestsTo(path);
const indexOfRequest = path => gateway.requests.findIndex(request => request.path === path);

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
  server.active.clear();
  server.seq = 0;
  server.unlockCalls = 0;
  server.mode = 'ok';
  server.unlockDelay = 0;
  installServer();
});

afterEach(async () => {
  await sleep(40);
});

after(async () => {
  await gateway.close();
});

// ── U. unlockWithPin 기본 ─────────────────────────────────────

test('U1: 성공 — 본문 {refresh_token, pin}만, Authorization 없음, PIN 앞자리 0 보존, Refresh 회전 저장, epoch 불변', async () => {
  const first = await startSession();
  const epoch = tokenService.getSessionEpoch();

  const result = await tokenService.unlockWithPin(PIN);

  assert.deepEqual(result, { onboardingCompleted: false }); // 토큰 값은 반환하지 않는다
  assert.equal(requests(UNLOCK).length, 1);
  const request = requests(UNLOCK)[0];
  assert.deepEqual(Object.keys(request.body).sort(), ['pin', 'refresh_token']);
  assert.equal(request.body.pin, PIN);
  assert.equal(request.body.refresh_token, first.refresh);
  assert.equal(request.headers.authorization, undefined);

  assert.notEqual(storedRefresh(), first.refresh);
  assert.notEqual(storedAccess(), first.access);
  assert.deepEqual([...server.active], [storedRefresh()], '서버에는 새 Refresh Token만 활성');
  assert.equal(tokenService.getSessionEpoch(), epoch);
  assert.equal(await tokenService.getAccessToken(), storedAccess());
});

test('U2: Access Token이 이미 만료돼도 잠금 해제 성공 (Authorization 불필요)', async () => {
  const first = await startSession();
  gateway.validTokens.delete(first.access);

  await tokenService.unlockWithPin(PIN);

  assert.equal(requests(UNLOCK)[0].headers.authorization, undefined);
  assert.equal(requests(UNLOCK).length, 1);
  assert.equal(gateway.refreshCount, 0, '일반 refresh를 호출하지 않는다');
});

test('U3: 잘못된 PIN의 모호한 401 — 토큰 유지·세션 만료 알림 없음·자동 로그아웃 없음, 이후 올바른 PIN 성공', async () => {
  const first = await startSession();
  const epoch = tokenService.getSessionEpoch();

  await assert.rejects(tokenService.unlockWithPin(WRONG_PIN), error => {
    assert.equal(error.status, 401);
    assert.equal(error.code, 'AUTH-401-005');
    assert.equal(error.requiredAction, 'RE_LOGIN');
    // 오류에 토큰·PIN이 실려 있지 않다.
    const dump = JSON.stringify(error);
    assert.equal(dump.includes(first.refresh), false);
    assert.equal(dump.includes(first.access), false);
    assert.equal(dump.includes(WRONG_PIN), false);
    return true;
  });

  assert.equal(storedRefresh(), first.refresh);
  assert.equal(storedAccess(), first.access);
  assert.equal(tokenService.getSessionEpoch(), epoch);
  assert.equal(expiredCalls, 0);
  assert.equal(requests(LOGOUT).length, 0);
  assert.equal(gateway.refreshCount, 0);

  await tokenService.unlockWithPin(PIN);
  assert.notEqual(storedRefresh(), first.refresh);
});

test('U4: Refresh Token이 서버에서 이미 폐기된 경우도 같은 401 — 이 함수는 토큰을 지우거나 만료 알림을 보내지 않는다', async () => {
  const first = await startSession();
  server.active.delete(first.refresh);

  await assert.rejects(tokenService.unlockWithPin(PIN), error => error.status === 401);

  assert.equal(storedRefresh(), first.refresh);
  assert.equal(storedAccess(), first.access);
  assert.equal(expiredCalls, 0);
});

test('U5: 423 잠금 — 토큰 유지·세션 유지', async () => {
  const first = await startSession();
  server.mode = 'locked';

  await assert.rejects(
    tokenService.unlockWithPin(PIN),
    error => error.status === 423 && error.code === 'AUTH-423-001'
  );

  assert.equal(storedRefresh(), first.refresh);
  assert.equal(expiredCalls, 0);
});

test('U6: 네트워크 오류·5xx — 토큰 유지·세션 유지', async () => {
  const first = await startSession();

  server.mode = 'network';
  await assert.rejects(tokenService.unlockWithPin(PIN), error => error.kind === 'NETWORK');

  server.mode = 'server-error';
  await assert.rejects(tokenService.unlockWithPin(PIN), error => error.kind === 'HTTP_5XX');

  assert.equal(storedRefresh(), first.refresh);
  assert.equal(storedAccess(), first.access);
  assert.equal(expiredCalls, 0);
});

test('U7: 타임아웃 — 토큰 유지·세션 유지', async () => {
  const first = await startSession();
  server.unlockDelay = 2200; // axios timeout(1500ms)보다 길다

  await assert.rejects(tokenService.unlockWithPin(PIN), error => error.kind === 'TIMEOUT');

  assert.equal(storedRefresh(), first.refresh);
  assert.equal(expiredCalls, 0);
});

test('U8: 200이어도 해석할 수 없는 응답 — 잠금 해제로 보지 않고 토큰을 바꾸지 않는다', async () => {
  const first = await startSession();
  server.mode = 'malformed';

  await assert.rejects(tokenService.unlockWithPin(PIN), error => error.kind === 'BUSINESS');

  assert.equal(storedRefresh(), first.refresh);
  assert.equal(storedAccess(), first.access);
});

test('U9: 저장된 토큰이 없으면 요청 없이 세션 무효 오류', async () => {
  await assert.rejects(tokenService.unlockWithPin(PIN), error => error.kind === 'SESSION_EXPIRED');
  assert.equal(server.unlockCalls, 0);
});

test('U10: 동시에 두 번 호출하면 두 번째는 요청 없이 CANCELED (PIN 실패 카운터 보호)', async () => {
  await startSession();
  server.unlockDelay = 150;

  const first = tokenService.unlockWithPin(PIN);
  await assert.rejects(tokenService.unlockWithPin(PIN), error => error.kind === 'CANCELED');
  await first;

  assert.equal(server.unlockCalls, 1);
});

test('U11: 로그아웃 진행 중에는 시작하지 않는다', async () => {
  await startSession();
  const store = createStore();
  tokenService.__testing.setLimits({ requestTimeoutMs: 300 });
  const logoutPromise = store.dispatch(logoutUser());

  await assert.rejects(tokenService.unlockWithPin(PIN), error => error.kind === 'CANCELED');
  await logoutPromise;

  assert.equal(server.unlockCalls, 0);
});

// ── G. Gateway 공개 경로 정책 ────────────────────────────────

test('G1: apiClient도 unlock 경로에 Authorization을 붙이지 않고, RE_LOGIN 응답에 토큰을 지우거나 만료 알림을 보내지 않는다', async () => {
  const first = await startSession();
  createStore();

  await assert.rejects(
    apiClient.post(API_ENDPOINTS.AUTH.SESSION_UNLOCK, {
      refresh_token: first.refresh,
      pin: WRONG_PIN,
    }),
    error => error.status === 401 && error.requiredAction === 'RE_LOGIN'
  );

  assert.equal(requests(UNLOCK)[0].headers.authorization, undefined);
  assert.equal(storedRefresh(), first.refresh);
  assert.equal(expiredCalls, 0);
});

// ── R. 일반 Refresh와의 관계 ─────────────────────────────────

test('R1: 일반 refresh 성공(복원 중 /me 401 → refresh)은 앱 잠금 해제로 이어지지 않는다', async () => {
  const first = await startSession();
  gateway.validTokens.delete(first.access); // Access 만료
  const store = createStore();

  const action = await store.dispatch(restoreSession());

  assert.equal(action.meta.requestStatus, 'fulfilled');
  assert.equal(gateway.refreshCount, 1);
  const { auth } = store.getState();
  assert.equal(auth.isAuthenticated, true);
  assert.equal(auth.isAppUnlocked, false, 'refresh/복원 성공만으로 잠금이 풀리면 안 된다');
  assert.equal(server.unlockCalls, 0);
});

test('R2: 여러 refresh가 동시에 요청돼도 기존 single-flight 유지 (요청 1회)', async () => {
  await startSession();

  const results = await Promise.all([
    tokenService.refreshAccessToken(),
    tokenService.refreshAccessToken(),
    tokenService.refreshAccessToken(),
  ]);

  assert.equal(gateway.refreshCount, 1);
  assert.equal(new Set(results).size, 1);
});

test('R3: refresh 진행 중 unlock — unlock은 refresh가 끝난 뒤 회전된 최신 토큰으로 요청하고, 결과는 unlock 응답에서만 나온다', async () => {
  const first = await startSession();
  gateway.refreshDelay = 300;

  const refreshPromise = tokenService.refreshAccessToken();
  const unlockPromise = tokenService.unlockWithPin(PIN);

  const [refreshed, unlocked] = await Promise.all([refreshPromise, unlockPromise]);

  assert.equal(typeof refreshed, 'string'); // refresh 결과는 Access Token 문자열
  assert.deepEqual(unlocked, { onboardingCompleted: false }); // unlock 결과는 unlock 응답

  assert.equal(gateway.refreshCount, 1);
  assert.equal(server.unlockCalls, 1);
  assert.ok(indexOfRequest(REFRESH) < indexOfRequest(UNLOCK), 'unlock 요청은 refresh 이후');
  assert.notEqual(requests(UNLOCK)[0].body.refresh_token, first.refresh, '회전된 최신 토큰 사용');
  assert.equal(expiredCalls, 0);
  assert.deepEqual([...server.active], [storedRefresh()]);
});

test('R4: unlock 진행 중 refresh 시작 — refresh는 unlock이 저장한 새 Refresh Token으로 시작 (회전 충돌·세션 만료 없음)', async () => {
  const first = await startSession();
  server.unlockDelay = 300;

  const unlockPromise = tokenService.unlockWithPin(PIN);
  await waitFor(() => server.unlockCalls === 1);
  const refreshPromise = tokenService.refreshAccessToken();

  const [unlocked, refreshed] = await Promise.all([unlockPromise, refreshPromise]);

  assert.deepEqual(unlocked, { onboardingCompleted: false });
  assert.equal(typeof refreshed, 'string');
  assert.ok(indexOfRequest(UNLOCK) < indexOfRequest(REFRESH));
  assert.notEqual(requests(REFRESH)[0].body.refresh_token, first.refresh);
  assert.equal(expiredCalls, 0);
  assert.deepEqual([...server.active], [storedRefresh()], '서버에는 활성 Refresh Token 1개');
});

test('R5: unlock 진행 중 일반 요청이 401을 받아도 같은 Refresh Token으로 동시 회전하지 않는다', async () => {
  const first = await startSession();
  gateway.validTokens.delete(first.access); // 일반 요청이 401(INVALID_TOKEN)을 받는다
  createStore();
  server.unlockDelay = 300;

  const unlockPromise = tokenService.unlockWithPin(PIN);
  await waitFor(() => server.unlockCalls === 1);
  const workPromise = apiClient.get(WORK_X);

  const [, work] = await Promise.all([unlockPromise, workPromise]);

  assert.deepEqual(work, { ok: true });
  assert.equal(expiredCalls, 0);
  assert.equal(requests(REFRESH).length, 1);
  assert.notEqual(requests(REFRESH)[0].body.refresh_token, first.refresh);
  assert.deepEqual([...server.active], [storedRefresh()]);
});

// ── L. 로그아웃과의 경쟁 ─────────────────────────────────────

test('L1: unlock이 R1 폐기·R2 발급 중에 로그아웃 시작 (대기 상한 안에 끝남) — 로그아웃이 R2로 서버 로그아웃, 활성 Refresh 없음', async () => {
  const first = await startSession();
  const store = createStore();
  server.unlockDelay = 300;

  const unlockPromise = tokenService.unlockWithPin(PIN);
  await waitFor(() => server.unlockCalls === 1);
  assert.equal(server.active.has(first.refresh), false, 'R1은 서버에서 이미 폐기됨');

  const logoutPromise = store.dispatch(logoutUser());
  const [unlockResult, logoutAction] = await Promise.all([
    unlockPromise.then(
      value => ({ value }),
      error => ({ error })
    ),
    logoutPromise,
  ]);

  assert.ok(
    unlockResult.value,
    'draining 중에도 epoch가 같으면 저장되어 로그아웃이 새 토큰을 쓴다'
  );
  assert.equal(logoutAction.payload.serverLoggedOut, true);
  assert.equal(logoutAction.payload.localCleared, true);
  const bodies = requests(LOGOUT).map(request => request.body.refresh_token);
  assert.ok(!bodies.includes(first.refresh), '폐기된 R1이 아니라');
  assert.equal(bodies.length, 1, 'R2 한 번으로 로그아웃');
  assert.deepEqual([...server.active], [], '서버에 활성 Refresh Token이 남지 않는다');
  assertNoStoredTokens();
});

test('L2: 로그아웃이 대기 상한을 넘겨 먼저 진행한 뒤 unlock 응답 도착 — R2 저장 거부, R2는 서버에서 폐기', async () => {
  const first = await startSession();
  const store = createStore();
  tokenService.__testing.setLimits({ refreshWaitMs: 50 });
  server.unlockDelay = 400;

  const unlockPromise = tokenService.unlockWithPin(PIN);
  await waitFor(() => server.unlockCalls === 1);

  const logoutAction = await store.dispatch(logoutUser());
  assert.equal(logoutAction.payload.localCleared, true);
  assert.equal(requests(LOGOUT)[0].body.refresh_token, first.refresh, '이 시점엔 R1로 로그아웃');

  await assert.rejects(unlockPromise, error => error.kind === 'CANCELED');
  await waitFor(() => requests(LOGOUT).length === 2);

  assert.notEqual(requests(LOGOUT)[1].body.refresh_token, first.refresh, '두 번째는 R2');
  assertNoStoredTokens();
  await waitFor(() => server.active.size === 0);
  assert.deepEqual([...server.active], [], '서버에 활성 Refresh Token이 남지 않는다');
});

test('L3: 이전 세션의 unlock 응답이 로그아웃 후 새로 로그인한 세션에 영향을 주지 않는다', async () => {
  await startSession();
  const store = createStore();
  tokenService.__testing.setLimits({ refreshWaitMs: 50 });
  server.unlockDelay = 400;

  const unlockPromise = tokenService.unlockWithPin(PIN);
  await waitFor(() => server.unlockCalls === 1);
  await store.dispatch(logoutUser());

  const second = await startSession(); // 새 로그인 세션
  const epochB = tokenService.getSessionEpoch();

  await assert.rejects(unlockPromise, error => error.kind === 'CANCELED');
  await waitFor(() => requests(LOGOUT).length === 2);

  // 새 세션의 토큰은 그대로이고 서버에서도 폐기되지 않았다.
  assert.equal(storedRefresh(), second.refresh);
  assert.equal(storedAccess(), second.access);
  assert.equal(tokenService.getSessionEpoch(), epochB);
  assert.ok(server.active.has(second.refresh));
  assert.ok(!requests(LOGOUT).some(request => request.body.refresh_token === second.refresh));
  assert.equal(expiredCalls, 0);
  assert.equal(await tokenService.getAccessToken(), second.access);
});

test('L4: 세션 epoch가 바뀌면(세션 정리) unlock 응답을 저장하지 않고 R2를 폐기한다', async () => {
  await startSession();
  server.unlockDelay = 300;

  const unlockPromise = tokenService.unlockWithPin(PIN);
  await waitFor(() => server.unlockCalls === 1);
  await tokenService.clearTokens();

  await assert.rejects(unlockPromise, error => error.kind === 'CANCELED');
  assertNoStoredTokens();
  await waitFor(() => server.active.size === 0);
});

test('L5: 토큰 저장 실패 — 인증 상태를 만들지 않고 세션 정리, 새 Refresh Token도 서버에서 폐기', async () => {
  await startSession();
  secureControl.fail.set = 1; // 새 Access Token 쓰기 실패

  await assert.rejects(tokenService.unlockWithPin(PIN), error => error.kind === 'SESSION_EXPIRED');

  assertNoStoredTokens();
  await waitFor(() => server.active.size === 0);
  assert.deepEqual([...server.active], []);
});
