import { createAsyncThunk } from '@reduxjs/toolkit';
import apiClient from '../../services/apiClient';
import { getAccessToken, setTokens, clearTokens } from '../../services/tokenService';
import { API_ENDPOINTS } from '../../constants/apiEndpoints';
import { normalizeApiError } from '../../utils/normalizeApiError';

// TODO: 백엔드 휴대폰 인증 API 명세 확정되면 API_ENDPOINTS.AUTH에 편입하고 아래 값을 실제 endpoint로 교체
const PHONE_VERIFICATION_ENDPOINTS = {
  request: null,
  verify: null,
};

const requireEndpoint = endpoint => {
  if (!endpoint) {
    throw new Error('휴대폰 인증 API가 아직 준비되지 않았습니다.');
  }
  return endpoint;
};

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
  async (userData, { rejectWithValue }) => {
    try {
      const data = await apiClient.post(API_ENDPOINTS.AUTH.REGISTER, userData);
      return data;
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

export const requestPhoneVerification = createAsyncThunk(
  'auth/requestPhoneVerification',
  async (payload, { rejectWithValue }) => {
    // payload/response 계약 미확정 — 백엔드 명세 확정 후 필드 매핑
    try {
      const endpoint = requireEndpoint(PHONE_VERIFICATION_ENDPOINTS.request);
      const data = await apiClient.post(endpoint, payload);
      return data;
    } catch (error) {
      return rejectWithValue(normalizeApiError(error, '인증번호 요청에 실패했습니다.'));
    }
  }
);

export const verifyPhoneVerification = createAsyncThunk(
  'auth/verifyPhoneVerification',
  async (payload, { rejectWithValue }) => {
    try {
      const endpoint = requireEndpoint(PHONE_VERIFICATION_ENDPOINTS.verify);
      const data = await apiClient.post(endpoint, payload);
      return data;
    } catch (error) {
      return rejectWithValue(normalizeApiError(error, '인증번호 확인에 실패했습니다.'));
    }
  }
);
