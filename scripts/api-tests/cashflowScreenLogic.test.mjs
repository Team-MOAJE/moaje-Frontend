// Cashflow 화면 순수 로직 단위 테스트(서버 호출 없음).
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/cashflowScreenLogic.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  AMOUNT_UNAVAILABLE,
  DAILY_LIMIT_CONFLICT_MESSAGE,
  buildCategoryRows,
  buildDailyLimitFormulaItems,
  buildMonthlySummaryRows,
  dailyLimitInputToText,
  formatCashflowAmount,
  formatYearMonthLabel,
  getCategoryLabel,
  getCurrentYearMonth,
  hasRevisionMismatch,
  isCashflowEmpty,
  isFutureYearMonth,
  parseDailyLimitInput,
  resolveCashflowViewState,
  resolveDailyLimitErrorMessage,
  shiftYearMonth,
  toDisplayWon,
} = await import('../../src/features/asset/cashflowScreenLogic.js');

// ── 금액 ──────────────────────────────────────────────────────

test('금액: null/없음은 "-"이고 실제 0원은 "0원"이다', () => {
  for (const missing of [null, undefined, NaN, Infinity, '1000', {}]) {
    assert.equal(formatCashflowAmount(missing), AMOUNT_UNAVAILABLE, String(missing));
    assert.equal(toDisplayWon(missing), null, String(missing));
  }
  assert.equal(formatCashflowAmount(0), '0원');
  assert.equal(toDisplayWon(0), 0);
});

test('금액: 소수는 반올림하지 않고 0 방향으로 버린다(서버 BigDecimal 4자리)', () => {
  assert.equal(toDisplayWon(12345.6789), 12345);
  assert.equal(toDisplayWon(0.9999), 0);
  assert.equal(Object.is(toDisplayWon(-0.5), -0), false, '-0을 만들지 않는다');
  assert.equal(toDisplayWon(-0.5), 0);
  assert.equal(toDisplayWon(-12345.6789), -12345);
  assert.equal(formatCashflowAmount(12345.9999), '12,345원');
  assert.equal(formatCashflowAmount(-12345.9999), '-12,345원');
  assert.equal(formatCashflowAmount(1234567), '1,234,567원');
});

test('금액: 안전 정수 범위를 벗어난 값은 표시하지 않는다(정밀도 손실 값을 보여주지 않음)', () => {
  assert.equal(toDisplayWon(2 ** 53), null);
  assert.equal(toDisplayWon(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
  assert.equal(formatCashflowAmount(1e21), AMOUNT_UNAVAILABLE);
});

// ── API-15 입력 ───────────────────────────────────────────────

test('입력: 남은 일수만 있으면 선택 금액 키는 생략된다(0·null로 채우지 않음)', () => {
  const parsed = parseDailyLimitInput({ days: '14' });
  assert.deepEqual(parsed, { ok: true, input: { daysUntilNextPayday: 14 } });
  assert.equal('expectedIncome' in parsed.input, false);
  const blank = parseDailyLimitInput({
    days: '7',
    expectedIncome: '',
    fixedExpenses: '  ',
    eventBuffer: undefined,
  });
  assert.deepEqual(blank, { ok: true, input: { daysUntilNextPayday: 7 } });
});

test('입력: 입력된 선택 금액은 정수(원)로 변환하고, 0도 값으로 보낸다', () => {
  const parsed = parseDailyLimitInput({
    days: '30',
    expectedIncome: '1,500,000',
    fixedExpenses: '0',
    eventBuffer: '50000',
  });
  assert.deepEqual(parsed.input, {
    daysUntilNextPayday: 30,
    expectedIncome: 1500000,
    fixedExpenses: 0,
    eventBuffer: 50000,
  });
});

test('입력: 남은 일수는 1 이상의 정수 필수이며 아니면 요청 값을 만들지 않는다', () => {
  for (const days of [undefined, null, '', ' ', '0', '00', 'abc', '-3', '1.5', '1e3', 14]) {
    const parsed = parseDailyLimitInput({ days });
    assert.equal(parsed.ok, false, String(days));
    assert.equal(parsed.field, 'days');
  }
  // 선택 금액도 소수점·부호·글자가 섞이면 조용히 보정하지 않고 거부한다.
  for (const bad of ['1.5', '-100', '10원', '1e3']) {
    const parsed = parseDailyLimitInput({ days: '3', fixedExpenses: bad });
    assert.equal(parsed.ok, false, bad);
    assert.equal(parsed.field, 'fixedExpenses');
  }
  assert.equal(parseDailyLimitInput(undefined).ok, false);
  assert.equal(parseDailyLimitInput({ days: '99999999999999999999' }).ok, false, '안전 정수 초과');
});

test('입력: 저장된 입력을 입력란 문자열로 복원한다', () => {
  assert.deepEqual(
    dailyLimitInputToText({ daysUntilNextPayday: 14, expectedIncome: 0, eventBuffer: 5000 }),
    { days: '14', expectedIncome: '0', fixedExpenses: '', eventBuffer: '5000' }
  );
  assert.deepEqual(dailyLimitInputToText(null), {
    days: '',
    expectedIncome: '',
    fixedExpenses: '',
    eventBuffer: '',
  });
});

test('결과 구성 항목: 서버 응답 값만 사용하고 spent·상태 항목을 만들지 않는다', () => {
  const items = buildDailyLimitFormulaItems({
    currentBalance: 500000,
    expectedIncome: 100000,
    fixedExpenses: 50000.5,
    eventBuffer: 0,
    daysUntilNextPayday: 10,
    dailyLimit: 55000,
    snapshotDate: '2026-10-13',
  });
  assert.deepEqual(
    items.map(i => [i.label, i.op, i.displayValue]),
    [
      ['현재 잔액', null, '500,000원'],
      ['예상 수입', 'plus', '100,000원'],
      ['고정 지출', 'minus', '50,000원'],
      ['예비비', 'minus', '0원'],
      ['남은 일수', null, '÷ 10일'],
    ]
  );
  assert.deepEqual(buildDailyLimitFormulaItems(null), []);
});

test('오류 안내: 409만 계좌 조건 문구이고, 그 외에는 오류 문구를 그대로 쓴다', () => {
  assert.equal(
    resolveDailyLimitErrorMessage({ message: '요청을 처리할 수 없습니다.', status: 409 }),
    DAILY_LIMIT_CONFLICT_MESSAGE
  );
  assert.equal(
    resolveDailyLimitErrorMessage({ message: '서버에 일시적인 문제가 발생했습니다.', status: 500 }),
    '서버에 일시적인 문제가 발생했습니다.'
  );
  assert.equal(
    resolveDailyLimitErrorMessage({ message: '네트워크 연결을 확인해주세요.', status: null }),
    '네트워크 연결을 확인해주세요.'
  );
  assert.equal(resolveDailyLimitErrorMessage(), '계산에 실패했습니다.');
});

// ── 월 ────────────────────────────────────────────────────────

test('월: 이동은 문자열 연산이며 연도 경계를 넘는다', () => {
  assert.equal(shiftYearMonth('2026-10', -1), '2026-09');
  assert.equal(shiftYearMonth('2026-01', -1), '2025-12');
  assert.equal(shiftYearMonth('2026-12', 1), '2027-01');
  assert.equal(shiftYearMonth('2026-10', 0), '2026-10');
  assert.equal(shiftYearMonth('2026-10', -14), '2025-08');
  for (const bad of [null, undefined, '2026-13', '2026-00', '202610', '2026-1', 202610]) {
    assert.equal(shiftYearMonth(bad, 1), null, String(bad));
  }
  assert.equal(shiftYearMonth('2026-10', 1.5), null);
  assert.equal(shiftYearMonth('0000-01', -1), null);
});

test('월: 현재 월·라벨·미래 판정', () => {
  assert.equal(getCurrentYearMonth(new Date(2026, 9, 13)), '2026-10');
  assert.equal(getCurrentYearMonth(new Date(2026, 0, 1)), '2026-01');
  assert.equal(formatYearMonthLabel('2026-09'), '2026년 9월');
  assert.equal(formatYearMonthLabel(null), AMOUNT_UNAVAILABLE);
  assert.equal(isFutureYearMonth('2026-11', '2026-10'), true);
  assert.equal(isFutureYearMonth('2027-01', '2026-12'), true);
  assert.equal(isFutureYearMonth('2026-10', '2026-10'), false);
  assert.equal(isFutureYearMonth('2026-09', '2026-10'), false);
  assert.equal(isFutureYearMonth(null, '2026-10'), false);
});

// ── 월별/카테고리 ─────────────────────────────────────────────

const monthly = (overrides = {}) => ({
  yearMonth: '2026-09',
  incomeAmount: 1000000,
  expenseAmount: 350000,
  transferAmount: 200000,
  revision: 3,
  calculatedAt: '2026-10-01T00:10:00',
  ...overrides,
});

const allCategories = overrides => {
  const base = [
    'INCOME',
    'FOOD',
    'CAFE',
    'TRANSPORT',
    'CULTURE',
    'SHOPPING',
    'STUDY',
    'HOUSING',
    'TRANSFER',
    'OTHER',
    'UNCATEGORIZED',
  ].map(category => ({ category, amount: 0 }));
  return base.map(item => ({ ...item, ...(overrides[item.category] ?? {}) }));
};

test('월별 요약: 수입·지출·자금이동을 각각 표시하고 서로 합산하지 않는다', () => {
  const rows = buildMonthlySummaryRows(monthly());
  assert.deepEqual(
    rows.map(r => [r.key, r.label, r.amountText]),
    [
      ['income', '수입', '1,000,000원'],
      ['expense', '지출', '350,000원'],
      ['transfer', '자금이동', '200,000원'],
    ]
  );
  const zero = buildMonthlySummaryRows(
    monthly({ incomeAmount: 0, expenseAmount: 0, transferAmount: 0 })
  );
  assert.deepEqual(
    zero.map(r => r.amountText),
    ['0원', '0원', '0원']
  );
  assert.deepEqual(buildMonthlySummaryRows(null), []);
});

test('카테고리: 소비 카테고리만 서버 순서대로, 0원 항목은 빼고, 수입·자금이동은 제외한다', () => {
  const rows = buildCategoryRows(
    allCategories({
      INCOME: { amount: 1000000 },
      FOOD: { amount: 120000 },
      CAFE: { amount: 30000.9 },
      TRANSFER: { amount: 200000 },
      UNCATEGORIZED: { amount: 60000 },
    })
  );
  assert.deepEqual(
    rows.map(r => [r.key, r.name, r.amountText]),
    [
      ['FOOD', '식비', '120,000원'],
      ['CAFE', '카페', '30,000원'],
      ['UNCATEGORIZED', '미분류', '60,000원'],
    ]
  );
  assert.equal(rows[0].barRatio, 1);
  assert.equal(rows[1].barRatio, 30000.9 / 120000);
  // 퍼센트·비율 텍스트·합계를 만들지 않는다.
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), ['amountText', 'barRatio', 'key', 'name']);
  }
});

test('카테고리: 빈 목록·전부 0원·알 수 없는 값은 안전하게 처리한다', () => {
  assert.deepEqual(buildCategoryRows(allCategories({})), []);
  assert.deepEqual(buildCategoryRows([]), []);
  assert.deepEqual(buildCategoryRows(null), []);
  assert.deepEqual(buildCategoryRows(undefined), []);
  const rows = buildCategoryRows([
    { category: 'UNKNOWN', amount: 5000 }, // 서버 계약에 없는 값 — 임의 항목으로 만들지 않는다
    { category: 'FOOD', amount: null },
    null,
    { category: 'OTHER', amount: 1000 },
  ]);
  assert.deepEqual(
    rows.map(r => r.key),
    ['OTHER']
  );
  assert.equal(getCategoryLabel('UNCATEGORIZED'), '미분류');
  assert.equal(getCategoryLabel('UNKNOWN'), '분류 없음');
  assert.equal(getCategoryLabel(undefined), '분류 없음');
});

test('빈 월 판정: 월별·카테고리가 모두 있고 전부 0일 때만 비어 있다 — 데이터가 없는 것(null)은 빈 월이 아니다', () => {
  const zeroMonthly = monthly({
    incomeAmount: 0,
    expenseAmount: 0,
    transferAmount: 0,
    revision: 1,
  });
  const zeroCategory = { yearMonth: '2026-09', revision: 1, categories: allCategories({}) };
  assert.equal(isCashflowEmpty(zeroMonthly, zeroCategory), true);
  assert.equal(isCashflowEmpty(monthly(), zeroCategory), false);
  assert.equal(
    isCashflowEmpty(zeroMonthly, {
      ...zeroCategory,
      categories: allCategories({ FOOD: { amount: 1 } }),
    }),
    false
  );
  assert.equal(isCashflowEmpty(null, zeroCategory), false);
  assert.equal(isCashflowEmpty(zeroMonthly, null), false);
});

test('revision: 두 응답의 집계 시점이 다르면 감지하고, 하나라도 없으면 판정하지 않는다', () => {
  assert.equal(hasRevisionMismatch(monthly({ revision: 3 }), { revision: 4 }), true);
  assert.equal(hasRevisionMismatch(monthly({ revision: 3 }), { revision: 3 }), false);
  assert.equal(hasRevisionMismatch(null, { revision: 3 }), false);
  assert.equal(hasRevisionMismatch(monthly(), null), false);
});

test('화면 상태: 오류는 빈 데이터로 보이지 않고, 데이터가 있으면 ready다', () => {
  assert.equal(resolveCashflowViewState({ loading: true, error: null, data: null }), 'loading');
  assert.equal(resolveCashflowViewState({ loading: false, error: '실패', data: null }), 'error');
  assert.equal(resolveCashflowViewState({ loading: false, error: null, data: monthly() }), 'ready');
  assert.equal(resolveCashflowViewState({ loading: false, error: null, data: null }), 'loading');
});
