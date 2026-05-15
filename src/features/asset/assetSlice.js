import { createSlice } from '@reduxjs/toolkit';
import { fetchAccounts, transferFunds } from './assetApi';

const assetSlice = createSlice({
  name: 'asset',
  initialState: {
    accounts: [],
    totalBalance: 0,
    isLoading: false,
    error: null,
  },
  reducers: {
    setAccounts: (state, action) => {
      state.accounts = action.payload;
    },
    setTotalBalance: (state, action) => {
      state.totalBalance = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAccounts.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchAccounts.fulfilled, (state, action) => {
        state.accounts = action.payload ?? [];
        state.isLoading = false;
      })
      .addCase(fetchAccounts.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? '계좌 조회에 실패했습니다.';
      })
      .addCase(transferFunds.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(transferFunds.fulfilled, (state) => {
        state.isLoading = false;
      })
      .addCase(transferFunds.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? '이체에 실패했습니다.';
      });
  },
});

export const { setAccounts, setTotalBalance } = assetSlice.actions;
export default assetSlice.reducer;
