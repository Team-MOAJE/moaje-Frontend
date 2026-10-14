// Asset 화면 표시 로직(순수 함수, React 비의존). 화면은 이 모듈의 결과만 렌더링한다.
// 원칙:
// - 서버에 없는 값(은행명, 계좌번호, 총잔액, 메모, 상대방 이름)은 만들지 않는다.
// - 금액은 *Exact가 true인 안전한 정수일 때만 표시하고, 아니면 '-'다(null을 0원으로, 반올림·절사 금지).
// - 날짜는 서버 문자열을 정규식으로만 읽는다. new Date·시간대 변환·상대 날짜(오늘/어제)를 쓰지 않는다.
import { formatKRW } from '../../utils/formatMoney';
import { filterByPeriod } from './transactionQueryAdapter';

// ── 금액 ──────────────────────────────────────────────────────

export const AMOUNT_UNAVAILABLE = '-';

// exact가 true이고 안전한 정수일 때만 "N원", 그 외(null·부정확·비정수)는 '-'.
export const formatExactMoney = (value, exact) =>
  exact === true && Number.isSafeInteger(value) ? formatKRW(value) : AMOUNT_UNAVAILABLE;

// ── 계좌 상태 ─────────────────────────────────────────────────

const ACCOUNT_STATUS_LABEL = Object.freeze({
  SUSPENDED: '일시 중지',
  CLOSED: '해지',
});

export const ACCOUNT_STATUS_NOTICE = Object.freeze({
  SUSPENDED: '이용이 일시 중지된 계좌예요. 조회만 가능해요.',
  CLOSED: '해지된 계좌예요. 조회만 가능해요.',
});

// ACTIVE는 배지·안내가 없다(null). 알 수 없는 상태도 만들어 내지 않는다.
export const getAccountStatusLabel = account => ACCOUNT_STATUS_LABEL[account?.status] ?? null;
export const getAccountStatusNotice = account => ACCOUNT_STATUS_NOTICE[account?.status] ?? null;

// 송금 출금 계좌 후보는 ACTIVE만. SUSPENDED/CLOSED는 조회 전용이다.
export const canTransferFrom = account => account?.status === 'ACTIVE';

// 동기화 상태 표시. 정상(SYNCED)이거나 상세가 없으면 null. message는 서버 값 그대로만 쓴다.
export const describeSyncStatus = detail => {
  if (!detail) return null;
  const message = typeof detail.message === 'string' && detail.message ? detail.message : null;
  if (detail.refreshFailed === true || detail.syncStatus === 'STALE') {
    return { label: '새로고침 실패', message, tone: 'error' };
  }
  if (detail.refreshing === true || detail.syncStatus === 'RECONCILING') {
    return { label: '갱신 중', message, tone: 'progress' };
  }
  if (detail.syncStatus === 'SYNC_REQUIRED') {
    return { label: '동기화 필요', message, tone: 'notice' };
  }
  return null;
};

// ── 홈 계좌 목록 ──────────────────────────────────────────────

// loading | error | empty | list. 오류와 0개를 구분한다. fetched=false(요청 전)는 빈 상태가 아니라 loading이다.
export const resolveHomeAccountsState = ({ accounts, loading, error, fetched = true } = {}) => {
  const hasAccounts = Array.isArray(accounts) && accounts.length > 0;
  if (hasAccounts) return 'list';
  if (loading) return 'loading';
  if (error) return 'error';
  return fetched ? 'empty' : 'loading';
};

// 홈 행 모델. 은행명·토큰 필드는 없다. 총잔액 합산은 하지 않는다(서버 합계 API 없음).
export const buildHomeAccountItems = accounts =>
  (Array.isArray(accounts) ? accounts : []).map(account => ({
    id: account.id,
    label: account.label,
    status: account.status,
    statusLabel: getAccountStatusLabel(account),
    balanceText: formatExactMoney(account.balance, account.balanceExact),
  }));

// ── 거래 표시 ─────────────────────────────────────────────────

export const TX_TYPE_LABEL = Object.freeze({
  DEPOSIT: '입금',
  WITHDRAW: '출금',
  TRANSFER: '이체',
  REVERSAL: '정정',
});

export const getTxTypeLabel = tx => TX_TYPE_LABEL[tx?.type] ?? '거래';

// 서버가 준 가맹점/상대 이름이 있으면 그것, 없으면 유형 라벨(이름을 만들지 않는다).
export const resolveTxTitle = tx => {
  const name = typeof tx?.counterparty === 'string' ? tx.counterparty.trim() : '';
  return name || getTxTypeLabel(tx);
};

// 금액 문자열. 부정확/없음 → '-'. 방향이 in이면 +, out이면 -, neutral(TRANSFER/REVERSAL)은 부호 없음.
export const formatTxAmount = tx => {
  if (tx?.amountExact !== true || !Number.isSafeInteger(tx?.amount)) return AMOUNT_UNAVAILABLE;
  const body = formatKRW(Math.abs(tx.amount));
  if (tx.direction === 'in') return `+${body}`;
  if (tx.direction === 'out') return `-${body}`;
  return body;
};

// 'positive'는 입금(in)만. 방향이 불명확하거나 금액을 표시할 수 없으면 기본색.
export const txAmountTone = tx =>
  tx?.direction === 'in' && formatTxAmount(tx) !== AMOUNT_UNAVAILABLE ? 'positive' : 'default';

// 거래 유형 필터 탭. status가 아니라 type 기준이다.
const FILTER_TYPE = Object.freeze({ 입금: 'DEPOSIT', 출금: 'WITHDRAW', 송금: 'TRANSFER' });
export const matchesTxFilter = (tx, filter) => {
  const type = FILTER_TYPE[filter];
  return type === undefined ? true : tx?.type === type;
};

// ── 날짜 (서버 문자열 그대로, 시간대 변환 없음) ─────────────────

const DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/;
export const UNKNOWN_DATE_GROUP = '날짜 미상';

// 'YYYY-MM-DD...' → 'YYYY.MM.DD'. 읽을 수 없으면 '-'.
export const formatServerDate = value => {
  const match = DATE_TIME_PATTERN.exec(typeof value === 'string' ? value : '');
  return match ? `${match[1]}.${match[2]}.${match[3]}` : '-';
};

// 'YYYY-MM-DDTHH:mm...' → 'YYYY.MM.DD HH:mm'(시각이 없으면 날짜만). 오프셋/Z가 있어도 변환하지 않는다.
export const formatServerDateTime = value => {
  const match = DATE_TIME_PATTERN.exec(typeof value === 'string' ? value : '');
  if (!match) return '-';
  const date = `${match[1]}.${match[2]}.${match[3]}`;
  return match[4] === undefined ? date : `${date} ${match[4]}:${match[5]}`;
};

export const groupKeyOf = value => {
  const date = formatServerDate(value);
  return date === '-' ? UNKNOWN_DATE_GROUP : date;
};

// 불러온 거래 → 기간 필터(클라이언트) → 유형 필터 → 날짜 그룹. 서버 요청과 무관한 순수 변환이다.
// period = { startKey, endKey } ('YYYY-MM-DD'). 서버 순서(최신순)를 유지한다.
export const buildHistoryViewModel = ({ transactions, filter = '전체', period } = {}) => {
  const byPeriod = filterByPeriod(transactions, period);
  const filtered = byPeriod.filter(tx => matchesTxFilter(tx, filter));
  const groups = [];
  const indexByKey = new Map();
  for (const tx of filtered) {
    const key = groupKeyOf(tx.createdAt);
    if (!indexByKey.has(key)) {
      indexByKey.set(key, groups.length);
      groups.push({ group: key, items: [] });
    }
    groups[indexByKey.get(key)].items.push(tx);
  }
  return {
    groups,
    count: filtered.length,
    loadedCount: Array.isArray(transactions) ? transactions.length : 0,
  };
};

// 거래내역 화면의 조회 대상. 거래 요청은 kind==='ready'일 때만 보낸다(accountId 없으면 요청 금지).
// loading | error | empty | noSelection | ready(accountId)
export const resolveHistoryTarget = ({
  accounts,
  selectedAccountId,
  accountsLoading,
  accountsError,
  fetched = true,
} = {}) => {
  const list = Array.isArray(accounts) ? accounts : [];
  if (list.length === 0) {
    if (accountsLoading) return { kind: 'loading' };
    if (accountsError) return { kind: 'error', message: accountsError };
    return fetched ? { kind: 'empty' } : { kind: 'loading' };
  }
  const selected = selectedAccountId == null ? null : list.find(a => a.id === selectedAccountId);
  // 계좌가 있지만 선택되지 않음(예: ACTIVE 계좌가 없어 기본 선택이 null) — 임의로 고르지 않는다.
  if (!selected) return { kind: 'noSelection' };
  return { kind: 'ready', accountId: selected.id, account: selected };
};
