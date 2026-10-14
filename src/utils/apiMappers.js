// 백엔드 필드명이 확정되면 이 파일만 수정한다.
// 화면 컴포넌트는 아래 normalize 함수의 반환 shape에만 의존한다.
import { DEFAULT_ACCOUNT_LABEL, resolveAccountBank } from '../features/asset/virtualBanks';

// Asset 계좌/거래 매퍼. 입력은 assetAccountApi가 검증한 모델(API-52, API-11~14)이다.
// 서버에 없는 값(토큰, 메모, 수수료, 완료 시간, 상대방 이름)은 만들지 않는다. 계좌번호는 서버 값(API-52 마스킹 / API-11 실제 번호)만 전달한다.
// 금액은 *Exact가 true일 때만 숫자이고, 아니면 null이다(반올림·절사 없음). 날짜는 서버 문자열을 변환 없이 보존한다.

// 계좌 1건. bankCode/bankName은 서버 값(API-52)이며, 표시용 bankName은 서버 bankName 우선, 없으면 목록에 있는 bankCode의 시연용 이름이다.
// 둘 다 없으면 null(계좌 ID·최근 선택 은행으로 추측하지 않는다). API-52에서 제거된 syncStatus/lastSyncedAt/createdAt은 없으면 null이다.
export const normalizeAccount = raw => {
  const bank = resolveAccountBank(raw);
  return {
    id: raw?.accountId ?? null,
    balance: raw?.balanceExact === true ? (raw?.balance ?? null) : null,
    balanceExact: raw?.balanceExact === true,
    status: raw?.status ?? null,
    syncStatus: raw?.syncStatus ?? null,
    lastSyncedAt: raw?.lastSyncedAt ?? null,
    createdAt: raw?.createdAt ?? null,
    bankCode: raw?.bankCode ?? null,
    bankName: bank.name,
    bankInfoConflict: bank.conflict,
    // 서버(API-52)가 마스킹해 준 표시용 번호. 전체 번호는 목록에 오지 않는다.
    maskedAccountNumber: raw?.maskedAccountNumber ?? null,
    tokenId: null,
    isPrimary: false,
    isActive: raw?.status === 'ACTIVE',
    label: null,
  };
};

// 목록 라벨: 은행명이 있으면 은행명(같은 은행이 여러 개면 "은행명 1", "은행명 2"),
// 없으면 기존 중립 라벨 — 계좌가 1개면 "내 계좌", 여러 개면 서버 정렬 순서대로 "내 계좌 1", "내 계좌 2".
export const normalizeAccountList = accounts => {
  const list = Array.isArray(accounts) ? accounts : [];
  const normalized = list.map(raw => normalizeAccount(raw));
  const bankTotals = new Map();
  normalized.forEach(account => {
    if (account.bankName !== null) {
      bankTotals.set(account.bankName, (bankTotals.get(account.bankName) ?? 0) + 1);
    }
  });
  const bankSeen = new Map();
  return normalized.map((account, index) => {
    if (account.bankName === null) {
      return {
        ...account,
        label: list.length === 1 ? DEFAULT_ACCOUNT_LABEL : `${DEFAULT_ACCOUNT_LABEL} ${index + 1}`,
      };
    }
    const order = (bankSeen.get(account.bankName) ?? 0) + 1;
    bankSeen.set(account.bankName, order);
    return {
      ...account,
      label:
        bankTotals.get(account.bankName) > 1 ? `${account.bankName} ${order}` : account.bankName,
    };
  });
};

// 입출금 방향: DEPOSIT=in, WITHDRAW=out. TRANSFER/REVERSAL은 서버 응답만으로 방향을 알 수 없어 중립이다.
const resolveDirection = type => {
  if (type === 'DEPOSIT') return 'in';
  if (type === 'WITHDRAW') return 'out';
  return 'neutral';
};

// 거래 1건 (API-11 transactionHistory[], API-12, API-13).
// requestedAt/counterparty는 기존 화면 호환 별칭이며 createdAt/merchantName을 그대로 가리킨다.
export const normalizeTransaction = raw => ({
  id: raw?.transactionId ?? null,
  publicTransactionId: raw?.publicTransactionId ?? null,
  type: raw?.type ?? null,
  direction: resolveDirection(raw?.type),
  amount: raw?.amountExact === true ? (raw?.amount ?? null) : null,
  amountExact: raw?.amountExact === true,
  status: raw?.status ?? 'UNKNOWN',
  merchantName: raw?.merchantName ?? null,
  categoryCode: raw?.categoryCode ?? null,
  createdAt: raw?.createdAt ?? null,
  requestedAt: raw?.createdAt ?? null,
  counterparty: raw?.merchantName ?? null,
});

// API-12 거래 단건은 목록의 거래와 같은 모델이다(서버에 없는 수수료·완료 시간·메모는 만들지 않는다).
export const normalizeTransactionDetail = normalizeTransaction;

// API-11 / API-14 계좌 상세. 서버가 준 값을 전달하고, 거래는 normalizeTransaction으로 변환한다.
export const normalizeAccountDetail = raw => ({
  accountId: raw?.accountId ?? null,
  bankCode: raw?.bankCode ?? null,
  // 표시용 은행명: 서버 bankName 우선, 없으면 목록에 있는 bankCode의 시연용 이름, 둘 다 없으면 null
  bankName: resolveAccountBank(raw).name,
  bankInfoConflict: resolveAccountBank(raw).conflict,
  // 실제 14자리 계좌번호(API-11/14). 없으면 null — 마스킹 번호·accountId로 대신 만들지 않는다.
  accountNumber: raw?.accountNumber ?? null,
  balance: raw?.balanceExact === true ? (raw?.balance ?? null) : null,
  balanceExact: raw?.balanceExact === true,
  syncStatus: raw?.syncStatus ?? null,
  refreshing: raw?.refreshing === true,
  refreshFailed: raw?.refreshFailed === true,
  message: raw?.message ?? null,
  lastSyncedAt: raw?.lastSyncedAt ?? null,
  transactionHistory: Array.isArray(raw?.transactionHistory)
    ? raw.transactionHistory.map(normalizeTransaction)
    : [],
  nextCursor: raw?.nextCursor ?? null,
  hasNext: raw?.hasNext === true,
});

export const normalizeSummary = raw => ({
  currentBalance: raw?.currentBalance ?? raw?.balance ?? 0,
  availableBalance: raw?.availableBalance ?? raw?.usableBalance ?? raw?.spendableBalance ?? 0,
  heldAmount: raw?.heldAmount ?? raw?.pendingAmount ?? 0,
});

export const normalizeDailyLimit = raw => ({
  amount: raw?.amount ?? raw?.dailyLimit ?? 0,
  spent: raw?.spent ?? raw?.spentToday ?? 0,
  daysLeft: raw?.daysLeft ?? raw?.remainingDays ?? 0,
  status: raw?.status ?? 'safe',
  formulaItems: Array.isArray(raw?.formulaItems) ? raw.formulaItems : [],
  recommendItems: Array.isArray(raw?.recommendItems) ? raw.recommendItems : [],
});
