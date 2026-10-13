// 6-1단계: 서버 온보딩 앱 연결용 순수 이동 로직 / 기능 플래그 / 로컬 결과 안내 판단 테스트.
// 서버 호출 없음, 실제 navigation 실행 없음(액션 객체만 검증). 모의 AsyncStorage 스텁 사용.
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/workOnboardingNavigation.test.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { __store, __control, __resetControl } from './stubs/asyncStorage.mjs';

const config = await import('../../src/features/onboarding/workOnboardingConfig.js');
const nav = await import('../../src/features/onboarding/workOnboardingNavigation.js');
const noticeModule = await import('../../src/features/onboarding/useLocalOnboardingNotice.js');
const { ROUTES } = await import('../../src/constants/routes.js');
const { GATE_STATUS } = await import('../../src/features/onboarding/useOnboardingGate.js');
const { getOnboardingRepository } =
  await import('../../src/features/onboarding/onboardingRepository.js');

const {
  GATE_VIEW,
  LOCAL_RESULT_NOTICE,
  LOCAL_RESULT_STATE,
  ROOT_BACK_ACTION,
  WORK_ONBOARDING_ROUTES,
  buildCompletionResetAction,
  buildGoHomeResetAction,
  buildOpenResultAction,
  buildRetakeAction,
  buildStartOnboardingAction,
  canRetry,
  createCompletionDispatcher,
  createNavigationHandlers,
  createNoticeTracker,
  decideLocalResultNotice,
  getGateErrorActions,
  getQuestionRouteOptions,
  getResultRouteOptions,
  nextRetryRequested,
  resolveGateView,
  resolveHomeMoneyTypeView,
  resolveRootBackAction,
} = nav;
const { readLocalResultState } = noticeModule;

const UID = '123456789012345678';
const OTHER_UID = '223456789012345679';

const readSource = rel => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
const stripComments = source =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

beforeEach(() => {
  __store.clear();
  __resetControl();
});

// ── Feature Flag ─────────────────────────────────────────────

// 롤아웃 상태(true/false)의 값 단정은 workOnboardingConnection.test.mjs의 '롤아웃 상태' 테스트 한 곳에서 한다.
// 여기서는 값과 무관하게 설정 모듈의 형태만 검증한다(롤백으로 false가 되어도 이 테스트는 유효).
test('Feature Flag는 boolean 상수 하나만 export (값은 롤아웃 상태 테스트에서 단정)', () => {
  assert.equal(typeof config.WORK_ONBOARDING_ENABLED, 'boolean');
  assert.deepEqual(Object.keys(config), ['WORK_ONBOARDING_ENABLED'], '다른 export 없음');
});

test('[정적 분석] 설정 파일은 import·부작용 없이 상수 하나만 정의', () => {
  const code = stripComments(readSource('src/features/onboarding/workOnboardingConfig.js')).trim();
  assert.match(code, /^export const WORK_ONBOARDING_ENABLED = (true|false);$/);
});

// ── Gate 상태별 화면 결정 ────────────────────────────────────

test('Gate checking → 로딩(splash)', () => {
  assert.deepEqual(resolveGateView({ status: GATE_STATUS.CHECKING }), {
    view: GATE_VIEW.SPLASH,
    isRetrying: false,
  });
  assert.equal(
    resolveGateView({ status: GATE_STATUS.CHECKING, retryRequested: false }).view,
    'splash'
  );
});

test('Gate error → 오류 화면(오류 종류 전달, 재시도 중 아님)', () => {
  assert.deepEqual(resolveGateView({ status: GATE_STATUS.ERROR, error: { type: 'NETWORK' } }), {
    view: GATE_VIEW.ERROR,
    isRetrying: false,
    errorType: 'NETWORK',
  });
  assert.equal(resolveGateView({ status: GATE_STATUS.ERROR }).errorType, 'UNKNOWN');
});

test('Gate complete → 홈 / incomplete → 신규 온보딩(mode initial)', () => {
  assert.deepEqual(resolveGateView({ status: GATE_STATUS.COMPLETE }), {
    view: GATE_VIEW.HOME,
    isRetrying: false,
    initialRouteName: ROUTES.HOME,
  });
  assert.deepEqual(resolveGateView({ status: GATE_STATUS.INCOMPLETE }), {
    view: GATE_VIEW.ONBOARDING,
    isRetrying: false,
    initialRouteName: WORK_ONBOARDING_ROUTES.ONBOARDING,
    initialParams: { mode: 'initial' },
  });
});

test('재시도 중(checking + retryRequested) → 오류 화면 유지 + 버튼 로딩, 직전 오류 종류 유지', () => {
  assert.deepEqual(
    resolveGateView({
      status: GATE_STATUS.CHECKING,
      retryRequested: true,
      error: null,
      lastErrorType: 'TIMEOUT',
    }),
    { view: GATE_VIEW.ERROR, isRetrying: true, errorType: 'TIMEOUT' }
  );
  assert.equal(
    resolveGateView({ status: GATE_STATUS.CHECKING, retryRequested: true }).errorType,
    'UNKNOWN'
  );
});

test('재시도 결과별 전환: 성공이면 home/onboarding, 다시 실패면 error(isRetrying false)', () => {
  assert.equal(
    resolveGateView({ status: GATE_STATUS.COMPLETE, retryRequested: true }).view,
    'home'
  );
  assert.equal(
    resolveGateView({ status: GATE_STATUS.INCOMPLETE, retryRequested: true }).view,
    'onboarding'
  );
  assert.deepEqual(
    resolveGateView({
      status: GATE_STATUS.ERROR,
      retryRequested: true,
      error: { type: 'SERVER' },
    }),
    { view: 'error', isRetrying: false, errorType: 'SERVER' }
  );
});

test('알 수 없는 status는 홈이 아니라 오류 화면', () => {
  for (const status of [undefined, null, '', 'unknown', 'done', 0]) {
    const view = resolveGateView({ status });
    assert.equal(view.view, GATE_VIEW.ERROR, String(status));
    assert.equal(view.errorType, 'UNKNOWN');
    assert.equal('initialRouteName' in view, false);
  }
  assert.equal(resolveGateView().view, GATE_VIEW.ERROR);
});

test('홈 우회 금지: 어떤 error 입력에서도 home/onboarding으로 가지 않고, 제공 동작은 재시도·로그아웃뿐', () => {
  for (const retryRequested of [false, true]) {
    for (const error of [
      null,
      { type: 'NETWORK' },
      { type: 'UNAUTHORIZED' },
      { type: 'INVALID_USER' },
    ]) {
      const view = resolveGateView({ status: GATE_STATUS.ERROR, retryRequested, error });
      assert.equal(view.view, GATE_VIEW.ERROR);
      assert.equal('initialRouteName' in view, false);
    }
  }
  assert.deepEqual(getGateErrorActions(), ['retry', 'logout']);
  const copy = getGateErrorActions();
  copy.push('home');
  assert.deepEqual(getGateErrorActions(), ['retry', 'logout'], '외부에서 변경 불가');
});

test('재시도 상태 전이: error에서만 재시도, checking 중 유지, 결과가 나오면 해제', () => {
  assert.equal(canRetry(GATE_STATUS.ERROR), true);
  for (const status of [
    GATE_STATUS.CHECKING,
    GATE_STATUS.COMPLETE,
    GATE_STATUS.INCOMPLETE,
    undefined,
  ]) {
    assert.equal(canRetry(status), false, String(status));
  }
  assert.equal(nextRetryRequested(true, GATE_STATUS.CHECKING), true);
  assert.equal(nextRetryRequested(false, GATE_STATUS.CHECKING), false);
  for (const status of [GATE_STATUS.COMPLETE, GATE_STATUS.INCOMPLETE, GATE_STATUS.ERROR]) {
    assert.equal(nextRetryRequested(true, status), false, status);
  }

  // 시나리오: error → (재시도 누름) → checking → error → (재시도) → checking → complete
  let requested = false;
  let status = GATE_STATUS.ERROR;
  assert.equal(canRetry(status), true);
  requested = true; // 사용자가 재시도 버튼을 누름
  status = GATE_STATUS.CHECKING;
  requested = nextRetryRequested(requested, status);
  assert.equal(
    resolveGateView({ status, retryRequested: requested, lastErrorType: 'NETWORK' }).isRetrying,
    true
  );
  status = GATE_STATUS.ERROR;
  requested = nextRetryRequested(requested, status);
  assert.equal(requested, false);
  assert.equal(
    resolveGateView({ status, retryRequested: requested, error: { type: 'NETWORK' } }).isRetrying,
    false
  );
});

// ── Navigation Action ────────────────────────────────────────

test('신규 라우트 이름: routes.js 상수와 값이 일치하고, 그 외 기존 ROUTES 값과는 충돌하지 않음 (6-3 연결 후)', () => {
  // 6-3에서 routes.js에 같은 값으로 등록되었다. 일치 여부는 그대로 검증하고, 다른 모든 기존 라우트와 겹치지 않는지 확인한다.
  assert.equal(ROUTES.WORK_FINANCIAL_ONBOARDING, WORK_ONBOARDING_ROUTES.ONBOARDING);
  assert.equal(ROUTES.WORK_FINANCIAL_ONBOARDING_RESULT, WORK_ONBOARDING_ROUTES.RESULT);

  const others = Object.entries(ROUTES)
    .filter(([key]) => !key.startsWith('WORK_FINANCIAL_ONBOARDING'))
    .map(([, value]) => value);
  const otherSet = new Set(others);
  for (const name of Object.values(WORK_ONBOARDING_ROUTES)) {
    assert.equal(otherSet.has(name), false, name);
  }
  assert.deepEqual(WORK_ONBOARDING_ROUTES, {
    ONBOARDING: 'WorkFinancialOnboarding',
    RESULT: 'WorkFinancialOnboardingResult',
  });
  assert.ok(Object.isFrozen(WORK_ONBOARDING_ROUTES));
  // 기존 온보딩 라우트는 삭제하지 않았다(롤백/Legacy용)
  assert.equal(ROUTES.FINANCIAL_ONBOARDING, 'FinancialOnboarding');
  assert.equal(ROUTES.FINANCIAL_ONBOARDING_RESULT, 'FinancialOnboardingResult');
});

test('최초 온보딩 시작 / 재검사 시작: mode 전달', () => {
  assert.deepEqual(buildStartOnboardingAction(), {
    type: 'NAVIGATE',
    payload: { name: 'WorkFinancialOnboarding', params: { mode: 'initial' } },
  });
  assert.deepEqual(buildRetakeAction(), {
    type: 'NAVIGATE',
    payload: { name: 'WorkFinancialOnboarding', params: { mode: 'retake' } },
  });
  assert.deepEqual(buildOpenResultAction(), {
    type: 'NAVIGATE',
    payload: { name: 'WorkFinancialOnboardingResult' },
  });
});

test('제출 완료 후 이동: HOME + WORK_RESULT로 스택 교체(질문 화면 제거), 홈 이동은 HOME만', () => {
  assert.deepEqual(buildCompletionResetAction(), {
    type: 'RESET',
    payload: {
      index: 1,
      routes: [{ name: ROUTES.HOME }, { name: 'WorkFinancialOnboardingResult' }],
    },
  });
  assert.deepEqual(buildGoHomeResetAction(), {
    type: 'RESET',
    payload: { index: 0, routes: [{ name: ROUTES.HOME }] },
  });
  // 완료 후 스택에 질문 화면이 없다
  const names = buildCompletionResetAction().payload.routes.map(route => route.name);
  assert.equal(names.includes(WORK_ONBOARDING_ROUTES.ONBOARDING), false);
  assert.equal(names.includes(ROUTES.FINANCIAL_ONBOARDING), false);
});

test('액션 빌더는 순수: 호출마다 새 객체·동일 내용, 반환값을 바꿔도 다음 호출에 영향 없음', () => {
  const first = buildCompletionResetAction();
  first.payload.routes.push({ name: 'Injected' });
  first.payload.index = 99;
  assert.deepEqual(buildCompletionResetAction().payload.routes.length, 2);
  assert.equal(buildCompletionResetAction().payload.index, 1);
  assert.notEqual(buildStartOnboardingAction(), buildStartOnboardingAction());
  assert.deepEqual(buildStartOnboardingAction(), buildStartOnboardingAction());
});

test('완료 이동 디스패처: 여러 번 호출해도 dispatch 1회 (중복 화면 이동 방지)', () => {
  const dispatched = [];
  const onComplete = createCompletionDispatcher(action => dispatched.push(action));
  assert.equal(onComplete(), true);
  assert.equal(onComplete(), false);
  assert.equal(onComplete(), false);
  assert.deepEqual(dispatched, [buildCompletionResetAction()]);
});

test('이동 핸들러 맵: 각 콜백이 해당 액션을 dispatch', () => {
  const dispatched = [];
  const handlers = createNavigationHandlers(action => dispatched.push(action));
  handlers.onStart();
  handlers.onRetake();
  handlers.onGoHome();
  handlers.onComplete();
  handlers.onComplete();
  assert.deepEqual(dispatched, [
    buildStartOnboardingAction(),
    buildRetakeAction(),
    buildGoHomeResetAction(),
    buildCompletionResetAction(),
  ]);
  assert.deepEqual(Object.keys(handlers).sort(), ['onComplete', 'onGoHome', 'onRetake', 'onStart']);
});

// ── 뒤로가기 / 라우트 옵션 ───────────────────────────────────

test('Android 루트 뒤로가기 정책: 뒤로 갈 화면 있으면 GO_BACK, Android 루트는 종료, iOS는 종료 시도 안 함', () => {
  assert.equal(
    resolveRootBackAction({ platform: 'android', canGoBack: true }),
    ROOT_BACK_ACTION.GO_BACK
  );
  assert.equal(
    resolveRootBackAction({ platform: 'ios', canGoBack: true }),
    ROOT_BACK_ACTION.GO_BACK
  );
  assert.equal(
    resolveRootBackAction({ platform: 'android', canGoBack: false }),
    ROOT_BACK_ACTION.EXIT_APP
  );
  assert.equal(resolveRootBackAction({ platform: 'ios', canGoBack: false }), ROOT_BACK_ACTION.NONE);
  for (const platform of ['web', 'windows', undefined, null]) {
    assert.equal(
      resolveRootBackAction({ platform, canGoBack: false }),
      ROOT_BACK_ACTION.NONE,
      String(platform)
    );
  }
  assert.equal(resolveRootBackAction(), ROOT_BACK_ACTION.NONE);
});

test('질문 라우트는 iOS 스와이프 비활성, 결과 라우트는 헤더만 숨김', () => {
  assert.deepEqual(getQuestionRouteOptions(), { headerShown: false, gestureEnabled: false });
  assert.deepEqual(getResultRouteOptions(), { headerShown: false });
  const options = getQuestionRouteOptions();
  options.gestureEnabled = true;
  assert.equal(getQuestionRouteOptions().gestureEnabled, false);
});

// ── Home 머니 타입 정책 ──────────────────────────────────────

test('Home 정책: 플래그 false는 기존(legacy_local), true는 중립 안내(server_guide)이며 로컬 계산 결과는 절대 노출 안 함', () => {
  assert.deepEqual(resolveHomeMoneyTypeView({ flagEnabled: false }), { kind: 'legacy_local' });
  assert.deepEqual(resolveHomeMoneyTypeView({}), { kind: 'legacy_local' });
  assert.deepEqual(resolveHomeMoneyTypeView(), { kind: 'legacy_local' });
  assert.deepEqual(
    resolveHomeMoneyTypeView({ flagEnabled: 'true' }),
    { kind: 'legacy_local' },
    'true만 활성'
  );

  const guide = resolveHomeMoneyTypeView({ flagEnabled: true });
  assert.equal(guide.kind, 'server_guide');
  assert.deepEqual(guide.action, buildOpenResultAction());
  assert.deepEqual(Object.keys(guide).sort(), ['action', 'ctaLabel', 'kind', 'message', 'title']);
  // 로컬 계산 결과/프로필 타입 관련 필드가 없다
  assert.equal(
    Object.keys(guide).some(key => /profile|type|tag|score|image|answers/i.test(key)),
    false
  );
  assert.doesNotMatch(
    JSON.stringify(guide),
    /점수|유형|타입/,
    '서버 결과를 계산/주장하는 문구 없음'
  );
  // 플래그 true일 때 입력에 로컬 결과를 줘도 반환값에 반영되지 않는다
  assert.deepEqual(
    resolveHomeMoneyTypeView({ flagEnabled: true, localProfile: { title: '로컬 타입' } }),
    guide
  );
});

// ── 로컬 결과 안내 판단 ──────────────────────────────────────

test('안내 판단 표: 서버 미완료 + 로컬 결과 있음 + 미표시일 때만 true', () => {
  const rows = [];
  for (const serverStatus of [
    'incomplete',
    'empty',
    'not_completed',
    'complete',
    'error',
    'checking',
    'x',
    undefined,
  ]) {
    for (const localResult of ['exists', 'none', 'unknown', undefined]) {
      for (const alreadyShown of [false, true]) {
        const expected =
          ['incomplete', 'empty', 'not_completed'].includes(serverStatus) &&
          localResult === 'exists' &&
          !alreadyShown;
        const decision = decideLocalResultNotice({ serverStatus, localResult, alreadyShown });
        assert.equal(decision.show, expected, `${serverStatus}/${localResult}/${alreadyShown}`);
        assert.equal(typeof decision.reason, 'string');
        rows.push(decision);
      }
    }
  }
  assert.equal(
    rows.filter(row => row.show).length,
    3,
    '표시되는 조합은 3가지(서버 미완료 3종 × exists × 미표시)'
  );
  assert.deepEqual(decideLocalResultNotice(), { show: false, reason: 'SERVER_STATUS' });
});

test('안내 문구: 삭제·자동 업로드 없음과 기기에 그대로 남음을 알림', () => {
  assert.match(LOCAL_RESULT_NOTICE.message, /서버에 저장되어 있지 않아요/);
  assert.match(LOCAL_RESULT_NOTICE.message, /그대로 남아 있어요/);
  assert.ok(Object.isFrozen(LOCAL_RESULT_NOTICE));
});

test('안내 트래커: 사용자별 1회, 메모리 전용 (AsyncStorage 접근 없음)', () => {
  const tracker = createNoticeTracker();
  assert.equal(tracker.hasShown(UID), false);
  tracker.markShown(UID);
  assert.equal(tracker.hasShown(UID), true);
  assert.equal(tracker.hasShown(OTHER_UID), false, '다른 사용자는 별도');
  assert.equal(createNoticeTracker().hasShown(UID), false, '트래커 인스턴스별 독립');
  assert.equal(__control.log.length, 0);
  assert.equal(__store.size, 0);
});

// ── 기존 로컬 결과 읽기 전용 확인 ────────────────────────────

const localResultKey = uid => `@financialOnboarding:result:v1:${uid}`;
const seedLocalData = () => {
  const data = {
    [localResultKey(UID)]: JSON.stringify({ answers: { q1: 'employed' }, updatedAt: 't' }),
    [`@financialOnboarding:draft:v1:${UID}`]: JSON.stringify({ currentIndex: 2, answers: {} }),
    [`@financialOnboarding:draftServer:v1:${UID}`]: 'server-draft',
    [localResultKey(OTHER_UID)]: JSON.stringify({ answers: {}, updatedAt: 't2' }),
    '@financialOnboarding:draft:v1:guest': 'guest',
    '@auth:autoLogin': 'true',
    '@auth:onboardingDone': 'true',
  };
  for (const [key, value] of Object.entries(data)) __store.set(key, value);
  __control.log.length = 0;
  return data;
};

test('기존 로컬 결과 존재/부재 판단: 있음 → exists, 없음 → none', async () => {
  seedLocalData();
  assert.equal(await readLocalResultState(UID), LOCAL_RESULT_STATE.EXISTS);
  __store.delete(localResultKey(UID));
  assert.equal(await readLocalResultState(UID), LOCAL_RESULT_STATE.NONE);
  assert.equal(await readLocalResultState('323456789012345680'), LOCAL_RESULT_STATE.NONE);
});

test('읽기 실패 → unknown (안내하지 않음, 오류 전파 없음) / 잘못된 userId → unknown + 저장소 접근 없음', async () => {
  seedLocalData();
  __control.fail.get = 1;
  assert.equal(await readLocalResultState(UID), LOCAL_RESULT_STATE.UNKNOWN);
  assert.equal(
    decideLocalResultNotice({ serverStatus: 'incomplete', localResult: LOCAL_RESULT_STATE.UNKNOWN })
      .show,
    false
  );

  __control.log.length = 0;
  for (const userId of ['', 'guest', '12a', '0', 123, null, undefined]) {
    assert.equal(await readLocalResultState(userId), LOCAL_RESULT_STATE.UNKNOWN, String(userId));
  }
  assert.deepEqual(__control.log, [], 'guest 등 잘못된 ID로 저장소를 읽지 않음');
});

test('읽기 전용: AsyncStorage에는 get만 발생, set/remove 0건, 기존 키·값 불변 (결과·Draft·서버 Draft·Auth)', async () => {
  const seeded = seedLocalData();
  await readLocalResultState(UID);
  await readLocalResultState(OTHER_UID);
  await readLocalResultState('999999999999999999');

  const ops = __control.log.map(entry => entry.split(':')[0]);
  assert.ok(ops.length > 0);
  assert.ok(
    ops.every(op => op === 'get'),
    `get 외 연산 발생: ${[...new Set(ops)]}`
  );
  assert.equal(__control.log.filter(entry => /:(set|remove):/.test(entry)).length, 0);
  assert.deepEqual(Object.fromEntries(__store), seeded, '저장된 값 전부 불변');
});

test('readLocalResultState는 loadResult만 호출 (loadDraft/saveDraft/submit/clear 계열 미호출)', async () => {
  const calls = [];
  const repository = new Proxy(
    {},
    {
      get: (_, method) => async () => {
        calls.push(method);
        return method === 'loadResult' ? { answers: {}, updatedAt: 't' } : null;
      },
    }
  );
  const state = await readLocalResultState(UID, { repositoryFactory: () => repository });
  assert.equal(state, LOCAL_RESULT_STATE.EXISTS);
  assert.deepEqual(calls, ['loadResult']);

  // 실제 기존 Repository 인스턴스도 같은 메서드만 사용했는지 로그로 확인
  seedLocalData();
  await readLocalResultState(UID, { repositoryFactory: getOnboardingRepository });
  assert.ok(__control.log.every(entry => entry.startsWith('get:')));
});

// ── 정적 분석: Hook·기존 앱 보호 ─────────────────────────────

test('[정적 분석] 안내 Hook: 플래그 기본값 사용, 읽기 전용 호출만, Alert/Navigation/react-native 미사용', () => {
  const source = stripComments(readSource('src/features/onboarding/useLocalOnboardingNotice.js'));
  assert.match(source, /enabled = WORK_ONBOARDING_ENABLED/);
  assert.match(
    source,
    /Boolean\(enabled\) && isNoticeServerStatus\(serverStatus\)/,
    'disabled면 읽지 않음'
  );
  assert.match(source, /\.loadResult\(\)/);
  for (const forbidden of [
    /loadDraft|saveDraft|clearDraft|submitResult|clearResult|clearAll/,
    /Alert|react-native|@react-navigation|navigation\./,
    /AsyncStorage|setItem|removeItem/,
    /uploadOnboarding|submitAnswers|fetch\(|apiClient/,
  ]) {
    assert.doesNotMatch(source, forbidden, String(forbidden));
  }
});

test('[정적 분석] 이동 로직 모듈은 React/react-native/React Navigation에 의존하지 않음', () => {
  const source = stripComments(readSource('src/features/onboarding/workOnboardingNavigation.js'));
  assert.doesNotMatch(source, /from 'react'|react-native|@react-navigation|AsyncStorage/);
  assert.doesNotMatch(
    source,
    /navigation\.(navigate|reset|dispatch)\(/,
    '직접 navigation 실행 없음'
  );
});

test('[정적 분석] 6-3 연결 파일은 신규 기능을 Feature Flag 분기 안에서만 실행하고, 그 외 기존 파일은 6-1 신규 파일을 쓰지 않음', () => {
  // 6-3에서 연결된 파일: 신규 기능은 WORK_ONBOARDING_ENABLED 분기로만 도달한다(Legacy 경로 코드는 보존).
  const main = stripComments(readSource('src/navigation/MainNavigator.js'));
  assert.match(
    main,
    /WORK_ONBOARDING_ENABLED \? <WorkMainNavigator \/> : <LegacyMainNavigator \/>/
  );
  const home = stripComments(readSource('src/screens/home/HomeScreen.js'));
  assert.match(
    home,
    /if \(WORK_ONBOARDING_ENABLED\) return undefined;/,
    '플래그 on에서만 로컬 읽기 중단'
  );
  assert.match(home, /resolveHomeMoneyTypeView\(\{ flagEnabled: WORK_ONBOARDING_ENABLED \}\)/);
  const category = stripComments(readSource('src/screens/category/CategoryScreen.js'));
  assert.match(
    category,
    /resolveFinancialOnboardingEntry\(\{ flagEnabled: WORK_ONBOARDING_ENABLED \}\)/
  );
  assert.equal(typeof config.WORK_ONBOARDING_ENABLED, 'boolean');
  // 플래그를 false로 명시하면 Home/Category/안내는 Legacy로 동작한다(값은 롤아웃 테스트에서 단정)
  assert.deepEqual(resolveHomeMoneyTypeView({ flagEnabled: false }), { kind: 'legacy_local' });

  const guarded = [
    'src/navigation/RootNavigator.js',
    'src/navigation/AuthNavigator.js',
    'src/screens/onboarding/FinancialOnboardingScreen.js',
    'src/screens/onboarding/FinancialOnboardingResultScreen.js',
    'src/features/onboarding/useOnboardingFlow.js',
    'src/features/onboarding/onboardingRepository.js',
    'src/features/onboarding/adapters/localUserOnboardingRepository.js',
    'src/features/auth/authApi.js',
    'src/services/tokenService.js',
    'src/screens/auth/PinInputScreen.js',
  ];
  for (const rel of guarded) {
    assert.ok(existsSync(new URL(`../../${rel}`, import.meta.url)), `${rel} 존재`);
    const source = readSource(rel);
    assert.doesNotMatch(
      source,
      /workOnboardingConfig|workOnboardingNavigation|useLocalOnboardingNotice|WORK_ONBOARDING_ENABLED/,
      `${rel}가 신규 파일을 사용하면 안 됨`
    );
  }
  // 1~5단계 구현 파일도 신규 6-1 파일에 의존하지 않는다
  for (const rel of [
    'src/features/onboarding/onboardingApi.js',
    'src/features/onboarding/useWorkOnboardingFlow.js',
    'src/features/onboarding/workOnboardingScreenLogic.js',
    'src/features/onboarding/useOnboardingGate.js',
    'src/screens/onboarding/WorkFinancialOnboardingScreen.js',
    'src/screens/onboarding/WorkFinancialOnboardingResultScreen.js',
  ]) {
    assert.doesNotMatch(
      readSource(rel),
      /workOnboardingConfig|workOnboardingNavigation|useLocalOnboardingNotice/,
      rel
    );
  }
});

test('[정적 분석] MainNavigator의 Legacy 경로는 여전히 기존 로컬 게이트를 사용하고 서버 Gate Hook을 직접 쓰지 않음', () => {
  const source = readSource('src/navigation/MainNavigator.js');
  const legacy = source.slice(
    source.indexOf('const LegacyMainNavigator'),
    source.indexOf('// ── 서버(Work API-34) 기반 Gate 경로')
  );
  assert.ok(legacy.length > 0);
  assert.match(legacy, /getOnboardingRepository\(userId\)/);
  assert.match(legacy, /\.loadResult\(\)/);
  assert.doesNotMatch(
    legacy,
    /useOnboardingGate|OnboardingGateBoundary|IncompleteOnboardingStackHost/
  );
  assert.doesNotMatch(source, /useOnboardingGate\(/);
});
