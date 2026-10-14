// Cashflow(API-15~17) 화면 표시/입력 로직(순수 함수, React·Redux 비의존). 화면은 이 모듈의 결과만 렌더링한다.
// 원칙
// - 서버가 주지 않는 값(오늘 쓴 돈, 상태, 비율)은 만들지 않는다. 금액을 임의로 합산하거나 반올림하지 않는다.
// - null(값 없음)과 실제 0원을 구분한다. 원 미만 소수(서버 BigDecimal 4자리)는 표시할 때만 0 방향으로 버린다(반올림 금지).
// - 날짜는 문자열 연산으로만 다룬다(시간대 변환 없음).
import { YEAR_MONTH_PATTERN, TRANSACTION_CATEGORIES } from './assetResponse';

export const AMOUNT_UNAVAILABLE = '-';

// ── 금액 ──────────────────────────────────────────────────────

// 표시용 원 단위 정수. 값이 없거나 유한수가 아니거나 안전 범위를 벗어나면 null. 소수는 0 방향으로 버린다.
export const toDisplayWon = value => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const truncated = Math.trunc(value);
  if (!Number.isSafeInteger(truncated)) return null;
  return truncated === 0 ? 0 : truncated; // -0 방지
};

export const formatCashflowAmount = value => {
  const won = toDisplayWon(value);
  if (won === null) return AMOUNT_UNAVAILABLE;
  const body = Math.abs(won).toLocaleString('ko-KR');
  return won < 0 ? `-${body}원` : `${body}원`;
};

// ── API-15 입력 ───────────────────────────────────────────────

export const DAILY_LIMIT_INPUT_FIELD = Object.freeze({
  DAYS: 'days',
  EXPECTED_INCOME: 'expectedIncome',
  FIXED_EXPENSES: 'fixedExpenses',
  EVENT_BUFFER: 'eventBuffer',
});

const DIGITS_PATTERN = /^[0-9]+$/;

export const sanitizeWonText = text =>
  typeof text === 'string' ? text.replace(/[^0-9]/g, '') : '';

// 입력 문자열 → API-15 요청 입력. 선택 금액이 비어 있으면 키를 생략한다(0으로 채우지 않음, null 전송 없음).
// days는 1 이상의 정수 필수. 반환: { ok: true, input } | { ok: false, field, message }
export const parseDailyLimitInput = ({ days, expectedIncome, fixedExpenses, eventBuffer } = {}) => {
  const toSafeInt = text => {
    // 쉼표·공백만 허용하고 그 밖의 문자(소수점·부호·글자)가 섞이면 잘못된 입력이다(조용히 숫자만 남기지 않는다).
    const digits = typeof text === 'string' ? text.replace(/[,\s]/g, '') : '';
    if (!DIGITS_PATTERN.test(digits)) return null;
    const parsed = parseInt(digits, 10);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  };

  const daysValue = toSafeInt(days);
  if (daysValue === null || daysValue === undefined || daysValue < 1) {
    return {
      ok: false,
      field: DAILY_LIMIT_INPUT_FIELD.DAYS,
      message: '다음 수입일까지 남은 일수를 1일 이상으로 입력해 주세요.',
    };
  }

  const input = { daysUntilNextPayday: daysValue };
  const optional = [
    [DAILY_LIMIT_INPUT_FIELD.EXPECTED_INCOME, 'expectedIncome', expectedIncome, '예상 수입'],
    [DAILY_LIMIT_INPUT_FIELD.FIXED_EXPENSES, 'fixedExpenses', fixedExpenses, '고정 지출'],
    [DAILY_LIMIT_INPUT_FIELD.EVENT_BUFFER, 'eventBuffer', eventBuffer, '예비비'],
  ];
  for (const [field, key, text, label] of optional) {
    const raw = typeof text === 'string' ? text.trim() : '';
    if (raw === '') continue; // 생략 — 서버 기본값
    const value = toSafeInt(raw);
    if (value === null || value === undefined) {
      return { ok: false, field, message: `${label}은(는) 0 이상의 숫자로 입력해 주세요.` };
    }
    input[key] = value;
  }
  return { ok: true, input };
};

// 저장된 요청 입력 → 입력란 문자열(재진입 시 복원). 값이 없으면 빈 문자열.
export const dailyLimitInputToText = input => ({
  days: Number.isSafeInteger(input?.daysUntilNextPayday) ? String(input.daysUntilNextPayday) : '',
  expectedIncome: Number.isSafeInteger(input?.expectedIncome) ? String(input.expectedIncome) : '',
  fixedExpenses: Number.isSafeInteger(input?.fixedExpenses) ? String(input.fixedExpenses) : '',
  eventBuffer: Number.isSafeInteger(input?.eventBuffer) ? String(input.eventBuffer) : '',
});

// 서버 계산 결과의 구성 항목(DailyLimitFormulaCard 입력). 서버 응답 값만 사용한다.
export const buildDailyLimitFormulaItems = result => {
  if (!result) return [];
  return [
    {
      label: '현재 잔액',
      caption: '활성 계좌 잔액 합계',
      op: null,
      displayValue: formatCashflowAmount(result.currentBalance),
    },
    {
      label: '예상 수입',
      caption: null,
      op: 'plus',
      displayValue: formatCashflowAmount(result.expectedIncome),
    },
    {
      label: '고정 지출',
      caption: null,
      op: 'minus',
      displayValue: formatCashflowAmount(result.fixedExpenses),
    },
    {
      label: '예비비',
      caption: null,
      op: 'minus',
      displayValue: formatCashflowAmount(result.eventBuffer),
    },
    {
      label: '남은 일수',
      caption: '위 금액을 나눠요',
      op: null,
      displayValue: `÷ ${result.daysUntilNextPayday}일`,
    },
  ];
};

export const DAILY_LIMIT_CONFLICT_MESSAGE =
  '연결된 계좌가 없거나 사용할 수 있는 계좌가 없어 계산할 수 없어요.';

// 오류 안내. 409만 계좌 조건으로 안내하고(서버 본문을 읽지 않는다), 그 외에는 서버/네트워크 오류 문구를 그대로 쓴다.
export const resolveDailyLimitErrorMessage = ({ message, status } = {}) =>
  status === 409 ? DAILY_LIMIT_CONFLICT_MESSAGE : (message ?? '계산에 실패했습니다.');

// ── 월 ────────────────────────────────────────────────────────

export const isYearMonth = value => typeof value === 'string' && YEAR_MONTH_PATTERN.test(value);

// 기기 현재 월(YYYY-MM). 화면 진입 시 기본 조회 월을 정하는 데만 쓴다.
export const getCurrentYearMonth = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

// 기기 로컬 기준 YYYY-MM-DD(홈 날짜 표시와 같은 기준). toISOString(UTC)을 쓰지 않아 날짜가 하루 밀리지 않는다.
export const getLocalDateKey = (now = new Date()) =>
  `${getCurrentYearMonth(now)}-${String(now.getDate()).padStart(2, '0')}`;

// 다음 로컬 자정까지 남은 밀리초(+1초 여유). 홈이 켜진 채 자정을 넘길 때 만료 확인 타이머에 쓴다.
export const msUntilNextLocalMidnight = (now = new Date()) => {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return Math.max(next.getTime() - now.getTime(), 0) + 1000;
};

// 저장된 계산일이 오늘일 때만 API-15 결과를 "오늘의 금액"으로 쓸 수 있다.
export const isDailyLimitCurrent = (calculatedOn, todayKey) =>
  typeof calculatedOn === 'string' && calculatedOn !== '' && calculatedOn === todayKey;

// YYYY-MM에 delta개월을 더한다(문자열 연산). 형식이 잘못되면 null.
export const shiftYearMonth = (yearMonth, delta) => {
  if (!isYearMonth(yearMonth) || !Number.isInteger(delta)) return null;
  const year = parseInt(yearMonth.slice(0, 4), 10);
  const month = parseInt(yearMonth.slice(5, 7), 10);
  const index = year * 12 + (month - 1) + delta;
  if (index < 0) return null;
  const nextYear = Math.floor(index / 12);
  const nextMonth = (index % 12) + 1;
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}`;
};

export const formatYearMonthLabel = yearMonth =>
  isYearMonth(yearMonth)
    ? `${yearMonth.slice(0, 4)}년 ${parseInt(yearMonth.slice(5, 7), 10)}월`
    : AMOUNT_UNAVAILABLE;

// 같은 형식의 YYYY-MM 문자열은 사전순 비교가 시간순이다.
export const isFutureYearMonth = (yearMonth, currentYearMonth) =>
  isYearMonth(yearMonth) && isYearMonth(currentYearMonth) && yearMonth > currentYearMonth;

// ── 월별/카테고리 표시 ────────────────────────────────────────

const CATEGORY_LABEL = Object.freeze({
  INCOME: '수입',
  FOOD: '식비',
  CAFE: '카페',
  TRANSPORT: '교통',
  CULTURE: '문화',
  SHOPPING: '쇼핑',
  STUDY: '학업',
  HOUSING: '주거',
  TRANSFER: '자금이동',
  OTHER: '기타',
  UNCATEGORIZED: '미분류',
});
export const UNKNOWN_CATEGORY_LABEL = '분류 없음';

export const getCategoryLabel = category => CATEGORY_LABEL[category] ?? UNKNOWN_CATEGORY_LABEL;

// 소비 카테고리에서 제외하는 항목(수입·자금이동은 월별 요약에 따로 표시한다).
const NON_SPENDING_CATEGORIES = Object.freeze(['INCOME', 'TRANSFER']);

// 서버 categories → 소비 카테고리 행. 서버 순서를 유지하고 금액을 합산·반올림·퍼센트 계산하지 않는다.
// 금액이 0인 항목은 목록에서 뺀다(서버가 거래 없는 카테고리를 0으로 채워 내려준다). barRatio는 막대 길이용 시각 비율이다.
export const buildCategoryRows = categories => {
  const list = Array.isArray(categories) ? categories : [];
  const spending = list.filter(
    item =>
      item &&
      TRANSACTION_CATEGORIES.includes(item.category) &&
      !NON_SPENDING_CATEGORIES.includes(item.category) &&
      toDisplayWon(item.amount) !== null &&
      item.amount !== 0
  );
  const peak = spending.reduce((max, item) => Math.max(max, Math.abs(item.amount)), 0);
  return spending.map(item => ({
    key: item.category,
    name: getCategoryLabel(item.category),
    amountText: formatCashflowAmount(item.amount),
    barRatio: peak > 0 ? Math.min(Math.abs(item.amount) / peak, 1) : 0,
  }));
};

// 월별 요약 행. 수입·지출·자금이동을 각각 서버 값 그대로 보여주고 서로 합산하지 않는다.
export const buildMonthlySummaryRows = monthly => {
  if (!monthly) return [];
  return [
    { key: 'income', label: '수입', amountText: formatCashflowAmount(monthly.incomeAmount) },
    { key: 'expense', label: '지출', amountText: formatCashflowAmount(monthly.expenseAmount) },
    {
      key: 'transfer',
      label: '자금이동',
      amountText: formatCashflowAmount(monthly.transferAmount),
    },
  ];
};

// 월별+카테고리가 모두 0이면 "거래 없음". 둘 중 하나라도 없으면 판정하지 않는다(false).
export const isCashflowEmpty = (monthly, category) =>
  monthly != null &&
  category != null &&
  monthly.incomeAmount === 0 &&
  monthly.expenseAmount === 0 &&
  monthly.transferAmount === 0 &&
  (category.categories ?? []).every(item => item.amount === 0);

// API-16/17 집계 시점(revision)이 서로 다르면 같은 월이라도 다른 시점 값이다.
export const hasRevisionMismatch = (monthly, category) =>
  monthly != null && category != null && monthly.revision !== category.revision;

// loading | error | ready. 오류가 데이터 없음(빈 월)으로 보이지 않게 한다.
export const resolveCashflowViewState = ({ loading, error, data }) => {
  if (data != null) return 'ready';
  if (loading) return 'loading';
  if (error) return 'error';
  return 'loading'; // 요청 전
};
