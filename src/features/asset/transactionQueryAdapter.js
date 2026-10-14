// 거래 목록(API-13) 조회 어댑터. 서버는 50건 고정 커서 방식이며 기간·size·page 파라미터가 없다.
// - 다음 페이지: 이전 응답의 nextCursor를 lastTransactionId로 보낸다(문자열 그대로, Number 변환 금지).
// - 기간 필터는 서버 조건이 아니다. 이미 불러온 거래에만 클라이언트에서 적용한다(filterByPeriod).
import { buildTransactionsQuery } from './assetAccountApi';

// 첫 페이지는 쿼리 없음, 다음 페이지는 { lastTransactionId }. 커서 형식 오류는 요청 전에 거부된다.
export function buildTransactionsCursorQuery({ cursor } = {}) {
  return buildTransactionsQuery({ lastTransactionId: cursor ?? undefined });
}

// mapAccountTransactionsResponse 결과를 슬라이스 입력 형태로 읽는다. hasNext/nextCursor는 서버 값 그대로(추정 없음).
export function extractTransactionListResult(result) {
  return {
    items: Array.isArray(result?.transactions) ? result.transactions : [],
    nextCursor: result?.nextCursor ?? null,
    hasNext: result?.hasNext === true,
  };
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_PREFIX_PATTERN = /^(\d{4}-\d{2}-\d{2})/;

// createdAt(서버 문자열)의 날짜 부분만 문자열로 비교한다. new Date·시간대 변환을 쓰지 않는다.
// startKey/endKey는 'YYYY-MM-DD'(경계 포함). 형식이 아닌 경계는 무시한다. 기간이 지정됐는데 날짜를 읽을 수 없는 거래는 제외한다.
export function filterByPeriod(transactions, { startKey, endKey } = {}) {
  const list = Array.isArray(transactions) ? transactions : [];
  const start = DATE_KEY_PATTERN.test(startKey ?? '') ? startKey : null;
  const end = DATE_KEY_PATTERN.test(endKey ?? '') ? endKey : null;
  if (!start && !end) return list;

  return list.filter(tx => {
    const match = DATE_PREFIX_PATTERN.exec(tx?.createdAt ?? '');
    if (!match) return false;
    const day = match[1];
    return (!start || day >= start) && (!end || day <= end);
  });
}
