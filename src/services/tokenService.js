import * as SecureStore from 'expo-secure-store';
import axios from 'axios';
import { API_ENDPOINTS } from '../constants/apiEndpoints';
import { API_HEADERS } from '../constants/apiHeaders';
import {
  API_ERROR_KIND,
  classifyAxiosError,
  createApiError,
  createSessionExpiredError,
  isAuthEnvelope,
} from './apiResponse';

const SECURE_KEY_ACCESS_TOKEN = 'ACCESS_TOKEN';
const SECURE_KEY_REFRESH_TOKEN = 'REFRESH_TOKEN';

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || '';
const TIMEOUT = Number(process.env.EXPO_PUBLIC_API_TIMEOUT) || 10000;

// Refresh 전용 인스턴스: apiClient 인터셉터를 거치지 않으므로 refresh 실패가 다시 refresh를 부르지 않는다.
const refreshClient = axios.create({
  baseURL: BASE_URL,
  timeout: TIMEOUT,
  headers: { [API_HEADERS.ACCEPT]: 'application/json' },
});

// 대기 상한(ms). 테스트에서만 __testing.setLimits로 줄인다.
// 로그아웃 총 상한 = hardCapMs(약 10초): 진행 중 refresh 대기 3초 + 서버 요청 5초 + 로컬 정리.
const DEFAULT_LIMITS = {
  refreshWaitMs: 3000,
  requestTimeoutMs: 5000,
  hardCapMs: 10000,
  markerWaitMs: 1000,
  queueWaitMs: 2000,
  readQueueWaitMs: 5000,
  beginSessionWaitMs: 5000,
  deleteRetryDelayMs: 100,
};
const LIMITS = { ...DEFAULT_LIMITS };

// ── 세션 상태 ──────────────────────────────────────────────────
// _epoch: "세션이 바뀌었는가". clearTokens·beginSession(세션 시작/종료)만 올린다. 같은 세션 안의 토큰 교체
// (setTokens, refresh 커밋)는 올리지 않는다. 세션을 끝내거나 시작하는 작업은 호출 즉시(동기) 자기 epoch를
// 확정하고, 나중에 실행되는 모든 부수효과는 저장소 큐 작업 안에서 실행 시점에 epoch를 다시 확인한다.
let _epoch = 0;
let _sessionStartSeq = 0; // beginSession 횟수(로그아웃 표식 쓰기 소유권 판정용)
let _accessTokenMemory = null;
let _storedTokensBlocked = false; // 삭제가 영구 실패한 경우 이번 실행에서는 저장된 토큰을 읽지 않는다
let _phase = 'none'; // 'none' | 'draining' | 'closing' (로그아웃 진행 단계)
let _activeLogoutRun = null;
let _runSeq = 0;

// 진행 중인 refresh Promise (single-flight). 같은 세션(epoch)의 요청만 합류한다.
let _refreshPromise = null;
let _refreshEpoch = 0;

// 진행 중인 앱 잠금 해제(API-50) Promise. refresh와 달리 합류시키지 않는다(결과가 "PIN 검증 성공"이어야 하므로).
// 둘 다 같은 Refresh Token을 회전시키므로, 나중에 시작한 쪽이 먼저 시작한 쪽을 기다려 직렬화한다.
let _unlockPromise = null;
let _unlockEpoch = 0;

// 세션 정리 훅(authApi가 등록): 로그아웃 대기 표식(AsyncStorage) 기록/제거. tokenService는 AsyncStorage를 모른다.
let _cleanupHooks = { onStart: null, onCleared: null };

export const setSessionCleanupHooks = hooks => {
  _cleanupHooks = { onStart: hooks?.onStart ?? null, onCleared: hooks?.onCleared ?? null };
};

export const getSessionEpoch = () => _epoch;
export const getSessionStartSeq = () => _sessionStartSeq;
export const isLogoutInProgress = () => _phase !== 'none';

const noop = () => {};

const raceTimeout = (promise, ms, fallback) =>
  new Promise(resolve => {
    const timer = setTimeout(() => resolve(fallback), ms);
    Promise.resolve(promise).then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const canceledError = reason => {
  const error = createApiError({ kind: API_ERROR_KIND.CANCELED });
  error.reason = reason;
  return error;
};

// ── 저장소 변경 직렬화 큐 ──────────────────────────────────────
// 모든 SecureStore 쓰기·삭제는 한 번에 하나씩 실행한다. 네이티브 set/get(Coroutine)과 delete(AsyncFunction)는
// 완료 순서가 호출 순서와 같다는 보장이 없으므로 JS 쪽에서 직렬화한다. 실패한 작업이 다음 작업을 막지 않는다.
let _queueTail = Promise.resolve();

const enqueue = task => {
  const run = _queueTail.then(task);
  _queueTail = run.then(noop, noop);
  return run;
};

// 큐가 비기를 기다린다(상한 초과 시 false). 읽기는 쓰기·삭제가 끝난 뒤에 수행한다.
const waitQueue = ms =>
  raceTimeout(
    _queueTail.then(() => true),
    ms,
    false
  );

const readStoredValue = async key => {
  try {
    const value = await SecureStore.getItemAsync(key);
    // 빈 문자열(삭제 실패 시 덮어쓴 값)은 "없음"으로 취급한다.
    return typeof value === 'string' && value ? value : null;
  } catch {
    return null;
  }
};

export const getAccessToken = async () => {
  if (_phase === 'closing' || _storedTokensBlocked) return null;
  if (_accessTokenMemory) return _accessTokenMemory;

  const epoch0 = _epoch;
  if (!(await waitQueue(LIMITS.readQueueWaitMs))) return null;
  if (_epoch !== epoch0) return getAccessToken();
  if (_phase === 'closing' || _storedTokensBlocked) return null;
  if (_accessTokenMemory) return _accessTokenMemory;

  const stored = await readStoredValue(SECURE_KEY_ACCESS_TOKEN);

  // 읽는 사이 세션이 바뀌었으면 지워진 값을 되살리지 않는다.
  if (_epoch !== epoch0) return getAccessToken();
  if (_phase === 'closing' || _storedTokensBlocked) return null;

  if (stored) {
    _accessTokenMemory = stored;
  }
  return stored;
};

export const getRefreshToken = async () => {
  if (_phase === 'closing' || _storedTokensBlocked) return null;

  const epoch0 = _epoch;
  if (!(await waitQueue(LIMITS.readQueueWaitMs))) return null;
  if (_epoch !== epoch0) return getRefreshToken();
  if (_phase === 'closing' || _storedTokensBlocked) return null;

  const stored = await readStoredValue(SECURE_KEY_REFRESH_TOKEN);

  if (_epoch !== epoch0) return getRefreshToken();
  if (_phase === 'closing' || _storedTokensBlocked) return null;
  return stored;
};

// 큐 작업 안에서 실행한다. 검사(epoch/aborted)와 쓰기 시작 사이에 await가 없다.
// refresh 토큰이 없으면 기존 값을 건드리지 않는다(SecureStore에 undefined 저장 방지).
const commitTokens = async ({ epoch, ctl, accessToken, refreshToken }) => {
  const isOwner = () => !ctl?.aborted && _epoch === epoch;

  if (!isOwner()) return false;
  _accessTokenMemory = null; // 쓰는 동안 이전 값을 읽지 않도록 비운다(읽기는 큐를 기다린다)

  await SecureStore.setItemAsync(SECURE_KEY_ACCESS_TOKEN, accessToken);

  if (typeof refreshToken === 'string' && refreshToken) {
    if (!isOwner()) return false;
    await SecureStore.setItemAsync(SECURE_KEY_REFRESH_TOKEN, refreshToken);
  }

  if (!isOwner()) return false;
  _accessTokenMemory = accessToken;
  return true;
};

// 같은 세션 안에서 토큰을 교체한다. 호출 후 세션이 바뀌면 쓰지 않고 false를 반환한다.
export const setTokens = (accessToken, refreshToken) => {
  const epoch = _epoch;
  return enqueue(() => commitTokens({ epoch, accessToken, refreshToken }));
};

// 로그인·회원가입 성공 시 새 세션을 시작한다. 성공하면 새 세션 epoch를 반환한다.
// - 로그아웃 진행 중이거나 expectedEpoch(요청 시작 시점 epoch)와 다르면 CANCELED로 거부(토큰 저장 안 함)
// - 저장소가 응답하지 않으면 beginSessionWaitMs 후 STORAGE_BUSY로 거부하고, 큐에 남은 쓰기는 실행돼도 저장하지 않는다
// - 저장 실패 오류에는 sessionEpoch를 실어 호출부가 자기 세션만 정리할 수 있게 한다
export const beginSession = (accessToken, refreshToken, { expectedEpoch } = {}) => {
  if (_phase !== 'none') {
    return Promise.reject(canceledError('LOGOUT_IN_PROGRESS'));
  }
  if (expectedEpoch !== undefined && expectedEpoch !== _epoch) {
    return Promise.reject(canceledError('SESSION_CHANGED'));
  }

  const myEpoch = ++_epoch;
  _sessionStartSeq += 1;
  _accessTokenMemory = null;
  _storedTokensBlocked = false;

  const ctl = { aborted: false };
  const write = enqueue(() => commitTokens({ epoch: myEpoch, ctl, accessToken, refreshToken }));

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ctl.aborted = true;
      const busy = canceledError('STORAGE_BUSY');
      busy.sessionEpoch = myEpoch;
      reject(busy);
    }, LIMITS.beginSessionWaitMs);

    write.then(
      committed => {
        clearTimeout(timer);
        if (committed) {
          resolve(myEpoch);
          return;
        }
        const changed = canceledError('SESSION_CHANGED');
        changed.sessionEpoch = myEpoch;
        reject(changed);
      },
      error => {
        clearTimeout(timer);
        if (error && typeof error === 'object') error.sessionEpoch = myEpoch;
        reject(error);
      }
    );
  });
};

// ── 세션 정리 ─────────────────────────────────────────────────
// 호출 즉시(동기) 세션을 닫는다: epoch 증가 + 메모리 토큰 제거. 반환값이 이 정리의 소유 epoch다.
const closeSessionNow = () => {
  _epoch += 1;
  _accessTokenMemory = null;
  return _epoch;
};

const settledAll = async promises => {
  const results = await Promise.allSettled(promises);
  return results.every(result => result.status === 'fulfilled');
};

const tryDeleteBoth = () =>
  settledAll([
    SecureStore.deleteItemAsync(SECURE_KEY_ACCESS_TOKEN),
    SecureStore.deleteItemAsync(SECURE_KEY_REFRESH_TOKEN),
  ]);

const tryOverwriteBoth = () =>
  settledAll([
    SecureStore.setItemAsync(SECURE_KEY_ACCESS_TOKEN, ''),
    SecureStore.setItemAsync(SECURE_KEY_REFRESH_TOKEN, ''),
  ]);

// 삭제 → (100ms 후) 재시도 → 빈 문자열 덮어쓰기 → 이번 실행 차단. 각 단계 직전에 소유 epoch를 다시 확인한다.
// 새 세션이 시작되었으면 아무것도 하지 않는다('superseded').
const runDeletion = closeEpoch =>
  enqueue(async () => {
    const isOwner = () => _epoch === closeEpoch;

    if (!isOwner()) return 'superseded';
    if (await tryDeleteBoth()) return 'cleared';

    await sleep(LIMITS.deleteRetryDelayMs);
    if (!isOwner()) return 'superseded';
    if (await tryDeleteBoth()) return 'cleared';

    if (!isOwner()) return 'superseded';
    if (await tryOverwriteBoth()) return 'cleared';

    if (!isOwner()) return 'superseded';
    _storedTokensBlocked = true;
    return 'failed';
  }).catch(() => 'failed');

// 삭제 결과가 'cleared'이고 아직 이 정리의 세션이면 표식 제거 훅을 호출한다('failed'·'superseded'는 표식 유지).
const finishCleanup = async closeEpoch => {
  const status = await runDeletion(closeEpoch);

  if (status === 'cleared' && _epoch === closeEpoch && _cleanupHooks.onCleared) {
    await raceTimeout(_cleanupHooks.onCleared(closeEpoch), LIMITS.markerWaitMs, false);
  }
  return status;
};

// 현재 세션(expectedEpoch)일 때만 토큰을 지운다. 던지지 않고 결과를 반환한다.
// - 'stale': 이미 다른 세션 → 아무것도 하지 않음(알림도 보내지 않아야 함)
// - 'cleared' | 'failed' | 'superseded': 정리를 수행함. closedEpoch는 이 정리가 소유한 epoch
// expectedEpoch가 undefined면 현재 세션을 지운다.
export const clearTokensIfEpoch = async expectedEpoch => {
  if (expectedEpoch !== undefined && expectedEpoch !== _epoch) {
    return { status: 'stale', closedEpoch: null, markerWritten: false };
  }

  const closeEpoch = closeSessionNow();
  const markerWritten = _cleanupHooks.onStart
    ? await raceTimeout(_cleanupHooks.onStart(closeEpoch), LIMITS.markerWaitMs, false)
    : false;
  const status = await finishCleanup(closeEpoch);

  return { status, closedEpoch: closeEpoch, markerWritten: markerWritten === true };
};

// 기존 호출부 호환: 현재 세션을 무조건 지운다. 삭제가 영구 실패했을 때만 던진다.
export const clearTokens = async () => {
  const { status } = await clearTokensIfEpoch();

  if (status === 'failed') {
    throw new Error('저장된 토큰을 삭제하지 못했습니다.');
  }
};

// ── 로그아웃 ──────────────────────────────────────────────────
// sendRequest(refreshToken, { timeoutMs }) → { serverLoggedOut, serverError } (던지지 않아야 함, 던져도 실패로 처리)
// 항상 resolve한다. 반환 값에 토큰은 포함하지 않는다.
//   draining: 새 refresh 차단, 진행 중인 refresh는 최대 refreshWaitMs 대기
//   closing:  epoch 증가·메모리 비움·읽기는 null → 서버 로그아웃 → 로컬 정리
// hardCapMs를 넘기면 phase만 해제하고 결과를 돌려준다. 남은 작업은 백그라운드에서 계속되지만
// 모든 저장소 부수효과가 소유 epoch를 확인하므로 새 세션에는 영향을 주지 않는다.
export const runLogout = sendRequest => {
  if (_activeLogoutRun) return _activeLogoutRun.promise;

  const run = { id: ++_runSeq, promise: null };
  _activeLogoutRun = run;
  _phase = 'draining';

  const result = {
    serverLoggedOut: false,
    localCleared: false,
    serverError: null,
    timedOut: false,
    markerWritten: false,
  };

  let closeEpoch = null;
  let capped = false;

  // 이 run이 아직 현재 run일 때만 phase를 해제한다(상한으로 이미 해제됐거나 새 run이 시작됐으면 건드리지 않음).
  const release = () => {
    if (_activeLogoutRun === run) {
      _activeLogoutRun = null;
      _phase = 'none';
    }
  };

  const ensureClosed = () => {
    if (closeEpoch === null) {
      _phase = 'closing';
      closeEpoch = closeSessionNow();
    }
    return closeEpoch;
  };

  // 표식은 로그아웃 시작 시 먼저 기록한다(삭제 도중 앱이 종료돼도 다음 실행에서 복원을 막기 위해).
  const markerPromise = _cleanupHooks.onStart
    ? raceTimeout(_cleanupHooks.onStart(), LIMITS.markerWaitMs, false)
    : Promise.resolve(false);

  const work = (async () => {
    try {
      const pending = _refreshPromise;
      const pendingUnlock = _unlockPromise;
      if (pendingUnlock) {
        // 진행 중인 잠금 해제가 새 Refresh Token을 저장한 뒤 그 토큰으로 서버 로그아웃해야 활성 토큰이 남지 않는다.
        // refresh와 잠금 해제를 하나의 대기 상한(refreshWaitMs) 안에서 함께 기다린다.
        await raceTimeout(
          Promise.allSettled([pending, pendingUnlock].filter(Boolean)),
          LIMITS.refreshWaitMs,
          null
        );
      } else if (pending) {
        await raceTimeout(pending, LIMITS.refreshWaitMs, null);
      }
      await waitQueue(LIMITS.queueWaitMs);

      const refreshToken = await raceTimeout(
        readStoredValue(SECURE_KEY_REFRESH_TOKEN),
        LIMITS.queueWaitMs,
        null
      );
      result.markerWritten = (await markerPromise) === true;

      const owned = ensureClosed();

      if (refreshToken && !capped) {
        try {
          const sent = await sendRequest(refreshToken, { timeoutMs: LIMITS.requestTimeoutMs });
          result.serverLoggedOut = sent?.serverLoggedOut === true;
          result.serverError = sent?.serverError ?? null;
        } catch {
          result.serverLoggedOut = false;
        }
      }

      const status = await finishCleanup(owned);
      result.localCleared = status === 'cleared';
      return { ...result };
    } finally {
      release();
    }
  })();

  run.promise = new Promise(resolve => {
    const timer = setTimeout(() => {
      capped = true;
      ensureClosed();
      release();
      resolve({ ...result, localCleared: false, timedOut: true });
    }, LIMITS.hardCapMs);

    work.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        release();
        resolve({ ...result, localCleared: false });
      }
    );
  });

  return run.promise;
};

// ── Refresh ───────────────────────────────────────────────────
// 진행 중인 refresh가 있으면 그 Promise, 없으면 null. 현재 세션의 refresh만 돌려준다.
export const getPendingRefresh = () =>
  _refreshPromise && _refreshEpoch === _epoch ? _refreshPromise : null;

// 서버가 refresh 자체를 거부한 경우(4xx)만 세션 만료로 본다. 408/429는 일시적 거부로 취급.
const isRefreshRejected = status =>
  status >= 400 && status < 500 && status !== 408 && status !== 429;

// 토큰을 지우고 던질 오류를 만든다. 세션이 이미 바뀌었으면 CANCELED(알림 없음),
// 이 세션을 정리했으면 SESSION_EXPIRED + closedEpoch(알림 직전 소유권 검증용).
const expireSession = async (epoch0, cause) => {
  const { status, closedEpoch } = await clearTokensIfEpoch(epoch0);

  if (status === 'stale' || status === 'superseded') {
    return canceledError('SESSION_CHANGED');
  }

  const error = createSessionExpiredError(cause);
  error.closedEpoch = closedEpoch;
  return error;
};

const performRefresh = async (epoch0, blockingUnlock = null) => {
  // 호출 시점에 이미 진행 중이던 잠금 해제가 있으면 끝난 뒤(회전된 새 Refresh Token을 저장한 뒤)에 시작한다.
  // 잠금 해제가 없으면(기본) 이 줄은 아무 것도 하지 않아 기존 동작과 같다.
  if (blockingUnlock) {
    await blockingUnlock.then(noop, noop);
    if (_epoch !== epoch0) throw canceledError('SESSION_CHANGED');
  }

  const refreshToken = await getRefreshToken();

  if (_epoch !== epoch0) throw canceledError('SESSION_CHANGED');

  if (!refreshToken) {
    throw await expireSession(epoch0);
  }

  if (!BASE_URL) {
    throw createApiError({ kind: API_ERROR_KIND.CONFIG });
  }

  let response;

  try {
    // 명세 API-07: POST /api/v1/auth/refresh, body { refresh_token }
    response = await refreshClient.post(API_ENDPOINTS.AUTH.REFRESH, {
      refresh_token: refreshToken,
    });
  } catch (error) {
    const apiError = classifyAxiosError(error);

    if (error?.response && isRefreshRejected(error.response.status)) {
      throw await expireSession(epoch0, apiError);
    }

    // 네트워크·타임아웃·5xx는 영구 만료로 단정하지 않는다 — 토큰을 유지한 채 오류만 전달.
    throw apiError;
  }

  const body = response.data;
  const data = isAuthEnvelope(body) && body.success === true ? body.data : null;
  const newAccessToken = data?.access_token;

  if (typeof newAccessToken !== 'string' || !newAccessToken) {
    throw createApiError({
      kind: API_ERROR_KIND.BUSINESS,
      message: '토큰 재발급 응답을 해석할 수 없습니다.',
      status: response.status,
      code: typeof body?.code === 'string' ? body.code : null,
      traceId: typeof body?.traceId === 'string' ? body.traceId : null,
    });
  }

  // 서버가 refresh_token을 회전해 내려주면 새 값을, 없으면 기존 값을 유지한다.
  // 세션 확인과 쓰기가 같은 큐 작업 안에 있어, 그 사이 로그아웃이 끼어들면 저장하지 않는다.
  const committed = await enqueue(() =>
    commitTokens({
      epoch: epoch0,
      accessToken: newAccessToken,
      refreshToken: data.refresh_token,
    })
  );

  if (!committed) throw canceledError('SESSION_CHANGED');

  return newAccessToken;
};

export const refreshAccessToken = () => {
  const pending = getPendingRefresh();
  if (pending) return pending;

  // 로그아웃 중에는 새 refresh를 시작하지 않는다(이미 진행 중인 것에 합류하는 것만 허용).
  if (_phase !== 'none') {
    return Promise.reject(canceledError('LOGOUT_IN_PROGRESS'));
  }

  const epoch0 = _epoch;
  const blockingUnlock = _unlockPromise && _unlockEpoch === epoch0 ? _unlockPromise : null;
  const promise = performRefresh(epoch0, blockingUnlock).finally(() => {
    // 이전 세션의 refresh가 끝나며 새 세션의 promise 포인터를 지우지 않는다.
    if (_refreshPromise === promise) {
      _refreshPromise = null;
    }
  });

  _refreshPromise = promise;
  _refreshEpoch = epoch0;

  return promise;
};

// ── 앱 잠금 해제 (API-50) ─────────────────────────────────────
// POST /api/v1/auth/session/unlock { refresh_token, pin } → 새 Access/Refresh Token (Refresh 회전: 이전 토큰 폐기).
// 성공(= 서버가 PIN을 검증함)해야만 resolve한다. 일반 refresh 성공과는 별개이며 refresh Promise에 합류하지 않는다.
// - 실패해도 토큰을 지우지 않는다. 서버의 401 AUTH-401-005는 "잘못된 PIN"과 "무효한 Refresh Token"을 구분하지 않으므로
//   이 함수는 401에서 세션을 정리·만료 처리하지 않고 오류만 전달한다(호출부가 사용자에게 로그아웃 경로를 제공한다).
// - 세션 epoch는 바꾸지 않는다(같은 세션의 토큰 교체). 응답이 도착했을 때 세션이 바뀌었으면(로그아웃·재로그인)
//   저장하지 않고 CANCELED를 던진다.
// - 저장하지 못한 새 Refresh Token은 서버에 활성 상태로 남지 않도록 서버 로그아웃으로 폐기를 시도한다(best-effort).
// 반환: { onboardingCompleted } — 토큰 값은 반환하지 않는다.

// 저장하지 못한(또는 저장하면 안 되는) 새 Refresh Token을 서버에서 폐기한다. 실패해도 던지지 않는다.
// Authorization 없이 {refresh_token}만 보낸다. 저장소·epoch를 건드리지 않으므로 다른 세션에 영향이 없다.
const revokeUnstoredRefreshToken = refreshToken => {
  if (!BASE_URL || typeof refreshToken !== 'string' || !refreshToken) return;

  refreshClient
    .post(
      API_ENDPOINTS.AUTH.LOGOUT,
      { refresh_token: refreshToken },
      { timeout: LIMITS.requestTimeoutMs }
    )
    .then(noop, noop);
};

const performUnlock = async (epoch0, pin, blockingRefresh) => {
  // 이미 진행 중이던 refresh가 있으면 끝난 뒤에 시작한다(같은 Refresh Token을 동시에 회전시키지 않기 위해).
  if (blockingRefresh) {
    await blockingRefresh.then(noop, noop);
  }

  if (_epoch !== epoch0) throw canceledError('SESSION_CHANGED');
  if (_phase !== 'none') throw canceledError('LOGOUT_IN_PROGRESS');

  // 대기 이후에 읽으므로 선행 refresh가 회전시킨 최신 Refresh Token을 사용한다.
  const refreshToken = await getRefreshToken();

  if (_epoch !== epoch0) throw canceledError('SESSION_CHANGED');
  if (_phase !== 'none') throw canceledError('LOGOUT_IN_PROGRESS');

  // 저장된 Refresh Token이 없으면 잠금 해제할 세션이 없다.
  if (!refreshToken) {
    throw await expireSession(epoch0);
  }

  if (!BASE_URL) {
    throw createApiError({ kind: API_ERROR_KIND.CONFIG });
  }

  let response;

  try {
    response = await refreshClient.post(API_ENDPOINTS.AUTH.SESSION_UNLOCK, {
      refresh_token: refreshToken,
      pin,
    });
  } catch (error) {
    // 이전 세션의 응답/오류는 현재 상태에 영향을 주지 않는다.
    if (_epoch !== epoch0) throw canceledError('SESSION_CHANGED');
    // 401(모호)·423·네트워크·타임아웃·5xx 모두 토큰을 유지한 채 오류만 전달한다.
    throw classifyAxiosError(error);
  }

  const body = response.data;
  const data = isAuthEnvelope(body) && body.success === true ? body.data : null;
  const newAccessToken = data?.access_token;
  const newRefreshToken = data?.refresh_token;

  if (
    typeof newAccessToken !== 'string' ||
    !newAccessToken ||
    typeof newRefreshToken !== 'string' ||
    !newRefreshToken
  ) {
    if (_epoch !== epoch0) {
      // 응답을 해석할 수 없어도 세션이 바뀐 뒤라면 호출부에는 취소로만 알린다.
      throw canceledError('SESSION_CHANGED');
    }
    // 서버가 회전했는지 알 수 없는 응답이다. 기존 토큰은 건드리지 않고 잠금도 풀지 않는다.
    throw createApiError({
      kind: API_ERROR_KIND.BUSINESS,
      message: '잠금 해제 응답을 해석할 수 없습니다.',
      status: response.status,
      code: typeof body?.code === 'string' ? body.code : null,
      traceId: typeof body?.traceId === 'string' ? body.traceId : null,
    });
  }

  // 응답을 기다리는 사이 세션이 바뀌었다(로그아웃 마감·재로그인). 새 토큰은 저장하지 않고 서버에서 폐기한다.
  if (_epoch !== epoch0) {
    revokeUnstoredRefreshToken(newRefreshToken);
    throw canceledError('SESSION_CHANGED');
  }

  // 새 Access + 회전된 Refresh를 한 번에 저장한다(기존 commitTokens·직렬화 큐 재사용, epoch는 쓰기 직전에 다시 확인).
  // 로그아웃이 draining 단계여도 epoch가 같으면 저장해, 로그아웃이 이 새 Refresh Token으로 서버 로그아웃하게 한다.
  let committed;

  try {
    committed = await enqueue(() =>
      commitTokens({ epoch: epoch0, accessToken: newAccessToken, refreshToken: newRefreshToken })
    );
  } catch {
    // 서버는 이미 이전 Refresh Token을 폐기했다. 저장이 어중간하게 끝났을 수 있으므로 이 세션을 정리하고
    // 저장하지 못한 새 Refresh Token은 서버에서 폐기한다. 인증 상태가 되살아나지 않는다.
    revokeUnstoredRefreshToken(newRefreshToken);
    throw await expireSession(epoch0);
  }

  if (!committed) {
    revokeUnstoredRefreshToken(newRefreshToken);
    throw canceledError('SESSION_CHANGED');
  }

  return { onboardingCompleted: data.onboarding_completed ?? null };
};

export const unlockWithPin = pin => {
  // 로그아웃 진행 중에는 시작하지 않는다.
  if (_phase !== 'none') {
    return Promise.reject(canceledError('LOGOUT_IN_PROGRESS'));
  }

  // 동시에 두 PIN을 보내지 않는다(PIN 실패 카운터는 서버에서 공유된다).
  if (_unlockPromise) {
    return Promise.reject(canceledError('UNLOCK_IN_PROGRESS'));
  }

  const epoch0 = _epoch;
  const blockingRefresh = getPendingRefresh();
  const promise = performUnlock(epoch0, pin, blockingRefresh).finally(() => {
    if (_unlockPromise === promise) {
      _unlockPromise = null;
    }
  });

  _unlockPromise = promise;
  _unlockEpoch = epoch0;

  return promise;
};

// 테스트 전용: 제한값 조정, 앱 재실행(프로세스 메모리 초기화) 모사.
export const __testing = {
  setLimits: overrides => Object.assign(LIMITS, overrides),
  resetLimits: () => Object.assign(LIMITS, DEFAULT_LIMITS),
  // 프로세스 재시작을 모사한다: 메모리 상태만 버리고 저장소(SecureStore/AsyncStorage)는 그대로 둔다.
  resetProcessState: () => {
    _accessTokenMemory = null;
    _storedTokensBlocked = false;
    _phase = 'none';
    _activeLogoutRun = null;
    _refreshPromise = null;
    _unlockPromise = null;
    _queueTail = Promise.resolve();
    _epoch += 1;
  },
};
