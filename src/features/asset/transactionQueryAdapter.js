// 주의: 이 파일은 백엔드 Gateway 확정 전 "임시 page 기반 pagination 계약"이다.
// 파라미터 이름(page/size/startDate/endDate)과 hasMore 추정 방식은 이 파일 하나만
// 고치면 대응 가능하지만, 서버가 cursor 기반으로 바뀌는 등 pagination 전략 자체가
// 바뀌면 assetSlice.js(transactionsNextPage)와 화면의 loadMore 호출부도 함께
// 손봐야 할 수 있다 — 이 파일만으로 모든 변경이 흡수된다고 가정하지 않는다.
export const TRANSACTION_PAGE_SIZE = 50;

export function buildTransactionListParams({ page = 0, dateRange } = {}) {
  return {
    page,
    size: TRANSACTION_PAGE_SIZE,
    startDate: dateRange?.startKey ?? undefined,
    endDate: dateRange?.endKey ?? undefined,
  };
}

export function extractTransactionListResult(envelopeData) {
  // TEMP: apiClient의 응답 인터셉터가 이미 envelope.data까지 unwrap해서 반환하므로
  // 여기 인자는 envelope.data 그 자체다. 그 안에서 거래 배열이 어디 있는지
  // (배열 자체인지 { transactions: [...] }인지)는 develop assetSlice.js가 기존에
  // 가정하던 shape을 그대로 따른 것이며, 백엔드 확정 전까지는 TEMP 가정이다.
  const items = Array.isArray(envelopeData) ? envelopeData : (envelopeData?.transactions ?? []);
  // TEMP: 서버가 hasNext/last 등 실제 필드를 내려주기 전까지, 요청 size만큼 꽉 채워
  // 돌아왔는지로 다음 페이지 존재 여부를 추정한다. 실제 필드가 확정되면 교체.
  const hasMore = items.length === TRANSACTION_PAGE_SIZE;
  return { items, hasMore };
}
