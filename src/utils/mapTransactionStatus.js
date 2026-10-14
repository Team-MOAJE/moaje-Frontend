const STATUS_MAP = {
  REQUESTED: 'pending',
  PENDING: 'pending',
  SENT: 'pending',
  SUCCEEDED: 'completed',
  COMPLETED: 'completed',
  UNKNOWN: 'checking',
  CHECK_REQUIRED: 'checking',
  RECONCILIATION_REQUIRED: 'checking',
  MANUAL_REVIEW_REQUIRED: 'checking',
  DEPOSIT_COMPLETED: 'depositCompleted',
  INCOME_COMPLETED: 'depositCompleted',
  EXPENSE_COMPLETED: 'expenseCompleted',
  PAYMENT_COMPLETED: 'expenseCompleted',
  // Asset 거래 status(API-11~13): FAILED / CANCELED는 서로 다른 값이며 성공·확인 중으로 합치지 않는다.
  FAILED: 'failed',
  CANCELED: 'canceled',
};

// SUCCESS는 거래 type으로 입금/출금 완료를 구분한다. 방향을 알 수 없는 TRANSFER / REVERSAL(또는 type 미전달)은 중립 'completed'.
const mapSuccess = type => {
  if (type === 'DEPOSIT') return 'depositCompleted';
  if (type === 'WITHDRAW') return 'expenseCompleted';
  return 'completed';
};

export const mapTransactionStatus = (apiStatus, type) =>
  apiStatus === 'SUCCESS' ? mapSuccess(type) : (STATUS_MAP[apiStatus] ?? 'checking');
