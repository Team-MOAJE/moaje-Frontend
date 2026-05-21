import { createAsyncThunk } from '@reduxjs/toolkit';
import apiClient from '../../services/apiClient';
import { API_ENDPOINTS } from '../../constants/apiEndpoints';
import { normalizeApiError } from '../../utils/normalizeApiError';

export const fetchRecommendations = createAsyncThunk(
  'work/fetchRecommendations',
  async (filters, { rejectWithValue }) => {
    try {
      return await apiClient.get(API_ENDPOINTS.WORK.RECOMMENDATIONS, { params: filters });
    } catch (error) {
      return rejectWithValue(normalizeApiError(error, '추천 정보 조회에 실패했습니다.'));
    }
  }
);

export const fetchDailyLimit = createAsyncThunk(
  'work/fetchDailyLimit',
  async (_, { rejectWithValue }) => {
    try {
      return await apiClient.get(API_ENDPOINTS.WORK.DAILY_LIMIT);
    } catch (error) {
      return rejectWithValue(normalizeApiError(error, '가용금액 조회에 실패했습니다.'));
    }
  }
);
