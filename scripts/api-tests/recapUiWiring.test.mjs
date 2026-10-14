// Money Recap 3부(UI 연결) 정적 테스트. React 렌더러가 없어 JSX는 렌더링하지 않는다(미검증).
// 소스 문자열 정적 분석 + 세션 컨트롤러 모의 시뮬레이션(개발 모드 재구독 순서)으로 연결 구조만 고정한다.
// 서버 호출 없음(fetcher 주입), AsyncStorage 사용 없음.
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/recapUiWiring.test.mjs
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
const { RECAP_SESSION_STATUS, createRecapSession } =
  await import('../../src/features/moneyRecap/recapScreenLogic.js');

const root = rel => new URL(`../../${rel}`, import.meta.url);
const readSource = rel => readFileSync(root(rel), 'utf8').replace(/\r\n/g, '\n');
const stripComments = source =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const code = rel => stripComments(readSource(rel));
const count = (text, pattern) => (text.match(pattern) ?? []).length;

const SCREEN = 'src/screens/asset/MoneyRecapScreen.js';
const ENTRY = 'src/components/moneyRecap/MoneyRecapEntry.js';
const CARD = 'src/components/moneyRecap/MoneyRecapInsightCard.js';
const SELECTOR = 'src/components/moneyRecap/MoneyRecapMonthSelector.js';
const CATEGORY = 'src/screens/category/CategoryScreen.js';
const NAVIGATOR = 'src/navigation/MainNavigator.js';

const screen = code(SCREEN);

// 첫 번째 `useEffect(` 블록 중 pattern이 들어 있는 블록의 본문(다음 `useEffect(`/컴포넌트 끝까지)을 돌려준다.
const effectBlocks = source =>
  source.split(/(?=useEffect\()/).filter(b => b.startsWith('useEffect('));

// ── 1. API-37: 화면 진입 시 호출 연결 ──────────────────────────

test('화면: userId Effect가 setUser 후 loadMonths(API-37)만 호출한다', () => {
  const block = effectBlocks(screen).find(b => b.includes('session.loadMonths()'));
  assert.ok(block, 'loadMonths를 부르는 Effect가 있어야 한다');
  const body = block.split(/\n\s*\}, \[/)[0];
  assert.match(body, /session\.setUser\(userId\)/);
  assert.match(body, /if \(userId\) session\.loadMonths\(\)/);
  assert.ok(!body.includes('openRecap'), 'Effect에서 openRecap(API-38) 호출 금지');
  assert.ok(!body.includes('fetchRecap('), 'Effect에서 fetchRecap 직접 호출 금지');
});

// ── 2·3. API-38은 시작 버튼에서만 ─────────────────────────────

test('화면: openRecap은 소스에서 정확히 한 번, onStart 핸들러 안에서만 등장한다', () => {
  assert.equal(count(screen, /openRecap/g), 1);
  assert.match(screen, /onStart=\{\(\) => session\.openRecap\(\)\}/);
});

test('화면: 월 선택은 selectMonth만 호출하고 API-38 경로가 없다', () => {
  assert.match(screen, /onSelect=\{month => session\.selectMonth\(month\)\}/);
  const selectLine = screen.split('\n').find(line => line.includes('onSelect='));
  assert.ok(!/openRecap|fetchRecap|loadMonths/.test(selectLine));
  // fetchRecap은 세션 주입(createRecapSession)에만 쓰이고 직접 호출되지 않는다.
  assert.equal(count(screen, /fetchRecap(?!Months)/g), 2); // import + 세션 주입
  assert.ok(!/fetchRecap(?!Months)\(/.test(screen));
  assert.ok(!/fetchRecapMonths\(/.test(screen));
});

test('Entry: 로딩·비활성이면 onStart를 호출하지 않고 API·세션을 모른다', () => {
  const entry = code(ENTRY);
  assert.match(entry, /const blocked = !!\(ctaLoading \|\| ctaDisabled\)/);
  assert.match(entry, /if \(!blocked\) onStart\?\.\(\)/);
  assert.match(entry, /disabled=\{blocked\}/);
  assert.match(entry, /vm\.titleLines \?\? \[\]/);
  assert.match(entry, /vm\.headlineLines \?\? \[\]/);
  assert.match(entry, /vm\.subtitleLines \?\? \[\]/);
  assert.match(entry, /monthSelector/);
  assert.match(entry, /notice/);
  assert.ok(!/features\/|apiClient|createRecapSession|useSelector|__DEV__|Alert/.test(entry));
});

// ── 4. createRecapSession + useSyncExternalStore ───────────────

test('화면: createRecapSession을 1회 생성하고 useSyncExternalStore로 구독한다', () => {
  assert.match(
    screen,
    /useState\(\(\) =>\s*createRecapSession\(\{ fetchMonths: fetchRecapMonths, fetchRecap \}\)\s*\)/
  );
  assert.match(screen, /useSyncExternalStore\(session\.subscribe, session\.getSnapshot\)/);
  assert.equal(count(screen, /createRecapSession\(/g), 1);
});

// ── 5. 사용자 변경 시 이전 데이터 차단 ─────────────────────────

test('화면: 스냅샷 userId가 현재 사용자와 다르면 로딩 패널을 보이고 recap 상태를 idle로 본다', () => {
  assert.match(screen, /const isOwnSnapshot = snapshot\.userId === userId/);
  assert.match(screen, /isOwnSnapshot \? snapshot\.recapStatus : S\.IDLE/);
  assert.match(screen, /!isOwnSnapshot \|\| snapshot\.monthsStatus === S\.IDLE/);
  // 사용자 검증은 isValidOnboardingUserId로 하고 숫자 변환을 하지 않는다.
  assert.match(screen, /isValidOnboardingUserId\(rawUserId\) \? rawUserId : null/);
  assert.ok(!/Number\(|parseInt|parseFloat|BigInt/.test(screen));
});

// ── 6. closeRecap · dispose ────────────────────────────────────

test('화면: 언마운트 cleanup에서 dispose, 뒤로가기·스토리 닫기는 closeRecap', () => {
  assert.match(screen, /useEffect\(\(\) => \(\) => session\.dispose\(\), \[session\]\)/);
  assert.equal(count(screen, /session\.dispose\(\)/g), 1);
  assert.equal(count(screen, /session\.closeRecap\(\)/g), 2);
  assert.match(screen, /onClose=\{\(\) => session\.closeRecap\(\)\}/);
  assert.match(
    screen,
    /if \(hasActiveRecap\) \{\s*session\.closeRecap\(\);\s*\} else \{\s*exitToPreviousScreen\(\);/
  );
  assert.match(screen, /hasActiveRecap = recapStatus === S\.LOADING \|\| recapStatus === S\.READY/);
  assert.match(screen, /BackHandler\.addEventListener\('hardwareBackPress'/);
  assert.match(screen, /return \(\) => sub\.remove\(\)/);
});

test('화면: 뒤로가기 fallback은 CATEGORY이고 HOME이 아니다', () => {
  assert.match(screen, /navigation\.canGoBack\(\)/);
  assert.match(screen, /navigation\.navigate\(ROUTES\.CATEGORY\)/);
  assert.ok(!screen.includes('ROUTES.HOME'));
});

// ── 7. 스토리 key ──────────────────────────────────────────────

test('화면: 스토리는 key={snapshot.recapMonth}로 월마다 재마운트하고 storiesData만 넘긴다', () => {
  assert.match(
    screen,
    /<MoneyRecapStories\s+key=\{snapshot\.recapMonth\}\s+data=\{snapshot\.storiesData\}/
  );
  assert.match(screen, /if \(recapStatus === S\.READY\)/);
});

// ── 8·9. 404·빈 목록·오류 + 재시도 처리 ────────────────────────

test('화면: 월 목록 오류·빈 목록·사용자 무효·recap 빈/오류 상태를 각각 처리한다', () => {
  assert.match(screen, /snapshot\.monthsStatus === S\.ERROR/);
  assert.match(screen, /describeRecapError\(snapshot\.monthsErrorType\)/);
  assert.match(screen, /snapshot\.monthsStatus === S\.EMPTY/);
  assert.match(screen, /describeRecapEmpty\(RECAP_EMPTY_REASON\.NO_MONTHS\)/);
  assert.match(screen, /사용자 정보를 확인할 수 없어요/);
  assert.match(
    screen,
    /recapStatus === S\.EMPTY[\s\S]*describeRecapEmpty\(snapshot\.recapEmptyReason\)/
  );
  assert.match(
    screen,
    /recapStatus === S\.ERROR[\s\S]*describeRecapError\(snapshot\.recapErrorType\)/
  );
  // 빈 상태(404 포함)는 오류 패널(tone="error")이 아니다.
  const emptyBranch = screen
    .split('snapshot.monthsStatus === S.EMPTY')[1]
    .split('if (recapStatus')[0];
  assert.ok(!emptyBranch.includes('tone="error"'));
});

test('화면: 재시도 버튼은 *Retryable일 때만 노출하고 불가 오류는 CTA를 비활성화한다', () => {
  assert.match(screen, /snapshot\.monthsRetryable \? \(\s*<PanelButton label=\{RETRY_LABEL\}/);
  assert.match(screen, /onPress=\{\(\) => session\.loadMonths\(\)\}/);
  assert.match(screen, /recapStatus === S\.ERROR && snapshot\.recapRetryable/);
  assert.match(screen, /\{ \.\.\.baseVm, ctaLabel: RETRY_LABEL \}/);
  assert.match(screen, /ctaDisabled=\{recapStatus === S\.ERROR && !snapshot\.recapRetryable\}/);
  assert.match(screen, /ctaLoading=\{recapStatus === S\.LOADING\}/);
  assert.match(screen, /disabled=\{recapStatus === S\.LOADING\}/);
});

// ── 월 칩 / 인사이트 카드 컴포넌트 ─────────────────────────────

test('MonthSelector: react-native·redesign만 import하고 disabled면 onSelect를 막는다', () => {
  const selector = code(SELECTOR);
  const imports = [...selector.matchAll(/^import .* from '([^']+)'/gm)].map(m => m[1]);
  assert.deepEqual(imports.sort(), ['../../theme/redesign', 'react', 'react-native'].sort());
  assert.match(selector, /if \(!disabled\) onSelect\?\.\(item\.value\)/);
  assert.match(selector, /disabled=\{disabled\}/);
  assert.match(selector, /accessibilityState=\{\{ selected, disabled: !!disabled \}\}/);
  assert.ok(!/features\/|apiClient|createRecapSession|fetch/.test(selector));
});

test('InsightCard: title이 있을 때만 제목과 위쪽 여백을 그린다', () => {
  const card = code(CARD);
  assert.match(card, /\{title \? <Text style=\{styles\.title\}>\{title\}<\/Text> : null\}/);
  assert.match(card, /title \? styles\.bodyWithTitle : null/);
  assert.match(card, /bodyWithTitle: \{ marginTop: 6 \}/);
});

// ── 10. 카테고리 금융 메뉴 · 라우트 ───────────────────────────

test('CategoryScreen: 금융 섹션에 머니 리캡 항목이 있고 기존 항목·온보딩 sentinel이 유지된다', () => {
  const category = code(CATEGORY);
  const finance = category.split('const FINANCE_ITEMS = [')[1].split('];')[0];
  assert.match(finance, /title: '머니 리캡'[^}]*routeAction: ROUTES\.MONEY_RECAP/);
  assert.match(finance, /ROUTES\.TRANSFER/);
  assert.match(finance, /ROUTES\.TRANSACTION_HISTORY/);
  assert.match(finance, /ROUTES\.DAILY_LIMIT/);
  assert.match(finance, /title: '이상거래 알림'[^}]*routeAction: ROUTES\.WORK_FDS/);
  assert.equal(count(finance, /routeAction:/g), 5);
  assert.match(category, /FINANCIAL_ONBOARDING_ACTION = 'financialOnboardingEntry'/);
  assert.match(category, /ROUTES\.WORK_READINESS/);
  assert.match(category, /navigation\.navigate\(item\.routeAction\)/);
});

test('라우트: ROUTES.MONEY_RECAP 값과 MainNavigator 등록이 유지된다', () => {
  assert.equal(ROUTES.MONEY_RECAP, 'MoneyRecap');
  const navigator = code(NAVIGATOR);
  assert.match(navigator, /name=\{ROUTES\.MONEY_RECAP\}\s+component=\{MoneyRecapScreen\}/);
});

// ── 11·12. 기존 스토리 보호 · Mock/불필요 호출 방지 ───────────

test('화면·컴포넌트: Mock 데이터·AsyncStorage·직접 HTTP·민감정보 참조가 없다', () => {
  for (const rel of [SCREEN, ENTRY, CARD, SELECTOR]) {
    const source = code(rel);
    assert.ok(!/moneyRecapMockData|MOCK_|mockData/i.test(source), `${rel}: mock 참조`);
    assert.ok(!/AsyncStorage|SecureStore|tokenService/.test(source), `${rel}: 저장소`);
    assert.ok(!/services\/apiClient|axios|fetch\(/.test(source), `${rel}: 직접 HTTP`);
    assert.ok(
      !/Authorization|access_token|refresh_token|console\./.test(source),
      `${rel}: 민감정보`
    );
  }
});

test('화면: 스토리 컴포넌트는 MoneyRecapStories 하나만 쓰고 buildMoneyRecapStories를 직접 부르지 않는다', () => {
  assert.match(
    screen,
    /import MoneyRecapStories from '..\/..\/components\/moneyRecap\/MoneyRecapStories'/
  );
  assert.ok(!screen.includes('buildMoneyRecapStories'));
  assert.ok(!/stories\/Story/.test(screen));
});

test('보호 대상: Stories·buildMoneyRecapStories는 새 API 계층·세션을 참조하지 않는다', () => {
  for (const rel of [
    'src/components/moneyRecap/MoneyRecapStories.js',
    'src/features/moneyRecap/buildMoneyRecapStories.js',
  ]) {
    const source = code(rel);
    assert.ok(!/recapApi|recapScreenLogic|createRecapSession|apiClient/.test(source), rel);
  }
  const stories = code('src/components/moneyRecap/MoneyRecapStories.js');
  assert.match(stories, /onClose/);
  assert.match(stories, /buildMoneyRecapStories/);
});

test('1부·2부: 화면 연결 코드가 apiEndpoints의 두 항목만 사용한다(경로 직접 기입 없음)', () => {
  assert.ok(!/\/api\/v1\/work\/recap|\/recap\/months/.test(screen));
});

// ── 개발 모드 재구독 시뮬레이션 (모의 fetcher, 서버 호출 없음) ──

const UID = '123456789012345678';
const flush = () => new Promise(resolve => setImmediate(resolve));

const makeSession = () => {
  const calls = { months: 0, recap: 0 };
  const session = createRecapSession({
    fetchMonths: async () => {
      calls.months += 1;
      return ['2026-09', '2026-08'];
    },
    fetchRecap: async () => {
      calls.recap += 1;
      throw new Error('이 테스트에서 API-38 호출은 없어야 한다');
    },
  });
  return { session, calls };
};

test('시뮬레이션: effect 이중 실행(구독→setUser→dispose→재구독→setUser) 뒤에도 구독·API-37 정상, API-38 없음', async () => {
  const { session, calls } = makeSession();
  let notified = 0;

  // 1차 setup: uSES 구독 → userId effect
  let unsubscribe = session.subscribe(() => {
    notified += 1;
  });
  session.setUser(UID);
  session.loadMonths();

  // StrictMode/Fast Refresh cleanup: uSES 구독 해제 → dispose effect cleanup
  unsubscribe();
  session.dispose();
  assert.equal(session.getSnapshot().userId, null);

  // 2차 setup: uSES가 다시 구독한 뒤 userId effect 재실행
  const before = notified;
  unsubscribe = session.subscribe(() => {
    notified += 1;
  });
  session.setUser(UID);
  session.loadMonths();
  await flush();

  const snapshot = session.getSnapshot();
  assert.equal(snapshot.userId, UID);
  assert.equal(snapshot.monthsStatus, RECAP_SESSION_STATUS.READY);
  assert.equal(snapshot.selectedMonth, '2026-09');
  assert.ok(notified > before, '재구독된 listener가 상태 변경을 받아야 한다');
  // 첫 요청은 dispose로 무효화되고 두 번째 요청만 상태를 만든다(개발 모드 한정 API-37 최대 2회).
  assert.ok(calls.months >= 1 && calls.months <= 2);
  assert.equal(calls.recap, 0);
  unsubscribe();
});

test('시뮬레이션: 재구독 없이 dispose만 하면 listener는 비워지고 이후 알림을 받지 않는다', async () => {
  const { session } = makeSession();
  let notified = 0;
  session.subscribe(() => {
    notified += 1;
  });
  session.dispose();
  const before = notified;
  session.setUser(UID);
  session.loadMonths();
  await flush();
  assert.equal(notified, before);
});

test('시뮬레이션: 월 선택은 API-38을 호출하지 않고 사용자 변경 시 이전 선택·결과가 초기화된다', async () => {
  const { session, calls } = makeSession();
  session.setUser(UID);
  await session.loadMonths();
  session.selectMonth('2026-08');
  assert.equal(session.getSnapshot().selectedMonth, '2026-08');
  assert.equal(calls.recap, 0);

  session.setUser('223456789012345679');
  const snapshot = session.getSnapshot();
  assert.equal(snapshot.userId, '223456789012345679');
  assert.equal(snapshot.monthsStatus, RECAP_SESSION_STATUS.IDLE);
  assert.equal(snapshot.selectedMonth, null);
  assert.equal(snapshot.storiesData, null);
});

test('이 테스트 전체에서 네트워크 요청이 발생하지 않았다', () => {
  assert.equal(outbound.length, 0);
});
