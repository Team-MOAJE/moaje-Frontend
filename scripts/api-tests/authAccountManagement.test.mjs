// 내 정보 수정(API-48)·회원 탈퇴(API-49)·PIN 변경(API-51) 단위 테스트 (모의 Gateway 사용, 실제 서버 호출 없음)
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/authAccountManagement.test.mjs
// 전화번호·PIN·토큰 값은 모의 서버 전용 가짜 값이며 출력하지 않는다. 실서버에 탈퇴·PIN 변경을 보내지 않는다.
import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { configureStore } from '@reduxjs/toolkit';
import { MockGateway, authEnvelope } from './mockGateway.mjs';
import { __store as secureStore } from './stubs/expoSecureStore.mjs';

const gateway = new MockGateway();
const baseURL = await gateway.listen();

process.env.EXPO_PUBLIC_API_BASE_URL = baseURL;
process.env.EXPO_PUBLIC_API_TIMEOUT = '300';

const tokenService = await import('../../src/services/tokenService.js');
const { API_ENDPOINTS } = await import('../../src/constants/apiEndpoints.js');
const { buildProfileUpdateRequest, updateProfile, deleteAccount, changePin } =
  await import('../../src/features/auth/authApi.js');
const { default: authReducer } = await import('../../src/features/auth/authSlice.js');
const { default: assetReducer } = await import('../../src/features/asset/assetSlice.js');

const ME_PATH = '/api/v1/auth/me';
const PIN_CHANGE_PATH = '/api/v1/auth/pin/change';
const ACCESS_KEY = 'ACCESS_TOKEN';
const REFRESH_KEY = 'REFRESH_TOKEN';

const user = {
  userId: '123',
  phoneNumber: '+821000000000',
  name: '테스트',
  email: 'old@example.test',
  onboardingCompleted: true,
};

const meData = (overrides = {}) => ({
  user_id: '123',
  onboarding_completed: true,
  phone_number: '+821000000000',
  name: '테스트',
  email: 'old@example.test',
  ...overrides,
});

// 로그인 완료 상태의 스토어 + 유효 토큰. 자산 상태에는 사용자 데이터를 넣어 초기화 여부를 확인한다.
const createLoggedInStore = async () => {
  await tokenService.setTokens('valid-access', 'valid-refresh');
  gateway.validTokens.add('valid-access');
  const authInitial = authReducer(undefined, { type: 'init' });
  const assetInitial = assetReducer(undefined, { type: 'init' });
  return configureStore({
    reducer: { auth: authReducer, asset: assetReducer },
    preloadedState: {
      auth: { ...authInitial, user, isAuthenticated: true, isAppUnlocked: true },
      asset: { ...assetInitial, accounts: [{ id: '1', marker: 'user-data' }] },
    },
  });
};

// 세션 정리 시 자산 상태는 초기값으로 돌아가고 sessionGeneration만 증가한다(이전 세션의 늦은 응답 무효화).
const assetIsReset = store => {
  const { sessionGeneration, transactionsActiveQuerySeq, ...rest } = store.getState().asset;
  const initial = assetReducer(undefined, { type: 'init' });
  const {
    sessionGeneration: initialGeneration,
    transactionsActiveQuerySeq: initialSeq,
    ...initialRest
  } = initial;
  return (
    JSON.stringify(rest) === JSON.stringify(initialRest) &&
    sessionGeneration > initialGeneration &&
    transactionsActiveQuerySeq > initialSeq
  );
};

const assertStillLoggedIn = store => {
  const { auth } = store.getState();
  assert.equal(auth.isAuthenticated, true);
  assert.deepEqual(auth.user, user);
  assert.equal(auth.isAccountActionPending, false);
  assert.equal(secureStore.get(ACCESS_KEY), 'valid-access');
  assert.equal(secureStore.get(REFRESH_KEY), 'valid-refresh');
  assert.equal(store.getState().asset.accounts.length, 1);
};

const assertLoggedOut = store => {
  const { auth } = store.getState();
  assert.equal(auth.isAuthenticated, false);
  assert.equal(auth.user, null);
  assert.equal(auth.isAppUnlocked, false);
  assert.equal(auth.isAccountActionPending, false);
  assert.equal(secureStore.has(ACCESS_KEY), false);
  assert.equal(secureStore.has(REFRESH_KEY), false);
  assert.ok(assetIsReset(store), '이전 사용자 자산 상태가 비워져야 한다');
};

const errorRoute =
  (status, code, requiredAction = 'NONE') =>
  () => ({
    status,
    body: authEnvelope(null, {
      success: false,
      status,
      code,
      message: '요청을 처리할 수 없습니다.',
      error: { reason: 'test', details: [], requiredAction },
    }),
  });

after(async () => {
  await gateway.close();
});

beforeEach(async () => {
  gateway.reset();
  await tokenService.clearTokens();
});

// ── API-48 요청 본문 ───────────────────────────────────────────

test('API-48 본문: 바꾼 항목만 보낸다 — email 생략=유지, null=삭제, name null/undefined=생략', () => {
  assert.deepEqual(buildProfileUpdateRequest({ name: ' 새이름 ' }), { name: '새이름' });
  assert.deepEqual(buildProfileUpdateRequest({ email: 'a@b.co' }), { email: 'a@b.co' });
  assert.deepEqual(buildProfileUpdateRequest({ email: null }), { email: null });
  assert.deepEqual(buildProfileUpdateRequest({ email: '  ' }), { email: null });
  assert.deepEqual(buildProfileUpdateRequest({ name: null, email: 'a@b.co' }), {
    email: 'a@b.co',
  });
  assert.deepEqual(buildProfileUpdateRequest({ name: '이름', email: null }), {
    name: '이름',
    email: null,
  });
});

test('API-48 본문: 공백 이름·잘못된 이메일·빈 입력은 요청 전에 차단', () => {
  assert.throws(() => buildProfileUpdateRequest({ name: '   ' }), /이름/);
  assert.throws(() => buildProfileUpdateRequest({ email: 'not-an-email' }), /이메일/);
  assert.throws(() => buildProfileUpdateRequest({}), /수정할 항목/);
  assert.throws(() => buildProfileUpdateRequest({ name: null }), /수정할 항목/);
});

// ── API-48 내 정보 수정 ────────────────────────────────────────

test('updateProfile 성공: PATCH /me + Bearer, 서버 응답으로 user 갱신(저장된 토큰·다른 필드 유지)', async () => {
  gateway.route('PATCH', ME_PATH, () => ({
    body: authEnvelope(meData({ name: '새이름', email: null, onboarding_completed: null }), {
      code: 'AUTH-200-012',
    }),
  }));
  const store = await createLoggedInStore();

  const action = await store.dispatch(updateProfile({ name: '새이름', email: null }));

  assert.equal(action.meta.requestStatus, 'fulfilled');
  const [request] = gateway.requestsTo(ME_PATH);
  assert.equal(request.method, 'PATCH');
  assert.equal(request.headers.authorization, 'Bearer valid-access');
  assert.deepEqual(request.body, { name: '새이름', email: null });
  const { auth } = store.getState();
  assert.equal(auth.user.name, '새이름');
  assert.equal(auth.user.email, null);
  assert.equal(
    auth.user.onboardingCompleted,
    true,
    'null이 기존 온보딩 완료 상태를 덮어쓰면 안 된다'
  );
  assert.equal(auth.user.phoneNumber, user.phoneNumber);
  assert.equal(auth.isAuthenticated, true);
  assert.equal(auth.isAccountActionPending, false);
});

test('updateProfile: 이름만 바꾸면 email 키를 보내지 않는다', async () => {
  gateway.route('PATCH', ME_PATH, () => ({ body: authEnvelope(meData({ name: '이름2' })) }));
  const store = await createLoggedInStore();

  await store.dispatch(updateProfile({ name: '이름2' }));

  assert.deepEqual(gateway.requestsTo(ME_PATH)[0].body, { name: '이름2' });
});

test('updateProfile 서버 오류/검증 실패/응답 형식 오류: 사용자 정보 유지, 로딩 해제', async () => {
  const store = await createLoggedInStore();

  gateway.route('PATCH', ME_PATH, errorRoute(400, 'COMMON-400-001'));
  let action = await store.dispatch(updateProfile({ name: '이름3' }));
  assert.equal(action.meta.requestStatus, 'rejected');
  assert.equal(typeof action.payload.message, 'string');
  assert.deepEqual(store.getState().auth.user, user);

  gateway.route('PATCH', ME_PATH, () => ({ body: authEnvelope({ name: '이름3' }) }));
  action = await store.dispatch(updateProfile({ name: '이름3' }));
  assert.equal(action.meta.requestStatus, 'rejected');
  assert.deepEqual(store.getState().auth.user, user);

  const before = gateway.requestsTo(ME_PATH).length;
  action = await store.dispatch(updateProfile({ name: '   ' }));
  assert.equal(action.meta.requestStatus, 'rejected');
  assert.equal(gateway.requestsTo(ME_PATH).length, before, '검증 실패는 요청을 보내지 않는다');
  assertStillLoggedIn(store);
});

test('updateProfile: 다른 사용자 ID 응답은 반영하지 않는다', async () => {
  gateway.route('PATCH', ME_PATH, () => ({ body: authEnvelope(meData({ user_id: '999' })) }));
  const store = await createLoggedInStore();

  const action = await store.dispatch(updateProfile({ name: '이름4' }));

  assert.equal(action.meta.requestStatus, 'rejected');
  assert.deepEqual(store.getState().auth.user, user);
});

// ── API-49 회원 탈퇴 ───────────────────────────────────────────

test('deleteAccount 성공: DELETE /me {current_pin}(앞자리 0 유지) → 토큰·인증·자산 상태 초기화', async () => {
  gateway.route('DELETE', ME_PATH, () => ({
    body: authEnvelope({ message: 'ok' }, { code: 'AUTH-200-013' }),
  }));
  const store = await createLoggedInStore();

  const action = await store.dispatch(deleteAccount({ currentPin: '012345' }));

  assert.equal(action.meta.requestStatus, 'fulfilled');
  assert.equal(action.payload.sessionEnded, true);
  const [request] = gateway.requestsTo(ME_PATH);
  assert.equal(request.method, 'DELETE');
  assert.equal(request.headers.authorization, 'Bearer valid-access');
  assert.deepEqual(request.body, { current_pin: '012345' });
  assert.equal(request.headers['content-type'], 'application/json');
  assertLoggedOut(store);
  assert.equal(
    gateway.requestsTo('/api/v1/auth/logout').length,
    0,
    '서버 로그아웃은 다시 호출하지 않는다'
  );
});

test('deleteAccount 실패(PIN 불일치·서버 오류·네트워크): 로그인 상태·토큰·자산 상태 유지', async () => {
  const store = await createLoggedInStore();

  // RE_LOGIN 요청이 와도 PIN 오입력으로 세션을 지우지 않는다.
  gateway.route('DELETE', ME_PATH, errorRoute(401, 'AUTH-401-003', 'RE_LOGIN'));
  let action = await store.dispatch(deleteAccount({ currentPin: '000000' }));
  assert.equal(action.meta.requestStatus, 'rejected');
  assertStillLoggedIn(store);

  gateway.route('DELETE', ME_PATH, () => ({ status: 500, body: { message: 'boom' } }));
  action = await store.dispatch(deleteAccount({ currentPin: '000000' }));
  assert.equal(action.meta.requestStatus, 'rejected');
  assertStillLoggedIn(store);

  gateway.route('DELETE', ME_PATH, () => ({ destroy: true }));
  action = await store.dispatch(deleteAccount({ currentPin: '000000' }));
  assert.equal(action.meta.requestStatus, 'rejected');
  assertStillLoggedIn(store);
});

test('deleteAccount: 6자리 숫자가 아닌 PIN은 요청 전에 차단', async () => {
  const store = await createLoggedInStore();

  for (const currentPin of ['12345', '1234567', 'abcdef', 123456, undefined]) {
    const action = await store.dispatch(deleteAccount({ currentPin }));
    assert.equal(action.meta.requestStatus, 'rejected');
  }
  assert.equal(gateway.requestsTo(ME_PATH).length, 0);
  assertStillLoggedIn(store);
});

test('deleteAccount 중복 요청 방지: 진행 중에는 두 번째 요청을 보내지 않는다', async () => {
  gateway.route('DELETE', ME_PATH, () => ({
    delay: 100,
    body: authEnvelope({ message: 'ok' }),
  }));
  const store = await createLoggedInStore();

  const first = store.dispatch(deleteAccount({ currentPin: '012345' }));
  const second = await store.dispatch(deleteAccount({ currentPin: '012345' }));
  await first;

  assert.equal(second.meta.condition, true);
  assert.equal(gateway.requestsTo(ME_PATH).length, 1);
  assertLoggedOut(store);
});

test('deleteAccount: 응답을 기다리는 사이 다른 세션이 시작되면 새 세션을 지우지 않는다', async () => {
  gateway.route('DELETE', ME_PATH, () => ({
    delay: 100,
    body: authEnvelope({ message: 'ok' }),
  }));
  const store = await createLoggedInStore();

  const pending = store.dispatch(deleteAccount({ currentPin: '012345' }));
  await new Promise(resolve => setTimeout(resolve, 30));
  await tokenService.clearTokens();
  await tokenService.setTokens('other-access', 'other-refresh');
  const action = await pending;

  assert.equal(action.payload.sessionEnded, false);
  assert.equal(secureStore.get(ACCESS_KEY), 'other-access');
  assert.equal(store.getState().auth.isAuthenticated, true);
  assert.equal(store.getState().auth.isAccountActionPending, false);
});

// ── API-51 PIN 변경 ────────────────────────────────────────────

test('changePin 성공: POST /pin/change {current_pin,new_pin,new_pin_confirm} → 로컬 세션 정리, 재로그인 필요', async () => {
  gateway.route('POST', PIN_CHANGE_PATH, () => ({
    body: authEnvelope({ message: 'ok' }, { code: 'AUTH-200-011' }),
  }));
  const store = await createLoggedInStore();

  const action = await store.dispatch(
    changePin({ currentPin: '012345', newPin: '065432', newPinConfirm: '065432' })
  );

  assert.equal(action.meta.requestStatus, 'fulfilled');
  assert.equal(action.payload.sessionEnded, true);
  const [request] = gateway.requestsTo(PIN_CHANGE_PATH);
  assert.equal(request.method, 'POST');
  assert.equal(request.headers.authorization, 'Bearer valid-access');
  assert.deepEqual(request.body, {
    current_pin: '012345',
    new_pin: '065432',
    new_pin_confirm: '065432',
  });
  assertLoggedOut(store);
  assert.equal(gateway.requestsTo('/api/v1/auth/logout').length, 0);
});

test('changePin 입력 검증: 불일치·6자리 아님은 요청 전에 차단, 상태 유지', async () => {
  const store = await createLoggedInStore();

  const cases = [
    { currentPin: '012345', newPin: '654321', newPinConfirm: '654322' },
    { currentPin: '012345', newPin: '65432', newPinConfirm: '65432' },
    { currentPin: '12345', newPin: '654321', newPinConfirm: '654321' },
    { currentPin: '012345', newPin: 'abcdef', newPinConfirm: 'abcdef' },
    {},
  ];
  for (const input of cases) {
    const action = await store.dispatch(changePin(input));
    assert.equal(action.meta.requestStatus, 'rejected');
  }
  assert.equal(gateway.requestsTo(PIN_CHANGE_PATH).length, 0);
  assertStillLoggedIn(store);
});

test('changePin 서버 거부(현재 PIN 불일치·RE_LOGIN)·네트워크 오류: 로그인 상태·토큰 유지', async () => {
  const store = await createLoggedInStore();
  const input = { currentPin: '000000', newPin: '654321', newPinConfirm: '654321' };

  gateway.route('POST', PIN_CHANGE_PATH, errorRoute(401, 'AUTH-401-003', 'RE_LOGIN'));
  let action = await store.dispatch(changePin(input));
  assert.equal(action.meta.requestStatus, 'rejected');
  assertStillLoggedIn(store);

  gateway.route('POST', PIN_CHANGE_PATH, () => ({ destroy: true }));
  action = await store.dispatch(changePin(input));
  assert.equal(action.meta.requestStatus, 'rejected');
  assertStillLoggedIn(store);
});

test('수정·탈퇴·PIN 변경은 동시에 하나만 진행한다', async () => {
  gateway.route('PATCH', ME_PATH, () => ({
    delay: 100,
    body: authEnvelope(meData({ name: 'x' })),
  }));
  const store = await createLoggedInStore();

  const first = store.dispatch(updateProfile({ name: 'x' }));
  const blocked = await store.dispatch(
    changePin({ currentPin: '012345', newPin: '654321', newPinConfirm: '654321' })
  );
  await first;

  assert.equal(blocked.meta.condition, true);
  assert.equal(gateway.requestsTo(PIN_CHANGE_PATH).length, 0);
});

// ── 명세 상수·화면 연결(정적) ──────────────────────────────────

test('엔드포인트 상수: API-48·49는 /me, API-51은 /pin/change', () => {
  assert.equal(API_ENDPOINTS.AUTH.ME, ME_PATH);
  assert.equal(API_ENDPOINTS.AUTH.PIN_CHANGE, PIN_CHANGE_PATH);
});

const readSource = rel =>
  readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const stripComments = source =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('ProfileScreen 연결(정적): 세 thunk로만 호출하고 PIN 재설정 흐름과 섞지 않는다', () => {
  const screen = stripComments(readSource('src/screens/profile/ProfileScreen.js'));
  assert.match(screen, /updateProfile\(input\)/);
  assert.match(screen, /changePin\(input\)/);
  assert.match(screen, /deleteAccount\(input\)/);
  assert.match(screen, /state\.auth\.isAccountActionPending/);
  assert.match(screen, /result\.meta\?\.requestStatus === 'rejected'/);
  assert.doesNotMatch(
    screen,
    /apiClient|API_ENDPOINTS|confirmPinReset|verifyAccountForReset|PIN_RESET/
  );

  const modals = stripComments(readSource('src/components/profile/AccountManagementModals.js'));
  assert.doesNotMatch(modals, /apiClient|API_ENDPOINTS|dispatch|useDispatch/);
  assert.match(modals, /secureTextEntry/);
  assert.match(modals, /maxLength=\{6\}/);
});

test('PIN 재설정 흐름은 변경되지 않았다: PIN_RESET_ENDPOINTS가 API-51 경로를 쓰지 않는다', () => {
  const api = readSource('src/features/auth/authApi.js');
  const block = api.slice(
    api.indexOf('const PIN_RESET_ENDPOINTS'),
    api.indexOf('const requireEndpoint')
  );
  assert.match(block, /verifyAccount: null/);
  assert.match(block, /resetConfirm: null/);
});
