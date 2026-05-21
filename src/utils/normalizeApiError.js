export const normalizeApiError = (error, fallback = '오류가 발생했습니다.') => ({
  message: error?.envelope?.message || error?.message || fallback,
  requiredAction: error?.envelope?.error?.requiredAction ?? null,
  code: error?.envelope?.code ?? null,
});
