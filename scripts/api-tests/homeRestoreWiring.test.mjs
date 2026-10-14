// 홈 UI 복원(거래내역·생활비 분석 탭)과 계좌 상세 이동 연결 테스트.
// React 렌더러가 없어 소스 문자열 정적 분석 + 순수 함수 단위 테스트만 수행한다(렌더링·Android 동작은 미검증). 서버 호출 없음.
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/homeRestoreWiring.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildHomeExpenseView,
  buildHomeTransactionItems,
  buildTransactionDetailParams,
  formatMonthOnlyLabel,
  parseServerDateParts,
  resolveHomeTransactionsState,
  shouldFetchHomeAccountDetail,
  shouldLoadHomeExpense,
} from '../../src/features/asset/homeTabLogic.js';
import { buildHomeAccountItems } from '../../src/features/asset/assetScreenLogic.js';

const root = rel => new URL(`../../${rel}`, import.meta.url);
const readSource = rel => readFileSync(root(rel), 'utf8').replace(/\r\n/g, '\n');
const stripComments = source =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const code = rel => stripComments(readSource(rel));

const HOME = 'src/screens/home/HomeScreen.js';
const ACCOUNT_TAB = 'src/components/home/HomeAccountTab.js';
const TX_TAB = 'src/components/home/HomeTransactionTab.js';
const EXPENSE_TAB = 'src/components/home/HomeExpenseAnalysisTab.js';
const THUNK = 'src/features/asset/homeExpenseThunk.js';
const LOGIC = 'src/features/asset/homeTabLogic.js';
const NAVIGATOR = 'src/navigation/MainNavigator.js';

const BIG_ID = '9007199254740993123';

// ── 계좌 클릭 → 상세 이동 ─────────────────────────────────────

test('계좌 행 onPress가 핸들러를 호출하고, 홈은 문자열 accountId를 ACCOUNT_DETAIL로 전달한다', () => {
  const tab = code(ACCOUNT_TAB);
  assert.match(tab, /onPress=\{\(\) => onAccountPress\(account\)\}/);
  assert.match(tab, /key=\{account\.id\}/);
  const home = code(HOME);
  assert.match(
    home,
    /navigation\.navigate\(ROUTES\.ACCOUNT_DETAIL, \{ accountId: account\.id \}\)/
  );
  assert.match(home, /typeof account\?\.id === 'string' && account\.id !== ''/);
  assert.doesNotMatch(home, /Number\(|parseInt\(|parseFloat\(/);
  // 개발 모드 진단 로그는 계좌 식별값·잔액을 출력하지 않는다(이동 여부와 id 형식만).
  assert.match(home, /if \(__DEV__\)/);
  assert.match(
    home,
    /console\.log\('\[Home\] account press', \{ navigate: valid, idType: typeof account\?\.id \}\)/
  );
});

test('큰 accountId는 홈 행 모델에서 문자열 그대로 보존된다', () => {
  const items = buildHomeAccountItems([
    { id: BIG_ID, label: '내 계좌', status: 'ACTIVE', balance: 500000, balanceExact: true },
  ]);
  assert.equal(items[0].id, BIG_ID);
  assert.equal(typeof items[0].id, 'string');
});

test('네비게이터에 계좌 상세·거래 상세·거래내역·월별 분석 라우트가 각각 1회 등록되어 있다', () => {
  const navigator = readSource(NAVIGATOR);
  for (const route of ['ACCOUNT_DETAIL', 'TRANSACTION_DETAIL', 'TRANSACTION_HISTORY', 'ANALYSIS']) {
    assert.equal(
      (navigator.match(new RegExp(`name=\\{ROUTES\\.${route}\\}`, 'g')) ?? []).length,
      1,
      route
    );
  }
});

test('계좌 상세 화면은 API-11 조회·뒤로가기(canGoBack)·송금 fromAccountId 전달을 유지한다', () => {
  const detail = code('src/screens/asset/AccountDetailScreen.js');
  assert.match(detail, /dispatch\(fetchAccountDetail\(\{ accountId: selectedAccountId \}\)\)/);
  assert.match(detail, /navigation\.canGoBack\(\)/);
  assert.match(detail, /navigate\(ROUTES\.TRANSFER, \{ fromAccountId: selectedAccountId \}\)/);
  assert.match(
    detail,
    /navigate\(ROUTES\.TRANSACTION_HISTORY, \{ accountId: selectedAccountId \}\)/
  );
});

// ── 거래내역 탭 ───────────────────────────────────────────────

test('parseServerDateParts: 서버 날짜 문자열만 읽고, 읽을 수 없으면 생략한다(시간대 변환 없음)', () => {
  assert.deepEqual(parseServerDateParts('2026-10-13T09:05:33'), {
    group: '10월 13일',
    time: '09:05',
  });
  assert.deepEqual(parseServerDateParts('2026-01-02 23:59:00'), {
    group: '1월 2일',
    time: '23:59',
  });
  assert.deepEqual(parseServerDateParts('2026-10-13T09:05:33Z'), {
    group: '10월 13일',
    time: '09:05',
  });
  assert.deepEqual(parseServerDateParts('2026-10-13'), { group: '10월 13일', time: null });
  for (const bad of [null, undefined, '', 'abc', 20261013, '2026-13-40T00:00']) {
    assert.deepEqual(parseServerDateParts(bad), { group: null, time: null });
  }
});

test('buildHomeTransactionItems: 서버 거래만 최근 5건까지, 금액은 방향·정밀도 규칙을 따른다', () => {
  const txs = Array.from({ length: 7 }, (_, index) => ({
    id: `tx-${index}`,
    type: index === 0 ? 'DEPOSIT' : 'WITHDRAW',
    direction: index === 0 ? 'in' : 'out',
    amount: 1000 * (index + 1),
    amountExact: true,
    counterparty: index === 1 ? '  ' : `가맹점${index}`,
    createdAt: '2026-10-13T09:05:33',
  }));
  const items = buildHomeTransactionItems(txs);
  assert.equal(items.length, 5);
  assert.deepEqual(items[0], {
    id: 'tx-0',
    counterparty: '가맹점0',
    group: '10월 13일',
    time: '09:05',
    amountText: '+1,000원',
    tone: 'positive',
  });
  assert.equal(items[1].counterparty, '출금'); // 가맹점명이 없으면 유형 라벨(이름을 만들지 않는다)
  assert.equal(items[1].amountText, '-2,000원');
  // 부정확한 금액은 숨기고 0원으로 바꾸지 않는다. 날짜를 읽을 수 없으면 group/time을 생략한다.
  const [odd] = buildHomeTransactionItems([
    {
      id: 'x',
      type: 'WITHDRAW',
      direction: 'out',
      amount: null,
      amountExact: false,
      createdAt: null,
    },
  ]);
  assert.equal(odd.amountText, '-');
  assert.equal(odd.group, null);
  assert.equal(odd.time, null);
  assert.deepEqual(buildHomeTransactionItems(null), []);
});

test('resolveHomeTransactionsState: 선택 계좌의 상세만 쓰고 다른 계좌 거래·오류를 빈 상태로 숨기지 않는다', () => {
  const detail = { transactionHistory: [{ id: 'a' }] };
  const base = {
    selectedAccountId: 'acc-1',
    detail,
    detailAccountId: 'acc-1',
    loading: false,
    error: null,
  };
  assert.equal(resolveHomeTransactionsState({ ...base, selectedAccountId: null }), 'none');
  assert.equal(resolveHomeTransactionsState(base), 'list');
  assert.equal(
    resolveHomeTransactionsState({ ...base, detail: { transactionHistory: [] } }),
    'empty'
  );
  // 다른 계좌의 상세는 사용하지 않는다.
  assert.equal(resolveHomeTransactionsState({ ...base, detailAccountId: 'acc-2' }), 'loading');
  assert.equal(
    resolveHomeTransactionsState({ ...base, detail: null, detailAccountId: null, error: '실패' }),
    'error'
  );
  assert.equal(
    resolveHomeTransactionsState({ ...base, detail: null, detailAccountId: null, loading: true }),
    'loading'
  );
});

test('shouldFetchHomeAccountDetail: 같은 계좌 상세가 있거나 진행 중·오류면 자동 요청하지 않는다', () => {
  const base = { selectedAccountId: 'acc-1', detailAccountId: null, loading: false, error: null };
  assert.equal(shouldFetchHomeAccountDetail(base), true);
  assert.equal(shouldFetchHomeAccountDetail({ ...base, detailAccountId: 'acc-1' }), false);
  assert.equal(shouldFetchHomeAccountDetail({ ...base, loading: true }), false);
  assert.equal(shouldFetchHomeAccountDetail({ ...base, error: '실패' }), false);
  assert.equal(shouldFetchHomeAccountDetail({ ...base, selectedAccountId: null }), false);
  assert.equal(shouldFetchHomeAccountDetail({ ...base, detailAccountId: 'acc-0' }), true);
});

test('거래 상세 이동 params는 문자열 id를 그대로 전달하고, 비어 있으면 이동하지 않는다', () => {
  assert.deepEqual(buildTransactionDetailParams(BIG_ID, 'tx-9007199254740993'), {
    accountId: BIG_ID,
    transactionId: 'tx-9007199254740993',
  });
  assert.equal(buildTransactionDetailParams('', 'tx'), null);
  assert.equal(buildTransactionDetailParams(BIG_ID, null), null);
  assert.equal(buildTransactionDetailParams(123, 'tx'), null);
});

test('거래내역 탭 연결: 선택 계좌 API-11만 사용하고 Mock·계좌 합산이 없다', () => {
  const home = code(HOME);
  assert.match(home, /state\.asset\.selectedAccountId/);
  assert.match(home, /state\.asset\.accountDetailAccountId/);
  assert.match(home, /dispatch\(fetchAccountDetail\(\{ accountId: selectedAccountId \}\)\)/);
  assert.match(home, /key: 'transactions', label: '거래내역'/);
  assert.match(home, /navigate\(ROUTES\.TRANSACTION_DETAIL, params\)/);
  assert.match(home, /ROUTES\.TRANSACTION_HISTORY/);
  assert.match(home, /\{ accountId: selectedAccountId \}/);
  for (const file of [HOME, TX_TAB, EXPENSE_TAB, LOGIC, THUNK]) {
    assert.doesNotMatch(
      code(file),
      /MOCK_|mockData|moneyRecapMockData|fetchTransactionPage|transactionHistoryMock|\.reduce\(|totalBalance|bankName|계좌 연결/,
      file
    );
  }
  // 거래 탭은 서버가 주지 않는 group/time이 없으면 숨긴다.
  const tab = code(TX_TAB);
  assert.match(tab, /\{group\.label \? </);
  assert.match(tab, /\{tx\.time \? </);
});

// ── 생활비 분석 탭 ────────────────────────────────────────────

const monthly = (overrides = {}) => ({
  data: { incomeAmount: 0, expenseAmount: 288900, transferAmount: 0, revision: 'r1' },
  loading: false,
  error: null,
  ...overrides,
});
const category = (overrides = {}) => ({
  data: {
    revision: 'r1',
    categories: [
      { category: 'FOOD', amount: 182400 },
      { category: 'CAFE', amount: 41000 },
      { category: 'INCOME', amount: 500000 },
      { category: 'TRANSPORT', amount: 0 },
    ],
  },
  loading: false,
  error: null,
  ...overrides,
});

test('buildHomeExpenseView: 서버 금액만 사용하고 퍼센트·합산을 만들지 않는다', () => {
  const view = buildHomeExpenseView({
    yearMonth: '2026-10',
    monthly: monthly(),
    category: category(),
  });
  assert.equal(view.state, 'ready');
  assert.equal(view.monthLabel, '10월');
  assert.equal(view.totalText, '288,900원'); // 서버 expenseAmount 그대로
  assert.deepEqual(
    view.rows.map(row => [row.key, row.amountText]),
    [
      ['FOOD', '182,400원'],
      ['CAFE', '41,000원'],
    ]
  ); // 수입·0원 카테고리 제외, 서버 순서 유지
  assert.equal(view.topCategoryName, '식비');
  for (const row of view.rows) {
    assert.ok(row.barRatio > 0 && row.barRatio <= 1);
    assert.equal(Object.prototype.hasOwnProperty.call(row, 'percent'), false);
  }
});

test('buildHomeExpenseView: 로딩·오류·빈 월을 구분한다', () => {
  const loading = { data: null, loading: true, error: null };
  const failed = { data: null, loading: false, error: '실패' };
  assert.equal(
    buildHomeExpenseView({ yearMonth: '2026-10', monthly: loading, category: loading }).state,
    'loading'
  );
  assert.equal(
    buildHomeExpenseView({ yearMonth: '2026-10', monthly: failed, category: category() }).state,
    'error'
  );
  const emptyMonthly = monthly({
    data: { incomeAmount: 0, expenseAmount: 0, transferAmount: 0, revision: 'r1' },
  });
  const emptyCategory = category({
    data: { revision: 'r1', categories: [{ category: 'FOOD', amount: 0 }] },
  });
  const empty = buildHomeExpenseView({
    yearMonth: '2026-10',
    monthly: emptyMonthly,
    category: emptyCategory,
  });
  assert.equal(empty.state, 'empty');
  assert.equal(empty.totalText, '0원'); // 오류가 아니라 정상적인 0원
  assert.equal(formatMonthOnlyLabel('2026-13'), null);
});

test('shouldLoadHomeExpense: 현재 월 데이터가 없을 때만 요청하고 진행 중·오류면 자동 재요청하지 않는다', () => {
  const empty = { data: null, loading: false, error: null };
  const base = {
    currentYearMonth: '2026-10',
    yearMonth: '2026-10',
    monthly: empty,
    category: empty,
  };
  assert.equal(shouldLoadHomeExpense(base), true);
  assert.equal(shouldLoadHomeExpense({ ...base, yearMonth: '2026-09' }), true);
  assert.equal(shouldLoadHomeExpense({ ...base, yearMonth: null }), true);
  assert.equal(shouldLoadHomeExpense({ ...base, monthly: monthly(), category: category() }), false);
  assert.equal(shouldLoadHomeExpense({ ...base, monthly: { ...empty, loading: true } }), false);
  assert.equal(shouldLoadHomeExpense({ ...base, category: { ...empty, error: '실패' } }), false);
  assert.equal(shouldLoadHomeExpense({ ...base, currentYearMonth: null }), false);
});

test('생활비 분석 탭 연결: 기존 Cashflow thunk를 재사용하고 퍼센트를 표시하지 않는다', () => {
  const thunk = code(THUNK);
  assert.match(thunk, /dispatch\(setCashflowYearMonth\(yearMonth\)\)/);
  assert.match(thunk, /dispatch\(loadMonthlyCashflow\(yearMonth\)\)/);
  assert.match(thunk, /dispatch\(loadCategoryCashflow\(yearMonth\)\)/);
  const home = code(HOME);
  assert.match(home, /dispatch\(loadHomeExpense\(currentYearMonth\)\)/);
  assert.match(home, /key: 'analysis', label: '생활비 분석'/);
  assert.match(home, /navigation\.navigate\(ROUTES\.ANALYSIS\)/);
  assert.match(home, /state\.asset\.cashflowYearMonth/);
  const tab = code(EXPENSE_TAB);
  assert.doesNotMatch(tab, /percent|toFixed|\.reduce\(/);
  assert.match(tab, /row\.barRatio/);
  // 요청은 탭이 열렸을 때와 사용자의 다시 시도에서만 나간다. 반복 타이머(setInterval)는 없고,
  // 유일한 setTimeout은 자정 통과 시 API-15 로컬 결과 만료만 확인하며 서버 요청 thunk를 호출하지 않는다.
  assert.doesNotMatch(home, /setInterval/);
  const timerBodies = [...home.matchAll(/setTimeout\(([\s\S]*?)msUntilNextLocalMidnight/g)].map(
    m => m[1]
  );
  assert.equal(timerBodies.length, 1);
  assert.doesNotMatch(
    timerBodies[0],
    /fetchAccount|loadHomeExpense|loadMonthly|loadCategory|submitDailyLimit/
  );
  assert.match(timerBodies[0], /check\(\)/);
});

// ── 홈 구성·보호 ──────────────────────────────────────────────

test('안전금액 히어로: 계산 전에도 기존 레이아웃을 유지하고 가짜 금액 없이 계산 진입만 제공한다', () => {
  const section = code('src/components/home/HomeSafeAmountSection.js');
  const pending = section.slice(
    section.indexOf('if (amount == null) {'),
    section.indexOf('const hasUsage')
  );
  assert.match(pending, /styles\.date/);
  assert.match(pending, /오늘 안전하게 쓸 수 있는 돈/);
  assert.match(pending, /<Text style=\{\[styles\.amount, styles\.amountPending\]\}>-<\/Text>/);
  assert.match(pending, /onPress=\{onCalculatePress\}/);
  assert.match(pending, /오늘 쓸 수 있는 금액 계산하기/);
  assert.doesNotMatch(pending, /\d{2,}|usedToday|remaining|formatNumber/); // 숫자·사용/남은 금액 없음
  const home = code(HOME);
  assert.match(home, /onCalculatePress=\{handleWhyPress\}/);
  assert.match(home, /navigation\.navigate\(ROUTES\.DAILY_LIMIT\)/);
  assert.doesNotMatch(home, /\{amount != null && \(/);
});

test('홈 탭 구성: 계좌·거래내역·생활비 분석·머니 타입, 안전금액은 서버 계산 결과가 있을 때만 숫자를 보인다', () => {
  const home = code(HOME);
  const labels = [...home.matchAll(/\{ key: '(\w+)', label: '([^']+)' \}/g)].map(m => m[2]);
  assert.deepEqual(labels, ['계좌', '거래내역', '생활비 분석', '머니 타입']);
  // 금액은 서버 dailyLimit에서만 만들고, 계산일이 오늘인 결과일 때만 숫자로 보인다(어제 금액 미표시).
  assert.match(
    home,
    /const amount =\s*dailyLimit && isDailyLimitCurrent\(dailyLimitMeta\.calculatedOn, todayKey\)\s*\? toDisplayWon\(dailyLimit\.dailyLimit\)\s*: null;/
  );
  assert.match(home, /state\.asset\.cashflowDaily\.result/);
  assert.match(home, /dispatch\(fetchAccounts\(\)\)/);
  assert.match(home, /ROUTES\.ACCOUNT_OPEN/);
});

test('세션 격리: 홈이 서버 데이터를 로컬 state로 복사하지 않고 asset 슬라이스만 읽는다', () => {
  const home = code(HOME);
  const useStates = [...home.matchAll(/useState\((\(\) => new Date\(\)|[^)]*)\)/g)].map(m => m[1]);
  // 탭 키, 요청 플래그, 머니 타입 프로필(기존) + 날짜 표시/API-15 유효일 판정용 시계(서버 데이터 아님)
  assert.deepEqual(useStates, ["'account'", 'false', 'null', '() => new Date()']);
  for (const key of ['accountDetail', 'cashflowMonthly', 'cashflowCategory', 'selectedAccountId']) {
    assert.match(home, new RegExp(`state\\.asset\\.${key}`));
  }
});
