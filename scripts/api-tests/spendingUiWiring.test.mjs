// 학기 소비 분석(API-42~46) UI 연결 정적·Mock 테스트. React 렌더러가 없어 JSX는 렌더링하지 않는다(렌더링·StrictMode 실동작은 미검증).
// 소스 문자열 정적 분석 + 세션 컨트롤러 모의로 연결 구조만 고정한다. 서버 호출 없음, AsyncStorage 사용 없음.
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/spendingUiWiring.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';

process.env.EXPO_PUBLIC_API_BASE_URL ??= 'http://127.0.0.1:1';

// 모듈 import 중 네트워크 요청이 없는지 감시한다.
const outbound = [];
for (const mod of [http, https]) {
  const original = mod.request;
  mod.request = function spied(...args) {
    outbound.push(args[0]);
    return original.apply(this, args);
  };
}

const { ROUTES } = await import('../../src/constants/routes.js');
const { API_ENDPOINTS } = await import('../../src/constants/apiEndpoints.js');
const logic = await import('../../src/features/work/spendingScreenLogic.js');

const root = rel => new URL(`../../${rel}`, import.meta.url);
const readSource = rel => readFileSync(root(rel), 'utf8').replace(/\r\n/g, '\n');
const stripComments = source =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const code = rel => stripComments(readSource(rel));
const count = (text, pattern) => (text.match(pattern) ?? []).length;

const SCREEN = 'src/screens/work/SpendingScreen.js';
const COMPONENT_DIR = 'src/components/work/spending';
const COMPONENTS = readdirSync(root(COMPONENT_DIR)).map(name => `${COMPONENT_DIR}/${name}`);
const CATEGORY = 'src/screens/category/CategoryScreen.js';
const NAVIGATOR = 'src/navigation/MainNavigator.js';

// ── 라우트·진입점 ────────────────────────────────────────────

test('라우트: WORK_SPENDING이 고유 값으로 존재하고 기존 라우트는 유지', () => {
  assert.equal(ROUTES.WORK_SPENDING, 'WorkSpending');
  assert.equal(Object.values(ROUTES).filter(value => value === ROUTES.WORK_SPENDING).length, 1);
  assert.equal(ROUTES.WORK_SIMULATOR, 'WorkSimulator');
  assert.equal(ROUTES.WORK_READINESS, 'WorkReadiness');
  assert.equal(ROUTES.MONEY_RECAP, 'MoneyRecap');
});

test('Navigator: 기능 플래그 조건 밖에 등록, headerShown false, 기존 등록 유지', () => {
  const navigator = code(NAVIGATOR);
  assert.match(navigator, /import SpendingScreen from '..\/screens\/work\/SpendingScreen'/);
  assert.equal(count(navigator, /name=\{ROUTES\.WORK_SPENDING\}/g), 1);
  assert.match(
    navigator,
    /name=\{ROUTES\.WORK_SPENDING\}\s+component=\{SpendingScreen\}\s+options=\{\{ headerShown: false \}\}/
  );
  const flagBlock = navigator.slice(navigator.indexOf('{includeWorkRoutes && ('));
  assert.equal(flagBlock.includes('WORK_SPENDING'), false, '플래그 조건 블록 밖');
  for (const route of ['WORK_READINESS', 'WORK_SIMULATOR', 'MONEY_RECAP', 'PIN_INPUT', 'HOME']) {
    assert.equal(count(navigator, new RegExp(`name=\\{ROUTES\\.${route}\\}`, 'g')), 1, route);
  }
});

test('CategoryScreen: 진입 항목 1개 추가, 기존 항목 유지', () => {
  const category = code(CATEGORY);
  assert.equal(count(category, /routeAction: ROUTES\.WORK_SPENDING/g), 1);
  assert.match(category, /title: '학기 소비 분석'/);
  for (const route of ['WORK_READINESS', 'WORK_SIMULATOR', 'MONEY_RECAP', 'PROFILE', 'SETTINGS']) {
    assert.equal(count(category, new RegExp(`routeAction: ROUTES\\.${route}`, 'g')), 1, route);
  }
});

test('엔드포인트: SPENDING 상수는 기존 WORK 항목을 바꾸지 않고 추가만 됨', () => {
  assert.equal(typeof API_ENDPOINTS.WORK.SPENDING.REPORT, 'function');
  assert.equal(API_ENDPOINTS.WORK.SIMULATOR_BASELINES, '/api/v1/work/simulator/baselines');
  assert.equal(API_ENDPOINTS.WORK.READINESS('1'), '/api/v1/work/readiness/1');
});

// ── 화면 구조 ────────────────────────────────────────────────

test('화면: 세션 생성·dispose를 한 effect에, 사용자 설정은 setUser, 폼·구독으로 요청 없음', () => {
  const screen = code(SCREEN);
  assert.equal(count(screen, /createSpendingSession\(/g), 1);
  assert.match(screen, /return \(\) => created\.dispose\(\)/);
  assert.match(screen, /session\.setUser\(userId\)/);
  assert.match(screen, /useSyncExternalStore/);
});

test('화면: POST(API-44)는 submitSchedule 한 곳(등록 버튼 onSubmit)에서만 호출', () => {
  const screen = code(SCREEN);
  assert.equal(count(screen, /submitSchedule\(/g), 1);
  assert.match(screen, /onSubmit=\{\(\) => session\.submitSchedule\(\)\}/);
  assert.equal(count(screen, /createAcademicSchedule/g), 2, 'import + 세션 주입뿐');
  // 화면이 API를 직접 호출하지 않는다(세션에 주입만).
  for (const call of [
    'fetchEventBuffer(',
    'fetchSpendingProfile(',
    'fetchAcademicSchedules(',
    'fetchSemesterReport(',
  ]) {
    assert.equal(screen.includes(call), false, call);
  }
});

test('화면: 자동 재조회 수단(포커스·타이머·폴링·AppState) 없음, 구간 전환·연도/학기·재시도는 사용자 이벤트', () => {
  for (const path of [SCREEN, ...COMPONENTS]) {
    const source = code(path);
    for (const forbidden of [
      'useFocusEffect',
      'addListener(',
      'setInterval',
      'setTimeout',
      'AppState',
      'NetInfo',
      'focus',
    ]) {
      assert.equal(source.includes(forbidden), false, `${path}: ${forbidden}`);
    }
  }
  const screen = code(SCREEN);
  assert.match(screen, /onPress=\{\(\) => session\.selectTab\(tab\.key\)\}/);
  assert.match(screen, /onRetry: \(\) => session\.retry\(key\)/);
});

test('화면·컴포넌트: Gateway URL·토큰·fetch/axios·AsyncStorage·Mock 데이터를 직접 쓰지 않음', () => {
  for (const path of [SCREEN, ...COMPONENTS]) {
    const source = code(path);
    for (const forbidden of [
      'http://',
      'https://',
      'localhost',
      'Authorization',
      'axios',
      'fetch(',
      'AsyncStorage',
      'SecureStore',
      'Math.random',
      'MOCK_',
    ]) {
      assert.equal(source.includes(forbidden), false, `${path}: ${forbidden}`);
    }
  }
});

test('화면: 다른 사용자의 스냅샷은 렌더링하지 않고 userId 없으면 안내', () => {
  const screen = code(SCREEN);
  assert.match(screen, /snapshot\.userId !== userId/);
  assert.match(screen, /사용자 정보를 확인할 수 없어요/);
});

test('화면: 뒤로가기는 canGoBack 후 CATEGORY fallback', () => {
  const screen = code(SCREEN);
  assert.match(screen, /navigation\.canGoBack\(\)/);
  assert.match(screen, /navigation\.navigate\(ROUTES\.CATEGORY\)/);
});

test('컴포넌트: 리포트 화면에 실제 소비로 오해할 문구 없음, 안내 문구를 항상 표시', () => {
  const forbidden = ['지출', '소비 금액', '소비금액', '썼', '사용한 금액'];
  for (const path of [
    `${COMPONENT_DIR}/SemesterReportSection.js`,
    `${COMPONENT_DIR}/ReportScoreCard.js`,
    `${COMPONENT_DIR}/ReportEventRow.js`,
  ]) {
    const source = code(path);
    for (const word of forbidden) assert.equal(source.includes(word), false, `${path}: ${word}`);
  }
  const section = code(`${COMPONENT_DIR}/SemesterReportSection.js`);
  assert.match(section, /REPORT_NOTICE/);
  assert.match(section, /REPORT_EVENT_NOTICE/);
});

test('컴포넌트: 점수·등급을 계산하지 않고 서버 값(뷰모델)만 표시', () => {
  for (const path of [
    `${COMPONENT_DIR}/ReportScoreCard.js`,
    `${COMPONENT_DIR}/SemesterReportSection.js`,
  ]) {
    const source = code(path);
    assert.equal(/Number\(|parseInt|parseFloat|\.reduce\(|Math\./.test(source), false, path);
  }
});

test('컴포넌트: 일정 키는 정밀도 손실 id를 쓰지 않음', () => {
  for (const path of [...COMPONENTS, SCREEN]) {
    const source = code(path);
    assert.equal(/\.id\b|\bid:/.test(source), false, path);
    assert.equal(/user_id|userId/.test(source) && path.includes('components'), false, path);
  }
});

// ── 세션 연결 동작 ───────────────────────────────────────────

const UID = '123456789012345678';

test('세션 모의: 진입 시 일정 구간 GET만 나가고 프로필·리포트·POST는 구간 전환/버튼 전까지 없음', async () => {
  const calls = [];
  const session = logic.createSpendingSession({
    fetchEventBuffer: async () => (calls.push('buffer'), '0'),
    fetchSpendingProfile: async () => (calls.push('profile'), {}),
    createAcademicSchedule: async () => (calls.push('create'), {}),
    fetchCalendarSchedules: async () => (calls.push('schedules'), []),
    fetchSemesterReport: async () => (calls.push('report'), {}),
    fetchUniversities: async () => (calls.push('universities'), []),
    syncCalendar: async () => (calls.push('sync'), {}),
  });

  await session.setUser(UID);
  assert.deepEqual([...calls].sort(), ['buffer', 'schedules']);

  // StrictMode처럼 effect가 같은 사용자로 다시 실행돼도 같은 요청을 중복해서 보내지 않는다.
  await session.setUser(UID);
  assert.deepEqual([...calls].sort(), ['buffer', 'schedules']);
  session.dispose();
});

test('세션 모의: dispose 후에는 어떤 호출도 요청을 만들지 않음', async () => {
  const calls = [];
  const session = logic.createSpendingSession({
    fetchEventBuffer: async () => (calls.push('buffer'), '0'),
    fetchSpendingProfile: async () => (calls.push('profile'), {}),
    createAcademicSchedule: async () => (calls.push('create'), {}),
    fetchCalendarSchedules: async () => (calls.push('schedules'), []),
    fetchSemesterReport: async () => (calls.push('report'), {}),
    fetchUniversities: async () => (calls.push('universities'), []),
    syncCalendar: async () => (calls.push('sync'), {}),
  });
  session.dispose();

  await session.setUser(UID);
  await session.selectTab('profile');
  await session.setScheduleYear(2025);
  session.setFormField('eventName', 'x');
  await session.submitSchedule();
  assert.deepEqual(calls, []);
});

test('모듈 import 중 네트워크 요청 없음', () => {
  assert.deepEqual(outbound, []);
});
