import { createAsyncThunk } from '@reduxjs/toolkit';
import apiClient from '../../services/apiClient';
import { API_ENDPOINTS } from '../../constants/apiEndpoints';
import { normalizeApiError } from '../../utils/normalizeApiError';
import { ensureIdempotencyKey } from '../../utils/idempotencyKey';

export const fetchAccounts = createAsyncThunk(
  'asset/fetchAccounts',
  async (_, { rejectWithValue }) => {
    try {
      return await apiClient.get(API_ENDPOINTS.ASSET.ACCOUNTS);
    } catch (error) {
      return rejectWithValue(normalizeApiError(error, '계좌 목록 조회에 실패했습니다.'));
    }
  }
);

export const fetchAccountSummary = createAsyncThunk(
  'asset/fetchAccountSummary',
  async (_, { rejectWithValue }) => {
    try {
      return await apiClient.get(API_ENDPOINTS.ASSET.ACCOUNT_SUMMARY);
    } catch (error) {
      return rejectWithValue(normalizeApiError(error, '계좌 요약 조회에 실패했습니다.'));
    }
  }
);

export const fetchAvailableBalance = createAsyncThunk(
  'asset/fetchAvailableBalance',
  async (_, { rejectWithValue }) => {
    try {
      return await apiClient.get(API_ENDPOINTS.ASSET.AVAILABLE_BALANCE);
    } catch (error) {
      return rejectWithValue(normalizeApiError(error, '사용 가능 금액 조회에 실패했습니다.'));
    }
  }
);

export const fetchTransactions = createAsyncThunk(
  'asset/fetchTransactions',
  async (params = {}, { rejectWithValue }) => {
    try {
      return await apiClient.get(API_ENDPOINTS.ASSET.TRANSACTIONS, { params });
    } catch (error) {
      return rejectWithValue(normalizeApiError(error, '거래내역 조회에 실패했습니다.'));
    }
  }
);

export const fetchTransactionDetail = createAsyncThunk(
  'asset/fetchTransactionDetail',
  async (transactionId, { rejectWithValue }) => {
    try {
      return await apiClient.get(API_ENDPOINTS.ASSET.TRANSACTION_DETAIL(transactionId));
    } catch (error) {
      return rejectWithValue(normalizeApiError(error, '거래 상세 조회에 실패했습니다.'));
    }
  }
);

export const transferFunds = createAsyncThunk(
  'asset/transferFunds',
  async (transferPayload, { rejectWithValue }) => {
    const { idempotencyKey, ...requestBody } = transferPayload;
    const safeIdempotencyKey = ensureIdempotencyKey(idempotencyKey);

    try {
      return await apiClient.post(API_ENDPOINTS.TRANSFER.CREATE, requestBody, {
        idempotent: true,
        idempotencyKey: safeIdempotencyKey,
      });
    } catch (error) {
      return rejectWithValue(normalizeApiError(error, '송금에 실패했습니다.'));
    }
  },
  {
    // condition: Redux Toolkit이 transferLoading=true 상태에서 dispatch를 취소함.
    // 취소 시 action은 dispatch되지 않으므로 fulfilled/rejected가 발생하지 않음.
    condition: (_, { getState }) => !getState().asset.transferLoading,
  }
);
