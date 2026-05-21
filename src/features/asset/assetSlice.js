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
    transactionsLoading: false,
    transactionsRefreshing: false,
    transactionsError: null,

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

      .addCase(fetchTransactions.pending, state => {
        state.transactionsLoading = true;
        state.transactionsError = null;
      })
      .addCase(fetchTransactions.fulfilled, (state, action) => {
        const raw = action.payload;
        const list = Array.isArray(raw) ? raw : (raw?.transactions ?? []);
        state.transactions = list.map(normalizeTransaction);
        state.transactionsLoading = false;
      })
      .addCase(fetchTransactions.rejected, (state, action) => {
        state.transactionsLoading = false;
        state.transactionsError = action.payload?.message ?? '거래내역 조회에 실패했습니다.';
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

export const { setSelectedAccountId, clearTransactionDetail } = assetSlice.actions;
export default assetSlice.reducer;
