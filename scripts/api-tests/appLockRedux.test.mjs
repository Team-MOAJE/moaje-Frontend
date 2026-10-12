// 앱 잠금(PIN) Redux 연동 테스트 (2·3부). 모의 Gateway·스텁 사용, 실제 서버 호출 없음.
// 실행: npm run test:api
// 서버 동작(401 AUTH-401-005 모호 응답, 423 잠금, Refresh 회전)은 Auth 소스 분석 결과이며 실요청 검증 전이다.
// 토큰·전화번호·PIN은 모의 서버 전용 가짜 값이며 출력하지 않는다.
import { test, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { configureStore } from '@reduxjs/toolkit';
import { MockGateway, authEnvelope } from './mockGateway.mjs';
import {
  __store as secureStore,
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
const {
  loginUser,
  logoutUser,
  restoreSession,
  verifyUnlockPin,
  classifyUnlockFailure,
  isAppLockFeatureEnabled,
  UNLOCK_FAILURE,
} = await import('../../src/features/auth/authApi.js');
const { default: authReducer, logout } = await import('../../src/features/auth/authSlice.js');

const UNLOCK = '/api/v1/auth/session/unlock';
const LOGOUT = '/api/v1/auth/logout';
const LOGIN = '/api/v1/auth/login';
const ME = '/api/v1/auth/me';
const WORK_X = '/api/v1/work/x';
const REFRESH_KEY = 'REFRESH_TOKEN';
const PIN = '012345';
const WRONG_PIN = '999999';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const waitFor = async (condition, timeoutMs = 3000) => {
  const end = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > end) assert.fail('waitFor 시간 초과');
    await sleep(5);
  }
};

// RootNavigator.js의 needsAppLock과 같은 식 (아래 S16이 소스와 일치함을 확인한다).
const needsAppLock = state =>
  state.auth.isAuthenticated && isAppLockFeatureEnabled && !state.auth.isAppUnlocked;

// ── 서버 모사 ────────────────────────────────────────────────
const server = { active: new Set(), seq: 0, unlockCalls: 0, mode: 'ok', unlockDelay: 0 };

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

const tokenEnvelope = (tokens, code) =>
  authEnvelope(
    {
      access_token: tokens.access,
      refresh_token: tokens.refresh,
      token_type: 'bearer',
      expires_in: 1800,
      onboarding_completed: false,
    },
    { code }
  );

const installServer = () => {
  gateway.refreshOverride = ({ record }) => {
    const presented = record.body?.refresh_token;
    if (!server.active.has(presented)) {
      return { status: 401, body: rejectEnvelope(401, 'AUTH-401-005', 'RE_LOGIN') };
    }
    server.active.delete(presented);
    return { body: tokenEnvelope(issue(), 'AUTH-200-002') };
  };

  gateway.route('POST', UNLOCK, ({ record }) => {
    server.unlockCalls += 1;
    const { refresh_token: presented, pin } = record.body ?? {};

    if (server.mode === 'network') return { public: true, destroy: true };
    if (server.mode === 'server-error') return { public: true, status: 503, body: { code: 'X' } };
    if (server.mode === 'locked') {
      return { public: true, status: 423, body: rejectEnvelope(423, 'AUTH-423-001', 'NONE') };
    }
    if (!server.active.has(presented) || pin !== PIN) {
      return { public: true, status: 401, body: rejectEnvelope(401, 'AUTH-401-005', 'RE_LOGIN') };
    }

    server.active.delete(presented);
    return {
      public: true,
      delay: server.unlockDelay,
      body: tokenEnvelope(issue(), 'AUTH-200-010'),
    };
  });

  gateway.route('POST', LOGIN, () => ({
    public: true,
    body: tokenEnvelope(issue(), 'AUTH-200-001'),
  }));

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

// 앱 재실행 직후와 같은 상태: 저장된 세션 → restoreSession → 인증됨 + 잠김
const restoreLocked = async (store = createStore()) => {
  const tokens = await startSession();
  const action = await store.dispatch(restoreSession());
  assert.equal(action.meta.requestStatus, 'fulfilled');
  assert.equal(store.getState().auth.isAuthenticated, true);
  return { store, tokens };
};

const storedRefresh = () => secureStore.get(REFRESH_KEY) ?? null;
const requests = path => gateway.requestsTo(path);

const rejectedPayload = async promise => {
  const action = await promise;
  assert.equal(action.meta.requestStatus, 'rejected');
  return action.payload;
};

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

// ── S. 잠금 상태 ─────────────────────────────────────────────

test('S1: 앱 재실행 후 세션 복원 성공 → 인증됨 + 잠김 유지, 잠금 화면 대상, unlock 요청 0건', async () => {
  const { store } = await restoreLocked();

  const { auth } = store.getState();
  assert.equal(auth.isAppUnlocked, false);
  assert.equal(needsAppLock(store.getState()), true, 'PIN 전에는 MainNavigator 대신 잠금 화면');
  assert.equal(server.unlockCalls, 0);
});

test('S2: API-50 성공일 때만 잠금 해제 — 결과에 토큰·PIN 없음, Refresh 회전 저장', async () => {
  const { store, tokens } = await restoreLocked();
  const before = needsAppLock(store.getState());

  const action = await store.dispatch(verifyUnlockPin({ pin: PIN }));

  assert.equal(before, true);
  assert.equal(action.meta.requestStatus, 'fulfilled');
  assert.deepEqual(action.payload, { onboardingCompleted: false });
  assert.equal(store.getState().auth.isAppUnlocked, true);
  assert.equal(needsAppLock(store.getState()), false, '성공 후에만 홈 진입');
  assert.notEqual(storedRefresh(), tokens.refresh);
  assert.deepEqual([...server.active], [storedRefresh()]);

  // 상태와 결과(payload)에는 PIN·토큰이 없다. (action.meta.arg의 PIN은 loginUser와 같은 thunk 관례로 메모리에만 있다.)
  const dump = JSON.stringify(store.getState()) + JSON.stringify(action.payload);
  assert.equal(dump.includes(PIN), false);
  assert.equal(dump.includes(storedRefresh()), false);
});

test('S3: 모호한 401(잘못된 PIN) → 잠금·인증 유지, 토큰 유지, 로그아웃·만료 알림 없음, 이후 올바른 PIN 성공', async () => {
  const { store, tokens } = await restoreLocked();

  const payload = await rejectedPayload(store.dispatch(verifyUnlockPin({ pin: WRONG_PIN })));

  assert.equal(classifyUnlockFailure(payload), UNLOCK_FAILURE.AMBIGUOUS_AUTH);
  const { auth } = store.getState();
  assert.equal(auth.isAuthenticated, true);
  assert.equal(auth.isAppUnlocked, false);
  assert.equal(needsAppLock(store.getState()), true);
  assert.equal(storedRefresh(), tokens.refresh);
  assert.equal(expiredCalls, 0);
  assert.equal(requests(LOGOUT).length, 0);

  await store.dispatch(verifyUnlockPin({ pin: PIN })).unwrap();
  assert.equal(needsAppLock(store.getState()), false);
});

test('S4: 423 → 잠금 유지·토큰 유지', async () => {
  const { store, tokens } = await restoreLocked();
  server.mode = 'locked';

  const payload = await rejectedPayload(store.dispatch(verifyUnlockPin({ pin: PIN })));

  assert.equal(classifyUnlockFailure(payload), UNLOCK_FAILURE.LOCKED);
  assert.equal(needsAppLock(store.getState()), true);
  assert.equal(storedRefresh(), tokens.refresh);
  assert.equal(expiredCalls, 0);
});

test('S5: 네트워크 오류·타임아웃·5xx → 잠금 유지·토큰 유지 (임의 잠금 해제 없음)', async () => {
  const { store, tokens } = await restoreLocked();

  server.mode = 'network';
  let payload = await rejectedPayload(store.dispatch(verifyUnlockPin({ pin: PIN })));
  assert.equal(classifyUnlockFailure(payload), UNLOCK_FAILURE.NETWORK);

  server.mode = 'server-error';
  payload = await rejectedPayload(store.dispatch(verifyUnlockPin({ pin: PIN })));
  assert.equal(classifyUnlockFailure(payload), UNLOCK_FAILURE.SERVER);

  server.mode = 'ok';
  server.unlockDelay = 2200;
  payload = await rejectedPayload(store.dispatch(verifyUnlockPin({ pin: PIN })));
  assert.equal(classifyUnlockFailure(payload), UNLOCK_FAILURE.NETWORK);

  assert.equal(needsAppLock(store.getState()), true);
  assert.equal(storedRefresh(), tokens.refresh);
  assert.equal(expiredCalls, 0);
});

test('S6: 저장된 Refresh Token이 없으면 세션 정리 → 로그인 화면으로 (잠금 해제 아님)', async () => {
  const { store } = await restoreLocked();
  secureStore.delete(REFRESH_KEY);

  const payload = await rejectedPayload(store.dispatch(verifyUnlockPin({ pin: PIN })));

  assert.equal(classifyUnlockFailure(payload), UNLOCK_FAILURE.SESSION_ENDED);
  const { auth } = store.getState();
  assert.equal(auth.isAuthenticated, false);
  assert.equal(auth.isAppUnlocked, false);
  assert.equal(auth.user, null);
  assert.equal(server.unlockCalls, 0);
});

// ── X. 세션 epoch·요청 소유권 경합 ───────────────────────────

test('X1: 이전 세션의 unlock 응답이 로그아웃 후 새로 복원된 (잠긴) 세션에 도착해도 잠금을 풀지 않는다', async () => {
  const { store } = await restoreLocked();
  tokenService.__testing.setLimits({ refreshWaitMs: 50 });
  server.unlockDelay = 400;

  const oldUnlock = store.dispatch(verifyUnlockPin({ pin: PIN }));
  await waitFor(() => server.unlockCalls === 1);

  await store.dispatch(logoutUser());
  assert.equal(store.getState().auth.isAuthenticated, false);

  // 새 세션 B: 저장된 세션 복원 → 인증됨 + 잠김
  const second = await startSession();
  await store.dispatch(restoreSession());
  assert.equal(needsAppLock(store.getState()), true);

  const payload = await rejectedPayload(oldUnlock);

  assert.equal(classifyUnlockFailure(payload), UNLOCK_FAILURE.CANCELED);
  assert.equal(
    needsAppLock(store.getState()),
    true,
    '이전 세션 응답이 현재 세션의 잠금을 풀면 안 된다'
  );
  assert.equal(store.getState().auth.isAppUnlocked, false);
  // 새 세션 토큰은 그대로이고 서버에서도 폐기되지 않았다.
  assert.equal(storedRefresh(), second.refresh);
  await waitFor(() => requests(LOGOUT).length === 2);
  assert.ok(server.active.has(second.refresh));
  assert.ok(!requests(LOGOUT).some(request => request.body.refresh_token === second.refresh));
  assert.equal(expiredCalls, 0);
});

test('X2: 로그아웃과 겹친 unlock이 서버에서 성공해도 Redux는 로그아웃 상태 유지, 서버에 활성 Refresh 없음', async () => {
  const { store } = await restoreLocked();
  server.unlockDelay = 300;

  const unlock = store.dispatch(verifyUnlockPin({ pin: PIN }));
  await waitFor(() => server.unlockCalls === 1);
  const logoutAction = await store.dispatch(logoutUser());
  const unlockAction = await unlock;

  assert.equal(logoutAction.payload.localCleared, true);
  assert.equal(unlockAction.meta.requestStatus, 'fulfilled', 'unlock 자체는 서버 성공');
  const { auth } = store.getState();
  assert.equal(auth.isAuthenticated, false, '로그아웃 상태 유지');
  assert.equal(auth.isAppUnlocked, false, '늦은 fulfilled는 reducer가 무시');
  assert.deepEqual([...server.active], []);
});

test('X3: 이전 요청의 늦은 fulfilled 액션(requestId 불일치)은 잠금을 풀지 않는다', async () => {
  const { store } = await restoreLocked();

  store.dispatch(
    verifyUnlockPin.fulfilled({ onboardingCompleted: false }, 'stale-request-id', { pin: PIN })
  );

  assert.equal(needsAppLock(store.getState()), true);
});

test('X4: 인증 상태가 아닐 때 최신 requestId의 fulfilled가 와도 잠금 해제 상태가 되지 않는다', async () => {
  const store = createStore();
  const pending = verifyUnlockPin.pending('req-1', { pin: PIN });
  store.dispatch(pending);
  store.dispatch(verifyUnlockPin.fulfilled({ onboardingCompleted: false }, 'req-1', { pin: PIN }));

  assert.equal(store.getState().auth.isAuthenticated, false);
  assert.equal(store.getState().auth.isAppUnlocked, false);
});

test('X5: 일반 refresh 성공(Access 만료 → 401 → refresh → 재시도)은 잠금을 풀지 않는다', async () => {
  const { store, tokens } = await restoreLocked();
  gateway.validTokens.delete(tokens.access); // Access 만료

  gateway.route('GET', WORK_X, () => ({ body: { ok: true } }));
  const result = await apiClient.get(WORK_X);

  assert.deepEqual(result, { ok: true });
  assert.equal(gateway.refreshCount, 1);
  assert.equal(needsAppLock(store.getState()), true);
  assert.equal(server.unlockCalls, 0);
});

// ── L. 로그아웃 버튼(탈출 경로)·기존 흐름 보호 ───────────────

test('L1: 잠금 상태에서 로그아웃 — 서버 로그아웃 1회, 토큰·Redux 정리, 중복 호출은 요청 1건, 다음 실행은 로그인 화면', async () => {
  const { store, tokens } = await restoreLocked();

  const [first, second] = await Promise.all([
    store.dispatch(logoutUser()),
    store.dispatch(logoutUser()),
  ]);

  assert.equal(first.payload.localCleared, true);
  assert.equal(second.payload.localCleared, true);
  assert.equal(requests(LOGOUT).length, 1, '중복 로그아웃 방지');
  assert.equal(requests(LOGOUT)[0].body.refresh_token, tokens.refresh);
  assert.equal(requests(LOGOUT)[0].headers.authorization, undefined);
  const { auth } = store.getState();
  assert.equal(auth.isAuthenticated, false);
  assert.equal(auth.isAppUnlocked, false);
  assert.equal(needsAppLock(store.getState()), false);
  assert.equal(storedRefresh(), null);

  // 다음 실행: 저장된 세션 없음 → /me 요청 없이 일반 로그인 화면
  tokenService.__testing.resetProcessState();
  const next = createStore();
  const meBefore = requests(ME).length;
  await next.dispatch(restoreSession());
  assert.equal(next.getState().auth.isAuthenticated, false);
  assert.equal(requests(ME).length, meBefore);
});

test('L2: 423 잠금 상태에서도 로그아웃 가능 (서버 로그아웃 실패해도 로컬 정리)', async () => {
  const { store } = await restoreLocked();
  server.mode = 'locked';
  await store.dispatch(verifyUnlockPin({ pin: PIN }));
  assert.equal(needsAppLock(store.getState()), true);

  gateway.route('POST', LOGOUT, () => ({ public: true, destroy: true })); // 서버 로그아웃 실패
  const result = await store.dispatch(logoutUser()).unwrap();

  assert.equal(result.serverLoggedOut, false);
  assert.equal(result.localCleared, true);
  assert.equal(store.getState().auth.isAuthenticated, false);
  assert.equal(storedRefresh(), null);
});

test('L3: PIN 로그인 성공은 기존대로 잠금 없이 진입 (isAppUnlocked=true)', async () => {
  const store = createStore();

  const action = await store.dispatch(loginUser({ phoneNumber: '01000000000', pin: PIN }));

  assert.equal(action.meta.requestStatus, 'fulfilled');
  assert.equal(store.getState().auth.isAppUnlocked, true);
  assert.equal(needsAppLock(store.getState()), false);
  assert.equal(server.unlockCalls, 0);
});

// ── M. 분류·활성화 상태 ──────────────────────────────────────

test('M1: classifyUnlockFailure 분류표', () => {
  const cases = [
    [{ status: 401, code: 'AUTH-401-005', kind: 'BUSINESS' }, UNLOCK_FAILURE.AMBIGUOUS_AUTH],
    [{ status: 423, code: 'AUTH-423-001', kind: 'BUSINESS' }, UNLOCK_FAILURE.LOCKED],
    [{ status: null, code: 'AUTH-423-001', kind: 'BUSINESS' }, UNLOCK_FAILURE.LOCKED],
    [{ kind: 'NETWORK' }, UNLOCK_FAILURE.NETWORK],
    [{ kind: 'TIMEOUT' }, UNLOCK_FAILURE.NETWORK],
    [{ kind: 'HTTP_5XX', status: 503 }, UNLOCK_FAILURE.SERVER],
    [{ kind: 'CANCELED' }, UNLOCK_FAILURE.CANCELED],
    [{ kind: 'SESSION_EXPIRED', sessionEnded: true }, UNLOCK_FAILURE.SESSION_ENDED],
    [{ kind: 'BUSINESS', status: 200 }, UNLOCK_FAILURE.OTHER],
    [undefined, UNLOCK_FAILURE.OTHER],
  ];

  for (const [error, expected] of cases) {
    assert.equal(classifyUnlockFailure(error), expected);
  }
});

test('M2: 앱 잠금 기능이 켜져 있고, RootNavigator의 분기 식과 이 테스트의 식이 같다', () => {
  assert.equal(isAppLockFeatureEnabled, true);
  const source = readFileSync(
    new URL('../../src/navigation/RootNavigator.js', import.meta.url),
    'utf8'
  );
  assert.ok(
    source.includes('isAuthenticated && isAppLockFeatureEnabled && !isAppUnlocked'),
    'RootNavigator 잠금 분기 식이 바뀌었습니다'
  );
});

test('M3: PinInputScreen의 unlock 모드는 서버 성공 전에 잠금을 풀지 않는다 (화면 소스 점검)', () => {
  const source = readFileSync(
    new URL('../../src/screens/auth/PinInputScreen.js', import.meta.url),
    'utf8'
  );
  assert.equal(
    source.includes('unlockApp'),
    false,
    '클라이언트 단독 잠금 해제 액션이 남아 있습니다'
  );
  assert.ok(source.includes('verifyUnlockPin({ pin: enteredPin })'));
  assert.ok(source.includes('logoutUser'), '로그아웃은 기존 logoutUser를 재사용');
  assert.ok(source.includes("mode === 'unlock'"), '탈출 버튼은 unlock 모드 한정');
  assert.ok(source.includes('Alert.alert'), '로그아웃 전 확인 Alert');
});
