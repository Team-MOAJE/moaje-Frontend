// 홈 생활비 분석 탭의 월별 조회. AnalysisScreen과 같은 상태(state.asset.cashflowYearMonth)와 같은 thunk(API-16/17)를 재사용한다.
// 월을 정한 뒤 두 API를 한 번씩 요청한다(자동 반복·자동 재시도 없음). 월이 바뀌면 이전 월의 응답은 reducer가 버린다.
import { loadCategoryCashflow, loadMonthlyCashflow } from './assetApi';
import { setCashflowYearMonth } from './assetSlice';

export const loadHomeExpense = yearMonth => dispatch => {
  dispatch(setCashflowYearMonth(yearMonth));
  dispatch(loadMonthlyCashflow(yearMonth));
  dispatch(loadCategoryCashflow(yearMonth));
};
