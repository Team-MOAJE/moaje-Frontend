// 6-2단계: Gate 경계 / 온보딩 라우트 래퍼의 동작 로직(순수) + JSX 파일 정적 분석 테스트.
// React 렌더러가 없으므로 JSX 컴포넌트는 렌더링하지 않는다(미검증). 서버 호출 없음, 모의 AsyncStorage 스텁 사용.
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/workOnboardingRouteScreens.test.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { __store, __control, __resetControl } from './stubs/asyncStorage.mjs';

const logic = await import('../../src/navigation/workOnboardingRouteLogic.js');
const nav = await import('../../src/features/onboarding/workOnboardingNavigation.js');
const config = await import('../../src/features/onboarding/workOnboardingConfig.js');
const { GATE_STATUS } = await import('../../src/features/onboarding/useOnboardingGate.js');
const { ROUTES } = await import('../../src/constants/routes.js');

const {
  IOS_ROOT_BACK_NOTICE,
  LOGOUT_CONFIRM,
  createLocalNoticePresenter,
  createQuestionCallbacks,
  createResultCallbacks,
  deriveBoundaryState,
  hasLogoutAction,
  pressRetry,
  presentLocalResultNotice,
  resolveNoticeSettings,
  resolveRouteMode,
  runBoundaryLogout,
} = logic;
const {
  GATE_VIEW,
  LOCAL_RESULT_NOTICE,
  WORK_ONBOARDING_ROUTES,
  buildCompletionResetAction,
  buildGoHomeResetAction,
  buildRetakeAction,
  buildStartOnboardingAction,
  createNoticeTracker,
  decideLocalResultNotice,
} = nav;

const UID_A = '123456789012345678';
const UID_B = '223456789012345679';

const root = rel => new URL(`../../${rel}`, import.meta.url);
const readSource = rel => readFileSync(root(rel), 'utf8');
const stripComments = source =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

beforeEach(() => {
  __store.clear();
  __resetControl();
});

// ── Gate 경계: 상태별 화면 결정 ──────────────────────────────

test('Gate 상태별 화면: checking→splash, error→error, complete→home, incomplete→onboarding', () => {
  const view = (status, extra = {}) =>
    deriveBoundaryState({ gate: { status, error: null, ...extra.gate }, userId: UID_A, ...extra });

  assert.equal(view(GATE_STATUS.CHECKING).view, GATE_VIEW.SPLASH);
  assert.deepEqual(
    view(GATE_STATUS.ERROR, { gate: { error: { type: 'NETWORK' } } }).view,
    GATE_VIEW.ERROR
  );
  const home = view(GATE_STATUS.COMPLETE);
  assert.equal(home.view, GATE_VIEW.HOME);
  assert.equal(home.initialRouteName, ROUTES.HOME);
  const onboarding = view(GATE_STATUS.INCOMPLETE);
  assert.equal(onboarding.view, GATE_VIEW.ONBOARDING);
  assert.equal(onboarding.initialRouteName, WORK_ONBOARDING_ROUTES.ONBOARDING);
  assert.deepEqual(onboarding.initialParams, { mode: 'initial' });
});

test('오류 화면 + 재시도: 재시도 중에는 오류 화면 유지·버튼 로딩·직전 오류 종류 유지', () => {
  const errorState = deriveBoundaryState({
    gate: { status: GATE_STATUS.ERROR, error: { type: 'TIMEOUT' } },
    retryState: { userId: UID_A, requested: false },
    lastError: { userId: UID_A, type: 'TIMEOUT' },
    userId: UID_A,
  });
  assert.equal(errorState.view, GATE_VIEW.ERROR);
  assert.equal(errorState.isRetrying, false);
  assert.equal(errorState.errorType, 'TIMEOUT');

  // 재시도를 눌러 checking이 된 프레임: 스플래시가 아니라 오류 화면 유지 + 로딩
  const retrying = deriveBoundaryState({
    gate: { status: GATE_STATUS.CHECKING, error: null },
    retryState: { userId: UID_A, requested: true },
    lastError: { userId: UID_A, type: 'TIMEOUT' },
    userId: UID_A,
  });
  assert.equal(retrying.view, GATE_VIEW.ERROR);
  assert.equal(retrying.isRetrying, true);
  assert.equal(retrying.errorType, 'TIMEOUT');
  assert.equal(retrying.retryRequested, true);

  // 결과가 나오면 재시도 상태가 해제된다
  for (const status of [GATE_STATUS.COMPLETE, GATE_STATUS.INCOMPLETE]) {
    const done = deriveBoundaryState({
      gate: { status, error: null },
      retryState: { userId: UID_A, requested: true },
      userId: UID_A,
    });
    assert.equal(done.retryRequested, false);
    assert.equal(done.isRetrying, false);
  }
  // 다시 실패하면 오류 화면(재시도 아님)
  const failedAgain = deriveBoundaryState({
    gate: { status: GATE_STATUS.ERROR, error: { type: 'SERVER' } },
    retryState: { userId: UID_A, requested: true },
    lastError: { userId: UID_A, type: 'TIMEOUT' },
    userId: UID_A,
  });
  assert.equal(failedAgain.isRetrying, false);
  assert.equal(failedAgain.errorType, 'SERVER', '새 오류 종류로 갱신');
});

test('사용자 변경: 이전 사용자의 재시도 상태/오류 종류를 새 사용자에게 쓰지 않음', () => {
  const fresh = deriveBoundaryState({
    gate: { status: GATE_STATUS.CHECKING, error: null },
    retryState: { userId: UID_A, requested: true }, // 사용자 A가 재시도 중이었음
    lastError: { userId: UID_A, type: 'NETWORK' },
    userId: UID_B, // 사용자 B로 전환
  });
  assert.equal(fresh.view, GATE_VIEW.SPLASH, 'B는 스플래시부터');
  assert.equal(fresh.isRetrying, false);
  assert.equal(fresh.retryRequested, false);
  assert.equal(fresh.lastErrorType, undefined);

  const bError = deriveBoundaryState({
    gate: { status: GATE_STATUS.ERROR, error: { type: 'SERVER' } },
    lastError: { userId: UID_A, type: 'NETWORK' },
    userId: UID_B,
  });
  assert.equal(bError.errorType, 'SERVER');
});

test('오류 중 홈 우회 차단: 어떤 오류 입력에서도 home/onboarding으로 가지 않고 동작은 retry·logout뿐', () => {
  for (const retryRequested of [false, true]) {
    for (const type of [
      'NETWORK',
      'TIMEOUT',
      'UNAUTHORIZED',
      'SERVER',
      'INVALID_USER',
      undefined,
    ]) {
      const state = deriveBoundaryState({
        gate: { status: GATE_STATUS.ERROR, error: type ? { type } : null },
        retryState: { userId: UID_A, requested: retryRequested },
        userId: UID_A,
      });
      assert.equal(state.view, GATE_VIEW.ERROR);
      assert.equal('initialRouteName' in state, false);
      assert.deepEqual(state.actions, ['retry', 'logout']);
    }
  }
  const unknown = deriveBoundaryState({ gate: { status: 'weird' }, userId: UID_A });
  assert.equal(unknown.view, GATE_VIEW.ERROR);
  assert.equal(deriveBoundaryState().view, GATE_VIEW.ERROR);
  assert.deepEqual(
    deriveBoundaryState({ gate: { status: GATE_STATUS.COMPLETE }, userId: UID_A }).actions,
    []
  );
});

test('재시도 누르기: error에서만, 연타·checking 중 무시, retry()가 실제 시작했을 때만 requested', () => {
  let calls = 0;
  const retry = result => () => {
    calls += 1;
    return result;
  };

  assert.deepEqual(
    pressRetry({ status: GATE_STATUS.ERROR, isRetrying: false, retry: retry(true) }),
    {
      called: true,
      requested: true,
    }
  );
  assert.equal(calls, 1);

  assert.deepEqual(
    pressRetry({ status: GATE_STATUS.ERROR, isRetrying: true, retry: retry(true) }),
    {
      called: false,
      requested: false,
    }
  );
  for (const status of [
    GATE_STATUS.CHECKING,
    GATE_STATUS.COMPLETE,
    GATE_STATUS.INCOMPLETE,
    undefined,
  ]) {
    assert.equal(
      pressRetry({ status, isRetrying: false, retry: retry(true) }).called,
      false,
      String(status)
    );
  }
  assert.equal(calls, 1, '무시된 호출은 retry()를 부르지 않음');

  // Gate가 요청을 만들지 못했다면(false) requested는 false
  assert.deepEqual(
    pressRetry({ status: GATE_STATUS.ERROR, isRetrying: false, retry: retry(false) }),
    {
      called: true,
      requested: false,
    }
  );
});

// ── 로그아웃 콜백 구조 ───────────────────────────────────────

const makeLogoutHarness = () => {
  const busyRef = { current: false };
  const mountedRef = { current: true };
  const busyLog = [];
  return {
    busyRef,
    mountedRef,
    busyLog,
    setBusy: value => busyLog.push(value),
  };
};

test('로그아웃: 주입된 onLogout을 기존 runGuardedLogout으로 실행 (중복 실행 방지, busy 해제)', async () => {
  const harness = makeLogoutHarness();
  let calls = 0;
  let release;
  const onLogout = () =>
    new Promise(resolve => {
      calls += 1;
      release = resolve;
    });

  const first = runBoundaryLogout({ onLogout, ...harness });
  const second = runBoundaryLogout({ onLogout, ...harness });
  assert.equal(await second, false, '진행 중에는 다시 시작하지 않음');
  release();
  assert.equal(await first, true);
  assert.equal(calls, 1);
  assert.deepEqual(harness.busyLog, [true, false]);
  assert.equal(harness.busyRef.current, false);
});

test('로그아웃: 실패해도 busy 해제, 언마운트 후에는 setBusy 호출 안 함, onLogout 없으면 실행·버튼 없음', async () => {
  const failing = makeLogoutHarness();
  await runBoundaryLogout({ onLogout: () => Promise.reject(new Error('x')), ...failing });
  assert.deepEqual(failing.busyLog, [true, false]);

  const unmounted = makeLogoutHarness();
  unmounted.mountedRef.current = false;
  await runBoundaryLogout({ onLogout: async () => {}, ...unmounted });
  assert.deepEqual(unmounted.busyLog, [true], '언마운트 후 setBusy(false) 없음');

  const none = makeLogoutHarness();
  assert.equal(await runBoundaryLogout({ onLogout: undefined, ...none }), false);
  assert.deepEqual(none.busyLog, []);
  assert.equal(hasLogoutAction(undefined), false);
  assert.equal(hasLogoutAction(null), false);
  assert.equal(
    hasLogoutAction(() => {}),
    true
  );
  assert.match(LOGOUT_CONFIRM.message, /전화번호와 PIN/);
});

// ── 질문/결과 콜백: 시작·재검사·완료·홈 ──────────────────────

const makeQuestionCallbacks = (overrides = {}) => {
  const log = { dispatched: [], backs: 0, exits: 0, notices: [] };
  const callbacks = createQuestionCallbacks({
    scope: `${UID_A}:initial`,
    dispatch: action => log.dispatched.push(action),
    canGoBack: () => true,
    goBack: () => {
      log.backs += 1;
    },
    platform: 'android',
    exitApp: () => {
      log.exits += 1;
    },
    showNotice: notice => log.notices.push(notice),
    ...overrides,
  });
  return { callbacks, log };
};

test('최초 온보딩 시작 / 재검사 시작 / 홈 이동: 결과 화면 콜백이 해당 액션을 dispatch', () => {
  const dispatched = [];
  const callbacks = createResultCallbacks({ scope: UID_A, dispatch: a => dispatched.push(a) });
  callbacks.onStart();
  callbacks.onRetake();
  callbacks.onGoHome();
  // 6-3: 시작/재검사는 서버 미완료 근거(gateEvidence)를 싣지 않고 undefined로 명시적으로 덮어쓴다
  // (Stack.Screen initialParams 병합으로 이전 근거가 상속되는 것을 방지)
  const withoutEvidence = action => ({
    ...action,
    payload: { ...action.payload, params: { ...action.payload.params, gateEvidence: undefined } },
  });
  assert.deepEqual(dispatched, [
    withoutEvidence(buildStartOnboardingAction()),
    withoutEvidence(buildRetakeAction()),
    buildGoHomeResetAction(),
  ]);
  assert.deepEqual(dispatched[0].payload.params, { mode: 'initial', gateEvidence: undefined });
  assert.deepEqual(dispatched[1].payload.params, { mode: 'retake', gateEvidence: undefined });
  assert.ok('gateEvidence' in dispatched[0].payload.params, '키가 존재해야 병합 시 덮어씀');
  assert.deepEqual(Object.keys(callbacks).sort(), ['onGoHome', 'onRetake', 'onStart', 'scope']);
});

test('제출 완료 후 결과 화면 이동 + 중복 완료 이동 방지', () => {
  const { callbacks, log } = makeQuestionCallbacks();
  assert.equal(callbacks.onComplete(), true);
  assert.equal(callbacks.onComplete(), false);
  assert.equal(callbacks.onComplete(), false);
  assert.deepEqual(log.dispatched, [buildCompletionResetAction()]);
  assert.deepEqual(
    log.dispatched[0].payload.routes.map(r => r.name),
    [ROUTES.HOME, WORK_ONBOARDING_ROUTES.RESULT]
  );
  assert.equal(log.dispatched[0].payload.index, 1);
});

test('사용자 전환: 콜백을 새로 만들면 이전 사용자의 완료 1회 상태를 재사용하지 않음', () => {
  const dispatched = [];
  const dispatch = action => dispatched.push(action);
  const common = {
    dispatch,
    canGoBack: () => true,
    goBack() {},
    platform: 'android',
    exitApp() {},
    showNotice() {},
  };
  const forA = createQuestionCallbacks({ scope: `${UID_A}:initial`, ...common });
  const forB = createQuestionCallbacks({ scope: `${UID_B}:initial`, ...common });

  assert.equal(forA.onComplete(), true);
  assert.equal(forA.onComplete(), false, 'A는 1회만');
  assert.equal(forB.onComplete(), true, 'B는 A의 실행 상태와 무관하게 1회 실행');
  assert.equal(forB.onComplete(), false);
  assert.equal(forA.onComplete(), false, 'B 실행이 A 상태를 되돌리지 않음');
  assert.equal(dispatched.length, 2);
  assert.notEqual(forA.onComplete, forB.onComplete);
  assert.equal(forA.scope, `${UID_A}:initial`);
  assert.equal(forB.scope, `${UID_B}:initial`);

  // 같은 사용자라도 mode가 바뀌어 다시 만들면 독립(재검사 완료 후 다시 완료 가능)
  const retake = createQuestionCallbacks({ scope: `${UID_A}:retake`, ...common });
  assert.equal(retake.onComplete(), true);
  assert.equal(dispatched.length, 3);
});

test('결과 콜백도 호출마다 독립(사용자별 재생성)', () => {
  const a = createResultCallbacks({ scope: UID_A, dispatch() {} });
  const b = createResultCallbacks({ scope: UID_B, dispatch() {} });
  assert.notEqual(a.onStart, b.onStart);
  assert.equal(a.scope, UID_A);
  assert.equal(b.scope, UID_B);
});

test('resolveRouteMode: retake만 retake, 나머지는 initial', () => {
  assert.equal(resolveRouteMode({ mode: 'retake' }), 'retake');
  for (const params of [undefined, null, {}, { mode: 'initial' }, { mode: 'x' }, { mode: 1 }]) {
    assert.equal(resolveRouteMode(params), 'initial', JSON.stringify(params));
  }
});

// ── 뒤로가기 ─────────────────────────────────────────────────

test('뒤로가기: 이전 화면 있음 → goBack', () => {
  for (const platform of ['android', 'ios']) {
    const { callbacks, log } = makeQuestionCallbacks({ platform, canGoBack: () => true });
    assert.equal(callbacks.onCancel(), 'GO_BACK');
    assert.equal(log.backs, 1);
    assert.equal(log.exits, 0);
    assert.deepEqual(log.notices, []);
  }
});

test('Android 루트 뒤로가기 → 앱 종료 (홈 이동·안내 없음)', () => {
  const { callbacks, log } = makeQuestionCallbacks({ platform: 'android', canGoBack: () => false });
  assert.equal(callbacks.onCancel(), 'EXIT_APP');
  assert.equal(log.exits, 1);
  assert.equal(log.backs, 0);
  assert.deepEqual(log.notices, []);
  assert.deepEqual(log.dispatched, [], '홈으로 이동하지 않음');
});

test('iOS 루트 뒤로가기 → 종료·홈 우회 없이 온보딩 완료 안내만', () => {
  for (const platform of ['ios', 'web', undefined]) {
    const { callbacks, log } = makeQuestionCallbacks({ platform, canGoBack: () => false });
    assert.equal(callbacks.onCancel(), 'NONE');
    assert.deepEqual(log.notices, [IOS_ROOT_BACK_NOTICE]);
    assert.equal(log.exits, 0, '강제 종료 시도 없음');
    assert.equal(log.backs, 0);
    assert.deepEqual(log.dispatched, [], '홈 화면 우회 없음');
  }
  assert.match(IOS_ROOT_BACK_NOTICE.message, /온보딩을 완료해야/);
});

test('canGoBack은 호출 시점 값을 읽음(함수 또는 불리언 모두 허용)', () => {
  let can = false;
  const { callbacks, log } = makeQuestionCallbacks({ platform: 'android', canGoBack: () => can });
  assert.equal(callbacks.onCancel(), 'EXIT_APP');
  can = true;
  assert.equal(callbacks.onCancel(), 'GO_BACK');
  assert.equal(log.backs, 1);
  const { callbacks: boolCallbacks } = makeQuestionCallbacks({ canGoBack: true });
  assert.equal(boolCallbacks.onCancel(), 'GO_BACK');
});

// ── 로컬 결과 안내 설정 / 표시 ───────────────────────────────

test('안내 Hook 설정: initial + 플래그 true만 활성, retake·플래그 false·비불리언은 비활성 (호출 순서 불변)', () => {
  // 6-3: 활성 조건 = 플래그 true + initial + Gate incomplete 근거(evidenceAvailable). 근거가 없으면 비활성.
  const cases = [
    [{ mode: 'initial', flagEnabled: true, evidenceAvailable: true }, true],
    [{ mode: 'initial', flagEnabled: true, evidenceAvailable: false }, false],
    [{ mode: 'initial', flagEnabled: true }, false],
    [{ mode: 'initial', flagEnabled: true, evidenceAvailable: 'yes' }, false],
    [{ mode: 'retake', flagEnabled: true, evidenceAvailable: true }, false],
    [{ mode: 'initial', flagEnabled: false, evidenceAvailable: true }, false],
    [{ mode: 'retake', flagEnabled: false, evidenceAvailable: true }, false],
    [{ mode: 'initial', flagEnabled: 'true', evidenceAvailable: true }, false],
    [{ mode: 'initial', flagEnabled: 1, evidenceAvailable: true }, false],
    [{ mode: 'initial', evidenceAvailable: true }, false],
    [{}, false],
    [undefined, false],
  ];
  for (const [input, expected] of cases) {
    const settings = resolveNoticeSettings(input);
    assert.equal(settings.enabled, expected, JSON.stringify(input));
    assert.equal(settings.serverStatus, GATE_STATUS.INCOMPLETE);
    assert.deepEqual(resolveNoticeSettings(input), settings, '같은 입력은 같은 결과');
  }
  // 래퍼가 쓰는 실제 플래그 값과 같은 입력: 플래그가 true(활성화 상태)면 근거가 있는 initial만 활성,
  // 롤백으로 false가 되면 항상 비활성. 값 자체의 단정은 workOnboardingConnection.test.mjs 롤아웃 테스트에서 한다.
  assert.equal(typeof config.WORK_ONBOARDING_ENABLED, 'boolean');
  const withEvidence = resolveNoticeSettings({
    mode: 'initial',
    flagEnabled: config.WORK_ONBOARDING_ENABLED,
    evidenceAvailable: true,
  });
  assert.equal(withEvidence.enabled, config.WORK_ONBOARDING_ENABLED === true);
  assert.equal(
    resolveNoticeSettings({
      mode: 'initial',
      flagEnabled: config.WORK_ONBOARDING_ENABLED,
      evidenceAvailable: false,
    }).enabled,
    false,
    '플래그와 무관하게 근거가 없으면 비활성'
  );
  assert.equal(
    resolveNoticeSettings({ mode: 'initial', flagEnabled: false, evidenceAvailable: true }).enabled,
    false,
    '플래그 false를 명시하면 Legacy 동작(비활성)'
  );
});

const presentArgs = (overrides = {}) => {
  const calls = { alerts: [], marks: 0 };
  return {
    calls,
    args: {
      shouldShow: true,
      notice: LOCAL_RESULT_NOTICE,
      userId: UID_A,
      isCurrent: () => true,
      showAlert: notice => calls.alerts.push(notice),
      markShown: () => {
        calls.marks += 1;
      },
      ...overrides,
    },
  };
};

test('안내 표시 조건: 서버 미완료 + 로컬 결과 존재 + 미표시 → Alert, 그 외 표시 안 함', () => {
  // 6-1 판단 결과를 그대로 shouldShow로 사용한다
  const decide = (serverStatus, localResult) =>
    decideLocalResultNotice({ serverStatus, localResult, alreadyShown: false });

  const shown = presentArgs({ shouldShow: decide('incomplete', 'exists').show });
  assert.equal(createLocalNoticePresenter().present(shown.args), true);
  assert.deepEqual(shown.calls.alerts, [LOCAL_RESULT_NOTICE], '6-1 안내 문구 재사용');

  for (const [serverStatus, localResult] of [
    ['complete', 'exists'],
    ['error', 'exists'],
    ['checking', 'exists'],
    ['incomplete', 'none'],
    ['incomplete', 'unknown'],
  ]) {
    const none = presentArgs({ shouldShow: decide(serverStatus, localResult).show });
    assert.equal(
      createLocalNoticePresenter().present(none.args),
      false,
      `${serverStatus}/${localResult}`
    );
    assert.deepEqual(none.calls.alerts, []);
    assert.equal(none.calls.marks, 0);
  }
  // notice가 없어도 표시 안 함
  const noNotice = presentArgs({ notice: null });
  assert.equal(createLocalNoticePresenter().present(noNotice.args), false);
});

test('Alert를 실제 표시한 경우에만 markShown (표시 실패·미표시는 기록 안 함)', () => {
  const failing = presentArgs({
    showAlert: () => {
      throw new Error('alert failed');
    },
  });
  const presenter = createLocalNoticePresenter();
  assert.equal(presenter.present(failing.args), false);
  assert.equal(failing.calls.marks, 0, '표시 실패 시 기록하지 않음');
  // 표시에 실패했으므로 다음 기회에 다시 표시할 수 있다
  const retry = presentArgs();
  assert.equal(presenter.present(retry.args), true);
  assert.equal(retry.calls.marks, 1);

  const hidden = presentArgs({ shouldShow: false });
  createLocalNoticePresenter().present(hidden.args);
  assert.equal(hidden.calls.marks, 0);
});

test('사용자별 Alert 중복 방지: A는 1회, B는 별도로 1회', () => {
  const presenter = createLocalNoticePresenter();
  const a1 = presentArgs({ userId: UID_A });
  const a2 = presentArgs({ userId: UID_A });
  const b1 = presentArgs({ userId: UID_B });
  assert.equal(presenter.present(a1.args), true);
  assert.equal(presenter.present(a2.args), false, '같은 사용자에게 두 번째는 표시 안 함');
  assert.equal(presenter.present(b1.args), true, '다른 사용자는 별도로 표시');
  assert.equal(a1.calls.alerts.length + a2.calls.alerts.length + b1.calls.alerts.length, 2);

  // Hook 쪽 트래커(hasShown)가 이미 표시했다고 알리면 표시 안 함
  const tracker = createNoticeTracker();
  tracker.markShown(UID_A);
  const hookShown = presentArgs({ userId: UID_A, hasShown: id => tracker.hasShown(id) });
  assert.equal(createLocalNoticePresenter().present(hookShown.args), false);

  // 화면 재마운트(새 컴포넌트 인스턴스)에도 모듈 단위 표시기는 유지된다
  const first = presentArgs({ userId: '323456789012345680' });
  const second = presentArgs({ userId: '323456789012345680' });
  assert.equal(presentLocalResultNotice(first.args), true);
  assert.equal(presentLocalResultNotice(second.args), false);
});

test('StrictMode Effect 재실행 시뮬레이션: 같은 closure로 effect가 두 번 실행돼도 Alert 1회', () => {
  const presenter = createLocalNoticePresenter();
  const { args, calls } = presentArgs();

  // setup → cleanup → setup (동일 렌더 값: shouldShow가 아직 true로 남아 있음)
  let active = true;
  presenter.present({ ...args, isCurrent: () => active });
  active = false; // cleanup
  active = true;
  presenter.present({ ...args, isCurrent: () => active });

  assert.equal(calls.alerts.length, 1);
  assert.equal(calls.marks, 1);
});

test('사용자 변경/언마운트 후 도착한 오래된 조회 결과로는 Alert를 표시하지 않음', () => {
  const presenter = createLocalNoticePresenter();
  let active = true;
  const { args, calls } = presentArgs({ isCurrent: () => active });
  active = false; // cleanup: 사용자 변경 또는 언마운트
  assert.equal(presenter.present(args), false);
  assert.deepEqual(calls.alerts, []);
  assert.equal(calls.marks, 0);

  // 이후 사용자 B의 최신 결과는 정상 표시
  const fresh = presentArgs({ userId: UID_B });
  assert.equal(presenter.present(fresh.args), true);
});

// ── 기존 데이터 불변 ─────────────────────────────────────────

test('기존 AsyncStorage 데이터 불변: 이 단계의 로직은 저장소를 읽지도 쓰지도 않음', async () => {
  const seeded = {
    [`@financialOnboarding:result:v1:${UID_A}`]: 'legacy-result',
    [`@financialOnboarding:draft:v1:${UID_A}`]: 'legacy-draft',
    [`@financialOnboarding:draftServer:v1:${UID_A}`]: 'server-draft',
    '@auth:autoLogin': 'true',
  };
  for (const [k, v] of Object.entries(seeded)) __store.set(k, v);
  __control.log.length = 0;

  // 로직 전체를 한 번씩 실행
  const harness = makeLogoutHarness();
  await runBoundaryLogout({ onLogout: async () => {}, ...harness });
  deriveBoundaryState({
    gate: { status: GATE_STATUS.ERROR, error: { type: 'NETWORK' } },
    userId: UID_A,
  });
  const { callbacks } = makeQuestionCallbacks();
  callbacks.onComplete();
  callbacks.onCancel();
  createLocalNoticePresenter().present(presentArgs().args);

  assert.deepEqual(__control.log, [], '저장소 접근 0건');
  assert.deepEqual(Object.fromEntries(__store), seeded);
});

// ── 정적 분석 ────────────────────────────────────────────────

const boundarySource = readSource('src/navigation/OnboardingGateBoundary.js');
const routesSource = readSource('src/navigation/WorkOnboardingRouteScreens.js');
const logicSource = readSource('src/navigation/workOnboardingRouteLogic.js');

// 함수 본문(중괄호 균형) 추출
const functionBody = (source, startMarker) => {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `${startMarker} 를 찾을 수 없음`);
  let depth = 0;
  let begun = false;
  // 매개변수 구조분해의 중괄호가 아니라 함수 본문의 여는 중괄호부터 센다
  const bodyStart = source.indexOf(') {', start) + 2;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') {
      depth += 1;
      begun = true;
    } else if (source[i] === '}') {
      depth -= 1;
      if (begun && depth === 0) return source.slice(start, i + 1);
    }
  }
  assert.fail('함수 본문 끝을 찾지 못함');
};

test('[정적 분석] 로직 모듈은 JSX·react-native·React Navigation 없이 기존 runGuardedLogout만 사용', () => {
  const code = stripComments(logicSource);
  assert.doesNotMatch(code, /react-native|@react-navigation|from 'react'|<\w+[^>]*\/>/);
  assert.match(code, /runGuardedLogout/);
  assert.doesNotMatch(
    code,
    /AsyncStorage|logoutUser|clearTokens|dispatch\(logout/,
    '새 로그아웃/저장소 로직 없음'
  );
});

test('[정적 분석] 경계 컴포넌트: Gate Hook·경계 로직·오류 컴포넌트 사용, onLogout 연결, 홈 우회 코드 없음', () => {
  const code = stripComments(boundarySource);
  assert.match(code, /useOnboardingGate\(\{ userId \}\)/);
  assert.match(code, /deriveBoundaryState\(/);
  assert.match(code, /pressRetry\(/);
  assert.match(code, /runBoundaryLogout\(/);
  assert.match(code, /onLogout/);
  assert.match(code, /<WorkOnboardingGateError/);
  assert.match(code, /<SplashLoadingScreen/);
  assert.match(code, /hasLogoutAction\(onLogout\)/, 'onLogout 없으면 버튼 숨김');
  assert.match(code, /isRetrying=\{boundary\.isRetrying\}/, '재시도 중 로딩 전달');
  // 홈 우회: 오류 분기에서 renderMain/HOME을 호출하지 않는다
  const errorBranch = code.slice(
    code.indexOf('GATE_VIEW.ERROR'),
    code.indexOf('return renderMain')
  );
  assert.ok(errorBranch.length > 0);
  assert.doesNotMatch(errorBranch, /renderMain|ROUTES\.HOME|initialRouteName/);
  // 자동 재시도 없음: retry는 사용자 핸들러에서만 호출
  assert.doesNotMatch(
    code,
    /gate\.retry\(/,
    'Gate.retry는 직접 호출하지 않고 pressRetry를 통해서만'
  );
  assert.match(code, /retry: gate\.retry/);
  assert.doesNotMatch(code, /setInterval|setTimeout/);
  // Auth/Token 직접 호출 없음
  assert.doesNotMatch(code, /logoutUser|tokenService|authApi|useDispatch/);
});

test('[정적 분석] 라우트 래퍼: 4단계 화면 + 콜백 팩토리 사용, 트래커·표시기를 컴포넌트에서 새로 만들지 않음', () => {
  const code = stripComments(routesSource);
  assert.match(code, /<WorkFinancialOnboardingScreen/);
  assert.match(code, /<WorkFinancialOnboardingResultScreen/);
  assert.match(code, /createQuestionCallbacks\(/);
  assert.match(code, /createResultCallbacks\(/);
  assert.match(code, /presentLocalResultNotice\(/);
  assert.doesNotMatch(
    code,
    /createNoticeTracker|createLocalNoticePresenter/,
    '재마운트로 초기화되는 트래커 금지'
  );
  assert.doesNotMatch(
    code,
    /AsyncStorage|loadResult|saveDraft|clear\w*\(/,
    '로컬 저장소 직접 접근 없음'
  );
  assert.doesNotMatch(
    code,
    /uploadOnboarding|submitAnswers|apiClient/,
    '자동 업로드·서버 호출 없음'
  );
  // 모듈 수준에서 콜백/디스패처를 만들지 않는다(컴포넌트 안에서만)
  const outsideComponents = code
    .replace(/import[\s\S]*?from '[^']+';/g, '') // import 구문 제외
    .replace(functionBody(code, 'export function WorkOnboardingQuestionRoute'), '')
    .replace(functionBody(code, 'export function WorkOnboardingResultRoute'), '');
  assert.doesNotMatch(
    outsideComponents,
    /createQuestionCallbacks|createResultCallbacks|createCompletionDispatcher/
  );
  // 라우트 등록/네비게이터 수정 없음
  assert.doesNotMatch(code, /createNativeStackNavigator|Stack\.Screen|NavigationContainer/);
});

test('[정적 분석] Hook 호출 규칙: useLocalOnboardingNotice는 1회·최상위·조건 없이 호출, enabled는 resolveNoticeSettings 결과', () => {
  const code = stripComments(routesSource);
  assert.equal((code.match(/useLocalOnboardingNotice\(/g) ?? []).length, 1);

  const body = functionBody(code, 'export function WorkOnboardingQuestionRoute');
  const lines = body.split('\n');
  const callIndex = lines.findIndex(line => line.includes('useLocalOnboardingNotice('));
  assert.ok(callIndex > 0);
  // 컴포넌트 본문 최상위(들여쓰기 2칸)의 단순 const 선언
  assert.match(
    lines[callIndex],
    /^ {2}const localNotice = useLocalOnboardingNotice\(\{ userId, serverStatus, enabled \}\);$/
  );

  // 호출 이전 줄에 조건문/삼항/&&/조기 return이 없다
  const before = lines.slice(0, callIndex).join('\n');
  // (삼항은 공백으로 둘러싸인 ?로 판별 — 옵셔널 체이닝 ?. 은 제외)
  assert.doesNotMatch(before, /\bif\s*\(|\s\?\s|&&|\breturn\b|\bfor\s*\(|\bwhile\s*\(/);
  // enabled/serverStatus는 resolveNoticeSettings에서 온다
  assert.match(before, /const \{ enabled, serverStatus \} = resolveNoticeSettings\(\{/);
  assert.match(before, /flagEnabled: WORK_ONBOARDING_ENABLED/);

  // 모든 Hook 호출은 컴포넌트 최상위(들여쓰기 2칸) 또는 useEffect/useMemo 콜백 바깥이다
  for (const component of ['WorkOnboardingQuestionRoute', 'WorkOnboardingResultRoute']) {
    const componentBody = functionBody(code, `export function ${component}`).split('\n');
    componentBody.forEach((line, index) => {
      if (/\buse(Selector|Memo|Effect|State|Ref|Callback|LocalOnboardingNotice)\(/.test(line)) {
        assert.match(
          line,
          /^ {2}(const .+ = )?use\w+\(/,
          `${component}:${index} Hook이 최상위가 아님: ${line.trim()}`
        );
      }
    });
  }
});

test('[정적 분석] 사용자 전환: 콜백 useMemo deps에 userId 포함, key에 userId·mode 포함', () => {
  const code = stripComments(routesSource);
  const questionBody = functionBody(code, 'export function WorkOnboardingQuestionRoute');
  const resultBody = functionBody(code, 'export function WorkOnboardingResultRoute');

  const questionDeps = questionBody.match(
    /createQuestionCallbacks\([\s\S]*?\}\),\s*\n\s*\[([^\]]*)\]/
  );
  assert.ok(questionDeps, '질문 콜백 useMemo deps를 찾을 수 없음');
  for (const dep of ['navigation', 'mode', 'userId']) {
    assert.match(questionDeps[1], new RegExp(`\\b${dep}\\b`), `질문 콜백 deps에 ${dep} 필요`);
  }

  const resultDeps = resultBody.match(/createResultCallbacks\([\s\S]*?\}\),\s*\n\s*\[([^\]]*)\]/);
  assert.ok(resultDeps, '결과 콜백 useMemo deps를 찾을 수 없음');
  for (const dep of ['navigation', 'userId']) {
    assert.match(resultDeps[1], new RegExp(`\\b${dep}\\b`), `결과 콜백 deps에 ${dep} 필요`);
  }

  assert.match(questionBody, /key=\{`\$\{userId\}:\$\{mode\}`\}/);
  assert.match(resultBody, /key=\{`\$\{userId\}`\}/);
  // 안내 effect cleanup으로 오래된 결과 차단
  assert.match(
    questionBody,
    /let active = true;[\s\S]*isCurrent: \(\) => active[\s\S]*active = false/
  );
});

test('[정적 분석] 신규 6-2 컴포넌트는 Feature Flag 분기 안에서만 실행되고, Auth/PIN 등 그 외 기존 파일은 사용하지 않음', () => {
  // 6-3 연결: MainNavigator는 신규 경계/라우트를 WorkMainNavigator(플래그 on) 경로에서만 렌더한다.
  const main = stripComments(readSource('src/navigation/MainNavigator.js'));
  assert.match(
    main,
    /WORK_ONBOARDING_ENABLED \? <WorkMainNavigator \/> : <LegacyMainNavigator \/>/
  );
  const legacy = main.slice(
    main.indexOf('const LegacyMainNavigator'),
    main.indexOf('const IncompleteOnboardingStackHost')
  );
  assert.ok(legacy.length > 0);
  assert.doesNotMatch(
    legacy,
    /OnboardingGateBoundary|WorkOnboardingRouteScreens|WorkOnboardingQuestionRoute|gateEvidenceRegistry/,
    'Legacy 경로에서는 신규 컴포넌트를 렌더하지 않음'
  );
  assert.doesNotMatch(main, /useOnboardingGate\(/, 'Gate Hook은 경계 컴포넌트 안에서만 호출');
  // 라우트 값이 6-1 임시 상수와 일치 (6-3에서 routes.js에 등록)
  assert.equal(ROUTES.WORK_FINANCIAL_ONBOARDING, WORK_ONBOARDING_ROUTES.ONBOARDING);
  assert.equal(ROUTES.WORK_FINANCIAL_ONBOARDING_RESULT, WORK_ONBOARDING_ROUTES.RESULT);

  const guarded = [
    'src/navigation/RootNavigator.js',
    'src/navigation/AuthNavigator.js',
    'src/screens/home/HomeScreen.js',
    'src/screens/onboarding/FinancialOnboardingScreen.js',
    'src/screens/onboarding/FinancialOnboardingResultScreen.js',
    'src/features/auth/authApi.js',
    'src/features/auth/guardedLogout.js',
    'src/services/tokenService.js',
    'src/screens/auth/PinInputScreen.js',
    'src/screens/profile/ProfileScreen.js',
  ];
  for (const rel of guarded) {
    assert.ok(existsSync(root(rel)), `${rel} 존재`);
    assert.doesNotMatch(
      readSource(rel),
      /OnboardingGateBoundary|WorkOnboardingRouteScreens|workOnboardingRouteLogic|WorkOnboardingQuestionRoute/,
      `${rel}가 신규 파일을 사용하면 안 됨`
    );
  }
  assert.equal(typeof config.WORK_ONBOARDING_ENABLED, 'boolean');
  assert.match(
    stripComments(readSource('src/features/onboarding/workOnboardingConfig.js')).trim(),
    /^export const WORK_ONBOARDING_ENABLED = (true|false);$/
  );
  assert.match(
    readSource('src/constants/routes.js'),
    /WORK_FINANCIAL_ONBOARDING: 'WorkFinancialOnboarding'/
  );
  assert.doesNotMatch(readSource('src/navigation/MainNavigator.js'), /useOnboardingGate\(/);
});

test('[정적 분석] 1~6-1단계 구현 파일은 6-2 신규 파일에 의존하지 않음', () => {
  for (const rel of [
    'src/features/onboarding/onboardingApi.js',
    'src/features/onboarding/useWorkOnboardingFlow.js',
    'src/features/onboarding/workOnboardingScreenLogic.js',
    'src/features/onboarding/useOnboardingGate.js',
    'src/features/onboarding/workOnboardingNavigation.js',
    'src/features/onboarding/useLocalOnboardingNotice.js',
    'src/screens/onboarding/WorkFinancialOnboardingScreen.js',
    'src/screens/onboarding/WorkFinancialOnboardingResultScreen.js',
    'src/components/onboarding/WorkOnboardingGateError.js',
  ]) {
    assert.doesNotMatch(
      readSource(rel),
      /OnboardingGateBoundary|WorkOnboardingRouteScreens|workOnboardingRouteLogic/,
      rel
    );
  }
});

test('[정적 분석] Work 결과 화면은 기존 Hero 디자인을 쓰되 서버 값만 표시하고 답변은 기본 접힘', () => {
  const screen = stripComments(
    readSource('src/screens/onboarding/WorkFinancialOnboardingResultScreen.js')
  );
  const summary = stripComments(
    readSource('src/components/onboarding/WorkOnboardingAnswerSummary.js')
  );

  // 기존 Hero 재사용 + API-35 유래 값(view.title/summaryLines) 사용
  assert.match(screen, /import FutureProfileHeroCard from/);
  assert.match(screen, /<FutureProfileHeroCard/);
  assert.match(screen, /view\.title/);
  assert.match(screen, /view\.summaryLines/);
  assert.doesNotMatch(screen, /tags=/);

  // 장식 이미지: 완료 시 저장된 값을 읽어 표시(화면에서 직접 랜덤 선택하지 않음), 서버 값과 무관
  assert.match(screen, /import \{ FUTURE_PROFILE_IMAGES \} from/);
  assert.match(screen, /loadProfileImageKey\(/);
  assert.doesNotMatch(screen, /Math\.random|pickRandomItem/);
  assert.match(screen, /imageSource=\{FUTURE_PROFILE_IMAGES\[imageKey\] \?\? null\}/);
  assert.match(screen, /imageKey=\{imageKey \?\? undefined\}/);
  assert.doesNotMatch(screen, /맞춤 이미지|분석 결과에 맞는|당신의 유형/);

  // 로컬 점수/프로필 분류/로컬 결과/성공 이미지 키로 대체 생성하지 않음
  assert.doesNotMatch(
    screen,
    /futureProfileConfig|buildFinancialOnboardingResultViewModel|getOnboardingRepository|successImage|AsyncStorage|PROFILE_SCORES/
  );

  // 개발용 문구 제거, 사용자 문구 적용
  for (const source of [screen, summary]) {
    assert.doesNotMatch(source, /서버에 저장된 답변으로 만든 요약|서버에 저장된 내 답변/);
  }
  assert.match(screen, /개의 답변으로 발견한 나/);
  assert.match(summary, /내 답변 다시보기/);

  // 미완료에서는 답변 개수를 단정하지 않는다: 숫자 문구는 notCompleted가 아닐 때만
  assert.match(
    screen,
    /notCompleted\s*\?\s*'[^']+'\s*:\s*`\$\{view\.answers\.length\}개의 답변으로 발견한 나`/
  );

  // 답변 목록: 기본 접힘 + 토글, 재진입/사용자 변경 시 scope key로 초기화
  assert.match(summary, /useState\(false\)/);
  assert.match(summary, /setExpanded\(prev => !prev\)/);
  assert.match(summary, /\{expanded &&/);
  assert.match(screen, /<WorkOnboardingAnswerSummary key=\{scope\}/);

  // 기존 상태/버튼 보존
  for (const label of ['온보딩 시작하기', '홈으로', '재검사하기', '다시 시도']) {
    assert.match(screen, new RegExp(label));
  }
  assert.match(screen, /onStart/);
  assert.match(screen, /onRetake/);
  assert.match(screen, /onGoHome/);
  assert.match(screen, /RESULT_STATUS\.ERROR/);
  assert.match(screen, /RESULT_STATUS\.EMPTY/);
  assert.match(screen, /RESULT_STATUS\.NOT_COMPLETED/);
  assert.match(screen, /LoadingPanel/);
});

test('[정적 분석] FutureProfileHeroCard/Scene은 로컬 프로필 계산에 의존하지 않음', () => {
  for (const rel of [
    'src/components/onboarding/FutureProfileHeroCard.js',
    'src/components/onboarding/FutureProfileScene.js',
  ]) {
    assert.doesNotMatch(
      stripComments(readSource(rel)),
      /buildFinancialOnboardingResultViewModel|futureProfileConfig|PROFILE_SCORES|getOnboardingRepository|AsyncStorage/,
      rel
    );
  }
});

test('[정적 분석] FutureProfileScene placeholder 장면의 JSX 컴포넌트는 모두 정의/import되어 있음', () => {
  const scene = stripComments(readSource('src/components/onboarding/FutureProfileScene.js'));
  const decor = stripComments(readSource('src/components/onboarding/FutureProfileDecor.js'));

  // Orb/Leaf는 Decor에서 export되고 Scene이 import한다 (누락 시 imageSource=null 경로에서 Render Error)
  assert.match(decor, /export function Leaf\b/);
  assert.match(decor, /export function Orb\b/);
  assert.match(scene, /import \{[^}]*\bLeaf\b[^}]*\} from '\.\/FutureProfileDecor'/);
  assert.match(scene, /import \{[^}]*\bOrb\b[^}]*\} from '\.\/FutureProfileDecor'/);

  // 일반화: JSX로 쓰인 모든 대문자 컴포넌트가 import 또는 파일 내 선언으로 존재해야 한다
  const tags = new Set([...scene.matchAll(/<([A-Z]\w*)/g)].map(m => m[1]));
  assert.ok(tags.size > 0);
  for (const tag of tags) {
    const declared =
      new RegExp(String.raw`import[^;]*\b${tag}\b[^;]*from`).test(scene) ||
      new RegExp(String.raw`(function|const|class)\s+${tag}\b`).test(scene);
    assert.ok(declared, `${tag}가 FutureProfileScene.js에서 정의/import되지 않음`);
  }
});

test('[정적 분석] Future Profile 이미지 6개 파일이 실제로 존재하고 키와 일치', () => {
  const assets = stripComments(readSource('src/constants/futureProfileAssets.js'));
  const files = [
    ...assets.matchAll(/require\('\.\.\/\.\.\/(assets\/future-profile\/[^']+\.png)'\)/g),
  ].map(m => m[1]);
  assert.equal(files.length, 6);
  for (const file of files) assert.ok(existsSync(root(file)), `${file} 없음`);
});
