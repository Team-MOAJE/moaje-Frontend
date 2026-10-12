import axios from 'axios';
import {
  getAccessToken,
  refreshAccessToken,
  clearTokensIfEpoch,
  getPendingRefresh,
  getSessionEpoch,
  isLogoutInProgress,
} from './tokenService';
import { ensureIdempotencyKey } from '../utils/idempotencyKey';
import { REQUIRED_ACTIONS } from '../constants/requiredActions';
import { API_HEADERS } from '../constants/apiHeaders';
import { API_ENDPOINTS } from '../constants/apiEndpoints';
import {
  API_ERROR_KIND,
  classifyAxiosError,
  createApiError,
  getRequestPath,
  shouldRefreshToken,
  unwrapResponse,
} from './apiResponse';

// 반환 계약 (자세한 규칙은 apiResponse.js)
// - 성공: Auth는 envelope.data, Banking·Asset·Work는 응답 본문 그대로(객체·배열)
// - 실패: ApiError { kind, status, code, message, traceId, requiredAction, envelope? }
//
// 요청별 옵션
// - skipAuth: Authorization 헤더를 붙이지 않음 (명세상 공개 Auth 경로는 자동 판정)
// - skipAuthRefresh: 401이어도 토큰 갱신/재시도하지 않음
// - responseFormat: 'envelope' | 'raw' — 응답 형식을 경로 판정 대신 직접 지정
// - idempotent + idempotencyKey: Idempotency-Key 헤더 고정 (재시도에도 같은 키)
// - skipSessionHandling: RE_LOGIN 응답에도 토큰 삭제·세션 만료 알림을 하지 않음 (로그아웃 요청용)
//
// 세션 고정: 요청은 시작 시점의 세션 epoch를 config._sessionEpoch에 기록한다. 인증이 필요한 요청이
// 세션이 바뀐 뒤(로그아웃·재로그인)에 재전송·refresh·토큰 삭제를 일으키지 않도록 CANCELED로 끝낸다.

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || '';
const TIMEOUT = Number(process.env.EXPO_PUBLIC_API_TIMEOUT) || 10000;

if (__DEV__ && !BASE_URL) {
  console.warn(
    '[apiClient] EXPO_PUBLIC_API_BASE_URL이 설정되지 않았습니다. .env에 Gateway URL을 채워주세요.'
  );
}

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: TIMEOUT,
  headers: {
    [API_HEADERS.ACCEPT]: 'application/json',
  },
});

let sessionExpiredHandler = null;

// Refresh Token까지 만료되어 다시 로그인이 필요할 때 호출할 함수를 등록한다(store.js에서 연결).
export const setSessionExpiredHandler = handler => {
  sessionExpiredHandler = handler;
};

const notifySessionExpired = apiError => {
  // 동시 요청들이 같은 refresh 실패를 공유하므로 한 번만 알린다.
  if (apiError._sessionExpiredNotified) return;
  apiError._sessionExpiredNotified = true;
  sessionExpiredHandler?.(apiError);
};

// 알림 직전에 세션 소유권을 다시 확인한다(검사와 호출 사이에 await 없음).
// closedEpoch: 이 오류를 만든 정리가 소유한 epoch. 그 사이 새 세션이 시작됐거나(epoch 변경) 로그아웃이
// 진행 중이면 새 계정의 Redux를 초기화하지 않도록 알리지 않는다. undefined면 기존 방식대로 알린다.
const notifySessionExpiredIfOwner = (apiError, closedEpoch) => {
  if (closedEpoch !== undefined && closedEpoch !== null) {
    if (getSessionEpoch() !== closedEpoch || isLogoutInProgress()) return;
  } else if (closedEpoch === null) {
    return;
  }
  notifySessionExpired(apiError);
};

const createCanceledError = () => createApiError({ kind: API_ERROR_KIND.CANCELED });

const isStaleSession = config =>
  config?._sessionEpoch !== undefined && config._sessionEpoch !== getSessionEpoch();

const isPublicAuthRequest = config => {
  const method = (config.method ?? 'get').toLowerCase();
  const path = getRequestPath(config.url);
  return API_ENDPOINTS.AUTH_PUBLIC.some(entry => entry.method === method && entry.path === path);
};

apiClient.interceptors.request.use(
  async config => {
    if (!BASE_URL) {
      return Promise.reject(createApiError({ kind: API_ERROR_KIND.CONFIG }));
    }

    config._accessTokenUsed = null;

    // 재전송은 최초 요청의 세션을 유지한다.
    if (config._sessionEpoch === undefined) {
      config._sessionEpoch = getSessionEpoch();
    }

    if (!config.skipAuth && !isPublicAuthRequest(config)) {
      const token = await getAccessToken();

      // 토큰을 읽는 사이 세션이 바뀌었으면 다른 계정의 토큰으로 보내지 않는다.
      if (isStaleSession(config)) {
        return Promise.reject(createCanceledError());
      }

      if (token) {
        config.headers[API_HEADERS.AUTHORIZATION] = `Bearer ${token}`;
        config._accessTokenUsed = token;
      } else {
        delete config.headers[API_HEADERS.AUTHORIZATION];
      }
    }

    if (config.data !== undefined && !config.headers[API_HEADERS.CONTENT_TYPE]) {
      config.headers[API_HEADERS.CONTENT_TYPE] = 'application/json';
    }

    if (config.idempotent) {
      // 최초 요청에서 키를 확정하고 config에 고정한다. 재시도는 같은 config를 다시 보내므로 키가 유지된다.
      const key = ensureIdempotencyKey(
        config.headers[API_HEADERS.IDEMPOTENCY_KEY] ?? config.idempotencyKey
      );
      config.headers[API_HEADERS.IDEMPOTENCY_KEY] = key;
      config.idempotencyKey = key;
    }

    return config;
  },
  error => Promise.reject(error)
);

// 토큰 만료로 실패한 요청을 다시 보낼 수 있게 토큰을 준비한다. 재시도 가능하면 true.
// 요청당 "최신 토큰으로 교체" 1회 + "refresh 후 재시도" 1회만 허용 → 무한 재시도 없음.
const prepareTokenForRetry = async config => {
  const pendingRefresh = getPendingRefresh();

  // 1) 다른 요청이 이미 갱신 중이면 새 refresh를 만들지 않고 그 결과를 기다린다.
  if (pendingRefresh && !config._refreshRetried) {
    config._refreshRetried = true;
    await pendingRefresh;
    return true;
  }

  // 2) 뒤늦은 401: 이 요청이 보낸 토큰보다 새 토큰이 이미 저장되어 있으면 refresh 없이 재시도.
  const currentToken = await getAccessToken();

  if (currentToken && currentToken !== config._accessTokenUsed && !config._tokenSwapRetried) {
    config._tokenSwapRetried = true;
    return true;
  }

  // 3) 같은 토큰으로 실패 → refresh (single-flight)
  if (!config._refreshRetried) {
    config._refreshRetried = true;
    await refreshAccessToken();
    return true;
  }

  return false;
};

apiClient.interceptors.response.use(unwrapResponse, async error => {
  const config = error.config;

  if (shouldRefreshToken(error)) {
    // 이전 세션의 요청: refresh·합류·재전송 없이 끝낸다(토큰 삭제·만료 알림도 없음).
    if (isStaleSession(config)) {
      return Promise.reject(createCanceledError());
    }

    let canRetry = false;

    try {
      canRetry = await prepareTokenForRetry(config);
    } catch (renewalError) {
      const apiError = classifyAxiosError(renewalError);

      if (apiError.kind === API_ERROR_KIND.SESSION_EXPIRED) {
        notifySessionExpiredIfOwner(apiError, renewalError?.closedEpoch);
      }

      return Promise.reject(apiError);
    }

    if (canRetry) {
      // 대기 중 세션이 바뀌었으면 새 세션의 토큰으로 재전송하지 않는다.
      if (isStaleSession(config)) {
        return Promise.reject(createCanceledError());
      }

      // 같은 config를 다시 보낸다 → Idempotency-Key 등 헤더 유지, Authorization만 최신 토큰으로 교체.
      return apiClient(config);
    }
  }

  const apiError = classifyAxiosError(error);

  // 인증이 필요한 API가 RE_LOGIN을 내려주면 토큰을 지우고 Redux도 초기화한다(토큰만 지워지고 인증 상태가 남던 불일치 방지).
  // 이전 세션의 응답이면 아무것도 하지 않는다. 정리 실패('failed')도 현재 세션이므로 Redux는 초기화한다.
  if (
    apiError.requiredAction === REQUIRED_ACTIONS.RE_LOGIN &&
    !config?.skipSessionHandling &&
    config &&
    !isPublicAuthRequest(config)
  ) {
    let cleared = null;

    try {
      cleared = await clearTokensIfEpoch(config._sessionEpoch);
    } catch {
      // 정리 오류가 원래 API 오류를 가리지 않는다.
    }

    if (cleared && cleared.status !== 'stale') {
      notifySessionExpiredIfOwner(apiError, cleared.closedEpoch);
    }
  }

  return Promise.reject(apiError);
});

export default apiClient;
