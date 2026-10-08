import { createAsyncThunk } from '@reduxjs/toolkit';
import apiClient from '../../services/apiClient';
import { getAccessToken, setTokens, clearTokens } from '../../services/tokenService';
import { API_ENDPOINTS } from '../../constants/apiEndpoints';
import { normalizeApiError } from '../../utils/normalizeApiError';

// TODO: 백엔드 PIN 재설정 API 명세 확정되면 API_ENDPOINTS.AUTH에 편입하고 아래 값을 실제 endpoint로 교체
// verifyAccount: 전화번호+이름 회원정보 확인, resetConfirm: 새 PIN 설정
const PIN_RESET_ENDPOINTS = {
  verifyAccount: null,
  resetConfirm: null,
};

const requireEndpoint = endpoint => {
  if (!endpoint) {
    throw new Error('해당 API가 아직 준비되지 않았습니다.');
  }
  return endpoint;
};

// TODO: 백엔드 register API 계약 확정 시 이 함수 내부만 실제 payload 형태로 재작성한다.
// phoneNumber/name/pin/termsRecords는 프론트 내부 모델명일 뿐이며,
// 실제 API가 이 키들을 그대로 요구한다고 가정하지 않는다.
// SMS 인증 제거로 verificationProof는 더 이상 보내지 않는다(백엔드가 proof를 필수로 요구하면 계약 변경 필요).
function buildRegisterRequest({ phoneNumber, name, pin, termsRecords }) {
  return { phoneNumber, name, pin, termsRecords };
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

// PIN 재설정 전 회원정보(전화번호 + 이름) 확인. 실제 본인인증이 아니다.
// 반환값: 'unavailable'(확인 API 미연결) | 'matched' | 'mismatch'. API 미연결 상태를 성공으로 처리하지 않는다.
// TODO: 아래 `matched` 응답 필드는 가정일 뿐이다. 백엔드 확인 API 확정 후 실제 응답 형태로 교체한다(서버/네트워크 오류는 throw).
export async function verifyAccountForReset({ phoneNumber, name }) {
  if (!PIN_RESET_ENDPOINTS.verifyAccount) return 'unavailable';
  const data = await apiClient.post(PIN_RESET_ENDPOINTS.verifyAccount, { phoneNumber, name });
  return data?.matched === true ? 'matched' : 'mismatch';
}

// 새 PIN 설정. endpoint가 확정되기 전에는 항상 실패한다(실제 PIN 변경 없음).
export const confirmPinReset = createAsyncThunk(
  'auth/confirmPinReset',
  async (payload, { rejectWithValue }) => {
    try {
      const endpoint = requireEndpoint(PIN_RESET_ENDPOINTS.resetConfirm);
      const data = await apiClient.post(endpoint, payload);
      return data;
    } catch (error) {
      return rejectWithValue(normalizeApiError(error, 'PIN 재설정에 실패했습니다.'));
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
