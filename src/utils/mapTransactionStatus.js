const STATUS_MAP = {
  REQUESTED: 'pending',
  PENDING: 'pending',
  SENT: 'pending',
  SUCCEEDED: 'completed',
  COMPLETED: 'completed',
  FAILED: 'failed',
  UNKNOWN: 'checking',
  CHECK_REQUIRED: 'checking',
  RECONCILIATION_REQUIRED: 'checking',
  MANUAL_REVIEW_REQUIRED: 'checking',
  REVERSED: 'reversed',
  DEPOSIT_COMPLETED: 'depositCompleted',
  INCOME_COMPLETED: 'depositCompleted',
  EXPENSE_COMPLETED: 'expenseCompleted',
  PAYMENT_COMPLETED: 'expenseCompleted',
};

export const mapTransactionStatus = apiStatus => STATUS_MAP[apiStatus] ?? 'checking';
