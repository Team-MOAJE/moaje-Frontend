// 학교 일정 동기화(API-18~20)·이상거래 알림(API-25~28) UI 연결 정적·Mock 테스트.
// React 렌더러가 없어 JSX는 렌더링하지 않는다(렌더링·StrictMode 실동작은 미검증).
// 소스 문자열 정적 분석으로 연결 구조만 고정한다. 서버 호출 없음, AsyncStorage 사용 없음.
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/calendarFdsUiWiring.test.mjs
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
const fdsLogic = await import('../../src/features/work/fdsScreenLogic.js');

const root = rel => new URL(`../../${rel}`, import.meta.url);
const readSource = rel => readFileSync(root(rel), 'utf8').replace(/\r\n/g, '\n');
const stripComments = source =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const code = rel => stripComments(readSource(rel));
const count = (text, pattern) => (text.match(pattern) ?? []).length;

const FDS_SCREEN = 'src/screens/work/FdsAlertsScreen.js';
const SPENDING_SCREEN = 'src/screens/work/SpendingScreen.js';
const FDS_DIR = 'src/components/work/fds';
const SPENDING_DIR = 'src/components/work/spending';
const FDS_COMPONENTS = readdirSync(root(FDS_DIR)).map(name => `${FDS_DIR}/${name}`);
const SPENDING_COMPONENTS = readdirSync(root(SPENDING_DIR)).map(name => `${SPENDING_DIR}/${name}`);
const CATEGORY = 'src/screens/category/CategoryScreen.js';
const NAVIGATOR = 'src/navigation/MainNavigator.js';

// ── 라우트·진입점 ────────────────────────────────────────────

test('라우트: WORK_FDS가 고유 값으로 존재하고 기존 라우트는 유지', () => {
  assert.equal(ROUTES.WORK_FDS, 'WorkFds');
  assert.equal(Object.values(ROUTES).filter(value => value === ROUTES.WORK_FDS).length, 1);
  for (const [key, value] of [
    ['WORK_SPENDING', 'WorkSpending'],
    ['WORK_SIMULATOR', 'WorkSimulator'],
    ['WORK_READINESS', 'WorkReadiness'],
    ['MONEY_RECAP', 'MoneyRecap'],
  ]) {
    assert.equal(ROUTES[key], value);
  }
});

test('Navigator: FdsAlertsScreen을 기능 플래그 조건 밖에 한 번 등록, headerShown false, 기존 등록 유지', () => {
  const navigator = code(NAVIGATOR);
  assert.match(navigator, /import FdsAlertsScreen from '..\/screens\/work\/FdsAlertsScreen'/);
  assert.equal(count(navigator, /name=\{ROUTES\.WORK_FDS\}/g), 1);
  assert.match(
    navigator,
    /name=\{ROUTES\.WORK_FDS\}\s+component=\{FdsAlertsScreen\}\s+options=\{\{ headerShown: false \}\}/
  );
  const flagBlock = navigator.slice(navigator.indexOf('{includeWorkRoutes && ('));
  assert.equal(flagBlock.includes('WORK_FDS'), false, '플래그 조건 블록 밖');
  for (const route of [
    'WORK_SPENDING',
    'WORK_READINESS',
    'WORK_SIMULATOR',
    'MONEY_RECAP',
    'PIN_INPUT',
    'HOME',
  ]) {
    assert.equal(count(navigator, new RegExp(`name=\\{ROUTES\\.${route}\\}`, 'g')), 1, route);
  }
});

test('CategoryScreen: 금융 섹션에 이상거래 알림 1개 추가, 기존 항목 유지', () => {
  const category = code(CATEGORY);
  assert.equal(count(category, /routeAction: ROUTES\.WORK_FDS/g), 1);
  assert.match(category, /title: '이상거래 알림'/);
  const financeBlock = category.slice(
    category.indexOf('const FINANCE_ITEMS'),
    category.indexOf('const MY_INFO_ITEMS')
  );
  assert.match(financeBlock, /ROUTES\.WORK_FDS/, '금융(FINANCE_ITEMS) 섹션 안에 있음');
  for (const route of [
    'TRANSFER',
    'TRANSACTION_HISTORY',
    'DAILY_LIMIT',
    'MONEY_RECAP',
    'WORK_READINESS',
    'WORK_SIMULATOR',
    'WORK_SPENDING',
    'PROFILE',
    'SETTINGS',
  ]) {
    assert.equal(count(category, new RegExp(`routeAction: ROUTES\\.${route}`, 'g')), 1, route);
  }
});

test('범위 밖 화면 보호: 홈 벨 아이콘·설정 알림 토글·송금 화면은 FDS와 연결하지 않음', () => {
  for (const path of [
    'src/components/home/AppHeader.js',
    'src/screens/settings/SettingsScreen.js',
    'src/screens/asset/TransferScreen.js',
    'src/features/asset/assetApi.js',
  ]) {
    const source = code(path);
    for (const word of ['WORK_FDS', 'fdsApi', 'fdsScreenLogic', 'FdsAlerts']) {
      assert.equal(source.includes(word), false, `${path}: ${word}`);
    }
  }
});

// ── 엔드포인트 ───────────────────────────────────────────────

test('엔드포인트: CALENDAR/FDS 추가, API-21(detect)은 상수·호출 코드 없음, 기존 항목 유지', () => {
  assert.equal(API_ENDPOINTS.WORK.CALENDAR.UNIVERSITIES, '/api/v1/work/calendar/universities');
  assert.equal(API_ENDPOINTS.WORK.CALENDAR.SYNC, '/api/v1/work/calendar/sync');
  assert.equal(API_ENDPOINTS.WORK.FDS.SAFETY_SCORE('1'), '/api/v1/work/fds/1/safety-score');
  assert.equal(typeof API_ENDPOINTS.WORK.SPENDING.SCHEDULES, 'function', 'API-45 상수 유지');
  assert.equal(typeof API_ENDPOINTS.WORK.SPENDING.SCHEDULE, 'string', 'API-44 상수 유지');
  assert.equal(API_ENDPOINTS.WORK.READINESS('1'), '/api/v1/work/readiness/1');

  const srcFiles = [
    'src/constants/apiEndpoints.js',
    'src/features/work/fdsApi.js',
    'src/features/work/fdsScreenLogic.js',
    'src/features/work/calendarApi.js',
    FDS_SCREEN,
    SPENDING_SCREEN,
    ...FDS_COMPONENTS,
    ...SPENDING_COMPONENTS,
  ];
  for (const path of srcFiles) {
    const source = code(path);
    assert.equal(/fds\/detect|DETECT|detectFds|FdsDetect/i.test(source), false, path);
  }
});

// ── 학사 일정 화면(SpendingScreen) ──────────────────────────

test('SpendingScreen: 일정 목록은 API-20(fetchCalendarSchedules)으로, API-45 함수는 화면에서 쓰지 않음', () => {
  const screen = code(SPENDING_SCREEN);
  assert.match(screen, /fetchCalendarSchedules,\s*\n\s*fetchSemesterReport/);
  assert.equal(screen.includes('fetchAcademicSchedules'), false);
  // API-44 직접 등록은 그대로: 주입 2회(import + 세션) + 등록 버튼 한 곳.
  assert.equal(count(screen, /createAcademicSchedule/g), 2);
  assert.equal(count(screen, /submitSchedule\(/g), 1);
  assert.match(screen, /onSubmit=\{\(\) => session\.submitSchedule\(\)\}/);
});

test('SpendingScreen: API-19 POST는 syncSchedules 한 곳, 확인 다이얼로그의 "불러오기" 버튼에서만 호출', () => {
  const screen = code(SPENDING_SCREEN);
  assert.equal(count(screen, /syncSchedules\(/g), 1);
  assert.match(
    screen,
    /Alert\.alert\([\s\S]*SYNC_CONFIRM_MESSAGE[\s\S]*session\.syncSchedules\(\)/
  );
  assert.match(screen, /onSync=\{handleSyncPress\}/);
  assert.match(screen, /onToggle=\{\(\) => session\.toggleCalendarPanel\(\)\}/);
  for (const call of ['fetchUniversities(', 'syncCalendar(', 'fetchCalendarSchedules(']) {
    assert.equal(screen.includes(call), false, `화면이 API를 직접 호출하지 않음: ${call}`);
  }
});

test('CalendarSyncSection: 요청 수단 없이 props/버튼만 사용, 학교 선택·학기 선택은 상위 핸들러 호출', () => {
  const section = code(`${SPENDING_DIR}/CalendarSyncSection.js`);
  assert.match(section, /onPress=\{onSync\}/);
  assert.match(section, /onPress=\{onToggle\}/);
  assert.match(section, /onSelectUniversity\(item\.universityId\)/);
  assert.equal(/useEffect|useState|useSelector|useDispatch/.test(section), false);
});

test('ScheduleItemRow: 출처 배지는 서버가 준 sourceLabel이 있을 때만 표시', () => {
  const row = code(`${SPENDING_DIR}/ScheduleItemRow.js`);
  assert.match(row, /sourceLabel \?/);
  const list = code(`${SPENDING_DIR}/ScheduleListSection.js`);
  assert.match(list, /sourceLabel=\{item\.sourceLabel\}/);
});

// ── 이상거래 알림 화면 ───────────────────────────────────────

test('FdsAlertsScreen: 세션 생성·dispose를 한 effect에, 사용자 설정은 setUser, 폼·구독으로 요청 없음', () => {
  const screen = code(FDS_SCREEN);
  assert.equal(count(screen, /createFdsSession\(/g), 1);
  assert.match(screen, /return \(\) => created\.dispose\(\)/);
  assert.match(screen, /session\.setUser\(userId\)/);
  assert.match(screen, /useSyncExternalStore/);
  assert.match(screen, /snapshot\.userId !== userId/);
  assert.match(screen, /사용자 정보를 확인할 수 없어요/);
});

test('FdsAlertsScreen: PATCH(API-27)는 confirmAlert 한 곳(알림 확인 버튼)에서만 호출', () => {
  const screen = code(FDS_SCREEN);
  assert.equal(count(screen, /confirmAlert\(/g), 1);
  assert.match(screen, /onConfirm=\{alertId => session\.confirmAlert\(alertId\)\}/);
  assert.equal(count(screen, /confirmFdsAlert/g), 2, 'import + 세션 주입뿐');
  for (const call of [
    'fetchSafetyScore(',
    'fetchFdsAlerts(',
    'fetchFdsLogs(',
    'confirmFdsAlert(',
  ]) {
    assert.equal(screen.includes(call), false, `화면이 API를 직접 호출하지 않음: ${call}`);
  }

  const row = code(`${FDS_DIR}/FdsAlertRow.js`);
  assert.match(row, /onPress=\{onConfirm\}/);
  assert.equal(count(row, /onConfirm/g), 2, '프로퍼티 선언 + 버튼 한 곳');
});

test('FdsAlertsScreen: 뒤로가기는 canGoBack 후 CATEGORY fallback', () => {
  const screen = code(FDS_SCREEN);
  assert.match(screen, /navigation\.canGoBack\(\)/);
  assert.match(screen, /navigation\.navigate\(ROUTES\.CATEGORY\)/);
});

test('이상거래 화면·컴포넌트와 학교 일정 컴포넌트: 자동 재조회 수단(포커스·타이머·폴링·AppState) 없음', () => {
  for (const path of [FDS_SCREEN, SPENDING_SCREEN, ...FDS_COMPONENTS, ...SPENDING_COMPONENTS]) {
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
  const screen = code(FDS_SCREEN);
  assert.match(screen, /onPress=\{\(\) => session\.selectTab\(tab\.key\)\}/);
  assert.match(screen, /onRetry: \(\) => session\.retry\(key\)/);
  assert.match(screen, /onRefresh=\{\(\) => session\.refreshAlerts\(\)\}/);
});

test('이상거래 화면·컴포넌트: Gateway URL·토큰·fetch/axios·AsyncStorage·Mock 데이터를 직접 쓰지 않음', () => {
  for (const path of [FDS_SCREEN, ...FDS_COMPONENTS]) {
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

test('이상거래 컴포넌트: 정밀도 손실 id·user_id를 쓰지 않고 점수·등급을 계산하지 않음', () => {
  for (const path of [FDS_SCREEN, ...FDS_COMPONENTS]) {
    const source = code(path);
    assert.equal(/\.id\b|\bid:/.test(source), false, path);
    if (path.includes('components')) {
      assert.equal(/user_id|userId/.test(source), false, path);
    }
  }
  for (const path of [`${FDS_DIR}/SafetyScoreCard.js`, `${FDS_DIR}/FdsAlertsSection.js`]) {
    const source = code(path);
    assert.equal(/Number\(|parseInt|parseFloat|\.reduce\(|Math\./.test(source), false, path);
  }
  const card = code(`${FDS_DIR}/SafetyScoreCard.js`);
  assert.match(card, /viewModel\.referenceNotice/);
  assert.match(card, /viewModel\.scoreText/);
  assert.match(card, /viewModel\.grade/);
});

test('이상거래 화면 로직: 점수·알림·거래를 만들어내는 코드(무작위·고정 더미) 없음', () => {
  const logicSource = code('src/features/work/fdsScreenLogic.js');
  for (const forbidden of ['Math.random', 'MOCK_', 'safetyScore:', 'safety_score']) {
    assert.equal(logicSource.includes(forbidden), false, forbidden);
  }
});

test('세션 모의: 진입 시 GET만 나가고 PATCH·로그는 버튼/구간 전환 전까지 없음, dispose 후 요청 없음', async () => {
  const calls = [];
  const make = () =>
    fdsLogic.createFdsSession({
      fetchSafetyScore: async () => (
        calls.push('score'),
        {
          safetyScore: 100,
          grade: 'A',
          emoji: '',
          totalTx: 0,
          highCount: 0,
          mediumCount: 0,
          periodDays: 30,
          message: '',
        }
      ),
      fetchFdsAlerts: async () => (
        calls.push('alerts'),
        { total: 0, unread: 0, returned: 0, alerts: [] }
      ),
      fetchFdsLogs: async () => (calls.push('logs'), []),
      confirmFdsAlert: async () => (calls.push('confirm'), {}),
    });

  const session = make();
  await session.setUser('123456789012345678');
  assert.deepEqual([...calls].sort(), ['alerts', 'score']);
  await session.setUser('123456789012345678'); // StrictMode처럼 같은 사용자 재설정
  assert.deepEqual([...calls].sort(), ['alerts', 'score']);
  assert.equal(session.getSnapshot().score.viewModel.noAnalyzedTransactions, true);
  session.dispose();

  calls.length = 0;
  await session.setUser('223456789012345678');
  await session.selectTab('logs');
  await session.confirmAlert('1');
  assert.deepEqual(calls, []);
});

test('모듈 import 중 네트워크 요청 없음', () => {
  assert.deepEqual(outbound, []);
});
