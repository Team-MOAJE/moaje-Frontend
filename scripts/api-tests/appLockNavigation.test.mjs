// 앱 잠금 화면 로그아웃 오류 수정 테스트: 네비게이션 route 충돌(StackRouter 실제 동작) + 로그아웃 진행 상태.
// 모의 Gateway·스텁 사용, 실제 서버 호출 없음. 토큰·PIN은 모의 서버 전용 가짜 값이며 출력하지 않는다.
import { test, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { configureStore } from '@reduxjs/toolkit';
import { StackRouter } from '@react-navigation/routers';
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

const { setSessionExpiredHandler } = await import('../../src/services/apiClient.js');
const tokenService = await import('../../src/services/tokenService.js');
const { logoutUser, restoreSession, verifyUnlockPin } =
  await import('../../src/features/auth/authApi.js');
const { default: authReducer, logout } = await import('../../src/features/auth/authSlice.js');
const { runGuardedLogout } = await import('../../src/features/auth/guardedLogout.js');
const { ROUTES } = await import('../../src/constants/routes.js');

const LOGOUT = '/api/v1/auth/logout';
const UNLOCK = '/api/v1/auth/session/unlock';
const ME = '/api/v1/auth/me';
const PIN = '012345';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// ── 소스에서 navigator별 route 이름 읽기 ─────────────────────────
const readSource = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');

const resolveRoute = expression => {
  const key = expression.replace(/^ROUTES\./, '');
  assert.ok(key in ROUTES, `ROUTES.${key} 없음`);
  return ROUTES[key];
};

const screenNames = source =>
  [...source.matchAll(/<(?:\w+)\.Screen[\s\S]*?name=\{(ROUTES\.\w+)\}/g)].map(match =>
    resolveRoute(match[1])
  );

const rootSource = readSource('../../src/navigation/RootNavigator.js');
const authSource = readSource('../../src/navigation/AuthNavigator.js');
const mainSource = readSource('../../src/navigation/MainNavigator.js');

const appLockSection = rootSource.slice(
  rootSource.indexOf('const AppLockStack'),
  rootSource.indexOf('const RootNavigator')
);
const appLockNames = screenNames(appLockSection);
const authNames = screenNames(authSource);
const mainNames = screenNames(mainSource);

// ── StackRouter로 "root navigator 교체" 재현 ─────────────────────
// useNavigationBuilder: 새 navigator는 container의 기존 root 상태를 읽고(stale:false면 그대로),
// route 이름 목록이 달라졌으면 router.getStateForRouteNamesChange가 이름이 남은 route만 유지한다.
const swapNavigator = ({ fromNames, fromParams, toNames, toInitial }) => {
  const fromRouter = StackRouter({});
  const oldState = fromRouter.getInitialState({
    routeNames: fromNames,
    routeParamList: fromParams,
    routeGetIdList: {},
  });

  const toRouter = StackRouter({ initialRouteName: toInitial });
  return toRouter.getStateForRouteNamesChange(oldState, {
    routeNames: toNames,
    routeParamList: {},
    routeGetIdList: {},
    routeKeyChanges: [],
  });
};

// ── 1. route 이름 충돌 ───────────────────────────────────────

test('N1: AppLockStack은 APP_LOCK_PIN을 쓰고 initialParams.mode=unlock을 유지한다', () => {
  assert.deepEqual(appLockNames, [ROUTES.APP_LOCK_PIN]);
  assert.ok(appLockSection.includes("initialParams={{ mode: 'unlock' }}"));
  assert.ok(appLockSection.includes('component={PinInputScreen}'), '기존 화면 재사용');
});

test('N2: APP_LOCK_PIN은 AuthNavigator·MainNavigator의 어떤 route 이름과도 겹치지 않는다', () => {
  assert.notEqual(ROUTES.APP_LOCK_PIN, ROUTES.PIN_INPUT);
  assert.equal(authNames.includes(ROUTES.APP_LOCK_PIN), false);
  assert.equal(mainNames.includes(ROUTES.APP_LOCK_PIN), false);
});

test('N3: AuthNavigator·MainNavigator의 기존 PIN_INPUT 경로는 그대로다', () => {
  assert.ok(authNames.includes(ROUTES.PIN_INPUT));
  assert.ok(mainNames.includes(ROUTES.PIN_INPUT));
  assert.ok(authNames.includes(ROUTES.LOGIN));
});

// ── 2. 문제 재현 / 3. 수정 후 동작 ───────────────────────────

test('N4(재현): 잠금 route가 PIN_INPUT이면 AuthNavigator로 전환될 때 잠금 route와 params가 이어진다', () => {
  const state = swapNavigator({
    fromNames: [ROUTES.PIN_INPUT], // 수정 전 AppLockStack
    fromParams: { [ROUTES.PIN_INPUT]: { mode: 'unlock' } },
    toNames: authNames,
    toInitial: ROUTES.LOGIN,
  });

  assert.deepEqual(
    state.routes.map(route => route.name),
    [ROUTES.PIN_INPUT],
    'LOGIN이 아니라 이전 잠금 route가 남는다'
  );
  assert.equal(state.routes[0].params.mode, 'unlock');
});

test('N5(수정): APP_LOCK_PIN에서 AuthNavigator로 전환하면 잠금 route가 제거되고 LOGIN이 선택된다', () => {
  const state = swapNavigator({
    fromNames: appLockNames,
    fromParams: { [ROUTES.APP_LOCK_PIN]: { mode: 'unlock' } },
    toNames: authNames,
    toInitial: ROUTES.LOGIN,
  });

  assert.deepEqual(
    state.routes.map(route => route.name),
    [ROUTES.LOGIN]
  );
  assert.equal(state.routes[state.index].name, ROUTES.LOGIN);
  assert.equal(
    state.routes.some(route => route.params?.mode === 'unlock'),
    false
  );
});

test('N6: APP_LOCK_PIN에서 MainNavigator로 전환해도 잠금 route가 이어지지 않는다 (잠금 해제 후 홈 진입)', () => {
  const state = swapNavigator({
    fromNames: appLockNames,
    fromParams: { [ROUTES.APP_LOCK_PIN]: { mode: 'unlock' } },
    toNames: mainNames,
    toInitial: ROUTES.HOME,
  });

  assert.equal(
    state.routes.some(route => route.name === ROUTES.APP_LOCK_PIN),
    false
  );
  assert.equal(
    state.routes.some(route => route.params?.mode === 'unlock'),
    false
  );
});

// ── 로그아웃 진행 상태 / 잠금 해제 흐름 (모의 서버) ──────────────

const server = { active: new Set(), seq: 0 };

const issue = () => {
  server.seq += 1;
  const tokens = { access: `N-access-${server.seq}`, refresh: `N-refresh-${server.seq}` };
  server.active.add(tokens.refresh);
  gateway.validTokens.add(tokens.access);
  return tokens;
};

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

let logoutDelay = 0;
let expiredCalls = 0;

const createStore = () => {
  const store = configureStore({ reducer: { auth: authReducer } });
  setSessionExpiredHandler(() => {
    expiredCalls += 1;
    store.dispatch(logout());
  });
  return store;
};

const restoreLocked = async () => {
  const store = createStore();
  const tokens = issue();
  await tokenService.beginSession(tokens.access, tokens.refresh);
  await store.dispatch(restoreSession());
  assert.equal(store.getState().auth.isAuthenticated, true);
  return { store, tokens };
};

// 화면의 ref/state를 흉내 내는 하네스
const createHarness = ({ mounted = true } = {}) => {
  const busyCalls = [];
  return {
    busyRef: { current: false },
    mountedRef: { current: mounted },
    setBusy: value => busyCalls.push(value),
    busyCalls,
  };
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
  server.active.clear();
  server.seq = 0;
  logoutDelay = 0;
  expiredCalls = 0;

  gateway.route('POST', LOGOUT, ({ record }) => {
    server.active.delete(record.body?.refresh_token);
    return { public: true, delay: logoutDelay, body: authEnvelope(null, { code: 'AUTH-200-003' }) };
  });
  gateway.route('GET', ME, () => ({
    body: authEnvelope({
      user_id: '1',
      name: '테스트',
      phone_number: '+821000000000',
      onboarding_completed: false,
    }),
  }));
  gateway.route('POST', UNLOCK, ({ record }) => {
    const { refresh_token: presented, pin } = record.body ?? {};
    if (!server.active.has(presented) || pin !== PIN) {
      return {
        public: true,
        status: 401,
        body: authEnvelope(null, {
          success: false,
          status: 401,
          code: 'AUTH-401-005',
          message: '실패',
          error: { reason: 'test', details: [], requiredAction: 'RE_LOGIN' },
        }),
      };
    }
    server.active.delete(presented);
    return { public: true, body: tokenEnvelope(issue(), 'AUTH-200-010') };
  });
});

afterEach(async () => {
  await sleep(40);
});

after(async () => {
  await gateway.close();
});

test('P1: 로그아웃 성공 후 진행 상태가 정리된다 (busy true → false, ref 복원), 서버 로그아웃 1회', async () => {
  const { store } = await restoreLocked();
  const harness = createHarness();

  const ran = await runGuardedLogout({
    ...harness,
    logout: () => store.dispatch(logoutUser()).unwrap(),
  });

  assert.equal(ran, true);
  assert.deepEqual(harness.busyCalls, [true, false]);
  assert.equal(harness.busyRef.current, false);
  assert.equal(store.getState().auth.isAuthenticated, false);
  assert.equal(gateway.requestsTo(LOGOUT).length, 1);
});

test('P2: 로그아웃이 실패(예외)해도 진행 상태가 정리되고 예외가 화면으로 새지 않는다', async () => {
  const harness = createHarness();

  const ran = await runGuardedLogout({
    ...harness,
    logout: async () => {
      throw new Error('boom');
    },
  });

  assert.equal(ran, true);
  assert.deepEqual(harness.busyCalls, [true, false]);
  assert.equal(harness.busyRef.current, false);
});

test('P3: 서버 로그아웃이 실패해도(연결 끊김) 로컬 정리 후 진행 상태가 정리된다', async () => {
  const { store } = await restoreLocked();
  gateway.route('POST', LOGOUT, () => ({ public: true, destroy: true }));
  const harness = createHarness();

  await runGuardedLogout({ ...harness, logout: () => store.dispatch(logoutUser()).unwrap() });

  assert.deepEqual(harness.busyCalls, [true, false]);
  assert.equal(store.getState().auth.isAuthenticated, false);
  assert.equal(secureStore.get('REFRESH_TOKEN') ?? null, null);
});

test('P4: 이미 로그아웃된 상태에서 다시 요청해도 서버 요청 없이 끝나고 영구 로딩 상태에 빠지지 않는다', async () => {
  const { store } = await restoreLocked();
  await store.dispatch(logoutUser());
  const requestsBefore = gateway.requestsTo(LOGOUT).length;
  const harness = createHarness();

  const startedAt = Date.now();
  const ran = await runGuardedLogout({
    ...harness,
    logout: () => store.dispatch(logoutUser()).unwrap(),
  });

  assert.equal(ran, true);
  assert.ok(Date.now() - startedAt < 2000, '즉시 끝나야 한다');
  assert.equal(gateway.requestsTo(LOGOUT).length, requestsBefore, '서버 요청 없음');
  assert.deepEqual(harness.busyCalls, [true, false], '로딩이 해제된다');
  assert.equal(harness.busyRef.current, false);
  assert.equal(store.getState().auth.isAuthenticated, false);

  // 이어서 또 눌러도 다시 동작한다(영구 비활성 아님)
  const again = await runGuardedLogout({
    ...harness,
    logout: () => store.dispatch(logoutUser()).unwrap(),
  });
  assert.equal(again, true);
});

test('P5: 진행 중 중복 요청은 건너뛰어 서버 로그아웃이 1회만 나간다', async () => {
  const { store } = await restoreLocked();
  logoutDelay = 200;
  const harness = createHarness();
  const logoutFn = () => store.dispatch(logoutUser()).unwrap();

  const first = runGuardedLogout({ ...harness, logout: logoutFn });
  const second = await runGuardedLogout({ ...harness, logout: logoutFn });
  await first;

  assert.equal(second, false);
  assert.equal(gateway.requestsTo(LOGOUT).length, 1);
  assert.deepEqual(harness.busyCalls, [true, false]);
});

test('P6: 화면이 언마운트된 뒤 끝나면 setState(setBusy)를 호출하지 않는다', async () => {
  const { store } = await restoreLocked();
  logoutDelay = 100;
  const harness = createHarness();

  const running = runGuardedLogout({
    ...harness,
    logout: () => store.dispatch(logoutUser()).unwrap(),
  });
  harness.mountedRef.current = false; // 로그아웃이 끝나기 전에 화면이 사라짐
  await running;

  assert.deepEqual(harness.busyCalls, [true], '언마운트 후 setBusy(false)를 호출하지 않는다');
  assert.equal(harness.busyRef.current, false, 'ref는 복원된다');
});

test('P7: 화면 소스는 공통 guardedLogout을 쓰고 로그인 모드 처리는 건드리지 않는다', () => {
  const screen = readSource('../../src/screens/auth/PinInputScreen.js');
  assert.ok(screen.includes('runGuardedLogout'));
  assert.ok(screen.includes('Alert.alert'), '확인 Alert 유지');
  assert.ok(screen.includes('loginUser({ phoneNumber, pin: enteredPin })'));
  assert.ok(screen.includes('confirmPinReset'));
});

test('U1: 기존 PIN 잠금 해제 성공 흐름 유지 — 복원 후 잠김, 올바른 PIN 후에만 해제', async () => {
  const { store } = await restoreLocked();
  assert.equal(store.getState().auth.isAppUnlocked, false);

  const action = await store.dispatch(verifyUnlockPin({ pin: PIN }));

  assert.equal(action.meta.requestStatus, 'fulfilled');
  assert.equal(store.getState().auth.isAppUnlocked, true);
  assert.equal(expiredCalls, 0);
});
