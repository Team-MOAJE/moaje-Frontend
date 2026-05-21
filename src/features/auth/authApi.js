import { createAsyncThunk } from '@reduxjs/toolkit';
import apiClient from '../../services/apiClient';
import { getAccessToken, setTokens, clearTokens } from '../../services/tokenService';
import { API_ENDPOINTS } from '../../constants/apiEndpoints';
import { normalizeApiError } from '../../utils/normalizeApiError';

export const loginUser = createAsyncThunk(
  'auth/loginUser',
  async (credentials, { rejectWithValue }) => {
    try {
      const data = await apiClient.post(API_ENDPOINTS.AUTH.LOGIN, credentials);
      await setTokens(data.accessToken, data.refreshToken);
      return data;
    } catch (error) {
      return rejectWithValue(normalizeApiError(error, '로그인에 실패했습니다.'));
    }
  }
);

export const registerUser = createAsyncThunk(
  'auth/registerUser',
  async (userData, { rejectWithValue, dispatch }) => {
    try {
      await apiClient.post(API_ENDPOINTS.AUTH.REGISTER, userData);
      const result = await dispatch(
        loginUser({ email: userData.email, password: userData.password })
      );
      return result.payload;
    } catch (error) {
      return rejectWithValue(normalizeApiError(error, '회원가입에 실패했습니다.'));
    }
  }
);

export const logoutUser = createAsyncThunk('auth/logoutUser', async () => {
  await apiClient.post(API_ENDPOINTS.AUTH.LOGOUT).catch(() => {});
  await clearTokens();
});

export const refreshToken = createAsyncThunk(
  'auth/refreshToken',
  async (_, { rejectWithValue }) => {
    try {
      const { refreshAccessToken } = await import('../../services/tokenService');
      const newToken = await refreshAccessToken();
      return { accessToken: newToken };
    } catch (error) {
      return rejectWithValue(normalizeApiError(error, '토큰 갱신에 실패했습니다.'));
    }
  }
);

export const restoreSession = createAsyncThunk('auth/restoreSession', async () => {
  const token = await getAccessToken();
  if (!token) return null;
  try {
    const data = await apiClient.get(API_ENDPOINTS.AUTH.ME);
    return data;
  } catch {
    await clearTokens();
    return null;
  }
});

export const fetchCurrentUser = createAsyncThunk(
  'auth/fetchCurrentUser',
  async (_, { rejectWithValue }) => {
    try {
      return await apiClient.get(API_ENDPOINTS.AUTH.ME);
    } catch (error) {
      return rejectWithValue(normalizeApiError(error, '사용자 정보를 불러오지 못했습니다.'));
    }
  }
);
