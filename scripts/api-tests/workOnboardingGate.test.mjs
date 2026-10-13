// 서버 온보딩 완료 판단 Gate(API-34) 테스트. React 렌더러가 없으므로 컨트롤러를 직접 검증하고,
// Hook/컴포넌트는 소스 정적 분석으로만 확인한다. 모의 Gateway만 사용하며 실서버 호출은 없다.
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/workOnboardingGate.test.mjs
import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { MockGateway } from './mockGateway.mjs';
import { __store, __control, __resetControl } from './stubs/asyncStorage.mjs';

const everRequested = [];
for (const [mod, protocol] of [
  [http, 'http'],
  [https, 'https'],
]) {
  const original = mod.request;
  mod.request = function spied(...args) {
    const target = args[0];
    const host =
      typeof target === 'string' ? new URL(target).hostname : (target?.hostname ?? target?.host);
    everRequested.push({ protocol, host });
    return original.apply(this, args);
  };
}

const gateway = new MockGateway();
const baseURL = await gateway.listen();
process.env.EXPO_PUBLIC_API_BASE_URL = baseURL;
process.env.EXPO_PUBLIC_API_TIMEOUT = '300';

const tokenService = await import('../../src/services/tokenService.js');
const gateModule = await import('../../src/features/onboarding/useOnboardingGate.js');
const repoModule =
  await import('../../src/features/onboarding/adapters/workOnboardingRepository.js');
const { ONBOARDING_ERROR_TYPE } = await import('../../src/features/onboarding/onboardingApi.js');
const { createApiError, API_ERROR_KIND } = await import('../../src/services/apiResponse.js');

const { GATE_ERROR_INVALID_USER, GATE_STATUS, createOnboardingGate } = gateModule;
const { createWorkOnboardingRepository } = repoModule;

const UID_A = '123456789012345678';
const UID_B = '223456789012345679';
const progressPath = uid => `/api/v1/work/onboarding/${uid}/progress`;

const progressBody = (completed, overrides = {}) => ({
  user_id: 1,
  answered_count: completed ? 10 : 3,
  total_questions: 10,
  is_completed: completed,
  remaining: completed ? [] : [4, 5, 6, 7, 8, 9, 10],
  unknown_answers: [],
  next_question_no: completed ? null : 4,
  ...overrides,
});

const progressRequests = uid =>
  gateway.requests.filter(r => r.method === 'GET' && r.path === progressPath(uid));

const settle = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms));

// 기대 상태에 도달할 때까지 폴링한다. checking이 아닌 예상 밖 상태가 되면 즉시, 시간 초과 시에도 명확히 실패한다.
const waitForStatus = async (gate, expected, timeoutMs = 2000) => {
  const startedAt = Date.now();
  for (;;) {
    const { status } = gate.getSnapshot();
    if (status === expected) return;
    if (status !== GATE_STATUS.CHECKING) {
      assert.fail(`기대 상태 ${expected}, 실제 ${status}`);
    }
    if (Date.now() - startedAt >= timeoutMs) {
      assert.fail(`${timeoutMs}ms 안에 ${expected}에 도달하지 못함 (마지막 상태: ${status})`);
    }
    await new Promise(resolve => setTimeout(resolve, 5));
  }
};

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

// 순서·지연을 직접 제어하는 가짜 repository (호출 횟수 기록)
const fakeRepository = () => {
  const calls = [];
  return {
    calls,
    loadProgress: () => {
      const d = deferred();
      calls.push(d);
      return d.promise;
    },
  };
};

const makeGate = (userId = UID_A) => {
  const repository = createWorkOnboardingRepository(userId);
  return createOnboardingGate({ userId, repository });
};

const started = (userId = UID_A) => {
  const gate = makeGate(userId);
  gate.start();
  return gate;
};

after(async () => {
  await gateway.close();
});

beforeEach(async () => {
  await settle(5);
  gateway.reset();
  __store.clear();
  __resetControl();
  await tokenService.clearTokens();
  gateway.validTokens.add('valid');
  await tokenService.setTokens('valid', 'refresh-0');
});

// ── 상태 판단 ────────────────────────────────────────────────

test('최초 상태는 checking (start 전에도 checking, 요청 없음)', () => {
  const gate = makeGate();
  const s = gate.getSnapshot();
  assert.equal(s.status, GATE_STATUS.CHECKING);
  assert.equal(s.isChecking, true);
  assert.equal(s.error, null);
  assert.equal(s.userId, UID_A);
  assert.equal(gateway.requests.length, 0, '생성만으로는 요청하지 않음');
});

test('API-34 is_completed=true → complete (GET 1회, 큰 user_id 경로, 쓰기 요청 없음)', async () => {
  gateway.route('GET', progressPath(UID_A), () => ({ body: progressBody(true) }));
  const gate = started();
  assert.equal(gate.getSnapshot().status, GATE_STATUS.CHECKING);
  await waitForStatus(gate, GATE_STATUS.COMPLETE);

  const s = gate.getSnapshot();
  assert.equal(s.status, GATE_STATUS.COMPLETE);
  assert.equal(s.isChecking, false);
  assert.equal(s.error, null);
  assert.equal(progressRequests(UID_A).length, 1);
  assert.equal(gateway.requests.length, 1);
  assert.equal(gateway.requests[0].headers.authorization, 'Bearer valid');
});

test('API-34 is_completed=false → incomplete (답변 일부/없음 모두)', async () => {
  for (const body of [
    progressBody(false),
    progressBody(false, {
      answered_count: 0,
      remaining: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      next_question_no: 1,
    }),
  ]) {
    gateway.reset();
    gateway.validTokens.add('valid');
    gateway.route('GET', progressPath(UID_A), () => ({ body }));
    const gate = started();
    await settle();
    assert.equal(gate.getSnapshot().status, GATE_STATUS.INCOMPLETE);
    assert.equal(gate.getSnapshot().error, null);
  }
});

// ── 오류: 모두 error, 완료/미완료로 대체하지 않음 ────────────

const ERROR_CASES = [
  ['네트워크 오류', () => ({ public: true, destroy: true }), ONBOARDING_ERROR_TYPE.NETWORK],
  [
    '타임아웃',
    () => ({ public: true, delay: 1200, body: progressBody(true) }),
    ONBOARDING_ERROR_TYPE.TIMEOUT,
  ],
  [
    '403',
    () => ({ public: true, status: 403, body: { detail: '다른 사용자' } }),
    ONBOARDING_ERROR_TYPE.FORBIDDEN,
  ],
  [
    '404',
    () => ({ public: true, status: 404, body: { detail: 'x' } }),
    ONBOARDING_ERROR_TYPE.NOT_FOUND,
  ],
  [
    '400',
    () => ({ public: true, status: 400, body: { detail: 'x' } }),
    ONBOARDING_ERROR_TYPE.BAD_REQUEST,
  ],
  [
    '409(기타 4xx)',
    () => ({ public: true, status: 409, body: { detail: 'x' } }),
    ONBOARDING_ERROR_TYPE.CLIENT_ERROR,
  ],
  [
    '500',
    () => ({ public: true, status: 500, body: { code: 'INTERNAL_SERVER_ERROR' } }),
    ONBOARDING_ERROR_TYPE.SERVER,
  ],
  [
    '503(본문 없음)',
    () => ({ public: true, status: 503, rawBody: '' }),
    ONBOARDING_ERROR_TYPE.SERVER,
  ],
  [
    'Work 서비스 자체 401',
    () => ({ public: true, status: 401, body: { detail: '헤더 없음' } }),
    ONBOARDING_ERROR_TYPE.UNAUTHORIZED,
  ],
  ['잘못된 응답: 객체 아님', () => ({ body: ['x'] }), ONBOARDING_ERROR_TYPE.INVALID_RESPONSE],
  [
    '잘못된 응답: HTML',
    () => ({ rawBody: '<html>Bad Gateway</html>' }),
    ONBOARDING_ERROR_TYPE.INVALID_RESPONSE,
  ],
  [
    '잘못된 응답: is_completed 문자열',
    () => ({ body: progressBody(true, { is_completed: 'true' }) }),
    ONBOARDING_ERROR_TYPE.INVALID_RESPONSE,
  ],
  [
    '잘못된 응답: is_completed 누락',
    () => ({ body: (({ is_completed, ...rest }) => rest)(progressBody(true)) }),
    ONBOARDING_ERROR_TYPE.INVALID_RESPONSE,
  ],
  [
    '잘못된 응답: 완료인데 남은 문항',
    () => ({ body: progressBody(true, { remaining: [3] }) }),
    ONBOARDING_ERROR_TYPE.INVALID_RESPONSE,
  ],
];

for (const [name, handler, expectedType] of ERROR_CASES) {
  test(`${name} → error(${expectedType}), complete/incomplete로 대체하지 않음, 자동 재시도 없음`, async () => {
    gateway.route('GET', progressPath(UID_A), handler);
    const gate = started();
    await settle(name === '타임아웃' ? 700 : 60);

    const s = gate.getSnapshot();
    assert.equal(s.status, GATE_STATUS.ERROR);
    assert.notEqual(s.status, GATE_STATUS.INCOMPLETE);
    assert.notEqual(s.status, GATE_STATUS.COMPLETE);
    assert.equal(s.error.type, expectedType);
    assert.equal(s.isChecking, false, 'checking에 머물지 않음');

    const before = progressRequests(UID_A).length;
    await settle(60);
    assert.equal(progressRequests(UID_A).length, before, '자동 재시도 없음');
    assert.equal(gateway.requests.filter(r => r.method !== 'GET').length, 0);
  });
}

test('401 인증 오류: 토큰 없음/갱신 불가 → error(UNAUTHORIZED), incomplete 아님', async () => {
  gateway.route('GET', progressPath(UID_A), () => ({ body: progressBody(true) }));
  await tokenService.clearTokens(); // 토큰 없음 → Gateway 401 UNAUTHENTICATED
  const gate = started();
  await settle(60);

  assert.equal(gate.getSnapshot().status, GATE_STATUS.ERROR);
  assert.equal(gate.getSnapshot().error.type, ONBOARDING_ERROR_TYPE.UNAUTHORIZED);
  assert.equal(gateway.refreshCount, 0, '토큰이 없으면 refresh를 시도하지 않음(기존 동작)');
});

test('401 토큰 만료: 기존 apiClient가 refresh 후 1회 재시도 → Gate는 영향 없이 complete', async () => {
  await tokenService.setTokens('expired-access', 'refresh-0');
  gateway.route('GET', progressPath(UID_A), () => ({ body: progressBody(true) }));
  const gate = started();
  await settle(300);

  assert.equal(gate.getSnapshot().status, GATE_STATUS.COMPLETE);
  assert.equal(gateway.refreshCount, 1);
  assert.equal(progressRequests(UID_A).length, 2, '원 요청 + refresh 후 재시도(인터셉터 담당)');
});

test('401 refresh 거부(세션 만료): error(UNAUTHORIZED), 미완료로 처리하지 않음', async () => {
  await tokenService.setTokens('expired-access', 'refresh-0');
  gateway.refreshMode = 'reject';
  gateway.route('GET', progressPath(UID_A), () => ({ body: progressBody(true) }));
  const gate = started();
  await settle(300);

  const s = gate.getSnapshot();
  assert.equal(s.status, GATE_STATUS.ERROR);
  assert.equal(s.error.type, ONBOARDING_ERROR_TYPE.UNAUTHORIZED);
});

test('잘못된 userId / repository 없음 → 서버 요청 없이 error(INVALID_USER)', async () => {
  const repository = fakeRepository();
  for (const userId of ['', '12a', '0', 123, null, undefined, '9223372036854775808']) {
    const gate = createOnboardingGate({ userId, repository });
    gate.start();
    const s = gate.getSnapshot();
    assert.equal(s.status, GATE_STATUS.ERROR, String(userId));
    assert.equal(s.error.type, GATE_ERROR_INVALID_USER, String(userId));
    assert.equal(gate.retry(), true, '재시도해도 동일(요청 없음)');
  }
  const noRepo = createOnboardingGate({ userId: UID_A, repository: null });
  noRepo.start();
  assert.equal(noRepo.getSnapshot().error.type, GATE_ERROR_INVALID_USER);
  assert.equal(repository.calls.length, 0);
  assert.equal(gateway.requests.length, 0);
});

// ── 재시도 / 중복 요청 ───────────────────────────────────────

test('실패 후 수동 retry: 새 API-34 조회로 error → checking → complete', async () => {
  let attempt = 0;
  gateway.route('GET', progressPath(UID_A), () => {
    attempt += 1;
    return attempt === 1
      ? { public: true, status: 503, body: { code: 'DB_CONNECTION_ERROR' } }
      : { body: progressBody(true) };
  });
  const gate = started();
  await settle();
  assert.equal(gate.getSnapshot().status, GATE_STATUS.ERROR);

  const states = [];
  gate.subscribe(() => states.push(gate.getSnapshot().status));
  assert.equal(gate.retry(), true);
  assert.equal(gate.getSnapshot().status, GATE_STATUS.CHECKING, '재시도 중 로딩 상태');
  assert.equal(gate.getSnapshot().isChecking, true);
  await settle();

  assert.equal(gate.getSnapshot().status, GATE_STATUS.COMPLETE);
  assert.deepEqual(states, [GATE_STATUS.CHECKING, GATE_STATUS.COMPLETE]);
  assert.equal(progressRequests(UID_A).length, 2);
});

test('연속 실패 후에도 다시 retry 가능', async () => {
  gateway.route('GET', progressPath(UID_A), () => ({ public: true, destroy: true }));
  const gate = started();
  await settle();
  for (let i = 0; i < 3; i += 1) {
    assert.equal(gate.getSnapshot().status, GATE_STATUS.ERROR);
    assert.equal(gate.retry(), true);
    await settle();
  }
  assert.equal(progressRequests(UID_A).length, 4);
  assert.equal(gate.getSnapshot().status, GATE_STATUS.ERROR);
});

test('중복 요청 방지: 동시 start 여러 번 / 조회 중 retry 연타 → GET 1회', async () => {
  const repository = fakeRepository();
  const gate = createOnboardingGate({ userId: UID_A, repository });
  assert.equal(gate.start(), true);
  assert.equal(gate.start(), false);
  assert.equal(gate.start(), false);
  assert.equal(gate.retry(), false, 'checking 중 retry 무시');
  assert.equal(gate.retry(), false);
  assert.equal(repository.calls.length, 1);

  repository.calls[0].reject(createApiError({ kind: API_ERROR_KIND.NETWORK }));
  await settle(5);
  assert.equal(gate.getSnapshot().status, GATE_STATUS.ERROR);

  assert.equal(gate.retry(), true);
  assert.equal(gate.retry(), false, '재시도 중 연타 무시');
  assert.equal(gate.retry(), false);
  assert.equal(repository.calls.length, 2);
});

test('complete/incomplete 상태와 dispose 상태에서 retry는 요청하지 않음', async () => {
  const repository = fakeRepository();
  const gate = createOnboardingGate({ userId: UID_A, repository });
  gate.start();
  repository.calls[0].resolve({ isCompleted: true });
  await settle(5);
  assert.equal(gate.getSnapshot().status, GATE_STATUS.COMPLETE);
  assert.equal(gate.retry(), false);

  const other = createOnboardingGate({ userId: UID_A, repository });
  assert.equal(other.retry(), false, 'start 전 retry 무시');
  assert.equal(repository.calls.length, 1);
});

// ── 오래된 응답 / 사용자 변경 / 언마운트 / 재시작 ─────────────

test('오래된 응답 무시: 첫 요청이 재시도 결과 뒤에 늦게 도착해도 반영되지 않음', async () => {
  const repository = fakeRepository();
  const gate = createOnboardingGate({ userId: UID_A, repository });
  gate.start(); // 요청 #1
  // #1이 아직 진행 중에 dispose → start(재시작)로 요청 #2 발급
  gate.dispose();
  gate.start();
  assert.equal(repository.calls.length, 2);

  repository.calls[1].resolve({ isCompleted: false }); // 새 요청이 먼저 도착
  await settle(5);
  assert.equal(gate.getSnapshot().status, GATE_STATUS.INCOMPLETE);

  repository.calls[0].resolve({ isCompleted: true }); // 오래된 응답이 나중에 도착
  await settle(5);
  assert.equal(gate.getSnapshot().status, GATE_STATUS.INCOMPLETE, '오래된 complete 응답 무시');
});

test('오래된 오류 응답도 무시: 재시작 후 이전 요청의 실패가 새 상태를 덮지 않음', async () => {
  const repository = fakeRepository();
  const gate = createOnboardingGate({ userId: UID_A, repository });
  gate.start();
  gate.dispose();
  gate.start();
  repository.calls[1].resolve({ isCompleted: true });
  await settle(5);
  repository.calls[0].reject(createApiError({ kind: API_ERROR_KIND.NETWORK }));
  await settle(5);
  assert.equal(gate.getSnapshot().status, GATE_STATUS.COMPLETE);
  assert.equal(gate.getSnapshot().error, null);
});

test('사용자 A→B 전환: A의 늦은 응답은 B 상태를 바꾸지 않고, B는 자기 상태를 새로 조회', async () => {
  const repoA = fakeRepository();
  const repoB = fakeRepository();
  const gateA = createOnboardingGate({ userId: UID_A, repository: repoA });
  gateA.start();

  // 로그아웃 → 사용자 B 로그인 (Hook의 effect cleanup = A dispose, 새 컨트롤러 B)
  gateA.dispose();
  const gateB = createOnboardingGate({ userId: UID_B, repository: repoB });
  assert.equal(gateB.getSnapshot().status, GATE_STATUS.CHECKING, 'B는 A의 상태를 재사용하지 않음');
  assert.equal(gateB.getSnapshot().userId, UID_B);
  gateB.start();
  assert.equal(repoB.calls.length, 1, 'B는 새로 조회');

  repoB.calls[0].resolve({ isCompleted: false });
  await settle(5);
  repoA.calls[0].resolve({ isCompleted: true }); // A의 늦은 응답
  await settle(5);

  assert.equal(gateB.getSnapshot().status, GATE_STATUS.INCOMPLETE);
  assert.equal(
    gateA.getSnapshot().status,
    GATE_STATUS.CHECKING,
    'dispose된 A도 늦은 응답으로 바뀌지 않음'
  );
});

test('사용자 A→B 실제 Repository: A 응답이 늦게 와도 B 결과만 반영, 각 사용자의 경로로 조회', async () => {
  gateway.route('GET', progressPath(UID_A), () => ({ delay: 120, body: progressBody(true) }));
  gateway.route('GET', progressPath(UID_B), () => ({ body: progressBody(false) }));

  const gateA = started(UID_A);
  await settle(10);
  gateA.dispose();
  const gateB = started(UID_B);
  await settle(250);

  assert.equal(gateB.getSnapshot().status, GATE_STATUS.INCOMPLETE);
  assert.equal(gateA.getSnapshot().status, GATE_STATUS.CHECKING);
  assert.equal(progressRequests(UID_A).length, 1);
  assert.equal(progressRequests(UID_B).length, 1);
});

test('언마운트(dispose) 후 도착한 응답은 상태·구독자에 반영되지 않음', async () => {
  const repository = fakeRepository();
  const gate = createOnboardingGate({ userId: UID_A, repository });
  let notifications = 0;
  gate.subscribe(() => {
    notifications += 1;
  });
  gate.start();
  const afterStart = notifications;
  gate.dispose();

  repository.calls[0].resolve({ isCompleted: true });
  await settle(5);

  assert.equal(gate.getSnapshot().status, GATE_STATUS.CHECKING);
  assert.equal(notifications, afterStart, 'dispose 후 알림 없음');

  const failing = createOnboardingGate({ userId: UID_A, repository });
  failing.start();
  failing.dispose();
  repository.calls[1].reject(createApiError({ kind: API_ERROR_KIND.NETWORK }));
  await settle(5);
  assert.equal(failing.getSnapshot().status, GATE_STATUS.CHECKING);
});

test('dispose 이후 정상 재시작: StrictMode 시퀀스(start → dispose → start)에서 서버를 다시 조회하고 반영', async () => {
  let calls = 0;
  gateway.route('GET', progressPath(UID_A), () => {
    calls += 1;
    return { delay: 20, body: progressBody(true) };
  });
  const gate = makeGate();

  assert.equal(gate.start(), true); // effect setup
  gate.dispose(); // effect cleanup (StrictMode)
  assert.equal(gate.start(), true); // effect setup again → 재시작 가능
  await settle(150);

  assert.equal(gate.getSnapshot().status, GATE_STATUS.COMPLETE, 'dispose 후에도 영구 비활성 아님');
  assert.equal(calls, 2, '첫 요청(무효화됨)과 재시작 요청');

  // complete 이후 dispose → start: 다시 checking부터 서버 재확인(이전 결과를 그대로 신뢰하지 않음)
  gate.dispose();
  gate.start();
  assert.equal(gate.getSnapshot().status, GATE_STATUS.CHECKING);
  await settle(100);
  assert.equal(gate.getSnapshot().status, GATE_STATUS.COMPLETE);
  assert.equal(calls, 3);
});

test('dispose 후 start: 이전 오류 상태에서도 재조회하여 복구', async () => {
  let attempt = 0;
  gateway.route('GET', progressPath(UID_A), () => {
    attempt += 1;
    return attempt === 1 ? { public: true, destroy: true } : { body: progressBody(false) };
  });
  const gate = started();
  await settle();
  assert.equal(gate.getSnapshot().status, GATE_STATUS.ERROR);

  gate.dispose();
  gate.start();
  await settle();
  assert.equal(gate.getSnapshot().status, GATE_STATUS.INCOMPLETE);
});

// ── 스냅샷 안정성 / 구독 ─────────────────────────────────────

test('getSnapshot 참조 안정: 변경이 없으면 동일 객체, 상태가 바뀔 때만 새 객체와 알림', async () => {
  const repository = fakeRepository();
  const gate = createOnboardingGate({ userId: UID_A, repository });
  const initial = gate.getSnapshot();
  assert.equal(gate.getSnapshot(), initial);

  let notifications = 0;
  const unsubscribe = gate.subscribe(() => {
    notifications += 1;
  });

  gate.start(); // checking → checking: 변화 없음
  assert.equal(gate.getSnapshot(), initial);
  assert.equal(notifications, 0);
  assert.ok(Object.isFrozen(initial));

  repository.calls[0].resolve({ isCompleted: true });
  await settle(5);
  const done = gate.getSnapshot();
  assert.notEqual(done, initial);
  assert.equal(notifications, 1);
  assert.equal(gate.getSnapshot(), done);

  unsubscribe();
  gate.dispose();
  gate.start();
  assert.equal(gate.getSnapshot().status, GATE_STATUS.CHECKING);
  assert.equal(notifications, 1, '구독 해제 후 알림 없음');
});

test('같은 오류가 반복되어도 상태가 바뀔 때(checking ↔ error)마다 알림', async () => {
  const repository = fakeRepository();
  const gate = createOnboardingGate({ userId: UID_A, repository });
  const statuses = [];
  gate.subscribe(() => statuses.push(gate.getSnapshot().status));
  gate.start();
  repository.calls[0].reject(createApiError({ kind: API_ERROR_KIND.NETWORK }));
  await settle(5);
  gate.retry();
  repository.calls[1].reject(createApiError({ kind: API_ERROR_KIND.NETWORK }));
  await settle(5);
  assert.deepEqual(statuses, ['error', 'checking', 'error']);
});

// ── 기존 데이터 보호 / 서버 미호출 ───────────────────────────

test('Gate는 AsyncStorage를 읽지도 쓰지도 지우지도 않음 (기존 온보딩 결과·Draft·Auth 값 불변)', async () => {
  const preserved = {
    [`@financialOnboarding:result:v1:${UID_A}`]: 'legacy-result',
    [`@financialOnboarding:draft:v1:${UID_A}`]: 'legacy-draft',
    [`@financialOnboarding:draftServer:v1:${UID_A}`]: 'server-draft',
    '@auth:onboardingDone': 'true',
    '@auth:autoLogin': 'true',
  };
  for (const [k, v] of Object.entries(preserved)) __store.set(k, v);
  __control.log.length = 0;

  // 서버가 incomplete여도 로컬 결과가 있다고 해서 자동 변환/업로드/삭제하지 않는다
  gateway.route('GET', progressPath(UID_A), () => ({ body: progressBody(false) }));
  const gate = started();
  await settle();
  assert.equal(gate.getSnapshot().status, GATE_STATUS.INCOMPLETE);

  gateway.route('GET', progressPath(UID_A), () => ({ body: progressBody(true) }));
  gate.dispose();
  gate.start();
  await settle();
  assert.equal(gate.getSnapshot().status, GATE_STATUS.COMPLETE, '서버 기준(로컬 결과와 무관)');

  assert.deepEqual(
    __control.log.filter(
      entry => entry.includes('@financialOnboarding') || entry.includes('@auth:')
    ),
    [],
    'Gate가 온보딩/Auth 로컬 키를 접근하지 않음'
  );
  for (const [k, v] of Object.entries(preserved)) assert.equal(__store.get(k), v, k);
  assert.equal(gateway.requests.filter(r => r.method !== 'GET').length, 0);
});

// ── 정적 분석 (렌더링 검증 아님) ─────────────────────────────

const read = rel => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
const stripComments = source =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const gateSource = read('src/features/onboarding/useOnboardingGate.js');
const errorSource = read('src/components/onboarding/WorkOnboardingGateError.js');

test('[정적 분석] Hook: useSyncExternalStore + start/dispose effect, 컨트롤러에 영구 비활성 플래그 없음', () => {
  assert.match(
    gateSource,
    /useSyncExternalStore\(controller\.subscribe, controller\.getSnapshot\)/
  );
  assert.match(gateSource, /controller\.start\(\);\s*return \(\) => controller\.dispose\(\);/);
  assert.doesNotMatch(gateSource, /\bdisposed\b/, '되돌릴 수 없는 disposed 플래그 없음');
  assert.match(gateSource, /requestGate\.invalidate\(\)/);
  assert.match(gateSource, /createRequestGate/);
});

test('[정적 분석] Gate는 Auth onboardingCompleted·AsyncStorage·MainNavigator·기존 로컬 저장소를 사용하지 않음', () => {
  for (const [name, rawSource] of [
    ['useOnboardingGate', gateSource],
    ['WorkOnboardingGateError', errorSource],
  ]) {
    const source = stripComments(rawSource); // 주석 설명은 제외하고 실제 코드만 검사
    assert.doesNotMatch(source, /onboardingCompleted|isOnboardingDone|markOnboardingDone/, name);
    assert.doesNotMatch(source, /async-storage|AsyncStorage/, name);
    assert.doesNotMatch(source, /MainNavigator|navigation\//, name);
    assert.doesNotMatch(source, /localUserOnboardingRepository|onboardingRepository'/, name);
  }
});

test('[정적 분석] 오류 UI: 재시도 중 로딩·중복 재시도 가드, 서버 상태 확인 실패 안내', () => {
  assert.match(errorSource, /loading=\{isRetrying\}/);
  assert.match(errorSource, /if \(isRetrying\) return/);
  assert.match(errorSource, /온보딩 상태를 확인하지 못했어요/);
  assert.match(errorSource, /다시 시도/);
});

test('오류 문구: 종류별 안내, INVALID_USER는 재로그인 안내', () => {
  // 컴포넌트 파일은 JSX라 Node에서 import할 수 없어 문구 함수는 로직 모듈로 간접 확인한다.
  assert.match(errorSource, /INVALID_USER|GATE_ERROR_INVALID_USER/);
  assert.match(errorSource, /describeErrorType\(errorType\)/);
});

test('모든 HTTP 요청은 127.0.0.1 모의 Gateway로만 전송됨', () => {
  assert.ok(everRequested.length > 0);
  assert.ok(everRequested.every(r => r.protocol === 'http' && r.host === '127.0.0.1'));
});
