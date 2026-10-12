import { createAsyncThunk } from '@reduxjs/toolkit';
import apiClient from '../../services/apiClient';
import { API_ENDPOINTS } from '../../constants/apiEndpoints';
import { normalizeApiError } from '../../utils/normalizeApiError';
import { ensureIdempotencyKey } from '../../utils/idempotencyKey';
import {
  buildTransactionListParams,
  extractTransactionListResult,
} from './transactionQueryAdapter';

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
  async ({ page = 0, dateRange = null, queryKey = null } = {}, { getState, rejectWithValue }) => {
    // 요청을 시작하는 시점의 "현재 활성 seq"를 스냅샷으로 고정한다.
    // resetTransactions/beginTransactionsRefresh는 이 dispatch 직전에 동기적으로
    // 호출되므로, 이 값은 항상 "이 요청이 속한 라운드"를 정확히 가리킨다.
    const requestSeq = getState().asset.transactionsActiveQuerySeq;
    try {
      const params = buildTransactionListParams({ page, dateRange });
      const data = await apiClient.get(API_ENDPOINTS.ASSET.TRANSACTIONS, { params });
      return { page, queryKey, requestSeq, ...extractTransactionListResult(data) };
    } catch (error) {
      return rejectWithValue({
        ...normalizeApiError(error, '거래내역 조회에 실패했습니다.'),
        queryKey,
        requestSeq,
      });
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
      // 같은 송금을 다시 시도할 때는 이 idempotencyKey를 그대로 다시 전달한다(새 송금은 키 생략).
      return rejectWithValue({
        ...normalizeApiError(error, '송금에 실패했습니다.'),
        idempotencyKey: safeIdempotencyKey,
      });
    }
  },
  {
    // condition: Redux Toolkit이 transferLoading=true 상태에서 dispatch를 취소함.
    // 취소 시 action은 dispatch되지 않으므로 fulfilled/rejected가 발생하지 않음.
    condition: (_, { getState }) => !getState().asset.transferLoading,
  }
);
