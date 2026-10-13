// 미래 자금 시뮬레이션 3부(UI 연결) 정적·Mock 테스트. React 렌더러가 없어 JSX는 렌더링하지 않는다(렌더링·StrictMode 실동작은 미검증).
// 소스 문자열 정적 분석 + 세션 컨트롤러 모의(개발 모드 effect 재실행 순서)로 연결 구조만 고정한다.
// 서버 호출 없음(fetcher 주입), AsyncStorage 사용 없음.
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/simulatorUiWiring.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';

process.env.EXPO_PUBLIC_API_BASE_URL ??= 'http://127.0.0.1:1';

// 모듈 import와 시뮬레이션 중 네트워크 요청이 없는지 감시한다.
const outbound = [];
for (const mod of [http, https]) {
  const original = mod.request;
  mod.request = function spied(...args) {
    outbound.push(args[0]);
    return original.apply(this, args);
  };
}

const { ROUTES } = await import('../../src/constants/routes.js');
const { ASSET_SOURCE } = await import('../../src/features/work/simulatorApi.js');
const { SIMULATOR_STATUS, SUBMIT_REJECT, createSimulatorSession } =
  await import('../../src/features/work/simulatorScreenLogic.js');

const root = rel => new URL(`../../${rel}`, import.meta.url);
const readSource = rel => readFileSync(root(rel), 'utf8').replace(/\r\n/g, '\n');
const stripComments = source =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const code = rel => stripComments(readSource(rel));
const count = (text, pattern) => (text.match(pattern) ?? []).length;

const SCREEN = 'src/screens/work/SimulatorScreen.js';
const COMPONENTS = [
  'src/components/work/SimulatorBaselineList.js',
  'src/components/work/SimulatorInputForm.js',
  'src/components/work/SimulatorResultCard.js',
  'src/components/work/SimulatorAdjustCard.js',
];
const CATEGORY = 'src/screens/category/CategoryScreen.js';
const NAVIGATOR = 'src/navigation/MainNavigator.js';

const S = SIMULATOR_STATUS;
const UID = '123456789012345678';
const OTHER_UID = '223456789012345678';

// ── 라우트·진입점 ────────────────────────────────────────────

test('라우트: WORK_SIMULATOR가 고유 값으로 존재하고 기존 라우트는 유지', () => {
  assert.equal(ROUTES.WORK_SIMULATOR, 'WorkSimulator');
  const values = Object.values(ROUTES);
  assert.equal(values.filter(value => value === ROUTES.WORK_SIMULATOR).length, 1);
  assert.equal(ROUTES.WORK_READINESS, 'WorkReadiness');
  assert.equal(ROUTES.MONEY_RECAP, 'MoneyRecap');
});

test('Navigator: 기능 플래그 조건 밖에 상시 등록, headerShown false, 기존 등록 유지', () => {
  const navigator = code(NAVIGATOR);
  assert.match(navigator, /import SimulatorScreen from '\.\.\/screens\/work\/SimulatorScreen';/);
  assert.match(
    navigator,
    /<Stack\.Screen\s+name=\{ROUTES\.WORK_SIMULATOR\}\s+component=\{SimulatorScreen\}\s+options=\{\{ headerShown: false \}\}\s*\/>/
  );
  assert.equal(count(navigator, /ROUTES\.WORK_SIMULATOR/g), 1);
  assert.ok(
    navigator.indexOf('ROUTES.WORK_SIMULATOR') < navigator.indexOf('{includeWorkRoutes && ('),
    '플래그 조건 블록보다 앞에 등록되어야 한다'
  );
  assert.match(navigator, /name=\{ROUTES\.WORK_READINESS\}/);
  assert.match(navigator, /name=\{ROUTES\.MONEY_RECAP\}/);
});

test('Category: 사회인 준비도 바로 아래에 시뮬레이션 진입점, 기존 항목 유지', () => {
  const category = code(CATEGORY);
  const readiness = category.indexOf('routeAction: ROUTES.WORK_READINESS');
  const simulator = category.indexOf('routeAction: ROUTES.WORK_SIMULATOR');
  assert.ok(readiness > -1 && simulator > readiness);
  // 두 항목 사이에 다른 routeAction이 없다.
  assert.equal(count(category.slice(readiness, simulator), /routeAction:/g), 1);
  assert.match(category, /title: '미래 자금 시뮬레이션'/);
  assert.match(category, /routeAction: FINANCIAL_ONBOARDING_ACTION/);
  assert.match(category, /routeAction: ROUTES\.MONEY_RECAP/);
});

// ── 화면 정적 구조 ───────────────────────────────────────────

test('화면: 세션을 effect 안에서 만들고 같은 effect cleanup에서 dispose한다', () => {
  const screen = code(SCREEN);
  assert.equal(count(screen, /createSimulatorSession\(/g), 1);

  const effect = /useEffect\(\(\) => \{([\s\S]*?)\n {2}\}, \[\]\);/.exec(screen);
  assert.ok(effect, '세션 생성 effect를 찾을 수 없음');
  assert.match(effect[1], /createSimulatorSession\(/);
  assert.match(effect[1], /setSession\(created\)/);
  assert.match(effect[1], /return \(\) => created\.dispose\(\);/);

  // 폐기된 세션을 재사용하는 패턴 금지.
  assert.doesNotMatch(screen, /useState\(\s*\(\)\s*=>\s*createSimulatorSession/);
  assert.doesNotMatch(screen, /useMemo\([\s\S]{0,80}createSimulatorSession/);
  assert.doesNotMatch(screen, /useRef\([\s\S]{0,40}createSimulatorSession/);
  assert.doesNotMatch(screen, /session\.dispose\(\)/); // 세션 변수명이 아니라 created.dispose만 존재
  assert.equal(count(screen, /\.dispose\(\)/g), 1);
  // 모듈 전역 세션 없음(최상위에서 createSimulatorSession 호출 없음은 위 count==1과 effect 내 위치로 보장).
  assert.doesNotMatch(screen, /^(const|let|var) \w+ = createSimulatorSession/m);
});

test('화면: 실제 3함수 주입, useSyncExternalStore, 세션 null일 때 안정된 빈 구독', () => {
  const screen = code(SCREEN);
  assert.match(
    screen,
    /createSimulatorSession\(\{\s*fetchBaselines: fetchSimulatorBaselines,\s*runSimulation,\s*runAdjustment,\s*\}\)/
  );
  assert.match(screen, /from '\.\.\/\.\.\/features\/work\/simulatorApi'/);
  assert.match(screen, /useSyncExternalStore\(/);
  assert.match(screen, /const EMPTY_SUBSCRIBE = \(\) => \(\) => \{\};/);
  assert.match(screen, /const EMPTY_SNAPSHOT = \(\) => null;/);
  assert.match(screen, /session \? session\.subscribe : EMPTY_SUBSCRIBE/);
  assert.match(screen, /session \? session\.getSnapshot : EMPTY_SNAPSHOT/);
});

test('화면: setUser/loadBaselines는 세션이 있을 때만 진입 effect에서, submit*는 탭 핸들러에서만', () => {
  const screen = code(SCREEN);

  const entry =
    /useEffect\(\(\) => \{\n\s+if \(!session\) return;([\s\S]*?)\}, \[session, userId\]\);/.exec(
      screen
    );
  assert.ok(entry, '진입 effect를 찾을 수 없음');
  assert.match(entry[1], /session\.setUser\(userId\)/);
  assert.match(entry[1], /if \(userId\) session\.loadBaselines\(\)/);
  assert.doesNotMatch(entry[1], /submit/);

  assert.equal(count(screen, /submitSimulation/g), 2); // 계산하기 + 다시 계산하기
  assert.equal(count(screen, /submitAdjustment/g), 1);
  for (const line of screen.split('\n').filter(l => /session\.submit/.test(l))) {
    assert.match(line, /=> session\.submit(Simulation|Adjustment)\(\)/, line);
  }
  // 모든 effect 본문에 submit 없음.
  const effects = screen.match(/useEffect\(\(\) => \{[\s\S]*?\n {2}\}, \[[^\]]*\]\);/g) ?? [];
  assert.equal(effects.length, 2);
  for (const body of effects) assert.doesNotMatch(body, /submit/);

  // baselines 재시도는 사용자 탭(onRetry)에서만 호출된다.
  assert.equal(count(screen, /loadBaselines\(\)/g), 2); // effect 1 + onRetry 1
  assert.match(screen, /onRetry=\{\(\) => session\.loadBaselines\(\)\}/);
});

test('화면: 사용자 변경·세션 없음 프레임에서 이전 데이터를 보이지 않는다', () => {
  const screen = code(SCREEN);
  assert.match(screen, /isValidOnboardingUserId\(rawUserId\) \? rawUserId : null/);
  assert.match(screen, /!session \|\| !snapshot \|\| snapshot\.userId !== userId/);
  assert.match(screen, /title="사용자 정보를 확인할 수 없어요"/);
  assert.match(screen, /navigation\.canGoBack\(\)/);
  assert.match(screen, /navigation\.navigate\(ROUTES\.CATEGORY\)/);
  assert.match(screen, /SafeAreaView[\s\S]*from 'react-native-safe-area-context'/);
});

test('범위: 화면·컴포넌트는 타이머·난수·Number 변환·직접 통신·저장소를 쓰지 않음', () => {
  for (const rel of [SCREEN, ...COMPONENTS]) {
    const source = code(rel);
    for (const [pattern, name] of [
      [/\bsetTimeout\b|\bsetInterval\b|\bclearTimeout\b|\bclearInterval\b/, '타이머'],
      [/Math\.random|Date\.now/, '난수/시각'],
      [/\bNumber\(|\bparseInt\(|\bparseFloat\(|\bBigInt\(/, '숫자 변환'],
      [/\bfetch\(|axios|apiClient/, '직접 통신'],
      [/AsyncStorage|SecureStore|localStorage/, '저장소'],
      [/Alert\./, 'Alert'],
      [/Linking/, '링크 열기'],
      [/console\./, '콘솔 로그'],
      [/useFocusEffect|useIsFocused|addListener\('focus'/, '포커스 재조회'],
    ]) {
      assert.doesNotMatch(source, pattern, `${rel}: ${name}`);
    }
  }
});

test('컴포넌트: props만 사용(Redux·네비게이션·세션 의존 없음), 금액 산술 없음', () => {
  for (const rel of COMPONENTS) {
    const source = code(rel);
    assert.doesNotMatch(source, /react-redux|@react-navigation|useNavigation|useSelector/, rel);
    assert.doesNotMatch(source, /createSimulatorSession|simulatorApi/, rel);
    assert.doesNotMatch(source, /(?:Text|text|Amount|Savable)\w*\s*[-*/]\s*\w/, rel);
    assert.doesNotMatch(source, /\.reduce\(|\.toFixed\(|toLocaleString/, rel);
  }
  // 요청 트리거는 상위가 넘긴 콜백뿐이다.
  assert.match(code(COMPONENTS[1]), /onPress=\{onSubmit\}/);
  assert.match(code(COMPONENTS[3]), /onPress=\{onSubmit\}/);
});

// ── 세션 모의: 개발 모드 effect 재실행 ───────────────────────

const deferred = () => {
  let resolve;
  const promise = new Promise(res => {
    resolve = res;
  });
  return { promise, resolve };
};

const baselineFixture = () => ({
  key: 'living_base_monthly',
  label: '월 기본 생활비',
  amount: '700000',
  kind: 'ASSUMPTION',
  source: '모아제 가정',
  asOf: '-',
  scope: '가정값',
  url: '',
});

const simulationFixture = () => ({
  target: { deposit: '1', moveInCost: '1', emergencyFund: '1', total: '3' },
  cashflow: { income: '1', housing: '1', living: '1', leisure: '1', expense: '1', savable: '1' },
  currentAsset: '1',
  gap: '1',
  monthsToGoal: 1,
  progressRate: '0.5',
  assetSource: ASSET_SOURCE.ASSET_SERVICE,
  assumedKeys: [],
  baselines: [baselineFixture()],
  advice: [],
});

// 화면의 effect 순서를 그대로 흉내 낸다: effect1(세션 생성) → effect2(setUser + loadBaselines).
const createEnv = () => {
  const env = { baselineCalls: 0, simCalls: 0, adjCalls: 0, baselineGates: [] };
  env.create = () =>
    createSimulatorSession({
      fetchBaselines: () => {
        env.baselineCalls += 1;
        const gate = deferred();
        env.baselineGates.push(gate);
        return gate.promise;
      },
      runSimulation: async () => {
        env.simCalls += 1;
        return simulationFixture();
      },
      runAdjustment: async () => {
        env.adjCalls += 1;
        throw new Error('호출되면 안 됨');
      },
    });
  env.entryEffect = (session, userId) => {
    if (!session) return;
    session.setUser(userId);
    if (userId) session.loadBaselines();
  };
  return env;
};

const flush = () => new Promise(resolve => setImmediate(resolve));

test('StrictMode 순서(생성→폐기→재생성): 폐기된 세션은 쓰이지 않고 새 세션이 기준값을 1회 요청', async () => {
  const env = createEnv();

  const first = env.create(); // effect1 (mount)
  env.entryEffect(null, UID); // effect2: 아직 session state가 null이라 아무것도 안 한다
  first.dispose(); // simulated cleanup
  const second = env.create(); // effect1 (re-mount)
  env.entryEffect(second, UID); // 다음 렌더의 effect2

  assert.equal(env.baselineCalls, 1);
  assert.equal(env.simCalls, 0);
  assert.equal(env.adjCalls, 0);

  const rejected = await first.submitSimulation();
  assert.equal(rejected.started, false);
  assert.equal(rejected.reason, SUBMIT_REJECT.DISPOSED);
  assert.equal(second.getSnapshot().baselines.status, S.LOADING);

  second.dispose();
});

test('폐기된 세션의 늦은 API-39 응답은 새 세션 상태·리스너를 바꾸지 않는다', async () => {
  const env = createEnv();

  const first = env.create();
  env.entryEffect(first, UID); // effect2가 first로 실행된 경우
  let firstNotified = 0;
  first.subscribe(() => {
    firstNotified += 1;
  });
  first.dispose();

  const second = env.create();
  let secondNotified = 0;
  second.subscribe(() => {
    secondNotified += 1;
  });
  env.entryEffect(second, UID);
  assert.equal(env.baselineCalls, 2); // GET만 중복(지표 기록 없음), POST 없음
  const before = second.getSnapshot();
  const notifiedBefore = secondNotified;

  env.baselineGates[0].resolve([baselineFixture()]); // first의 늦은 응답
  await flush();

  assert.equal(second.getSnapshot(), before);
  assert.equal(secondNotified, notifiedBefore);
  assert.equal(firstNotified, 0);

  env.baselineGates[1].resolve([baselineFixture()]);
  await flush();
  assert.equal(second.getSnapshot().baselines.status, S.READY);
  assert.equal(second.getSnapshot().baselines.viewModel.length, 1);

  assert.equal(env.simCalls, 0);
  assert.equal(env.adjCalls, 0);
  second.dispose();
});

test('화면 이탈(dispose) 뒤 도착한 응답은 상태를 바꾸지 않는다', async () => {
  const env = createEnv();
  const session = env.create();
  env.entryEffect(session, UID);
  let notified = 0;
  session.subscribe(() => {
    notified += 1;
  });
  const before = session.getSnapshot();

  session.dispose();
  env.baselineGates[0].resolve([baselineFixture()]);
  await flush();

  assert.equal(session.getSnapshot(), before);
  assert.equal(notified, 0);
});

test('사용자 변경 시 이전 사용자 응답을 폐기하고 새 사용자로 기준값을 다시 요청', async () => {
  const env = createEnv();
  const session = env.create();
  env.entryEffect(session, UID);
  env.entryEffect(session, OTHER_UID); // userId 변경 → effect2 재실행

  assert.equal(session.getSnapshot().userId, OTHER_UID);
  assert.equal(env.baselineCalls, 2);

  env.baselineGates[0].resolve([baselineFixture()]); // 이전 사용자 응답
  await flush();
  assert.equal(session.getSnapshot().baselines.status, S.LOADING);

  env.baselineGates[1].resolve([]);
  await flush();
  assert.equal(session.getSnapshot().baselines.status, S.READY);
  assert.equal(session.getSnapshot().baselines.viewModel.length, 0);
  session.dispose();
});

test('유효하지 않은 사용자: 기준값 요청 없이 계산도 거부', async () => {
  const env = createEnv();
  const session = env.create();
  env.entryEffect(session, null);

  assert.equal(env.baselineCalls, 0);
  const result = await session.submitSimulation();
  assert.equal(result.reason, SUBMIT_REJECT.NO_USER);
  assert.equal(env.simCalls, 0);
  session.dispose();
});

test('입력 변경·구독만으로는 POST가 나가지 않고, 계산하기 탭마다 정확히 1회', async () => {
  const env = createEnv();
  const session = env.create();
  env.entryEffect(session, UID);
  const unsubscribe = session.subscribe(() => {});

  session.setField('monthlyIncome', '2,500,000');
  session.setField('deposit', '1000');
  session.setAdjustDirection('INCREASE');
  session.setAdjustAmount('100000');
  unsubscribe();
  session.subscribe(() => {}); // 재구독
  await flush();
  assert.equal(env.simCalls, 0);
  assert.equal(env.adjCalls, 0);

  const first = session.submitSimulation();
  const second = session.submitSimulation(); // 연타
  assert.equal((await second).reason, SUBMIT_REJECT.IN_FLIGHT);
  await first;
  assert.equal(env.simCalls, 1);
  assert.equal(session.getSnapshot().simulation.status, S.READY);
  session.dispose();
});

test('이 테스트와 모듈 import 중 실제 네트워크 요청은 없었다', () => {
  assert.equal(outbound.length, 0);
});

test('기준값 목록: 참고 url은 화면에 표시하지 않고 이름·금액·구분·출처는 유지', () => {
  const list = code(COMPONENTS[0]);
  assert.doesNotMatch(list, /item\.url|hasUrl/);
  for (const field of ['item.label', 'item.amountText', 'item.kindLabel', 'item.source']) {
    assert.ok(list.includes(field), field);
  }
  assert.match(list, /item\.asOf/);
  assert.match(list, /item\.scope/);
});
