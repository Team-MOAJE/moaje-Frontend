// 홈 탭(거래내역·생활비 분석)·계좌 이동 표시 로직(순수 함수, React·Redux 비의존). 홈 화면은 이 결과만 렌더링한다.
// 원칙
// - 서버 응답에 있는 값만 쓴다. 계좌 간 거래를 합치지 않고, 날짜·금액·비율을 만들지 않는다.
// - 날짜는 서버 문자열(createdAt)을 정규식으로만 읽는다(new Date·시간대 변환 없음). 읽을 수 없으면 해당 필드를 생략한다.
// - 퍼센트는 서버가 주지 않으므로 만들지 않는다. barRatio는 금액 기반 시각 길이일 뿐 서버 비율이 아니다.
import { formatTxAmount, resolveTxTitle, txAmountTone } from './assetScreenLogic';
import {
  AMOUNT_UNAVAILABLE,
  buildCategoryRows,
  formatCashflowAmount,
  isCashflowEmpty,
  resolveCashflowViewState,
} from './cashflowScreenLogic';

export const HOME_RECENT_TRANSACTION_COUNT = 5;

const DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/;

// 'YYYY-MM-DDTHH:mm...' → { group: 'M월 D일', time: 'HH:mm' | null }. 읽을 수 없으면 { group: null, time: null }.
export const parseServerDateParts = value => {
  const match = DATE_TIME_PATTERN.exec(typeof value === 'string' ? value : '');
  if (!match) return { group: null, time: null };
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return { group: null, time: null };
  return {
    group: `${month}월 ${day}일`,
    time: match[4] === undefined ? null : `${match[4]}:${match[5]}`,
  };
};

// ── 거래내역 탭 (API-11 선택 계좌의 최근 거래) ─────────────────

// 서버 거래 → HomeTransactionTab 행. 상대방 이름·금액은 기존 규칙(resolveTxTitle/formatTxAmount)을 따른다.
export const buildHomeTransactionItems = (transactions, limit = HOME_RECENT_TRANSACTION_COUNT) =>
  (Array.isArray(transactions) ? transactions : []).slice(0, limit).map(tx => {
    const { group, time } = parseServerDateParts(tx?.createdAt);
    return {
      id: tx.id,
      counterparty: resolveTxTitle(tx),
      group,
      time,
      amountText: formatTxAmount(tx),
      tone: txAmountTone(tx),
    };
  });

// none(선택 계좌 없음) | loading | error | empty | list. 다른 계좌의 상세는 사용하지 않는다.
export const resolveHomeTransactionsState = ({
  selectedAccountId,
  detail,
  detailAccountId,
  loading,
  error,
} = {}) => {
  if (selectedAccountId == null) return 'none';
  const sameAccount = detail != null && detailAccountId === selectedAccountId;
  if (sameAccount) {
    return (detail.transactionHistory ?? []).length > 0 ? 'list' : 'empty';
  }
  if (loading) return 'loading';
  if (error) return 'error';
  return 'loading'; // 요청 전
};

// 홈에서 선택 계좌 상세(API-11)를 요청해야 하는지. 같은 계좌의 상세가 있거나 진행 중이면 요청하지 않는다.
export const shouldFetchHomeAccountDetail = ({
  selectedAccountId,
  detailAccountId,
  loading,
  error,
} = {}) => selectedAccountId != null && detailAccountId !== selectedAccountId && !loading && !error;

// 거래 상세 이동 params(id는 문자열 그대로).
export const buildTransactionDetailParams = (accountId, transactionId) =>
  typeof accountId === 'string' &&
  accountId !== '' &&
  typeof transactionId === 'string' &&
  transactionId !== ''
    ? { accountId, transactionId }
    : null;

// ── 생활비 분석 탭 (API-16/17) ────────────────────────────────

// 월 라벨('M월')은 조회 월 문자열에서만 만든다.
export const formatMonthOnlyLabel = yearMonth => {
  const match = /^(\d{4})-(\d{2})$/.exec(typeof yearMonth === 'string' ? yearMonth : '');
  if (!match) return null;
  const month = parseInt(match[2], 10);
  return month >= 1 && month <= 12 ? `${month}월` : null;
};

// loading | error | empty | ready. 홈 탭은 소비 카테고리 행과 월 지출(서버 expenseAmount)만 사용한다.
export const buildHomeExpenseView = ({ yearMonth, monthly, category } = {}) => {
  const monthlyView = resolveCashflowViewState(monthly ?? {});
  const categoryView = resolveCashflowViewState(category ?? {});
  const monthLabel = formatMonthOnlyLabel(yearMonth);
  if (monthlyView === 'error' || categoryView === 'error') {
    return { state: 'error', monthLabel, totalText: null, topCategoryName: null, rows: [] };
  }
  if (monthlyView !== 'ready' || categoryView !== 'ready') {
    return { state: 'loading', monthLabel, totalText: null, topCategoryName: null, rows: [] };
  }
  const rows = buildCategoryRows(category.data?.categories);
  const empty = isCashflowEmpty(monthly.data, category.data);
  return {
    state: empty ? 'empty' : 'ready',
    monthLabel,
    totalText: formatCashflowAmount(monthly.data?.expenseAmount),
    // 서버 금액이 가장 큰 소비 카테고리(barRatio 1). 합산·비율 계산 없이 이름만 사용한다.
    topCategoryName: rows.find(row => row.barRatio === 1)?.name ?? null,
    rows,
  };
};

// 홈 생활비 분석 탭이 현재 월 데이터를 요청해야 하는지(이미 같은 월 데이터가 있거나 진행 중이면 요청하지 않는다).
export const shouldLoadHomeExpense = ({ currentYearMonth, yearMonth, monthly, category } = {}) => {
  if (!currentYearMonth) return false;
  if (yearMonth !== currentYearMonth) return true;
  const hasBoth = monthly?.data != null && category?.data != null;
  const busy = Boolean(monthly?.loading) || Boolean(category?.loading);
  const failed = Boolean(monthly?.error) || Boolean(category?.error);
  return !hasBoth && !busy && !failed;
};

// ── 머니 타입 탭의 이번 달 소비 요약 (API-16/17, 생활비 분석 탭과 같은 상태) ──

// 학기·시험기간 같은 분석은 서버에 없으므로 만들지 않는다. 조회 월의 지출 합계(서버 expenseAmount)와
// 서버 금액이 큰 순서 상위 2개 소비 카테고리만 보여준다. 퍼센트는 서버가 주지 않아 계산하지 않는다.
// state: loading | error | empty | ready
export const buildHomeSpendingSummary = ({ yearMonth, monthly, category } = {}) => {
  const view = buildHomeExpenseView({ yearMonth, monthly, category });
  const base = { state: view.state, periodLabel: view.monthLabel, summary: null, rows: [] };
  if (view.state !== 'ready') return base;

  // barRatio는 금액 기반이라 내림차순 정렬이 금액 순서와 같다(동률은 서버 순서 유지).
  const ranked = view.rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => b.row.barRatio - a.row.barRatio || a.index - b.index)
    .map(item => item.row);
  const labels = ['가장 많이 지출한 항목', '두 번째로 지출한 항목'];
  return {
    ...base,
    summary:
      view.monthLabel && view.totalText !== AMOUNT_UNAVAILABLE
        ? `${view.monthLabel} 지출은 ${view.totalText}이에요`
        : null,
    rows: ranked.slice(0, 2).map((row, index) => ({
      key: index === 0 ? 'top' : 'second',
      label: labels[index],
      value: `${row.name} ${row.amountText}`,
    })),
  };
};
