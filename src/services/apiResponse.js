// 공통 HTTP 응답/오류 정규화. React Native 의존성이 없는 순수 모듈이다.
//
// 서비스별 정상 응답 형식(docs/moaje-frontend-api-guide-20261011.pdf):
// - Auth(/api/v1/auth/...): { success, status, code, message, data, error, traceId, timestamp }
//   → success === true일 때 data를 반환한다.
// - Banking·Asset·Work: 객체 또는 배열을 그대로 반환 → 응답 본문을 가공 없이 반환한다.
//
// apiClient 반환 계약: 정상 응답이면 위 규칙으로 꺼낸 값, 실패면 ApiError로 reject.
import { API_CODES } from '../constants/apiCodes';
import { REQUIRED_ACTIONS } from '../constants/requiredActions';

export const API_ERROR_KIND = {
  CONFIG: 'CONFIG', // BASE_URL 미설정 등 앱 설정 문제
  NETWORK: 'NETWORK', // 서버 미도달(연결 실패)
  TIMEOUT: 'TIMEOUT', // 요청 시간 초과
  CANCELED: 'CANCELED', // 호출부가 요청을 취소함
  AUTH_REQUIRED: 'AUTH_REQUIRED', // Gateway 401 UNAUTHENTICATED (토큰 없음)
  TOKEN_INVALID: 'TOKEN_INVALID', // Gateway 401 INVALID_TOKEN (갱신 재시도 후에도 거부됨)
  SESSION_EXPIRED: 'SESSION_EXPIRED', // Refresh Token 재발급 실패 → 다시 로그인 필요
  BUSINESS: 'BUSINESS', // Auth envelope success:false (서버가 정의한 업무 오류)
  HTTP_4XX: 'HTTP_4XX',
  HTTP_5XX: 'HTTP_5XX',
};

// Gateway가 토큰 단계에서 요청을 거부할 때 내려주는 코드.
// 2026-10-12 로컬 Gateway 실측: 토큰 없음 → 401 {"code":"UNAUTHENTICATED"},
// 무효·위조 JWT → 401 {"code":"INVALID_TOKEN"}. 서명이 유효한 만료 토큰의 코드는 아직 실측 전.
export const GATEWAY_CODES = {
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_TOKEN: 'INVALID_TOKEN',
};

// 이 코드로 401이 오면 토큰 갱신(또는 최신 토큰으로 재시도)을 시도한다.
export const REFRESHABLE_GATEWAY_CODES = [GATEWAY_CODES.INVALID_TOKEN];

const AUTH_ENVELOPE_PATH_PREFIXES = [
  '/api/v1/auth/', // 명세
];

const DEFAULT_MESSAGES = {
  [API_ERROR_KIND.CONFIG]: '서버 연결 설정이 아직 준비되지 않았어요.',
  [API_ERROR_KIND.NETWORK]: '네트워크 연결을 확인해주세요.',
  [API_ERROR_KIND.TIMEOUT]: '서버 응답이 지연되고 있어요. 잠시 후 다시 시도해주세요.',
  [API_ERROR_KIND.CANCELED]: '요청이 취소되었습니다.',
  [API_ERROR_KIND.AUTH_REQUIRED]: '로그인이 필요합니다.',
  [API_ERROR_KIND.TOKEN_INVALID]: '인증 정보가 유효하지 않습니다. 다시 로그인해주세요.',
  [API_ERROR_KIND.SESSION_EXPIRED]: '세션이 만료되었습니다. 다시 로그인해주세요.',
  [API_ERROR_KIND.BUSINESS]: '오류가 발생했습니다.',
  [API_ERROR_KIND.HTTP_4XX]: '요청을 처리할 수 없습니다.',
  [API_ERROR_KIND.HTTP_5XX]: '서버에 일시적인 문제가 발생했습니다.',
};

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export class ApiError extends Error {
  constructor(message, fields) {
    super(message);
    this.name = 'ApiError';
    Object.assign(this, fields);
  }
}

export const createApiError = ({
  kind,
  message,
  status = null,
  code = null,
  traceId = null,
  requiredAction = null,
  envelope,
}) => {
  const fields = {
    kind,
    status,
    code,
    traceId,
    requiredAction,
    // 기존 호출부(normalizeApiError 등) 호환용 플래그
    isNetworkError: kind === API_ERROR_KIND.NETWORK || kind === API_ERROR_KIND.TIMEOUT,
    isConfigError: kind === API_ERROR_KIND.CONFIG,
  };
  if (envelope !== undefined) {
    fields.envelope = envelope;
  }
  return new ApiError(message || DEFAULT_MESSAGES[kind], fields);
};

// 요청 config.url에서 경로만 추출한다(절대 URL·쿼리스트링 대응).
export const getRequestPath = url =>
  typeof url === 'string' ? url.replace(/^[a-z]+:\/\/[^/]+/i, '').split('?')[0] : '';

export const isAuthEnvelopePath = url => {
  const path = getRequestPath(url);
  return AUTH_ENVELOPE_PATH_PREFIXES.some(prefix => path.startsWith(prefix));
};

export const isAuthEnvelope = body =>
  isPlainObject(body) && typeof body.success === 'boolean' && 'data' in body && 'code' in body;

const readHeader = (headers, name) => {
  if (!headers) return null;
  const value = typeof headers.get === 'function' ? headers.get(name) : headers[name];
  return typeof value === 'string' && value ? value : null;
};

const readTraceId = (body, headers) =>
  (isPlainObject(body) && typeof body.traceId === 'string' && body.traceId) ||
  readHeader(headers, 'x-trace-id');

const createEnvelopeError = (kind, envelope, status, headers) =>
  createApiError({
    kind,
    message: envelope.message,
    status,
    code: typeof envelope.code === 'string' ? envelope.code : null,
    traceId: readTraceId(envelope, headers),
    requiredAction: envelope.error?.requiredAction ?? null,
    envelope,
  });

// 정상(2xx) 응답 → 호출부에 넘길 값. 응답 필드를 새로 만들지 않는다.
// config.responseFormat('envelope' | 'raw')으로 요청별 지정 가능, 없으면 경로로 판정한다.
export const unwrapResponse = response => {
  const { data: body, config, status, headers } = response;
  const format = config?.responseFormat ?? (isAuthEnvelopePath(config?.url) ? 'envelope' : 'raw');

  if (format === 'raw') {
    return body;
  }

  if (isAuthEnvelope(body)) {
    if (body.success === true) {
      return body.data;
    }
    throw createEnvelopeError(API_ERROR_KIND.BUSINESS, body, status, headers);
  }

  throw createApiError({
    kind: API_ERROR_KIND.BUSINESS,
    message: '서버 응답 형식을 해석할 수 없습니다.',
    status,
    traceId: readTraceId(body, headers),
  });
};

const isTimeoutError = error =>
  error?.code === 'ETIMEDOUT' ||
  (error?.code === 'ECONNABORTED' && /timeout/i.test(error?.message ?? ''));

// Axios 오류(또는 이미 정규화된 ApiError) → ApiError
export const classifyAxiosError = error => {
  if (error instanceof ApiError) {
    return error;
  }

  if (error?.isConfigError) {
    return createApiError({ kind: API_ERROR_KIND.CONFIG, message: error.message });
  }

  if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError') {
    return createApiError({ kind: API_ERROR_KIND.CANCELED });
  }

  const response = error?.response;

  if (!response) {
    return createApiError({
      kind: isTimeoutError(error) ? API_ERROR_KIND.TIMEOUT : API_ERROR_KIND.NETWORK,
    });
  }

  const { status, data: body, headers } = response;

  if (status >= 500) {
    return isAuthEnvelope(body)
      ? createEnvelopeError(API_ERROR_KIND.HTTP_5XX, body, status, headers)
      : createApiError({
          kind: API_ERROR_KIND.HTTP_5XX,
          status,
          code: isPlainObject(body) && typeof body.code === 'string' ? body.code : null,
          traceId: readTraceId(body, headers),
        });
  }

  if (isAuthEnvelope(body)) {
    return createEnvelopeError(API_ERROR_KIND.BUSINESS, body, status, headers);
  }

  const code = isPlainObject(body) && typeof body.code === 'string' ? body.code : null;
  let kind = API_ERROR_KIND.HTTP_4XX;

  if (status === 401 && code === GATEWAY_CODES.UNAUTHENTICATED) {
    kind = API_ERROR_KIND.AUTH_REQUIRED;
  } else if (status === 401 && REFRESHABLE_GATEWAY_CODES.includes(code)) {
    kind = API_ERROR_KIND.TOKEN_INVALID;
  }

  return createApiError({ kind, status, code, traceId: readTraceId(body, headers) });
};

// Refresh 실패 → 다시 로그인 필요. 원인 오류의 status/code/traceId는 보존한다.
export const createSessionExpiredError = cause =>
  createApiError({
    kind: API_ERROR_KIND.SESSION_EXPIRED,
    status: cause?.status ?? null,
    code: cause?.code ?? null,
    traceId: cause?.traceId ?? null,
    requiredAction: REQUIRED_ACTIONS.RE_LOGIN,
    envelope: cause?.envelope,
  });

// 토큰 만료로 판단해 갱신을 시도할 오류인지 판정한다.
// - 실제로 Bearer 토큰을 붙여 보낸 요청의 401만 대상(로그인 실패·토큰 없음은 제외)
// - Gateway INVALID_TOKEN(실측) 또는 Auth envelope의 REFRESH_TOKEN/AUTH-401-002(기존 코드, 미검증)
export const shouldRefreshToken = error => {
  const response = error?.response;
  const config = error?.config;

  if (!response || response.status !== 401 || !config?._accessTokenUsed || config.skipAuthRefresh) {
    return false;
  }

  const body = response.data;

  if (isAuthEnvelope(body)) {
    return (
      body.error?.requiredAction === REQUIRED_ACTIONS.REFRESH_TOKEN ||
      body.code === API_CODES.AUTH_ACCESS_TOKEN_EXPIRED
    );
  }

  return isPlainObject(body) && REFRESHABLE_GATEWAY_CODES.includes(body.code);
};
