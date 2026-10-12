// apiClient의 ApiError(또는 일반 Error) → Redux rejectWithValue용 직렬화 가능한 객체.
// 기존 필드(message/requiredAction/code)는 그대로 유지하고 status/kind/traceId를 추가로 제공한다.
export const normalizeApiError = (error, fallback = '오류가 발생했습니다.') => ({
  message: error?.envelope?.message || error?.message || fallback,
  requiredAction: error?.requiredAction ?? error?.envelope?.error?.requiredAction ?? null,
  code: (error?.kind ? error.code : null) ?? error?.envelope?.code ?? null,
  status: error?.status ?? null,
  kind: error?.kind ?? null,
  traceId: error?.traceId ?? null,
});
