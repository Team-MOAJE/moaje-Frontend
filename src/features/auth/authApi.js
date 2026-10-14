import { createAsyncThunk } from '@reduxjs/toolkit';
import apiClient from '../../services/apiClient';
import {
  getAccessToken,
  beginSession,
  clearTokensIfEpoch,
  getSessionEpoch,
  getSessionStartSeq,
  isLogoutInProgress,
  runLogout,
  setSessionCleanupHooks,
  unlockWithPin,
} from '../../services/tokenService';
import { markLogoutPending, isLogoutPending, clearLogoutPending } from './authStorage';
import { removeDailyLimitRecordSafely } from '../asset/dailyLimitStorage';
import { API_ENDPOINTS } from '../../constants/apiEndpoints';
import { normalizeApiError } from '../../utils/normalizeApiError';
import { API_ERROR_KIND, createApiError } from '../../services/apiResponse';
import { API_CODES } from '../../constants/apiCodes';

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

// 회원가입 동의 레코드의 type. SignupTermsScreen의 TERMS_DEFINITIONS type 값과 같아야 한다.
export const REGISTER_TERM_TYPES = {
  SERVICE: 'service-terms',
  PRIVACY: 'privacy-consent',
};

const REGISTER_CONSENT_ERROR_MESSAGE = '필수 약관 동의 정보가 없습니다.';

// 사용자가 실제로 동의한 레코드만 인정한다. 없거나 미동의·버전 누락이면 요청 전에 차단한다.
const findConfirmedTerm = (termsRecords, type) => {
  const record = Array.isArray(termsRecords) ? termsRecords.find(t => t?.type === type) : null;
  const isValid =
    record?.confirmed === true && typeof record.version === 'string' && record.version !== '';

  if (!isValid) {
    throw new Error(REGISTER_CONSENT_ERROR_MESSAGE);
  }
  return record;
};

// 명세 API-01 요청 본문. 값은 변환하지 않는다(PIN은 문자열 그대로 → 앞자리 0 유지).
// 선택 필드(email, device_info)는 보내지 않는다.
export function buildRegisterRequest({ phoneNumber, name, pin, pinConfirm, termsRecords }) {
  const serviceTerms = findConfirmedTerm(termsRecords, REGISTER_TERM_TYPES.SERVICE);
  const privacyConsent = findConfirmedTerm(termsRecords, REGISTER_TERM_TYPES.PRIVACY);

  return {
    phone_number: phoneNumber,
    name,
    pin,
    pin_confirm: pinConfirm,
    terms_agreed: serviceTerms.confirmed,
    terms_version: serviceTerms.version,
    privacy_agreed: privacyConsent.confirmed,
    privacy_version: privacyConsent.version,
  };
}

// Auth 응답의 사용자 정보 → Redux user. user_id는 문자열 그대로 둔다(Number 변환 금지).
export const mapAuthUser = data => ({
  userId: data.user_id,
  phoneNumber: data.phone_number ?? null,
  name: data.name ?? null,
  email: data.email ?? null,
  onboardingCompleted: data.onboarding_completed ?? null,
});

const isNonEmptyString = value => typeof value === 'string' && value !== '';

// 로그인 전 전화번호 가입 여부 확인 결과 상태.
export const PHONE_CHECK_STATUS = {
  REGISTERED: 'registered',
  UNREGISTERED: 'unregistered',
  UNAVAILABLE: 'unavailable', // 확인 API 미연결 — 가입 여부를 판단할 수 없음(registered 아님)
};

// 서버 응답 → 상태값 변환. 응답 형식이 아직 확정되지 않았으므로 이 함수만 실제 명세에 맞춰 수정한다.
// TODO: 백엔드 응답 필드 확정 후 교체. 아래 `registered` boolean은 임시 가정일 뿐이다.
// 명시적 boolean이 아니면 registered로 간주하지 않고 오류로 처리한다(계약이 불명확할 때 안전 실패).
export function mapPhoneCheckResponse(data) {
  if (data?.registered === true) return PHONE_CHECK_STATUS.REGISTERED;
  if (data?.registered === false) return PHONE_CHECK_STATUS.UNREGISTERED;
  throw new Error('가입 여부 확인 응답 형식을 해석할 수 없습니다.');
}

// 로그인 전 전화번호 가입 여부 확인. 반환: PHONE_CHECK_STATUS 값.
// CHECK_PHONE endpoint가 없으면 요청 없이 UNAVAILABLE을 반환한다(가짜 성공/Mock 없음).
// 네트워크·서버 오류는 잡지 않고 그대로 throw한다 — 호출 화면이 별도로 처리한다.
export async function checkPhoneRegistered({ phoneNumber }) {
  const endpoint = API_ENDPOINTS.AUTH.CHECK_PHONE;
  if (!endpoint) return PHONE_CHECK_STATUS.UNAVAILABLE;

  // TODO: 요청 방식(POST/GET)과 요청 데이터 형식은 백엔드 명세 확정 후 수정한다.
  const data = await apiClient.post(endpoint, { phoneNumber });
  return mapPhoneCheckResponse(data);
}

// ── 세션 정리 표식(logoutPending) ──────────────────────────────
// 로그아웃·RE_LOGIN·refresh 거부 등 세션 정리 시작 시 표식을 먼저 기록하고, 정리가 확인되면 지운다.
// 삭제가 실패했거나 도중에 앱이 종료되면 표식이 남아 다음 실행의 restoreSession이 복원하지 않는다.
// 표식 쓰기·삭제는 단일 직렬 큐로 실행하고, 실행 시점에 소유권(세션)을 다시 확인한다.
let _markerTail = Promise.resolve();
const enqueueMarker = task => {
  const run = _markerTail.then(task).catch(() => false);
  _markerTail = run;
  return run;
};

setSessionCleanupHooks({
  // 쓰기: 정리를 시작한 뒤 새 세션이 시작되지 않았을 때만
  onStart: () => {
    const startSeq = getSessionStartSeq();
    return enqueueMarker(async () =>
      getSessionStartSeq() === startSeq ? markLogoutPending() : false
    );
  },
  // 삭제: 정리가 확인됐고 아직 그 정리의 세션일 때만
  onCleared: closeEpoch =>
    enqueueMarker(async () => (getSessionEpoch() === closeEpoch ? clearLogoutPending() : false)),
});

const canceledRejection = (stage, fallback) => ({
  ...normalizeApiError(createApiError({ kind: API_ERROR_KIND.CANCELED }), fallback),
  stage,
  retryable: false,
});

// 로그인·회원가입 응답의 토큰으로 새 세션을 시작한다(요청 시작 시점 epoch를 넘겨, 그 사이 로그아웃·세션 변경이
// 있었다면 저장하지 않고 CANCELED로 거부). 저장 실패 시 자기 세션만 정리한다. 성공하면 새 세션 epoch를 반환한다.
// 표식은 토큰 저장이 확인된 뒤에 지운다(저장 전에 지우면 이전 계정 토큰이 표식 없이 남을 수 있음).
const saveIssuedTokens = async (data, startEpoch) => {
  if (!isNonEmptyString(data?.access_token) || !isNonEmptyString(data?.refresh_token)) {
    throw new Error('토큰 발급 응답을 해석할 수 없습니다.');
  }

  let sessionEpoch;

  try {
    sessionEpoch = await beginSession(data.access_token, data.refresh_token, {
      expectedEpoch: startEpoch,
    });
  } catch (storageError) {
    if (storageError?.sessionEpoch !== undefined) {
      const cleanup = clearTokensIfEpoch(storageError.sessionEpoch).catch(() => {});
      // 저장소가 응답하지 않는(STORAGE_BUSY) 경우 정리도 같은 큐 뒤에 서므로 기다리지 않는다 — 로그인은 즉시 실패로 끝난다.
      if (storageError.reason !== 'STORAGE_BUSY') await cleanup;
    }
    throw storageError;
  }

  await enqueueMarker(async () =>
    getSessionEpoch() === sessionEpoch ? clearLogoutPending() : false
  );

  return sessionEpoch;
};

// GET /me → Redux user. user_id가 없으면 인증 완료로 볼 수 없으므로 실패로 처리한다.
const fetchMe = async () => {
  const data = await apiClient.get(API_ENDPOINTS.AUTH.ME);
  if (!isNonEmptyString(data?.user_id)) {
    throw new Error('사용자 정보 응답을 해석할 수 없습니다.');
  }
  return mapAuthUser(data);
};

// 서버가 세션을 거부한 경우만 true. 네트워크·타임아웃·5xx·응답 해석 실패는 일시 오류로 보고 토큰을 지우지 않는다.
// - Gateway 401 UNAUTHENTICATED/INVALID_TOKEN(갱신 재시도 후에도 거부), refresh 실패(SESSION_EXPIRED)
// - Auth 401 envelope(예: 탈퇴·비활성 사용자, AUTH-401-001 — 실행 중 Auth 소스 기준, 실요청 검증 전)
const SESSION_INVALID_KINDS = [
  API_ERROR_KIND.SESSION_EXPIRED,
  API_ERROR_KIND.AUTH_REQUIRED,
  API_ERROR_KIND.TOKEN_INVALID,
];
const isSessionInvalidError = error =>
  SESSION_INVALID_KINDS.includes(error?.kind) || error?.status === 401;

// /me 실패 공통 처리: 세션 무효면 토큰 정리, 일시 오류면 토큰 유지(재시도 가능).
// CANCELED(세션이 바뀜)는 재시도 대상이 아니며 새 세션의 토큰을 건드리지 않는다.
// 정리는 sessionEpoch(이 요청이 속한 세션)와 같을 때만 수행한다.
const rejectMeFailure = async (error, rejectWithValue, sessionEpoch) => {
  const canceled = error?.kind === API_ERROR_KIND.CANCELED;
  const retryable = !canceled && !isSessionInvalidError(error);
  if (!canceled && !retryable) {
    await clearTokensIfEpoch(sessionEpoch).catch(() => {});
  }
  return rejectWithValue({
    ...normalizeApiError(error, '사용자 정보를 불러오지 못했습니다.'),
    stage: 'me',
    retryable,
  });
};

// credentials: { phoneNumber, pin } — 전화번호+PIN 로그인(API-02) 후 /me(API-47)로 사용자 정보를 확정한다.
// 로그인 실패 시에는 /me를 호출하지 않고 저장된 토큰도 바꾸지 않는다.
export const loginUser = createAsyncThunk(
  'auth/loginUser',
  async ({ phoneNumber, pin }, { rejectWithValue }) => {
    // 응답이 로그아웃 이후에 도착해도 새 세션을 만들지 않도록 요청 시작 시점의 세션을 기록한다.
    const startEpoch = getSessionEpoch();
    let sessionEpoch;

    try {
      const data = await apiClient.post(API_ENDPOINTS.AUTH.LOGIN, {
        phone_number: phoneNumber,
        pin,
      });
      sessionEpoch = await saveIssuedTokens(data, startEpoch);
    } catch (error) {
      return rejectWithValue({
        ...normalizeApiError(error, '로그인에 실패했습니다.'),
        stage: 'login',
      });
    }

    try {
      const user = await fetchMe();
      // /me를 기다리는 사이 로그아웃·세션 변경이 있었다면 인증 상태를 되살리지 않는다.
      if (getSessionEpoch() !== sessionEpoch) {
        return rejectWithValue(canceledRejection('me', '사용자 정보를 불러오지 못했습니다.'));
      }
      return { user };
    } catch (error) {
      return rejectMeFailure(error, rejectWithValue, sessionEpoch);
    }
  }
);

export const registerUser = createAsyncThunk(
  'auth/registerUser',
  async (userData, { rejectWithValue }) => {
    const startEpoch = getSessionEpoch();

    try {
      const body = buildRegisterRequest(userData);
      const data = await apiClient.post(API_ENDPOINTS.AUTH.REGISTER, body);

      if (
        !isNonEmptyString(data?.access_token) ||
        !isNonEmptyString(data?.refresh_token) ||
        !isNonEmptyString(data?.user_id)
      ) {
        throw new Error('회원가입 응답을 해석할 수 없습니다.');
      }

      await saveIssuedTokens(data, startEpoch);

      // 토큰은 반환하지 않는다(Redux에 복제 금지).
      return { user: mapAuthUser(data) };
    } catch (error) {
      return rejectWithValue(normalizeApiError(error, '회원가입에 실패했습니다.'));
    }
  }
);

// 서버 로그아웃(API-08) 요청. 던지지 않고 결과만 돌려준다 — 오류 본문·토큰은 포함하지 않는다.
// Authorization 헤더는 붙지 않는다(공개 경로). 서버 오류 코드는 실요청 검증 전(Docker 소스 분석 기준)이다.
const sendLogoutRequest = async (refreshToken, { timeoutMs }) => {
  try {
    // HTTP 200이어도 Auth envelope의 success===true일 때만 성공으로 본다(apiResponse.unwrapResponse 규칙).
    await apiClient.post(
      API_ENDPOINTS.AUTH.LOGOUT,
      { refresh_token: refreshToken },
      { timeout: timeoutMs, skipAuthRefresh: true, skipSessionHandling: true }
    );
    return { serverLoggedOut: true, serverError: null };
  } catch (error) {
    const { kind, status, code, traceId } = normalizeApiError(error);
    return { serverLoggedOut: false, serverError: { kind, status, code, traceId } };
  }
};

// 서버 로그아웃 성공 여부와 무관하게 항상 로컬 정리를 하고 fulfilled로 끝난다 → authSlice가 Redux를 초기화한다.
// 반환: { serverLoggedOut, localCleared, serverError|null, timedOut, markerWritten } (토큰 값 없음)
export const logoutUser = createAsyncThunk('auth/logoutUser', () => runLogout(sendLogoutRequest));

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

// 앱 시작 시 저장된 토큰으로 세션 복원. Access Token 만료는 apiClient가 refresh 후 재시도한다.
// 세션 무효가 확인된 경우만 토큰을 정리하고, 일시 오류면 토큰을 유지한 채 이번 실행은 미인증으로 둔다.
export const restoreSession = createAsyncThunk('auth/restoreSession', async () => {
  // 이전 실행에서 세션 정리가 끝났는지 확인되지 않았다면(표식) 토큰이 남아 있어도 복원하지 않고 정리를 다시 시도한다.
  if (await isLogoutPending()) {
    await clearTokensIfEpoch().catch(() => {});
    return null;
  }

  const epoch0 = getSessionEpoch();
  const token = await getAccessToken();
  if (!token) return null;
  try {
    const user = await fetchMe();
    // /me를 기다리는 사이 로그아웃·세션 변경이 있었다면 복원하지 않는다.
    return getSessionEpoch() === epoch0 ? { user } : null;
  } catch (error) {
    if (isSessionInvalidError(error)) {
      await clearTokensIfEpoch(epoch0).catch(() => {});
    }
    return null;
  }
});

// 저장된 토큰으로 /me만 다시 조회한다(로그인 직후 /me 일시 실패 시 재시도용 — login을 다시 호출하지 않음).
export const fetchCurrentUser = createAsyncThunk(
  'auth/fetchCurrentUser',
  async (_, { rejectWithValue }) => {
    const epoch0 = getSessionEpoch();
    try {
      const user = await fetchMe();
      if (getSessionEpoch() !== epoch0) {
        return rejectWithValue(canceledRejection('me', '사용자 정보를 불러오지 못했습니다.'));
      }
      return { user };
    } catch (error) {
      return rejectMeFailure(error, rejectWithValue, epoch0);
    }
  }
);

// ── 내 정보 수정(API-48)·회원 탈퇴(API-49)·PIN 변경(API-51) ─────────────────
// 모두 JWT가 필요한 Auth envelope API다. PIN 재설정(PIN_RESET_ENDPOINTS, 현재 PIN을 모르는 경우)과는 다른 기능이다.
const PIN_PATTERN = /^[0-9]{6}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 입력 검증 실패. 서버 요청 없이 화면 메시지로만 쓴다(kind 없음 → normalizeApiError가 message를 그대로 사용).
const validationError = message => new Error(message);

const requirePin = (pin, label) => {
  if (typeof pin !== 'string' || !PIN_PATTERN.test(pin)) {
    throw validationError(`${label}는 숫자 6자리여야 합니다.`);
  }
  return pin;
};

// API-48 요청 본문. 명세: email 생략=유지, null=삭제 / name은 null이면 현재 값 유지, 공백만 입력 불가.
// 입력: { name?: string, email?: string | null }. undefined와 name:null은 보내지 않고, email의 null·빈 문자열은 삭제(null)로 보낸다.
export function buildProfileUpdateRequest({ name, email } = {}) {
  const body = {};

  if (name !== undefined && name !== null) {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (trimmed === '') throw validationError('이름을 입력해 주세요.');
    body.name = trimmed;
  }

  if (email !== undefined) {
    const trimmed = typeof email === 'string' ? email.trim() : '';
    if (email === null || trimmed === '') {
      body.email = null;
    } else if (!EMAIL_PATTERN.test(trimmed)) {
      throw validationError('이메일 형식이 올바르지 않습니다.');
    } else {
      body.email = trimmed;
    }
  }

  if (!('name' in body) && !('email' in body)) {
    throw validationError('수정할 항목이 없습니다.');
  }
  return body;
}

// 같은 계정 요청(수정·탈퇴·PIN 변경)이 동시에 진행되지 않게 한다.
const noConcurrentAccountAction = (_, { getState }) => !getState().auth?.isAccountActionPending;

// 서버가 세션을 끝낸 뒤(탈퇴·PIN 변경 성공) 로컬 인증 정보를 정리한다. 서버 로그아웃(API-08)은 다시 호출하지 않는다.
// 이 요청 이후 다른 세션이 시작됐으면(stale) 새 세션을 건드리지 않고 sessionEnded:false를 돌려준다.
const endLocalSession = async startEpoch => {
  const cleared = await clearTokensIfEpoch(startEpoch).catch(() => null);
  return { sessionEnded: cleared !== null && cleared.status !== 'stale' };
};

// 입력: { name?, email? } (buildProfileUpdateRequest 참고). 서버가 성공 envelope을 준 경우에만 fulfilled.
export const updateProfile = createAsyncThunk(
  'auth/updateProfile',
  async (input, { rejectWithValue, getState }) => {
    const startEpoch = getSessionEpoch();

    try {
      const body = buildProfileUpdateRequest(input);
      const data = await apiClient.patch(API_ENDPOINTS.AUTH.ME, body);

      if (!isNonEmptyString(data?.user_id)) {
        throw new Error('내 정보 수정 응답을 해석할 수 없습니다.');
      }
      const currentUserId = getState().auth?.user?.userId;
      if (getSessionEpoch() !== startEpoch || (currentUserId && currentUserId !== data.user_id)) {
        return rejectWithValue(canceledRejection('profile', '내 정보를 수정하지 못했습니다.'));
      }
      return { user: mapAuthUser(data) };
    } catch (error) {
      return rejectWithValue({
        ...normalizeApiError(error, '내 정보를 수정하지 못했습니다.'),
        stage: 'profile',
      });
    }
  },
  { condition: noConcurrentAccountAction }
);

// 회원 탈퇴(API-49). 입력: { currentPin }. 서버 성공이 확인된 뒤에만 로컬 토큰을 정리한다(실패하면 로그인 상태 유지).
// RE_LOGIN 응답이어도 토큰을 지우지 않는다(skipSessionHandling) — PIN 오입력이 세션 종료로 번지지 않게 한다.
export const deleteAccount = createAsyncThunk(
  'auth/deleteAccount',
  async ({ currentPin } = {}, { rejectWithValue, getState }) => {
    const startEpoch = getSessionEpoch();
    const userId = getState().auth?.user?.userId;

    try {
      requirePin(currentPin, '현재 PIN');
      await apiClient.delete(API_ENDPOINTS.AUTH.ME, {
        data: { current_pin: currentPin },
        skipSessionHandling: true,
      });
    } catch (error) {
      return rejectWithValue({
        ...normalizeApiError(error, '회원 탈퇴에 실패했습니다.'),
        stage: 'deleteAccount',
      });
    }

    // 서버 탈퇴가 성공한 뒤에만 이 사용자의 로컬 API-15 기록을 지운다. 삭제가 실패해도(예외 없음, 진단 로그만)
    // 토큰 정리와 로그아웃 전환은 계속 진행한다.
    await removeDailyLimitRecordSafely(userId);

    return endLocalSession(startEpoch);
  },
  { condition: noConcurrentAccountAction }
);

// PIN 변경(API-51). 입력: { currentPin, newPin, newPinConfirm }. 성공하면 서버가 Refresh Token을 폐기하므로
// 로컬 인증 정보를 정리하고 새 PIN으로 다시 로그인하게 한다. 실패하면 로그인 상태를 유지한다.
export const changePin = createAsyncThunk(
  'auth/changePin',
  async ({ currentPin, newPin, newPinConfirm } = {}, { rejectWithValue }) => {
    const startEpoch = getSessionEpoch();

    try {
      requirePin(currentPin, '현재 PIN');
      requirePin(newPin, '새 PIN');
      requirePin(newPinConfirm, '새 PIN 확인');
      if (newPin !== newPinConfirm) throw validationError('새 PIN이 일치하지 않습니다.');

      await apiClient.post(
        API_ENDPOINTS.AUTH.PIN_CHANGE,
        { current_pin: currentPin, new_pin: newPin, new_pin_confirm: newPinConfirm },
        { skipSessionHandling: true }
      );
    } catch (error) {
      return rejectWithValue({
        ...normalizeApiError(error, 'PIN 변경에 실패했습니다.'),
        stage: 'changePin',
      });
    }

    return endLocalSession(startEpoch);
  },
  { condition: noConcurrentAccountAction }
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

// App Lock(API-50 session/unlock). endpoint가 있는 동안 true — RootNavigator가 이 값으로 잠금 화면 분기를 켠다.
// 잠금 화면에는 '로그아웃하고 다시 로그인' 진입점(PinInputScreen unlock 모드)이 함께 있어야 한다.
export const isAppLockFeatureEnabled = Boolean(API_ENDPOINTS.AUTH.SESSION_UNLOCK);

// 잠금 해제 실패 분류. 화면 문구와 처리 선택에만 사용한다(토큰 정리는 하지 않는다).
export const UNLOCK_FAILURE = {
  // 401: 서버가 "잘못된 PIN"과 "무효한 Refresh Token"을 같은 응답(AUTH-401-005)으로 내려 구분할 수 없다.
  AMBIGUOUS_AUTH: 'AMBIGUOUS_AUTH',
  LOCKED: 'LOCKED', // 423: PIN 5회 실패 → 30분 제한
  NETWORK: 'NETWORK', // 네트워크·타임아웃
  SERVER: 'SERVER', // 5xx
  CANCELED: 'CANCELED', // 세션이 바뀜(로그아웃·재로그인) 또는 중복 요청 — 사용자에게 알리지 않는다
  SESSION_ENDED: 'SESSION_ENDED', // 세션이 정리됨 — 스토어가 로그아웃 상태로 전환한다
  OTHER: 'OTHER',
};

export const classifyUnlockFailure = error => {
  if (error?.sessionEnded === true) return UNLOCK_FAILURE.SESSION_ENDED;
  if (error?.kind === API_ERROR_KIND.CANCELED) return UNLOCK_FAILURE.CANCELED;
  if (error?.status === 423 || error?.code === API_CODES.AUTH_PIN_LOCKED) {
    return UNLOCK_FAILURE.LOCKED;
  }
  if (error?.status === 401) return UNLOCK_FAILURE.AMBIGUOUS_AUTH;
  if (error?.kind === API_ERROR_KIND.NETWORK || error?.kind === API_ERROR_KIND.TIMEOUT) {
    return UNLOCK_FAILURE.NETWORK;
  }
  if (error?.kind === API_ERROR_KIND.HTTP_5XX) return UNLOCK_FAILURE.SERVER;
  return UNLOCK_FAILURE.OTHER;
};

// payload: { pin }. 서버(API-50)가 PIN을 검증해 200을 준 경우에만 fulfilled → authSlice가 isAppUnlocked=true로 바꾼다.
// 일반 refresh 성공은 이 thunk의 결과가 아니므로 잠금을 풀지 못한다. 토큰·PIN은 결과에 포함하지 않는다.
export const verifyUnlockPin = createAsyncThunk(
  'auth/verifyUnlockPin',
  async ({ pin }, { rejectWithValue }) => {
    // 요청 시작 시점의 세션. 응답이 로그아웃·재로그인 이후 도착하면 현재 세션의 잠금에 영향을 주지 않는다.
    const startEpoch = getSessionEpoch();

    try {
      const result = await unlockWithPin(pin);

      if (getSessionEpoch() !== startEpoch) {
        return rejectWithValue(canceledRejection('unlock', 'PIN 확인에 실패했습니다.'));
      }
      return { onboardingCompleted: result.onboardingCompleted };
    } catch (error) {
      // 이 세션을 정리한 SESSION_EXPIRED(토큰 없음·저장 실패)만 인증 해제로 알린다(소유권 확인).
      const sessionEnded =
        error?.kind === API_ERROR_KIND.SESSION_EXPIRED &&
        error?.closedEpoch !== undefined &&
        getSessionEpoch() === error.closedEpoch &&
        !isLogoutInProgress();

      return rejectWithValue({
        ...normalizeApiError(error, 'PIN 확인에 실패했습니다.'),
        stage: 'unlock',
        sessionEnded,
      });
    }
  }
);
