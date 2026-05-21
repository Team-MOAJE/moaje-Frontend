// 백엔드 필드명이 확정되면 이 파일만 수정한다.
// 화면 컴포넌트는 아래 normalize 함수의 반환 shape에만 의존한다.

export const normalizeAccount = raw => ({
  id: raw?.id ?? raw?.accountId ?? null,
  bankName: raw?.bankName ?? raw?.bank ?? '-',
  tokenId: raw?.tokenId ?? raw?.accountToken ?? '-',
  balance: raw?.balance ?? raw?.currentBalance ?? 0,
  isPrimary: raw?.isPrimary ?? raw?.primary ?? false,
});

export const normalizeTransaction = raw => ({
  id: raw?.id ?? raw?.transactionId ?? null,
  status: raw?.status ?? 'UNKNOWN',
  amount: raw?.amount ?? 0,
  counterparty: raw?.counterparty ?? raw?.recipientName ?? raw?.senderName ?? '-',
  requestedAt: raw?.requestedAt ?? raw?.createdAt ?? null,
  memo: raw?.memo ?? '',
  type: raw?.type ?? raw?.transactionType ?? null,
});

export const normalizeTransactionDetail = raw => ({
  ...normalizeTransaction(raw),
  description: raw?.description ?? null,
  completedAt: raw?.completedAt ?? raw?.updatedAt ?? null,
  fee: raw?.fee ?? 0,
  referenceId: raw?.referenceId ?? null,
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
