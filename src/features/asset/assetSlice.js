import { createSlice } from '@reduxjs/toolkit';
import {
  fetchAccounts,
  fetchAccountSummary,
  fetchAvailableBalance,
  fetchTransactions,
  fetchTransactionDetail,
  transferFunds,
} from './assetApi';
import {
  normalizeAccount,
  normalizeSummary,
  normalizeTransaction,
  normalizeTransactionDetail,
} from '../../utils/apiMappers';

const assetSlice = createSlice({
  name: 'asset',
  initialState: {
    accounts: [],
    accountsLoading: false,
    accountsError: null,
    selectedAccountId: null,

    summary: null,
    summaryLoading: false,
    summaryError: null,

    availableBalanceDetail: null,
    availableBalanceLoading: false,
    availableBalanceError: null,

    transactions: [],
    transactionsLoading: false, // 최초(page 0) 조회 로딩
    transactionsLoadingMore: false, // 다음 페이지 조회 로딩
    transactionsRefreshing: false,
    transactionsError: null,
    transactionsNextPage: 0, // TEMP: page 기반 임시 pagination 계약의 "다음 page 번호". cursor 방식으로 바뀌면 이 필드 자체를 재설계해야 함
    transactionsHasMore: true, // TEMP: 실제 hasNext 필드 확정 전 추정치 (transactionQueryAdapter 참고)
    transactionsActiveQueryKey: null, // 현재 유효한 조회 조건(기간)을 식별하는 key. race condition 방어용
    transactionsActiveQuerySeq: 0, // 기간 변경/새로고침마다 증가하는 "라운드" 번호. race condition 방어용

    transactionDetail: null,
    transactionDetailLoading: false,
    transactionDetailError: null,

    transferLoading: false,
    transferError: null,
  },
  reducers: {
    setSelectedAccountId: (state, action) => {
      state.selectedAccountId = action.payload;
    },
    clearTransactionDetail: state => {
      state.transactionDetail = null;
      state.transactionDetailError = null;
    },
    resetTransactions: (state, action) => {
      const { queryKey } = action.payload ?? {};
      state.transactions = [];
      state.transactionsNextPage = 0;
      state.transactionsHasMore = true;
      state.transactionsError = null;
      state.transactionsLoading = false;
      state.transactionsLoadingMore = false;
      state.transactionsActiveQueryKey = queryKey ?? null;
      state.transactionsActiveQuerySeq += 1; // 기간이 바뀌면 이전 라운드의 응답은 전부 무효화
    },
    beginTransactionsRefresh: state => {
      // 기간(queryKey)은 그대로 두고 라운드(seq)만 새로 시작한다.
      // 목록은 비우지 않는다 — pull-to-refresh는 기존 데이터를 유지한 채 재조회한다.
      state.transactionsActiveQuerySeq += 1;
      // 새 라운드가 page 0만 재요청하고 page>0(loadMore)은 재요청하지 않기 때문에,
      // 만약 refresh 시작 시점에 이전 라운드의 loadMore가 in-flight 상태였다면
      // (transactionsLoadingMore === true) 그 응답은 나중에 stale로 판정되어
      // fulfilled/rejected에서 그냥 return되므로 transactionsLoadingMore를 false로
      // 되돌릴 코드가 영영 실행되지 않는다. 그대로 두면 이 플래그가 true로 남아
      // handleLoadMore()가 이후 계속 차단된다 — 여기서 명시적으로 정리한다.
      // (transactionsLoading은 건드리지 않는다: 바로 이어서 dispatch되는 page 0
      // 요청의 pending/fulfilled가 정상적인 lifecycle로 스스로 관리한다.)
      state.transactionsLoadingMore = false;
      state.transactionsError = null;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(fetchAccounts.pending, state => {
        state.accountsLoading = true;
        state.accountsError = null;
      })
      .addCase(fetchAccounts.fulfilled, (state, action) => {
        const raw = action.payload;
        const list = Array.isArray(raw) ? raw : (raw?.accounts ?? []);
        state.accounts = list.map(normalizeAccount);
        state.accountsLoading = false;
      })
      .addCase(fetchAccounts.rejected, (state, action) => {
        state.accountsLoading = false;
        state.accountsError = action.payload?.message ?? '계좌 조회에 실패했습니다.';
      })

      .addCase(fetchAccountSummary.pending, state => {
        state.summaryLoading = true;
        state.summaryError = null;
      })
      .addCase(fetchAccountSummary.fulfilled, (state, action) => {
        state.summary = normalizeSummary(action.payload);
        state.summaryLoading = false;
      })
      .addCase(fetchAccountSummary.rejected, (state, action) => {
        state.summaryLoading = false;
        state.summaryError = action.payload?.message ?? '계좌 요약 조회에 실패했습니다.';
      })

      .addCase(fetchAvailableBalance.pending, state => {
        state.availableBalanceLoading = true;
        state.availableBalanceError = null;
      })
      .addCase(fetchAvailableBalance.fulfilled, (state, action) => {
        state.availableBalanceDetail = action.payload;
        state.availableBalanceLoading = false;
      })
      .addCase(fetchAvailableBalance.rejected, (state, action) => {
        state.availableBalanceLoading = false;
        state.availableBalanceError =
          action.payload?.message ?? '사용 가능 금액 조회에 실패했습니다.';
      })

      .addCase(fetchTransactions.pending, (state, action) => {
        const { page } = action.meta.arg ?? {};
        if (!page) state.transactionsLoading = true;
        else state.transactionsLoadingMore = true;
        state.transactionsError = null;
      })
      .addCase(fetchTransactions.fulfilled, (state, action) => {
        const { page, queryKey, requestSeq, items, hasMore } = action.payload;
        const isStale =
          queryKey !== state.transactionsActiveQueryKey ||
          requestSeq !== state.transactionsActiveQuerySeq;
        if (isStale) return; // 오래된 기간/라운드의 응답 — 완전히 무시 (목록/페이지/로딩 상태 건드리지 않음)

        const normalized = items.map(normalizeTransaction);
        if (page === 0) {
          state.transactions = normalized;
        } else {
          const seen = new Set(state.transactions.map(t => t.id));
          state.transactions.push(...normalized.filter(t => !seen.has(t.id)));
        }
        state.transactionsNextPage = page + 1;
        state.transactionsHasMore = hasMore;
        state.transactionsLoading = false;
        state.transactionsLoadingMore = false;
      })
      .addCase(fetchTransactions.rejected, (state, action) => {
        const { queryKey, requestSeq, ...errorInfo } = action.payload ?? {};
        const isStale =
          queryKey !== state.transactionsActiveQueryKey ||
          requestSeq !== state.transactionsActiveQuerySeq;
        if (isStale) return; // 오래된 기간/라운드의 에러 — 현재 화면의 error 상태를 덮지 않음

        state.transactionsLoading = false;
        state.transactionsLoadingMore = false;
        state.transactionsError = errorInfo?.message ?? '거래내역 조회에 실패했습니다.';
      })

      .addCase(fetchTransactionDetail.pending, state => {
        state.transactionDetailLoading = true;
        state.transactionDetailError = null;
      })
      .addCase(fetchTransactionDetail.fulfilled, (state, action) => {
        state.transactionDetail = normalizeTransactionDetail(action.payload);
        state.transactionDetailLoading = false;
      })
      .addCase(fetchTransactionDetail.rejected, (state, action) => {
        state.transactionDetailLoading = false;
        state.transactionDetailError = action.payload?.message ?? '거래 상세 조회에 실패했습니다.';
      })

      .addCase(transferFunds.pending, state => {
        state.transferLoading = true;
        state.transferError = null;
      })
      .addCase(transferFunds.fulfilled, state => {
        state.transferLoading = false;
      })
      .addCase(transferFunds.rejected, (state, action) => {
        state.transferLoading = false;
        state.transferError = action.payload?.message ?? '송금에 실패했습니다.';
      });
  },
});

export const {
  setSelectedAccountId,
  clearTransactionDetail,
  resetTransactions,
  beginTransactionsRefresh,
} = assetSlice.actions;
export default assetSlice.reducer;
