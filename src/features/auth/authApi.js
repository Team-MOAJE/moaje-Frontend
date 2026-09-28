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

// TODO: 백엔드 register API 계약 확정 시 이 함수 내부만 실제 payload 형태로 재작성한다.
// phoneNumber/name/pin/verificationProof/termsRecords는 프론트 내부 모델명일 뿐이며,
// 실제 API가 이 키들을 그대로 요구한다고 가정하지 않는다.
function buildRegisterRequest({ phoneNumber, name, pin, verificationProof, termsRecords }) {
  return { phoneNumber, name, pin, verificationProof, termsRecords };
}

// credentials: { phoneNumber, pin } — 전화번호+PIN 로그인.
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
      const data = await apiClient.post(
        API_ENDPOINTS.AUTH.REGISTER,
        buildRegisterRequest(userData)
      );
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

// TODO: 백엔드 App Lock PIN 검증 API 명세 확정되면 API_ENDPOINTS.AUTH에 편입하고 실제 endpoint로 교체
const PIN_ENDPOINTS = {
  verifyUnlock: null,
};

// endpoint가 채워지는 순간 이 값도 자동으로 true가 된다 — 별도 플래그/DEV_CONFIG 불필요.
// endpoint가 null인 동안(지금)은 App Lock 화면 자체를 건너뛰도록 RootNavigator가 이 값을 사용한다
// — endpoint 없이 App Lock을 강제 활성화하면 세션이 있는 사용자가 영구히 잠기므로 절대 금지.
export const isAppLockFeatureEnabled = Boolean(PIN_ENDPOINTS.verifyUnlock);

export const verifyUnlockPin = createAsyncThunk(
  'auth/verifyUnlockPin',
  async (payload, { rejectWithValue }) => {
    try {
      const endpoint = requireEndpoint(PIN_ENDPOINTS.verifyUnlock);
      const data = await apiClient.post(endpoint, payload);
      return data;
    } catch (error) {
      return rejectWithValue(normalizeApiError(error, 'PIN 확인에 실패했습니다.'));
    }
  }
);
