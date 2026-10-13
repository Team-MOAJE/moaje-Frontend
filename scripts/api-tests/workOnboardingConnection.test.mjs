// 6-3단계: 서버 온보딩 앱 연결 테스트 (기능 플래그 false 기본 상태 + 신규 코드 경로).
// React 렌더러가 없으므로 JSX 컴포넌트는 렌더링하지 않는다(미검증). 순수 로직 + 소스 정적 분석 + 실제 React Navigation
// StackRouter로 검증한다. 서버 호출 없음, 모의 AsyncStorage 스텁 사용.
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/workOnboardingConnection.test.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { StackRouter } from '@react-navigation/routers';
import { __store, __control, __resetControl } from './stubs/asyncStorage.mjs';

// 모듈 import와 로직 실행 중 네트워크 요청이 없는지 감시한다(요청은 그대로 전달).
const outbound = [];
for (const mod of [http, https]) {
  const original = mod.request;
  mod.request = function spied(...args) {
    outbound.push(args[0]);
    return original.apply(this, args);
  };
}

const config = await import('../../src/features/onboarding/workOnboardingConfig.js');
const nav = await import('../../src/features/onboarding/workOnboardingNavigation.js');
const logic = await import('../../src/navigation/workOnboardingRouteLogic.js');
const { ROUTES } = await import('../../src/constants/routes.js');

const {
  WORK_ONBOARDING_ROUTES,
  buildCompletionResetAction,
  buildOpenResultAction,
  buildRetakeAction,
  buildStartOnboardingAction,
  getQuestionRouteOptions,
  getResultRouteOptions,
  resolveHomeMoneyTypeView,
} = nav;
const {
  createEvidenceRegistry,
  createQuestionCallbacks,
  createResultCallbacks,
  isEvidenceUsable,
  resolveFinancialOnboardingEntry,
  resolveNoticeSettings,
  startGateEvidence,
} = logic;

const UID_A = '123456789012345678';
const UID_B = '223456789012345679';

const root = rel => new URL(`../../${rel}`, import.meta.url);
const readSource = rel => readFileSync(root(rel), 'utf8').replace(/\r\n/g, '\n');
const stripComments = source =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const squash = text => text.replace(/\s+/g, ' ').trim();

beforeEach(() => {
  __store.clear();
  __resetControl();
});

const mainSource = stripComments(readSource('src/navigation/MainNavigator.js'));
const sliceBetween = (source, from, to) => {
  const start = source.indexOf(from);
  const end = to ? source.indexOf(to, start + 1) : source.length;
  assert.ok(start >= 0 && end > start, `구간을 찾을 수 없음: ${from}`);
  return source.slice(start, end);
};
const stackSection = sliceBetween(mainSource, 'const renderMainStack', 'const LegacyMainNavigator');
const legacySection = sliceBetween(
  mainSource,
  'const LegacyMainNavigator',
  'const IncompleteOnboardingStackHost'
);
const hostSection = sliceBetween(
  mainSource,
  'const IncompleteOnboardingStackHost',
  'const renderWorkMain'
);
const renderWorkMainSection = sliceBetween(
  mainSource,
  'const renderWorkMain',
  'const WorkMainNavigator'
);
const workSection = sliceBetween(mainSource, 'const WorkMainNavigator', 'const MainNavigator = ');

// ── 1. Feature Flag false: 기존 라우트·옵션·초기 진입 경로 불변 ──

// 6-3 이전(HEAD) MainNavigator의 Screen 정의 스냅샷
const LEGACY_SCREEN_SNAPSHOT = [
  'ROUTES.HOME|HomeScreen|{{ headerShown: false }}',
  "ROUTES.ACCOUNT_LIST|AccountListScreen|{{ title: '내 계좌' }}",
  "ROUTES.ACCOUNT_DETAIL|AccountDetailScreen|{{ headerShown: false, animation: 'none' }}",
  'ROUTES.DAILY_LIMIT|DailyLimitScreen|{{ headerShown: false }}',
  'ROUTES.ANALYSIS|AnalysisScreen|{{ headerShown: false }}',
  'ROUTES.TRANSFER|TransferScreen|{{ headerShown: false }}',
  "ROUTES.RECOMMENDATION|RecommendationScreen|{{ title: '소득 추천' }}",
  "ROUTES.MFA_SCREEN|MFAScreen|{{ title: '추가 인증' }}",
  'ROUTES.CATEGORY|CategoryScreen|{{ headerShown: false }}',
  "ROUTES.MONEY_RECAP|MoneyRecapScreen|{{ headerShown: false, animation: 'none' }}",
  'ROUTES.PROFILE|ProfileScreen|{{ headerShown: false }}',
  'ROUTES.SETTINGS|SettingsScreen|{{ headerShown: false }}',
  'ROUTES.TRANSACTION_HISTORY|TransactionHistoryScreen|{{ headerShown: false }}',
  'ROUTES.TRANSACTION_DETAIL|TransactionDetailScreen|{{ headerShown: false }}',
  'ROUTES.FINANCIAL_ONBOARDING|FinancialOnboardingScreen|{{ headerShown: false }}',
  'ROUTES.FINANCIAL_ONBOARDING_RESULT|FinancialOnboardingResultScreen|{{ headerShown: false }}',
  'ROUTES.PIN_INPUT|PinInputScreen|{{ headerShown: false }}',
  // 4단계: 사회인 준비도(API-36). 플래그와 무관하게 공통 등록되는 신규 라우트(기존 17개는 위 그대로).
  'ROUTES.WORK_READINESS|ReadinessScreen|{{ headerShown: false }}',
];

const parseScreens = section => {
  const flat = squash(section);
  const matches = [
    ...flat.matchAll(
      /<Stack\.Screen name=\{(ROUTES\.\w+)\} component=\{(\w+)\} options=\{(.+?)\}(?: initialParams=\{[^}]*\})? \/>/g
    ),
  ];
  return matches.map(match => ({
    name: match[1],
    component: match[2],
    options: match[3],
    text: match[0],
    index: match.index,
  }));
};

test('플래그 false(Legacy): 기존 라우트 집합·순서·화면 옵션이 이전(HEAD)과 동일', () => {
  const baseSection = stackSection.slice(0, stackSection.indexOf('{includeWorkRoutes &&'));
  const screens = parseScreens(baseSection);
  const actual = screens.map(screen => `${screen.name}|${screen.component}|{${screen.options}}`);
  assert.deepEqual(actual, LEGACY_SCREEN_SNAPSHOT);

  // Navigator 공통 옵션(헤더 스타일)도 그대로
  assert.match(
    squash(stackSection),
    /screenOptions=\{\{ headerStyle: \{ backgroundColor: '#2563EB' \}, headerTintColor: '#fff', headerTitleStyle: \{ fontWeight: 'bold' \}, \}\}/
  );
});

test('플래그 false(Legacy): 신규 Work 라우트는 includeWorkRoutes 블록 안에서만 등록되고 Legacy는 false로 호출', () => {
  const workBlock = stackSection.slice(stackSection.indexOf('{includeWorkRoutes &&'));
  const workScreens = parseScreens(workBlock);
  assert.deepEqual(
    workScreens.map(screen => screen.name),
    ['ROUTES.WORK_FINANCIAL_ONBOARDING', 'ROUTES.WORK_FINANCIAL_ONBOARDING_RESULT']
  );
  assert.equal(
    squash(stackSection).split('includeWorkRoutes &&').length - 1,
    2,
    '각 신규 Screen이 플래그로 감싸짐'
  );

  // Legacy는 includeWorkRoutes를 넘기지 않음(기본 false)
  assert.match(
    squash(legacySection),
    /return renderMainStack\(\{ initialRouteName: gateStatus === 'incomplete' \? ROUTES\.FINANCIAL_ONBOARDING : ROUTES\.HOME, \}\);/
  );
  assert.doesNotMatch(legacySection, /includeWorkRoutes|WORK_FINANCIAL/);
  assert.match(stackSection, /includeWorkRoutes = false/);
});

test('플래그 false(Legacy): 기존 로컬 온보딩 게이트(초기 진입 경로) 보존', () => {
  const flat = squash(legacySection);
  assert.match(flat, /const userId = useSelector\(state => state\.auth\.user\?\.userId\);/);
  assert.match(flat, /const \[gateStatus, setGateStatus\] = useState\('checking'\);/);
  assert.match(flat, /if \(!userId\) return;/);
  assert.match(flat, /getOnboardingRepository\(userId\) \.loadResult\(\)/);
  assert.match(flat, /setGateStatus\(result \? 'complete' : 'incomplete'\)/);
  assert.match(flat, /if \(gateStatus === 'checking'\) \{ return <SplashLoadingScreen \/>; \}/);
  assert.match(flat, /\}, \[userId\]\);/);
});

// ── 롤아웃 상태 (플래그 값 단정은 이 테스트 한 곳에서만 한다) ──
// 6-4: 서버 온보딩 활성화(true). 롤백하려면 설정 값을 false로 되돌리고 이 기대값만 함께 바꾼다.
// 아래 Legacy 구조 회귀 테스트들은 값과 무관하게 항상 유효해야 한다.
const EXPECTED_ROLLOUT_FLAG = true;

test('롤아웃 상태: WORK_ONBOARDING_ENABLED 값과 설정 파일 본문이 기대값과 일치', () => {
  assert.equal(config.WORK_ONBOARDING_ENABLED, EXPECTED_ROLLOUT_FLAG);
  assert.equal(
    stripComments(readSource('src/features/onboarding/workOnboardingConfig.js')).trim(),
    `export const WORK_ONBOARDING_ENABLED = ${EXPECTED_ROLLOUT_FLAG};`
  );
});

test('롤아웃 상태: 활성화(true)일 때 Work 경로의 동작 값 (Home 안내·Category 진입·안내 Hook)', () => {
  const flag = config.WORK_ONBOARDING_ENABLED;
  assert.equal(
    resolveHomeMoneyTypeView({ flagEnabled: flag }).kind,
    flag ? 'server_guide' : 'legacy_local'
  );
  assert.equal(
    resolveFinancialOnboardingEntry({ flagEnabled: flag }).kind,
    flag ? 'server_result' : 'legacy_local'
  );
  assert.equal(
    resolveNoticeSettings({ mode: 'initial', flagEnabled: flag, evidenceAvailable: true }).enabled,
    flag
  );
  // 활성화 상태에서 Legacy 로직은 명시적 false 인자로 계속 검증된다
  assert.deepEqual(resolveHomeMoneyTypeView({ flagEnabled: false }), { kind: 'legacy_local' });
  assert.deepEqual(resolveFinancialOnboardingEntry({ flagEnabled: false }), {
    kind: 'legacy_local',
  });
  assert.equal(
    resolveNoticeSettings({ mode: 'initial', flagEnabled: false, evidenceAvailable: true }).enabled,
    false
  );
});

test('Legacy 경로 보존(값 무관): MainNavigator는 컴포넌트 선택만 분기하고 서버 Gate는 Work 경로에서만 도달', () => {
  assert.equal(typeof config.WORK_ONBOARDING_ENABLED, 'boolean');
  assert.equal(
    squash(mainSource.slice(mainSource.indexOf('const MainNavigator = '))),
    'const MainNavigator = () => WORK_ONBOARDING_ENABLED ? <WorkMainNavigator /> : <LegacyMainNavigator />; export default MainNavigator;'
  );
  // 서버 Gate 관련 요소는 WorkMainNavigator 이하(플래그 true 경로)에서만 쓰인다
  // (renderMainStack의 신규 Screen은 includeWorkRoutes=false에서 등록되지 않으며, Gate 경계·Host는 Work 경로에서만 참조)
  const outsideWork = mainSource.slice(
    0,
    mainSource.indexOf('const IncompleteOnboardingStackHost')
  );
  assert.doesNotMatch(
    outsideWork.replace(/^import[\s\S]*?;\n/gm, ''), // import 구문 제외
    /OnboardingGateBoundary|IncompleteOnboardingStackHost|startGateEvidence\(/
  );
  assert.ok(legacySection.length > 0 && !/WorkOnboarding/.test(legacySection));
  assert.doesNotMatch(
    mainSource,
    /useOnboardingGate\(/,
    'API-34 Gate Hook은 경계 컴포넌트 안에서만 호출'
  );
  assert.equal((mainSource.match(/<OnboardingGateBoundary/g) ?? []).length, 1);
  assert.equal((mainSource.match(/<WorkMainNavigator/g) ?? []).length, 1);
  assert.equal((mainSource.match(/<IncompleteOnboardingStackHost/g) ?? []).length, 1);
  assert.ok(workSection.includes('<OnboardingGateBoundary'));
});

test('신규 API-34 자동 호출 경로 미도달: 연결 모듈 import와 로직 실행 중 네트워크 요청 없음', async () => {
  const before = outbound.length;
  await import('../../src/features/onboarding/useOnboardingGate.js');
  await import('../../src/navigation/OnboardingGateBoundary.js').catch(() => null); // JSX라 Node에서는 import 불가(무시)
  const registry = createEvidenceRegistry();
  startGateEvidence({ registry, userId: UID_A })();
  createQuestionCallbacks({ dispatch() {} });
  createResultCallbacks({ dispatch() {} });
  resolveFinancialOnboardingEntry({ flagEnabled: false });
  assert.equal(outbound.length, before, '요청 0건');
});

// ── 2. 라우트 등록 ───────────────────────────────────────────

test('신규 라우트: routes.js 값이 6-1 임시 상수와 일치하고 기존 라우트는 삭제되지 않음', () => {
  assert.equal(ROUTES.WORK_FINANCIAL_ONBOARDING, WORK_ONBOARDING_ROUTES.ONBOARDING);
  assert.equal(ROUTES.WORK_FINANCIAL_ONBOARDING_RESULT, WORK_ONBOARDING_ROUTES.RESULT);
  assert.equal(ROUTES.WORK_FINANCIAL_ONBOARDING, 'WorkFinancialOnboarding');
  assert.equal(ROUTES.WORK_FINANCIAL_ONBOARDING_RESULT, 'WorkFinancialOnboardingResult');
  for (const key of [
    'FINANCIAL_ONBOARDING',
    'FINANCIAL_ONBOARDING_RESULT',
    'PIN_INPUT',
    'APP_LOCK_PIN',
    'LOGIN',
  ]) {
    assert.ok(key in ROUTES, key);
  }
  const values = Object.values(ROUTES);
  assert.equal(new Set(values).size, values.length, '라우트 값 중복 없음');
});

test('Work 경로 Stack: 신규 라우트 옵션(질문 gestureEnabled:false), 모든 Screen name이 ROUTES.*', () => {
  const workBlock = stackSection.slice(stackSection.indexOf('{includeWorkRoutes &&'));
  const flat = squash(workBlock);
  assert.match(
    flat,
    /name=\{ROUTES\.WORK_FINANCIAL_ONBOARDING\} component=\{WorkOnboardingQuestionRoute\} options=\{getQuestionRouteOptions\(\)\} initialParams=\{onboardingInitialParams\}/
  );
  assert.match(
    flat,
    /name=\{ROUTES\.WORK_FINANCIAL_ONBOARDING_RESULT\} component=\{WorkOnboardingResultRoute\} options=\{getResultRouteOptions\(\)\}/
  );
  assert.deepEqual(getQuestionRouteOptions(), { headerShown: false, gestureEnabled: false });
  assert.deepEqual(getResultRouteOptions(), { headerShown: false });

  // appLockNavigation 테스트가 파싱하는 형태: 모든 Screen name이 ROUTES.* 표현식
  const allNames = [...mainSource.matchAll(/<(?:\w+)\.Screen[\s\S]*?name=\{([^}]+)\}/g)].map(m =>
    m[1].trim()
  );
  assert.ok(allNames.length >= 19);
  for (const name of allNames) {
    assert.match(name, /^ROUTES\.\w+$/);
    assert.ok(name.replace('ROUTES.', '') in ROUTES, name);
  }
  assert.ok(allNames.includes('ROUTES.PIN_INPUT'));
  assert.equal(allNames.includes('ROUTES.APP_LOCK_PIN'), false);
});

test('어떤 Stack.Screen에도 serverStatus 고정 initialParams가 없음 (근거 상속 방지)', () => {
  assert.doesNotMatch(mainSource, /serverStatus/);
  assert.doesNotMatch(squash(mainSource), /initialParams=\{\{[^}]*(serverStatus|incomplete)/);
  // initialParams는 변수로만 전달(Host가 토큰 준비 후 구성)
  const initialParamsUses = [...squash(mainSource).matchAll(/initialParams=\{([^}]*\}?)\}/g)].map(
    m => m[1]
  );
  assert.deepEqual(initialParamsUses, ['onboardingInitialParams']);
  assert.match(
    squash(hostSection),
    /onboardingInitialParams: \{ mode: 'initial', gateEvidence: issued\.token \}/
  );
});

// ── 3. React Hook 안전성 ─────────────────────────────────────

const hookLines = section => section.split('\n').filter(line => /\buse[A-Z]\w*\(/.test(line));

test('Hook 호출 규칙: 각 컴포넌트의 Hook은 최상위에서만 호출되고 MainNavigator 자체에는 Hook이 없음', () => {
  for (const [name, section] of [
    ['LegacyMainNavigator', legacySection],
    ['IncompleteOnboardingStackHost', hostSection],
    ['WorkMainNavigator', workSection],
  ]) {
    const lines = hookLines(section);
    assert.ok(lines.length > 0, name);
    for (const line of lines) {
      assert.match(
        line,
        /^ {2}(const .+ = )?use\w+\(/,
        `${name}: 최상위가 아닌 Hook 호출: ${line.trim()}`
      );
    }
  }
  // Hook 호출 이전에 조건문/조기 return/삼항이 없다 (본문 앞부분 = 마지막 Hook 호출 줄까지)
  for (const section of [legacySection, hostSection, workSection]) {
    const lines = section.split('\n');
    const lastHook = lines
      .map((l, i) => (/\buse[A-Z]\w*\(/.test(l) && /^ {2}/.test(l) ? i : -1))
      .reduce((a, b) => Math.max(a, b), -1);
    const effectCallbacks = lines.slice(0, lastHook + 1).join('\n');
    // useEffect 콜백 내부의 if/return은 허용 → 최상위 들여쓰기(2칸) 조건문만 검사
    assert.doesNotMatch(effectCallbacks, /^ {2}(if|for|while)\b|^ {2}return\b/m);
  }
  const mainComponent = mainSource.slice(mainSource.indexOf('const MainNavigator = '));
  assert.doesNotMatch(mainComponent, /\buse[A-Z]\w*\(/);
  // renderMainStack / renderWorkMain 은 Hook 없는 일반 함수
  assert.doesNotMatch(stackSection, /\buse[A-Z]\w*\(/);
  assert.doesNotMatch(renderWorkMainSection, /\buse[A-Z]\w*\(/);
});

// ── 4. WorkMainNavigator 배선 / 로그아웃 / Auth 보호 ────────

test('WorkMainNavigator 배선: Boundary(userId, onLogout=logoutUser().unwrap(), renderMain), Auth 코드는 import만', () => {
  const flat = squash(workSection);
  assert.match(
    flat,
    /const handleLogout = useCallback\(\(\) => dispatch\(logoutUser\(\)\)\.unwrap\(\), \[dispatch\]\);/
  );
  assert.match(
    flat,
    /<OnboardingGateBoundary userId=\{userId\} onLogout=\{handleLogout\} renderMain=\{renderMain\} \/>/
  );
  assert.match(mainSource, /import \{ logoutUser \} from '\.\.\/features\/auth\/authApi';/);
  // 새 로그아웃 로직을 만들지 않는다
  assert.doesNotMatch(mainSource, /clearTokens|tokenService|runGuardedLogout|AsyncStorage/);
  // renderMain은 순수 함수로 Host를 요소로만 반환
  const flatRender = squash(renderWorkMainSection);
  assert.match(
    flatRender,
    /initialRouteName === ROUTES\.WORK_FINANCIAL_ONBOARDING \? \( <IncompleteOnboardingStackHost userId=\{userId\} \/> \) : \( renderMainStack\(\{ initialRouteName, includeWorkRoutes: true \}\) \)/
  );
});

test('Auth/PIN/로그아웃/기존 온보딩 파일은 HEAD 대비 변경 없음 (git diff)', () => {
  const files = [
    'src/navigation/RootNavigator.js',
    'src/navigation/AuthNavigator.js',
    'src/features/auth/authApi.js',
    'src/features/auth/authSlice.js',
    'src/features/auth/authStorage.js',
    'src/features/auth/guardedLogout.js',
    'src/services/tokenService.js',
    'src/services/apiClient.js',
    'src/screens/auth/PinInputScreen.js',
    'src/screens/profile/ProfileScreen.js',
    'src/screens/onboarding/FinancialOnboardingScreen.js',
    'src/screens/onboarding/FinancialOnboardingResultScreen.js',
    'src/features/onboarding/useOnboardingFlow.js',
    'src/features/onboarding/onboardingRepository.js',
    'src/features/onboarding/adapters/localUserOnboardingRepository.js',
  ];
  let changed;
  try {
    changed = execFileSync('git', ['diff', '--name-only', '--', ...files], {
      cwd: new URL('../../', import.meta.url),
      encoding: 'utf8',
    }).trim();
  } catch {
    return; // git을 쓸 수 없는 환경에서는 건너뜀
  }
  assert.equal(changed, '', `수정되면 안 되는 파일이 변경됨:\n${changed}`);
});

// ── 5. 서버 미완료 근거 토큰 (렌더 중 전역 변경 금지, 커밋 후 Effect) ──

test('토큰 수명주기 [정적]: issue/revoke/consume은 Effect 안(또는 startGateEvidence)에서만 호출', () => {
  // MainNavigator: 레지스트리 변경은 Host의 useEffect → startGateEvidence 한 곳
  assert.doesNotMatch(mainSource, /gateEvidenceRegistry\.(issue|revoke|consume)\(/);
  assert.doesNotMatch(mainSource, /\.(issue|revoke|consume)\(/);
  const hostFlat = squash(hostSection);
  assert.match(
    hostFlat,
    /useEffect\( \(\) => startGateEvidence\(\{ registry: gateEvidenceRegistry, userId, onIssued: token => setIssued\(\{ userId, token \}\), \}\), \[userId\] \);/
  );
  // 렌더 경로(renderMainStack / renderWorkMain / WorkMainNavigator / Legacy)에는 레지스트리 접근 자체가 없다
  for (const section of [stackSection, renderWorkMainSection, workSection, legacySection]) {
    assert.doesNotMatch(section, /gateEvidenceRegistry|startGateEvidence|createGateCycleId/);
  }
  // 질문 라우트: 읽기는 lazy useState, 소비는 useEffect
  const routes = stripComments(readSource('src/navigation/WorkOnboardingRouteScreens.js'));
  const flatRoutes = squash(routes);
  assert.match(
    flatRoutes,
    /const \[evidence\] = useState\(\(\) => \(\{ userId, available: gateEvidenceRegistry\.isAvailable\(evidenceToken, userId\), \}\)\);/
  );
  assert.match(
    flatRoutes,
    /useEffect\(\(\) => \{ gateEvidenceRegistry\.consume\(evidenceToken\); \}, \[evidenceToken\]\);/
  );
  assert.equal(
    (routes.match(/gateEvidenceRegistry\.(issue|revoke)\(/g) ?? []).length,
    0,
    '래퍼는 발급/철회하지 않음'
  );
  assert.equal((routes.match(/gateEvidenceRegistry\.consume\(/g) ?? []).length, 1);
  // 로직 모듈의 변경 호출은 startGateEvidence 안뿐
  const logicSource = stripComments(readSource('src/navigation/workOnboardingRouteLogic.js'));
  const startFn = sliceBetween(logicSource, 'export const startGateEvidence', 'export const');
  assert.match(startFn, /registry\.issue\(userId\)/);
  assert.match(startFn, /registry\.revoke\(token\)/);
  assert.equal((logicSource.match(/registry\.issue\(/g) ?? []).length, 1);
});

test('Host: 토큰 준비 전에는 질문 Stack을 마운트하지 않고(스플래시), deps는 [userId]뿐 (리렌더로 재발급 없음)', () => {
  const flat = squash(hostSection);
  assert.match(flat, /const \[issued, setIssued\] = useState\(null\);/);
  assert.match(
    flat,
    /if \(!issued \|\| issued\.userId !== userId\) \{ return <SplashLoadingScreen \/>; \}/
  );
  const guardIndex = hostSection.indexOf('return <SplashLoadingScreen />');
  const stackIndex = hostSection.indexOf('renderMainStack(');
  assert.ok(guardIndex > 0 && stackIndex > guardIndex, '가드가 Stack 렌더보다 앞');
  assert.match(flat, /\), \[userId\] \);/);
  assert.equal((hostSection.match(/useEffect\(/g) ?? []).length, 1);
});

test('토큰 [순수]: 렌더 재실행(읽기 N회)·중단된 렌더는 발급/소비하지 않음', () => {
  const registry = createEvidenceRegistry();
  const token = startGateEvidence({ registry, userId: UID_A, onIssued() {} }) && null;
  void token;
  const fresh = createEvidenceRegistry();
  // 렌더에서는 읽기만: 토큰이 없을 때 N회 읽어도 아무것도 생기지 않는다
  for (let i = 0; i < 10; i += 1) {
    assert.equal(fresh.isAvailable('anything', UID_A), false);
    assert.equal(fresh.isAvailable(undefined, UID_A), false);
    assert.equal(isEvidenceUsable({ userId: UID_A, available: false }, UID_A), false);
  }
  const issued = fresh.issue(UID_A);
  for (let i = 0; i < 10; i += 1)
    assert.equal(fresh.isAvailable(issued, UID_A), true, '읽기는 소비하지 않음');
  assert.equal(fresh.issue(UID_B) !== issued, true);
});

test('토큰 [순수]: 최초 Gate incomplete 진입은 available, effect 소비 후 같은 토큰 재사용 불가 (멱등)', () => {
  const registry = createEvidenceRegistry();
  const seen = [];
  const cleanup = startGateEvidence({ registry, userId: UID_A, onIssued: t => seen.push(t) });
  assert.equal(seen.length, 1);
  const [token] = seen;
  assert.equal(registry.isAvailable(token, UID_A), true);

  // 마운트 시 한 번 읽은 값(= 안내 판단)은 유지된다
  const readAtMount = registry.isAvailable(token, UID_A);
  registry.consume(token);
  registry.consume(token); // 멱등
  assert.equal(readAtMount, true);
  assert.equal(registry.isAvailable(token, UID_A), false, '소비 후 무효');
  assert.equal(
    resolveNoticeSettings({
      mode: 'initial',
      flagEnabled: true,
      evidenceAvailable: registry.isAvailable(token, UID_A),
    }).enabled,
    false
  );
  cleanup();
  assert.equal(registry.isAvailable(token, UID_A), false);
});

test('토큰 [순수]: StrictMode(issue→revoke→issue)에서 첫 토큰은 무효, 마지막 토큰만 유효, 활성 토큰은 1개', () => {
  const registry = createEvidenceRegistry();
  const issued = [];
  const onIssued = token => issued.push(token);

  const cleanup1 = startGateEvidence({ registry, userId: UID_A, onIssued }); // setup
  cleanup1(); // StrictMode cleanup
  const cleanup2 = startGateEvidence({ registry, userId: UID_A, onIssued }); // setup again

  assert.equal(issued.length, 2);
  assert.notEqual(issued[0], issued[1]);
  assert.equal(registry.isAvailable(issued[0], UID_A), false, '첫 토큰 무효');
  assert.equal(registry.isAvailable(issued[1], UID_A), true, '마지막 토큰 유효');

  // cleanup 없이 연속 발급해도 이전 토큰은 즉시 무효(동시에 유효한 최초 진입 토큰 중복 없음)
  const third = registry.issue(UID_A);
  assert.equal(registry.isAvailable(issued[1], UID_A), false);
  assert.equal(registry.isAvailable(third, UID_A), true);
  // 이미 교체된 토큰의 revoke는 현재 토큰에 영향 없음(멱등)
  cleanup2();
  assert.equal(registry.isAvailable(third, UID_A), true);
});

test('토큰 [순수]: 사용자 A→B 전환·언마운트 시 이전 토큰 무효, 다른 사용자 토큰은 사용 불가', () => {
  const registry = createEvidenceRegistry();
  const tokens = {};
  const cleanupA = startGateEvidence({ registry, userId: UID_A, onIssued: t => (tokens.A = t) });
  assert.equal(registry.isAvailable(tokens.A, UID_A), true);

  cleanupA(); // userId 변경 → effect cleanup
  assert.equal(registry.isAvailable(tokens.A, UID_A), false, '이전 사용자 토큰 무효');
  const cleanupB = startGateEvidence({ registry, userId: UID_B, onIssued: t => (tokens.B = t) });
  assert.equal(registry.isAvailable(tokens.B, UID_B), true);
  assert.equal(registry.isAvailable(tokens.A, UID_B), false, 'A 토큰은 B에게 무효');
  assert.equal(registry.isAvailable(tokens.B, UID_A), false, 'B 토큰은 A에게 무효');

  cleanupB(); // 언마운트
  assert.equal(registry.isAvailable(tokens.B, UID_B), false);

  // 잘못된 사용자 ID는 발급하지 않고 no-op cleanup
  for (const bad of [undefined, null, '', 123]) {
    let called = false;
    const noop = startGateEvidence({ registry, userId: bad, onIssued: () => (called = true) });
    assert.equal(called, false);
    assert.doesNotThrow(noop);
  }
});

test('토큰 + 안내 판단: 근거가 있는 최초 진입만 활성, 근거 없는 재진입(onStart·retake·직접 navigate)은 비활성', () => {
  const registry = createEvidenceRegistry();
  let token;
  startGateEvidence({ registry, userId: UID_A, onIssued: t => (token = t) });

  const settingsFor = (mode, params, userId = UID_A) =>
    resolveNoticeSettings({
      mode,
      flagEnabled: true,
      evidenceAvailable: isEvidenceUsable(
        { userId, available: registry.isAvailable(params?.gateEvidence, userId) },
        userId
      ),
    });

  assert.equal(
    settingsFor('initial', { mode: 'initial', gateEvidence: token }).enabled,
    true,
    'Gate incomplete 최초 진입'
  );
  registry.consume(token); // 첫 마운트 effect
  assert.equal(
    settingsFor('initial', { mode: 'initial', gateEvidence: token }).enabled,
    false,
    '소비 후 재진입'
  );
  assert.equal(settingsFor('initial', { mode: 'initial' }).enabled, false, '근거 없는 진입');
  assert.equal(
    settingsFor('initial', { mode: 'initial', gateEvidence: undefined }).enabled,
    false,
    'onStart'
  );
  assert.equal(settingsFor('retake', { mode: 'retake' }).enabled, false, 'retake');
  assert.equal(settingsFor('initial', { gateEvidence: 'forged|1' }).enabled, false, '위조 토큰');
});

test('토큰 상속 [StackRouter]: initialParams가 navigate params와 병합돼도 소비된 근거는 무효, onStart/onRetake는 덮어씀', () => {
  const registry = createEvidenceRegistry();
  let token;
  startGateEvidence({ registry, userId: UID_A, onIssued: t => (token = t) });

  const routeNames = [
    ROUTES.HOME,
    ROUTES.WORK_FINANCIAL_ONBOARDING,
    ROUTES.WORK_FINANCIAL_ONBOARDING_RESULT,
  ];
  const routeParamList = {
    [ROUTES.WORK_FINANCIAL_ONBOARDING]: { mode: 'initial', gateEvidence: token },
  };
  const options = { routeNames, routeParamList, routeGetIdList: {} };
  const router = StackRouter({ initialRouteName: ROUTES.WORK_FINANCIAL_ONBOARDING });
  const initial = router.getInitialState(options);

  // 첫 진입: 질문 라우트가 initialParams의 토큰을 가진다
  assert.equal(initial.routes[0].name, ROUTES.WORK_FINANCIAL_ONBOARDING);
  assert.equal(initial.routes[0].params.gateEvidence, token);
  assert.equal(registry.isAvailable(initial.routes[0].params.gateEvidence, UID_A), true);
  registry.consume(token); // 첫 마운트 effect

  // 제출 완료 후 reset → 이후 결과 화면 onStart로 질문 라우트에 다시 진입
  // reset 결과는 부분 상태라 실제 컨테이너처럼 rehydrate 후 다음 액션을 처리한다
  const afterReset = router.getRehydratedState(
    router.getStateForAction(initial, buildCompletionResetAction(), options),
    options
  );
  assert.deepEqual(
    afterReset.routes.map(r => r.name),
    [ROUTES.HOME, ROUTES.WORK_FINANCIAL_ONBOARDING_RESULT]
  );

  const callbacks = createResultCallbacks({
    dispatch: action => {
      const next = router.getStateForAction(afterReset, action, options);
      callbacks.last = next;
    },
  });
  callbacks.onStart();
  const entered = callbacks.last.routes.at(-1);
  assert.equal(entered.name, ROUTES.WORK_FINANCIAL_ONBOARDING);
  assert.equal(entered.params.mode, 'initial');
  assert.equal(
    entered.params.gateEvidence,
    undefined,
    'onStart는 상속된 initialParams 근거를 덮어씀'
  );
  assert.equal(registry.isAvailable(entered.params.gateEvidence, UID_A), false);

  // 덮어쓰기가 없는 직접 navigate는 병합으로 토큰이 상속되지만 이미 소비되어 무효
  const inherited = router.getStateForAction(
    afterReset,
    {
      type: 'NAVIGATE',
      payload: { name: ROUTES.WORK_FINANCIAL_ONBOARDING, params: { mode: 'initial' } },
    },
    options
  );
  const inheritedToken = inherited.routes.at(-1).params.gateEvidence;
  assert.equal(inheritedToken, token, '병합으로 상속됨(React Navigation 동작)');
  assert.equal(registry.isAvailable(inheritedToken, UID_A), false, '소비된 근거라 무효');
  assert.equal(
    resolveNoticeSettings({
      mode: 'initial',
      flagEnabled: true,
      evidenceAvailable: registry.isAvailable(inheritedToken, UID_A),
    }).enabled,
    false
  );
});

// ── 6. 제출 완료 후 이동 ─────────────────────────────────────

test('제출 완료 → HOME + WORK_RESULT 이동: 질문 라우트 제거, Gate의 이전 incomplete로 되돌아가지 않음, reset 중복 없음', () => {
  const routeNames = [
    ROUTES.HOME,
    ROUTES.WORK_FINANCIAL_ONBOARDING,
    ROUTES.WORK_FINANCIAL_ONBOARDING_RESULT,
  ];
  const options = { routeNames, routeParamList: {}, routeGetIdList: {} };
  const router = StackRouter({ initialRouteName: ROUTES.WORK_FINANCIAL_ONBOARDING });
  let state = router.getInitialState(options);
  assert.deepEqual(
    state.routes.map(r => r.name),
    [ROUTES.WORK_FINANCIAL_ONBOARDING]
  );

  const dispatched = [];
  const { onComplete } = createQuestionCallbacks({
    dispatch: action => {
      dispatched.push(action);
      state = router.getStateForAction(state, action, options);
    },
  });
  assert.equal(onComplete(), true);
  assert.equal(onComplete(), false);
  assert.equal(onComplete(), false);
  assert.equal(dispatched.length, 1, 'navigation.reset은 1회');

  assert.deepEqual(
    state.routes.map(r => r.name),
    [ROUTES.HOME, ROUTES.WORK_FINANCIAL_ONBOARDING_RESULT]
  );
  assert.equal(state.index, 1);
  assert.equal(
    state.routes.some(r => r.name === ROUTES.WORK_FINANCIAL_ONBOARDING),
    false
  );

  // Gate가 여전히 incomplete(경계 재렌더로 같은 initialRouteName 유지)여도 기존 상태에서 routes가 다시 계산되지 않는다
  const unchanged = router.getStateForRouteNamesChange(state, {
    routeNames,
    routeParamList: {},
    routeGetIdList: {},
    routeKeyChanges: [],
  });
  assert.deepEqual(
    unchanged.routes.map(r => r.name),
    [ROUTES.HOME, ROUTES.WORK_FINANCIAL_ONBOARDING_RESULT]
  );

  // 결과 화면에서 뒤로 가면 홈, 결과의 홈 이동은 HOME 하나로 reset
  const back = router.getStateForAction(state, { type: 'GO_BACK' }, options);
  assert.equal(back.routes.at(-1).name, ROUTES.HOME);
});

test('저장 여부가 불확실하면 완료 이동 없음: onComplete는 서버 저장 확인 후에만 호출되는 구조(4단계 화면)', () => {
  const screen = stripComments(
    readSource('src/screens/onboarding/WorkFinancialOnboardingScreen.js')
  );
  const flat = squash(screen);
  // 성공(completed) + Draft 정리 성공일 때만 즉시 notify, 그 외 notify는 completed 패널의 "계속"/뒤로가기뿐
  assert.match(
    flat,
    /result\.state === SUBMIT_STATE\.COMPLETED && result\.draftCleanup === 'cleared'\) \{ notifyCompletion\(result\);/
  );
  assert.doesNotMatch(
    screen.slice(screen.indexOf('SAVE_UNCONFIRMED')),
    /notifierRef\.current\?\.notify\(result\)/
  );
});

// ── 7. Home / Category ───────────────────────────────────────

test('진입 정책: 플래그 false → legacy_local(기존 로직), true → 서버 결과 화면 (서버 상태 추정 없음)', () => {
  assert.deepEqual(resolveFinancialOnboardingEntry({ flagEnabled: false }), {
    kind: 'legacy_local',
  });
  assert.deepEqual(resolveFinancialOnboardingEntry({}), { kind: 'legacy_local' });
  assert.deepEqual(resolveFinancialOnboardingEntry(), { kind: 'legacy_local' });
  assert.deepEqual(resolveFinancialOnboardingEntry({ flagEnabled: 'true' }), {
    kind: 'legacy_local',
  });
  assert.deepEqual(resolveFinancialOnboardingEntry({ flagEnabled: true }), {
    kind: 'server_result',
    action: buildOpenResultAction(),
  });
  // 질문 화면으로 직접 이동하지 않는다(시작/재검사는 결과 화면이 조회 결과로 결정)
  assert.equal(
    resolveFinancialOnboardingEntry({ flagEnabled: true }).action.payload.name,
    ROUTES.WORK_FINANCIAL_ONBOARDING_RESULT
  );
});

test('CategoryScreen: 플래그 on에서만 서버 결과로 이동하고 로컬 Draft/결과 접근 전에 반환, off는 기존 로직 보존', () => {
  const source = stripComments(readSource('src/screens/category/CategoryScreen.js'));
  const handler = sliceBetween(
    source,
    'const handleFinancialOnboardingPress',
    'const handleItemPress'
  );
  const flat = squash(handler);
  assert.match(
    flat,
    /const entry = resolveFinancialOnboardingEntry\(\{ flagEnabled: WORK_ONBOARDING_ENABLED \}\); if \(entry\.kind === 'server_result'\) \{ navigation\.dispatch\(entry\.action\); return; \}/
  );
  // 서버 분기가 로컬 저장소 접근보다 앞에 있다
  assert.ok(
    handler.indexOf("entry.kind === 'server_result'") < handler.indexOf('getOnboardingRepository(')
  );
  // 기존 로컬 로직 보존
  assert.match(flat, /const repository = getOnboardingRepository\(user\?\.userId \?\? 'guest'\);/);
  assert.match(flat, /Promise\.all\(\[repository\.loadDraft\(\), repository\.loadResult\(\)\]\)/);
  assert.match(flat, /navigation\.navigate\(ROUTES\.FINANCIAL_ONBOARDING, \{ mode: draft\.mode,/);
  assert.match(flat, /navigation\.navigate\(ROUTES\.FINANCIAL_ONBOARDING_RESULT\)/);
});

test('HomeScreen: 플래그 on에서 로컬 머니 타입을 읽지 않고 중립 안내 + 신규 결과 이동, off는 기존 동작 보존', () => {
  const source = stripComments(readSource('src/screens/home/HomeScreen.js'));
  const flat = squash(source);
  // 로컬 읽기 effect: 플래그 on이면 읽기 전에 종료(Hook 순서는 그대로)
  assert.match(
    flat,
    /useEffect\(\(\) => \{ if \(WORK_ONBOARDING_ENABLED\) return undefined; let cancelled = false; const loadMoneyType = async \(\) => \{ try \{ const result = await repository\.loadResult\(\);/
  );
  assert.match(
    flat,
    /const repository = useMemo\(\(\) => getOnboardingRepository\(userId \?\? 'guest'\), \[userId\]\);/,
    '기존 Hook 유지'
  );
  assert.match(
    flat,
    /const moneyTypeView = resolveHomeMoneyTypeView\(\{ flagEnabled: WORK_ONBOARDING_ENABLED \}\);/
  );
  assert.match(
    flat,
    /navigation\.navigate\( WORK_ONBOARDING_ENABLED \? ROUTES\.WORK_FINANCIAL_ONBOARDING_RESULT : ROUTES\.FINANCIAL_ONBOARDING_RESULT \)/
  );
  // 서버 안내 분기에서는 로컬 프로필을 전달하지 않는다
  const guideBlock = sliceBetween(
    source,
    "if (moneyTypeView.kind === 'server_guide')",
    'return (\n          <HomeMoneyTypeTab'
  );
  assert.doesNotMatch(guideBlock, /moneyTypeProfile|profile/);
  assert.match(
    squash(guideBlock),
    /<HomeFutureProfileGuide title=\{moneyTypeView\.title\} message=\{moneyTypeView\.message\} ctaLabel=\{moneyTypeView\.ctaLabel\} onPress=\{handleServerGuidePress\} \/>/
  );
  // 기존 탭 렌더(legacy)는 그대로
  assert.match(
    flat,
    /<HomeMoneyTypeTab profile=\{moneyTypeProfile\} onDetailPress=\{handleFutureProfilePress\} \/>/
  );
  assert.match(
    flat,
    /setMoneyTypeProfile\(buildFinancialOnboardingResultViewModel\(result\.answers\)\.profile\)/
  );
});

test('Home 안내 컴포넌트: 로컬 계산 필드(profile/tags)를 받지 않고 중립 문구·동작만 사용', () => {
  const source = stripComments(readSource('src/components/home/HomeFutureProfileGuide.js'));
  assert.match(
    source,
    /export default function HomeFutureProfileGuide\(\{ title, message, ctaLabel, onPress \}\)/
  );
  assert.doesNotMatch(
    source,
    /profile|tags|description|buildFinancialOnboardingResultViewModel|onboardingRepository|AsyncStorage/
  );

  const off = resolveHomeMoneyTypeView({ flagEnabled: false });
  assert.deepEqual(off, { kind: 'legacy_local' });
  const on = resolveHomeMoneyTypeView({ flagEnabled: true, localProfile: { title: '로컬 타입' } });
  assert.equal(on.kind, 'server_guide');
  assert.doesNotMatch(JSON.stringify(on), /로컬 타입|점수/);
  assert.deepEqual(on.action, buildOpenResultAction());
});

// ── 8. 기존 데이터·네트워크 ──────────────────────────────────

test('기존 AsyncStorage 데이터 불변: 연결 로직(레지스트리·콜백·진입 정책)은 저장소를 읽지도 쓰지도 않음', () => {
  const seeded = {
    [`@financialOnboarding:result:v1:${UID_A}`]: 'legacy-result',
    [`@financialOnboarding:draft:v1:${UID_A}`]: 'legacy-draft',
    [`@financialOnboarding:draftServer:v1:${UID_A}`]: 'server-draft',
    '@auth:autoLogin': 'true',
  };
  for (const [k, v] of Object.entries(seeded)) __store.set(k, v);
  __control.log.length = 0;

  const registry = createEvidenceRegistry();
  const cleanup = startGateEvidence({ registry, userId: UID_A });
  registry.consume(registry.issue(UID_A));
  cleanup();
  createQuestionCallbacks({ dispatch() {} }).onComplete();
  createResultCallbacks({ dispatch() {} }).onStart();
  resolveFinancialOnboardingEntry({ flagEnabled: true });
  resolveHomeMoneyTypeView({ flagEnabled: true });
  buildStartOnboardingAction();
  buildRetakeAction();

  assert.deepEqual(__control.log, [], '저장소 접근 0건');
  assert.deepEqual(Object.fromEntries(__store), seeded);
  assert.equal(outbound.length, 0, '이 테스트 전체에서 네트워크 요청 없음');
});
