// 회원가입(API-01) 연동 단위 테스트 (모의 Gateway 사용, 실제 서버 호출 없음)
// 실행: npm run test:api
// 전화번호·PIN·토큰 값은 모의 서버 전용 가짜 값이며 출력하지 않는다.
import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { configureStore } from '@reduxjs/toolkit';
import { MockGateway, authEnvelope } from './mockGateway.mjs';
import { __store as secureStore } from './stubs/expoSecureStore.mjs';

const gateway = new MockGateway();
const baseURL = await gateway.listen();

// apiClient/tokenService는 모듈 로드 시점에 env를 읽으므로 import 전에 설정한다.
process.env.EXPO_PUBLIC_API_BASE_URL = baseURL;
process.env.EXPO_PUBLIC_API_TIMEOUT = '300';

const tokenService = await import('../../src/services/tokenService.js');
const { API_ERROR_KIND } = await import('../../src/services/apiResponse.js');
const { registerUser, buildRegisterRequest, loginUser, fetchCurrentUser, restoreSession } =
  await import('../../src/features/auth/authApi.js');
const { default: authReducer } = await import('../../src/features/auth/authSlice.js');

const REGISTER_PATH = '/api/v1/auth/register';
const ACCESS_KEY = 'ACCESS_TOKEN';
const REFRESH_KEY = 'REFRESH_TOKEN';

const SPEC_REQUEST_KEYS = [
  'name',
  'phone_number',
  'pin',
  'pin_confirm',
  'privacy_agreed',
  'privacy_version',
  'terms_agreed',
  'terms_version',
].sort();

const serviceTerms = (overrides = {}) => ({
  termId: 'signup-service-terms',
  type: 'service-terms',
  version: 'v1',
  required: true,
  confirmed: true,
  confirmedAt: '2026-10-12T00:00:00.000Z',
  ...overrides,
});

const privacyConsent = (overrides = {}) => ({
  termId: 'signup-personal-info-consent',
  type: 'privacy-consent',
  version: 'v1',
  required: true,
  confirmed: true,
  confirmedAt: '2026-10-12T00:00:00.000Z',
  ...overrides,
});

const signupInput = (overrides = {}) => ({
  phoneNumber: '01000000000',
  name: '테스트',
  pin: '012345',
  pinConfirm: '012345',
  termsRecords: [serviceTerms(), privacyConsent()],
  ...overrides,
});

const registerSuccessData = {
  access_token: 'register-access',
  refresh_token: 'register-refresh',
  token_type: 'bearer',
  expires_in: 1800,
  onboarding_completed: false,
  user_id: '123',
  phone_number: '+821000000000',
  name: '테스트',
};

const routeRegister = handler => gateway.route('POST', REGISTER_PATH, handler);

const routeRegisterSuccess = (data = registerSuccessData) =>
  routeRegister(() => ({
    public: true,
    status: 201,
    body: authEnvelope(data, { status: 201, code: 'AUTH-201-001' }),
  }));

const createStore = () => configureStore({ reducer: { auth: authReducer } });

const assertNotAuthenticated = store => {
  const { auth } = store.getState();
  assert.equal(auth.isAuthenticated, false);
  assert.equal(auth.user, null);
};

const assertNoTokens = () => {
  assert.equal(secureStore.has(ACCESS_KEY), false);
  assert.equal(secureStore.has(REFRESH_KEY), false);
};

after(async () => {
  await gateway.close();
});

beforeEach(async () => {
  gateway.reset();
  delete secureStore.set; // 저장 실패 테스트에서 덮어쓴 메서드 복구
  await tokenService.clearTokens();
});

// ── 요청 본문 ─────────────────────────────────────────────────

test('register 요청 본문: 명세 8개 키만, 타입·PIN 앞자리 0 유지, 선택 필드 미전송', () => {
  const body = buildRegisterRequest(signupInput({ pin: '012345', pinConfirm: '012345' }));

  assert.deepEqual(Object.keys(body).sort(), SPEC_REQUEST_KEYS);
  assert.equal(body.phone_number, '01000000000');
  assert.equal(body.name, '테스트');
  assert.equal(body.pin, '012345');
  assert.equal(body.pin_confirm, '012345');
  for (const key of ['phone_number', 'name', 'pin', 'pin_confirm']) {
    assert.equal(typeof body[key], 'string', `${key}는 문자열`);
  }
  assert.equal('email' in body, false);
  assert.equal('device_info' in body, false);
});

test('pin은 최초 입력값, pin_confirm은 확인 단계 입력값을 그대로 사용', () => {
  const body = buildRegisterRequest(signupInput({ pin: '000111', pinConfirm: '000112' }));
  assert.equal(body.pin, '000111');
  assert.equal(body.pin_confirm, '000112');
});

test('동의 여부·버전은 각 레코드의 실제 값에서 가져온다', () => {
  const body = buildRegisterRequest(
    signupInput({
      termsRecords: [serviceTerms({ version: 'v1' }), privacyConsent({ version: 'v1-privacy' })],
    })
  );
  assert.equal(body.terms_agreed, true);
  assert.equal(body.terms_version, 'v1');
  assert.equal(body.privacy_agreed, true);
  assert.equal(body.privacy_version, 'v1-privacy');
});

// ── 요청 전 차단 ──────────────────────────────────────────────

const BLOCKED_CASES = [
  ['서비스 이용약관 레코드 없음', [privacyConsent()]],
  ['개인정보 동의 레코드 없음', [serviceTerms()]],
  ['서비스 이용약관 미동의', [serviceTerms({ confirmed: false }), privacyConsent()]],
  ['개인정보 미동의', [serviceTerms(), privacyConsent({ confirmed: false })]],
  ['서비스 이용약관 버전 누락', [serviceTerms({ version: undefined }), privacyConsent()]],
  ['개인정보 버전 빈 문자열', [serviceTerms(), privacyConsent({ version: '' })]],
  ['termsRecords 누락', undefined],
];

for (const [label, termsRecords] of BLOCKED_CASES) {
  test(`동의 정보 차단: ${label} → 서버 요청 0건, 토큰 없음, 미인증`, async () => {
    routeRegisterSuccess();
    const store = createStore();

    const action = await store.dispatch(registerUser(signupInput({ termsRecords })));

    assert.equal(action.meta.requestStatus, 'rejected');
    assert.equal(action.payload.message, '필수 약관 동의 정보가 없습니다.');
    assert.equal(gateway.requestsTo(REGISTER_PATH).length, 0);
    assertNoTokens();
    assertNotAuthenticated(store);
  });
}

// ── 성공 ──────────────────────────────────────────────────────

test('가입 성공: SecureStore에 토큰 저장, Redux 인증·user 매핑(user_id 문자열)', async () => {
  routeRegisterSuccess();
  const store = createStore();

  const action = await store.dispatch(registerUser(signupInput()));

  assert.equal(action.meta.requestStatus, 'fulfilled');
  assert.equal(secureStore.get(ACCESS_KEY), 'register-access');
  assert.equal(secureStore.get(REFRESH_KEY), 'register-refresh');

  const { auth } = store.getState();
  assert.equal(auth.isAuthenticated, true);
  assert.deepEqual(auth.user, {
    userId: '123',
    phoneNumber: '+821000000000',
    name: '테스트',
    email: null,
    onboardingCompleted: false,
  });
  assert.equal(typeof auth.user.userId, 'string');
  assert.equal(JSON.stringify(auth).includes('register-access'), false, 'Redux에 토큰 미복제');

  const [request] = gateway.requestsTo(REGISTER_PATH);
  assert.equal(request.method, 'POST');
  assert.equal(request.headers.authorization, undefined);
  assert.match(request.headers['content-type'], /application\/json/);
  assert.deepEqual(Object.keys(request.body).sort(), SPEC_REQUEST_KEYS);
  assert.equal(request.body.pin, '012345');
  assert.equal(request.body.terms_agreed, true);
  assert.equal(request.body.terms_version, 'v1');
  assert.equal(request.body.privacy_agreed, true);
  assert.equal(request.body.privacy_version, 'v1');
});

test('기존 Access Token이 저장돼 있어도 register 요청에 Authorization 미첨부', async () => {
  await tokenService.setTokens('stale-access', 'stale-refresh');
  routeRegisterSuccess();
  const store = createStore();

  await store.dispatch(registerUser(signupInput()));

  const [request] = gateway.requestsTo(REGISTER_PATH);
  assert.equal(request.headers.authorization, undefined);
  assert.equal(secureStore.get(ACCESS_KEY), 'register-access', '가입 응답 토큰으로 교체');
});

// ── 실패 ──────────────────────────────────────────────────────

test('서버 업무 실패(409 envelope) → 미인증, 토큰 없음, message·code 보존, 재시도 없음', async () => {
  routeRegister(() => ({
    public: true,
    status: 409,
    body: authEnvelope(null, {
      success: false,
      status: 409,
      code: 'AUTH-409-TEST',
      message: '이미 가입된 휴대폰 번호입니다.',
    }),
  }));
  const store = createStore();

  const action = await store.dispatch(registerUser(signupInput()));

  assert.equal(action.meta.requestStatus, 'rejected');
  assert.equal(action.payload.kind, API_ERROR_KIND.BUSINESS);
  assert.equal(action.payload.status, 409);
  assert.equal(action.payload.code, 'AUTH-409-TEST');
  assert.equal(action.payload.message, '이미 가입된 휴대폰 번호입니다.');
  assert.equal(gateway.requestsTo(REGISTER_PATH).length, 1);
  assert.equal(gateway.refreshCount, 0);
  assertNoTokens();
  assertNotAuthenticated(store);
});

test('응답 지연(TIMEOUT) → 미인증, 토큰 없음, 자동 재전송 없음', async () => {
  routeRegister(() => ({ public: true, delay: 1000, status: 201, body: authEnvelope({}) }));
  const store = createStore();

  const action = await store.dispatch(registerUser(signupInput()));

  assert.equal(action.meta.requestStatus, 'rejected');
  assert.equal(action.payload.kind, API_ERROR_KIND.TIMEOUT);
  assert.equal(gateway.requestsTo(REGISTER_PATH).length, 1);
  assertNoTokens();
  assertNotAuthenticated(store);
});

for (const missingKey of ['access_token', 'refresh_token', 'user_id']) {
  test(`성공 envelope인데 ${missingKey} 없음 → 실패 처리, 토큰 미저장, 미인증`, async () => {
    const { [missingKey]: _omitted, ...data } = registerSuccessData;
    routeRegisterSuccess(data);
    const store = createStore();

    const action = await store.dispatch(registerUser(signupInput()));

    assert.equal(action.meta.requestStatus, 'rejected');
    assert.equal(action.payload.message, '회원가입 응답을 해석할 수 없습니다.');
    assertNoTokens();
    assertNotAuthenticated(store);
  });
}

test('토큰 저장 실패 → 실패 처리, 부분 저장 정리, 미인증', async () => {
  routeRegisterSuccess();
  secureStore.set = () => {
    throw new Error('secure store unavailable');
  };
  const store = createStore();

  const action = await store.dispatch(registerUser(signupInput()));

  delete secureStore.set;
  assert.equal(action.meta.requestStatus, 'rejected');
  assertNoTokens();
  assert.equal(await tokenService.getAccessToken(), null, '메모리 토큰도 정리');
  assertNotAuthenticated(store);
});

// ── 3부: 로그인(API-02) + 내 정보(API-47) + 세션 복원 ─────────────
// 서버 오류 코드(422/423/400/401)는 실행 중 Auth 소스 분석 값이다(실요청 검증 전).

const LOGIN_PATH = '/api/v1/auth/login';
const ME_PATH = '/api/v1/auth/me';

const meData = {
  user_id: '123',
  onboarding_completed: true,
  phone_number: '+821000000000',
  name: '테스트',
  email: null,
};

const expectedUser = {
  userId: '123',
  phoneNumber: '+821000000000',
  name: '테스트',
  email: null,
  onboardingCompleted: true,
};

let loginSeq = 0;

// 로그인 성공: 매번 새 토큰을 발급하고, markValid면 Gateway가 유효 토큰으로 인정한다.
const routeLoginSuccess = ({ markValid = true } = {}) =>
  gateway.route('POST', LOGIN_PATH, () => {
    loginSeq += 1;
    const accessToken = `login-access-${loginSeq}`;
    if (markValid) gateway.validTokens.add(accessToken);
    return {
      public: true,
      body: authEnvelope(
        {
          access_token: accessToken,
          refresh_token: `login-refresh-${loginSeq}`,
          token_type: 'bearer',
          expires_in: 1800,
          onboarding_completed: true,
        },
        { code: 'AUTH-200-001' }
      ),
    };
  });

const loginErrorRoute = (status, code, message) => () => ({
  public: true,
  status,
  body: authEnvelope(null, { success: false, status, code, message }),
});

const routeMe = handler => gateway.route('GET', ME_PATH, handler);
const routeMeSuccess = () =>
  routeMe(() => ({ body: authEnvelope(meData, { code: 'AUTH-200-007' }) }));

const login = store => store.dispatch(loginUser({ phoneNumber: '01000000000', pin: '012345' }));

const assertAuthenticatedAs = (store, user) => {
  const { auth } = store.getState();
  assert.equal(auth.isAuthenticated, true);
  assert.deepEqual(auth.user, user);
  assert.equal(typeof auth.user.userId, 'string');
};

test('login 요청: {phone_number, pin}만, PIN 앞자리 0 유지, 저장된 토큰이 있어도 Authorization 미첨부', async () => {
  await tokenService.setTokens('stale-access', 'stale-refresh');
  routeLoginSuccess();
  routeMeSuccess();

  await login(createStore());

  const [request] = gateway.requestsTo(LOGIN_PATH);
  assert.deepEqual(request.body, { phone_number: '01000000000', pin: '012345' });
  assert.equal(request.headers.authorization, undefined);
  assert.match(request.headers['content-type'], /application\/json/);
});

test('login 성공 → 토큰 저장 → 새 토큰으로 /me → Redux user 매핑·인증', async () => {
  routeLoginSuccess();
  routeMeSuccess();
  const store = createStore();

  const action = await login(store);

  assert.equal(action.meta.requestStatus, 'fulfilled');
  const accessToken = secureStore.get(ACCESS_KEY);
  assert.match(accessToken, /^login-access-/);
  assert.match(secureStore.get(REFRESH_KEY), /^login-refresh-/);

  assert.deepEqual(
    gateway.requests.map(r => r.path),
    [LOGIN_PATH, ME_PATH]
  );
  const [meRequest] = gateway.requestsTo(ME_PATH);
  assert.equal(meRequest.headers.authorization, `Bearer ${accessToken}`);

  assertAuthenticatedAs(store, expectedUser);
  assert.equal(store.getState().auth.isAppUnlocked, true);
  assert.equal(JSON.stringify(store.getState().auth).includes(accessToken), false);
});

const LOGIN_FAILURES = [
  [
    '미가입 번호/잘못된 PIN 422',
    loginErrorRoute(422, 'AUTH-422-001', '인증정보가 일치하지 않습니다.'),
    422,
    'AUTH-422-001',
    API_ERROR_KIND.BUSINESS,
  ],
  [
    'PIN 잠금 423',
    loginErrorRoute(423, 'AUTH-423-001', '간편 비밀번호 인증이 잠겼습니다.'),
    423,
    'AUTH-423-001',
    API_ERROR_KIND.BUSINESS,
  ],
  [
    '전화번호 형식 400',
    loginErrorRoute(400, 'AUTH-400-005', '전화번호를 확인해 주세요.'),
    400,
    'AUTH-400-005',
    API_ERROR_KIND.BUSINESS,
  ],
  [
    '서버 오류 503',
    () => ({ public: true, status: 503, body: {} }),
    503,
    null,
    API_ERROR_KIND.HTTP_5XX,
  ],
  [
    '응답 지연',
    () => ({ public: true, delay: 1000, body: {} }),
    null,
    null,
    API_ERROR_KIND.TIMEOUT,
  ],
];

for (const [label, handler, status, code, kind] of LOGIN_FAILURES) {
  test(`login 실패(${label}) → 미인증, 토큰 없음, /me·refresh 미호출, 요청 1회`, async () => {
    gateway.route('POST', LOGIN_PATH, handler);
    routeMeSuccess();
    const store = createStore();

    const action = await login(store);

    assert.equal(action.meta.requestStatus, 'rejected');
    assert.equal(action.payload.stage, 'login');
    assert.equal(action.payload.kind, kind);
    assert.equal(action.payload.status, status);
    assert.equal(action.payload.code, code);
    assert.equal(gateway.requestsTo(LOGIN_PATH).length, 1);
    assert.equal(gateway.requestsTo(ME_PATH).length, 0);
    assert.equal(gateway.refreshCount, 0);
    assertNoTokens();
    assertNotAuthenticated(store);
  });
}

test('login 성공 응답에 refresh_token 없음 → 토큰 미저장, /me 미호출, 미인증', async () => {
  gateway.route('POST', LOGIN_PATH, () => ({
    public: true,
    body: authEnvelope({ access_token: 'only-access', expires_in: 1800 }),
  }));
  const store = createStore();

  const action = await login(store);

  assert.equal(action.meta.requestStatus, 'rejected');
  assert.equal(gateway.requestsTo(ME_PATH).length, 0);
  assertNoTokens();
  assertNotAuthenticated(store);
});

const ME_TRANSIENT_FAILURES = [
  ['서버 503', () => ({ status: 503, body: {} })],
  ['응답 지연', () => ({ delay: 1000, body: authEnvelope(meData) })],
];

for (const [label, handler] of ME_TRANSIENT_FAILURES) {
  test(`login 후 /me 일시 실패(${label}) → 토큰 유지·미인증, /me만 재시도해 인증(login 1회)`, async () => {
    routeLoginSuccess();
    routeMe(handler);
    const store = createStore();

    const action = await login(store);

    assert.equal(action.meta.requestStatus, 'rejected');
    assert.equal(action.payload.stage, 'me');
    assert.equal(action.payload.retryable, true);
    assert.match(secureStore.get(ACCESS_KEY), /^login-access-/, '토큰 유지');
    assertNotAuthenticated(store);

    routeMeSuccess();
    const retry = await store.dispatch(fetchCurrentUser());

    assert.equal(retry.meta.requestStatus, 'fulfilled');
    assert.equal(gateway.requestsTo(LOGIN_PATH).length, 1, 'login 재호출 없음');
    assert.equal(gateway.requestsTo(ME_PATH).length, 2);
    assertAuthenticatedAs(store, expectedUser);
  });
}

test('/me 재시도가 다시 일시 실패 → 토큰 유지·미인증, retryable 유지, login 재호출 없음', async () => {
  routeLoginSuccess();
  routeMe(() => ({ status: 503, body: {} }));
  const store = createStore();

  await login(store);
  const retry = await store.dispatch(fetchCurrentUser());

  assert.equal(retry.meta.requestStatus, 'rejected');
  assert.equal(retry.payload.retryable, true);
  assert.match(secureStore.get(ACCESS_KEY), /^login-access-/);
  assert.equal(gateway.requestsTo(LOGIN_PATH).length, 1);
  assertNotAuthenticated(store);
});

test('/me INVALID_TOKEN → refresh 1회 → 새 토큰으로 /me 재시도 → 인증', async () => {
  routeLoginSuccess({ markValid: false });
  routeMeSuccess();
  const store = createStore();

  const action = await login(store);

  assert.equal(action.meta.requestStatus, 'fulfilled');
  assert.equal(gateway.refreshCount, 1);
  assert.equal(secureStore.get(ACCESS_KEY), 'access-1');
  assertAuthenticatedAs(store, expectedUser);
});

test('/me 중 refresh 거부(RE_LOGIN) → 토큰 정리, 미인증, 재시도 불가', async () => {
  routeLoginSuccess({ markValid: false });
  routeMeSuccess();
  gateway.refreshMode = 'reject';
  const store = createStore();

  const action = await login(store);

  assert.equal(action.meta.requestStatus, 'rejected');
  assert.equal(action.payload.stage, 'me');
  assert.equal(action.payload.retryable, false);
  assert.equal(action.payload.kind, API_ERROR_KIND.SESSION_EXPIRED);
  assertNoTokens();
  assertNotAuthenticated(store);
});

const meAuth401 = () => ({
  public: true,
  status: 401,
  body: authEnvelope(null, {
    success: false,
    status: 401,
    code: 'AUTH-401-001',
    message: '요청을 처리할 수 없습니다.',
  }),
});

test('/me Auth 401 envelope(비활성 사용자 등) → refresh 없이 토큰 정리, 미인증', async () => {
  routeLoginSuccess();
  routeMe(meAuth401);
  const store = createStore();

  const action = await login(store);

  assert.equal(action.payload.retryable, false);
  assert.equal(gateway.refreshCount, 0);
  assertNoTokens();
  assertNotAuthenticated(store);
});

test('fetchCurrentUser(/me 재시도) 세션 무효 401 → 토큰 정리, 미인증', async () => {
  await tokenService.setTokens('valid-access', 'valid-refresh');
  routeMe(meAuth401);
  const store = createStore();

  const action = await store.dispatch(fetchCurrentUser());

  assert.equal(action.meta.requestStatus, 'rejected');
  assert.equal(action.payload.retryable, false);
  assertNoTokens();
  assertNotAuthenticated(store);
});

test('혼선 방지: 사용자 A 토큰이 있을 때 login 실패 → /me 미호출, A 토큰 그대로, 미인증', async () => {
  await tokenService.setTokens('user-a-access', 'user-a-refresh');
  gateway.validTokens.add('user-a-access');
  gateway.route(
    'POST',
    LOGIN_PATH,
    loginErrorRoute(422, 'AUTH-422-001', '인증정보가 일치하지 않습니다.')
  );
  routeMeSuccess();
  const store = createStore();

  await login(store);

  assert.equal(gateway.requestsTo(ME_PATH).length, 0);
  assert.equal(secureStore.get(ACCESS_KEY), 'user-a-access');
  assert.equal(secureStore.get(REFRESH_KEY), 'user-a-refresh');
  assertNotAuthenticated(store);
});

test('혼선 방지: 사용자 A 토큰이 있을 때 login 성공 → 새 토큰으로 교체, /me는 새 토큰 사용', async () => {
  await tokenService.setTokens('user-a-access', 'user-a-refresh');
  gateway.validTokens.add('user-a-access');
  routeLoginSuccess();
  routeMeSuccess();
  const store = createStore();

  await login(store);

  const newAccess = secureStore.get(ACCESS_KEY);
  assert.match(newAccess, /^login-access-/);
  assert.match(secureStore.get(REFRESH_KEY), /^login-refresh-/);
  const [meRequest] = gateway.requestsTo(ME_PATH);
  assert.equal(meRequest.headers.authorization, `Bearer ${newAccess}`);
});

// ── 세션 복원 ─────────────────────────────────────────────────

test('restoreSession: 토큰 없음 → 요청 없이 미인증, 복원 완료 표시', async () => {
  routeMeSuccess();
  const store = createStore();

  await store.dispatch(restoreSession());

  assert.equal(gateway.requests.length, 0);
  assert.equal(store.getState().auth.isSessionRestored, true);
  assertNotAuthenticated(store);
});

test('restoreSession: 유효 토큰 → /me로 사용자 복원', async () => {
  await tokenService.setTokens('valid-access', 'valid-refresh');
  gateway.validTokens.add('valid-access');
  routeMeSuccess();
  const store = createStore();

  await store.dispatch(restoreSession());

  assert.equal(store.getState().auth.isSessionRestored, true);
  assertAuthenticatedAs(store, expectedUser);
});

for (const [label, handler] of ME_TRANSIENT_FAILURES) {
  test(`restoreSession: /me 일시 실패(${label}) → 토큰 유지, 이번 실행은 미인증`, async () => {
    await tokenService.setTokens('valid-access', 'valid-refresh');
    gateway.validTokens.add('valid-access');
    routeMe(handler);
    const store = createStore();

    await store.dispatch(restoreSession());

    assert.equal(store.getState().auth.isSessionRestored, true);
    assert.equal(secureStore.get(ACCESS_KEY), 'valid-access');
    assert.equal(secureStore.get(REFRESH_KEY), 'valid-refresh');
    assertNotAuthenticated(store);
  });
}

test('restoreSession: Access 만료 → refresh 후 /me 성공 → 복원', async () => {
  await tokenService.setTokens('expired-access', 'refresh-0');
  routeMeSuccess();
  const store = createStore();

  await store.dispatch(restoreSession());

  assert.equal(gateway.refreshCount, 1);
  assert.equal(secureStore.get(ACCESS_KEY), 'access-1');
  assertAuthenticatedAs(store, expectedUser);
});

test('restoreSession: Refresh도 만료(RE_LOGIN) → 토큰 정리, 미인증', async () => {
  await tokenService.setTokens('expired-access', 'expired-refresh');
  gateway.refreshMode = 'reject';
  routeMeSuccess();
  const store = createStore();

  await store.dispatch(restoreSession());

  assert.equal(store.getState().auth.isSessionRestored, true);
  assertNoTokens();
  assertNotAuthenticated(store);
});

test('restoreSession: Auth 401(비활성 사용자) → 토큰 정리, 미인증', async () => {
  await tokenService.setTokens('valid-access', 'valid-refresh');
  routeMe(meAuth401);
  const store = createStore();

  await store.dispatch(restoreSession());

  assertNoTokens();
  assertNotAuthenticated(store);
});
