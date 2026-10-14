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

// ── 송금 금액 검증 (잔액 초과 방지) ────────────────────────────

export const TRANSFER_AMOUNT_ISSUE = Object.freeze({
  INVALID_AMOUNT: 'INVALID_AMOUNT', // 안전한 양의 정수가 아님(0·음수·소수·정밀도 초과)
  NO_BALANCE_INFO: 'NO_BALANCE_INFO', // 정확한 잔액을 알 수 없음(balanceExact가 true인 안전 정수가 아님)
  EXCEEDS_BALANCE: 'EXCEEDS_BALANCE', // 출금 계좌 잔액 초과
});

export const EXCEEDS_BALANCE_MESSAGE = '계좌 잔액을 초과하는 금액은 송금할 수 없어요.';
export const AMOUNT_TOO_LARGE_MESSAGE = '입력할 수 없는 큰 금액이에요. 금액을 다시 입력해 주세요.';

// 출금 계좌(서버 잔액) 기준으로 금액이 새 송금에 쓸 수 있는지 판정한다. 문제가 없으면 null.
// 잔액을 정확히 알 수 없으면(balanceExact !== true, 비안전 정수) 송금 가능한 금액을 만들지 않는다.
export const getTransferAmountIssue = ({ account, amount }) => {
  if (!Number.isSafeInteger(amount) || amount <= 0) return TRANSFER_AMOUNT_ISSUE.INVALID_AMOUNT;
  if (!account || account.balanceExact !== true || !Number.isSafeInteger(account.balance)) {
    return TRANSFER_AMOUNT_ISSUE.NO_BALANCE_INFO;
  }
  return amount > account.balance ? TRANSFER_AMOUNT_ISSUE.EXCEEDS_BALANCE : null;
};

// 송금 완료 후 서버 잔액을 아직 확인하지 못한 계좌인지. 이 계좌의 목록 잔액은 최신으로 취급하지 않는다.
export const isBalanceStale = (staleIds, accountId) =>
  Array.isArray(staleIds) && typeof accountId === 'string' && staleIds.includes(accountId);

export const BALANCE_CHECKING_MESSAGE = '계좌 잔액을 확인 중이에요.';
export const BALANCE_CHECK_FAILED_MESSAGE =
  '송금 후 잔액을 확인하지 못했어요. 잠시 후 계좌 화면에서 새로고침해 주세요.';

// 송금 확인 직전 재검증(새 송금 전용 — 미확정 송금 재확인 경로에는 쓰지 않는다).
// - state: 그 시점의 최신 Redux 루트 상태(렌더에서 캡처한 값이 아님).
// - snapshot: 확인창을 연 시점의 송금 내용 { userId, sessionGeneration, accountId, amount, depositBankCode, depositAccountNumber }.
// - current: 확인 시점의 화면 입력 { accountId, amount, depositBankCode, depositAccountNumber }.
// 통과하면 null, 아니면 사유 문자열('CHANGED' | 'BLOCKED' | TRANSFER_AMOUNT_ISSUE 값).
export const validateTransferAtConfirm = ({ state, snapshot, current }) => {
  const userId = state?.auth?.user?.userId;
  const asset = state?.asset;
  if (!asset || !snapshot || !current) return 'CHANGED';
  if (typeof userId !== 'string' || userId === '' || userId !== snapshot.userId) return 'CHANGED';
  if (asset.sessionGeneration !== snapshot.sessionGeneration) return 'CHANGED';
  for (const field of ['accountId', 'amount', 'depositBankCode', 'depositAccountNumber']) {
    if (current[field] !== snapshot[field]) return 'CHANGED';
  }
  if (asset.transferLoading || asset.pendingTransfer != null) return 'BLOCKED';
  // 송금 후 서버 잔액이 확인되기 전에는 목록 잔액으로 새 송금을 검증하지 않는다.
  if (isBalanceStale(asset.staleBalanceAccountIds, snapshot.accountId)) return 'STALE_BALANCE';
  const account = Array.isArray(asset.accounts)
    ? asset.accounts.find(item => item.id === snapshot.accountId)
    : undefined;
  if (!canTransferFrom(account)) return 'CHANGED';
  return getTransferAmountIssue({ account, amount: snapshot.amount });
};

// 계좌 상세: route accountId가 문자열이고 목록에 있을 때만 "적용 대기"다. 적용 직후 화면이
// navigation.setParams({ accountId: undefined })로 소비하므로 이후 사용자 선택은 덮어쓰이지 않는다.
// 목록에 없는 id는 적용하지 않는다. id는 문자열로만 비교한다(Number 변환 없음).
export const hasPendingRouteSeed = (routeAccountId, accounts) =>
  typeof routeAccountId === 'string' &&
  Array.isArray(accounts) &&
  accounts.some(account => account.id === routeAccountId);

// 송금 화면의 fromAccountId param 식별값. 사용자 선택이 어느 param 상태에서 이루어졌는지 비교한다.
export const transferFromParamKey = (hasFromParam, fromParam) =>
  hasFromParam ? `param:${typeof fromParam === 'string' ? fromParam : ''}` : 'none';

// 송금 출금 계좌 id 결정. 우선순위: 유효한 사용자 선택 > fromAccountId param > 고정(pinned) 기본 계좌.
// userPick = { generation, id, paramKey } — 세션(sessionGeneration)이 같고 선택 당시와 param 상태가
// 같을 때만 유효하다(새 param이 오거나 사용자가 바뀌면 이전 선택은 무효).
export const resolveTransferFromId = ({
  hasFromParam,
  fromParam,
  pinnedId,
  userPick,
  sessionGeneration,
}) => {
  const paramKey = transferFromParamKey(hasFromParam, fromParam);
  const pickValid =
    userPick != null &&
    userPick.generation === sessionGeneration &&
    userPick.paramKey === paramKey &&
    typeof userPick.id === 'string' &&
    userPick.id.length > 0;
  if (pickValid) return { requestedFromId: userPick.id, fromParamValid: true, usingPick: true };
  if (hasFromParam) {
    const fromParamValid = typeof fromParam === 'string' && fromParam.trim().length > 0;
    return {
      requestedFromId: fromParamValid ? fromParam : null,
      fromParamValid,
      usingPick: false,
    };
  }
  return { requestedFromId: pinnedId ?? null, fromParamValid: true, usingPick: false };
};

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

// 계좌 상세 제목. 목록 라벨(API-52 은행 정보 기반)을 기본으로 쓰고, 목록에는 은행 정보가 없는데
// 같은 계좌의 상세(API-11/14)가 은행명을 주면 그 이름을 쓴다. 둘 다 없으면 목록의 중립 라벨을 유지한다.
// 다른 계좌의 상세 은행명은 쓰지 않는다(호출부가 선택 계좌와 일치하는 상세만 넘긴다).
export const resolveAccountTitle = (account, detail) => {
  if (!account) return null;
  if (account.bankName == null && typeof detail?.bankName === 'string' && detail.bankName !== '') {
    return detail.bankName;
  }
  return account.label ?? null;
};

// 계좌번호: 실제 번호는 14자리 숫자 문자열(서버 보장). 표시용 하이픈은 화면 전용이며 복사값과 분리한다.
const ACCOUNT_NUMBER_PATTERN = /^[0-9]{14}$/;

// 표시용 포맷(4-4-6). 14자리 숫자가 아니면 null — 마스킹 번호·accountId·ACCOUNT-{id}를 포맷해 번호처럼 보이게 하지 않는다.
export const formatAccountNumber = accountNumber =>
  typeof accountNumber === 'string' && ACCOUNT_NUMBER_PATTERN.test(accountNumber)
    ? `${accountNumber.slice(0, 4)}-${accountNumber.slice(4, 8)}-${accountNumber.slice(8)}`
    : null;

// 복사할 값 결정. 정규화된 상세(detail.accountId)가 현재 선택 계좌(selectedAccountId = 목록 id)와 같고,
// accountNumber가 14자리 숫자일 때만 서버 원문 그대로 반환한다. 아니면 null(복사 불가).
// accountId·maskedAccountNumber·표시용 하이픈 문자열은 절대 반환하지 않는다.
export const getCopyableAccountNumber = (detail, selectedAccountId) =>
  typeof selectedAccountId === 'string' &&
  selectedAccountId !== '' &&
  detail?.accountId === selectedAccountId &&
  typeof detail.accountNumber === 'string' &&
  ACCOUNT_NUMBER_PATTERN.test(detail.accountNumber)
    ? detail.accountNumber
    : null;

// 홈 행 모델. 토큰 필드는 없다(은행명은 account.label에 이미 반영된다). 총잔액 합산은 하지 않는다(서버 합계 API 없음).
// maskedAccountNumber는 서버(API-52)가 준 마스킹 번호만 전달한다(전체 번호는 목록에 없다).
// staleBalanceIds에 든 계좌(송금 후 서버 잔액 미확인)는 이전 잔액 대신 '-'를 보여준다.
export const buildHomeAccountItems = (accounts, staleBalanceIds = []) =>
  (Array.isArray(accounts) ? accounts : []).map(account => ({
    id: account.id,
    label: account.label,
    maskedAccountNumber: account.maskedAccountNumber ?? null,
    status: account.status,
    statusLabel: getAccountStatusLabel(account),
    balanceText: isBalanceStale(staleBalanceIds, account.id)
      ? '-'
      : formatExactMoney(account.balance, account.balanceExact),
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
