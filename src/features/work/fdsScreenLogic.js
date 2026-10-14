// 이상거래 알림 화면 로직 (API-25 탐지 기록, API-26 알림 목록, API-27 알림 확인, API-28 소비 안전도 점수).
// React / react-native / Redux / AsyncStorage에 의존하지 않는 순수 모듈이다.
//
// 원칙
// - 안전도 점수·등급·이모지·메시지, 알림 문구, 위험도, 집계(total/unread)는 모두 서버 값이다. 이 모듈은 표시용으로 포맷만 하며
//   점수·등급·알림·거래를 만들거나 재계산하지 않는다. 금액은 문자열로만 다루며 Number로 바꾸지 않는다.
// - 거래 0건(total_tx 0)이면 서버가 100점/A등급을 돌려줄 수 있다. 점수·등급은 그대로 두고 "참고용" 안내만 덧붙인다.
// - 요청이 실패하면 값을 만들지 않는다(가짜 0점·빈 알림 없음). 오류 종류만 돌려준다.
// - 자동 재시도·폴링·타이머가 없다. GET은 화면 진입/구간 첫 진입/미확인 필터 전환/사용자의 '다시 불러오기'에서만 나가고,
//   PATCH(API-27)는 confirmAlert() 호출('확인' 버튼 탭)로만 나간다. API-21(탐지 실행)은 서버가 자동으로 수행하므로 호출하지 않는다.
// - 사용자 변경·dispose·필터 전환 뒤에 도착한 늦은 응답은 폐기한다(요청 게이트 / 세대 번호).
// - 알림 id는 TSID(64bit)라 숫자 문자열로만 다룬다.
import { createRequestGate, describeErrorType } from '../onboarding/workOnboardingScreenLogic';
import { isValidOnboardingUserId } from '../onboarding/onboardingApi';
import { formatWonString } from '../moneyRecap/recapScreenLogic';
import {
  canRetrySpendingError,
  describeSpendingError,
  formatServerDateTime,
} from './spendingScreenLogic';
import { FDS_ERROR_TYPE, getFdsErrorType } from './fdsApi';

const T = FDS_ERROR_TYPE;

// ── 상수 ─────────────────────────────────────────────────────

export const FDS_TAB = Object.freeze({ ALERTS: 'alerts', LOGS: 'logs' });

export const FDS_STATUS = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error',
});

export const CONFIRM_REJECT = Object.freeze({
  DISPOSED: 'DISPOSED',
  NO_USER: 'NO_USER',
  UNKNOWN_ALERT: 'UNKNOWN_ALERT',
  ALREADY_CONFIRMED: 'ALREADY_CONFIRMED',
  IN_FLIGHT: 'IN_FLIGHT',
});

// API-26/25 한 번에 요청하는 개수(서버 허용 1~100). 서버는 offset을 지원하지 않아 더 보기는 없다.
export const ALERTS_LIMIT = 50;
export const LOGS_LIMIT = 50;

export const NO_ANALYZED_NOTICE = '분석된 거래가 없어 현재 점수는 참고용이에요.';
export const ALERTS_LIMIT_NOTICE = `최근 ${ALERTS_LIMIT}건만 보여드려요.`;
export const LOGS_LIMIT_NOTICE = `최근 ${LOGS_LIMIT}건만 보여드려요.`;
export const LOGS_NOTICE =
  '이상거래 점검을 거친 거래 기록이에요. 위험도가 낮으면 알림은 만들어지지 않아요.';

export const FDS_LABELS = Object.freeze({
  scoreTitle: '소비 안전도',
  scoreCaption: '최근 30일 기준',
  totalTx: '점검한 거래',
  highCount: '높은 위험',
  mediumCount: '주의',
  alertsEmptyAll: '이상거래 알림이 없어요.',
  alertsEmptyUnread: '확인하지 않은 알림이 없어요.',
  logsEmpty: '점검한 거래 기록이 없어요.',
});

const RISK_LABELS = Object.freeze({ HIGH: '높은 위험', MEDIUM: '주의', LOW: '낮음' });

// 알 수 없는 위험도는 서버 원문을 그대로 보여준다.
export const describeRiskLevel = riskLevel =>
  Object.prototype.hasOwnProperty.call(RISK_LABELS, riskLevel)
    ? RISK_LABELS[riskLevel]
    : String(riskLevel);

// ── 사용자 문구 (서버 원문·토큰·ID 노출 없음) ────────────────

export const describeFdsError = errorType => describeSpendingError(errorType);
export const canRetryFdsError = errorType => canRetrySpendingError(errorType);

// 알림 확인(PATCH) 실패 문구. 서버가 못 찾은 경우(404)는 목록이 오래됐다는 뜻이다.
export const describeConfirmError = errorType => {
  if (errorType === T.NOT_FOUND) {
    return '알림을 찾을 수 없어요. 목록을 새로고침해 주세요.';
  }
  return `확인 처리하지 못했어요. ${describeErrorType(errorType)}`;
};

// ── 뷰모델 ───────────────────────────────────────────────────

// API-28. 점수·등급·메시지는 서버 값 그대로. 거래 0건이면 참고용 안내만 덧붙인다(값은 바꾸지 않는다).
export const buildScoreViewModel = score => {
  const noAnalyzedTransactions = score.totalTx === 0;
  return {
    scoreText: `${score.safetyScore}점`,
    grade: score.grade,
    emoji: score.emoji,
    message: score.message,
    periodText: `최근 ${score.periodDays}일 기준`,
    rows: [
      { key: 'totalTx', label: FDS_LABELS.totalTx, value: `${score.totalTx}건` },
      { key: 'highCount', label: FDS_LABELS.highCount, value: `${score.highCount}건` },
      { key: 'mediumCount', label: FDS_LABELS.mediumCount, value: `${score.mediumCount}건` },
    ],
    noAnalyzedTransactions,
    referenceNotice: noAnalyzedTransactions ? NO_ANALYZED_NOTICE : null,
  };
};

// API-26 항목. 문구(message)·위험도·금액은 서버 값이다.
export const buildAlertViewModel = alert => ({
  key: alert.alertId,
  alertId: alert.alertId,
  riskLevel: alert.riskLevel,
  riskLabel: describeRiskLevel(alert.riskLevel),
  amountText: formatWonString(alert.amount),
  merchantText: alert.merchant === null || alert.merchant === '' ? null : alert.merchant,
  message: alert.message,
  createdText: formatServerDateTime(alert.createdAt),
  isConfirmed: alert.isConfirmed,
  confirmedText: alert.confirmedAt === null ? null : formatServerDateTime(alert.confirmedAt),
});

// API-25 항목. 서버는 가맹점·발생 시각을 로그에 담지 않는다.
export const buildLogViewModel = log => ({
  key: log.logId,
  riskLevel: log.riskLevel,
  riskLabel: describeRiskLevel(log.riskLevel),
  amountText: formatWonString(log.amount),
  createdText: formatServerDateTime(log.createdAt),
  isAlerted: log.isAlerted,
});

// ── 요청 실행 래퍼 ───────────────────────────────────────────

// 반환: { ok:true, value } | { ok:false, canceled:true } | { ok:false, errorType }
export const runFdsRequest = async fn => {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    const errorType = getFdsErrorType(error);
    if (errorType === T.CANCELED) return { ok: false, canceled: true };
    return { ok: false, errorType };
  }
};

// ── 세션 ─────────────────────────────────────────────────────

const S = FDS_STATUS;

const idleResource = () =>
  Object.freeze({
    status: S.IDLE,
    scope: null,
    viewModel: null,
    errorType: null,
    retryable: false,
  });

const idleAlerts = () =>
  Object.freeze({
    status: S.IDLE,
    scope: null,
    items: Object.freeze([]),
    total: 0,
    unread: 0,
    returned: 0,
    errorType: null,
    retryable: false,
  });

const idleLogs = () =>
  Object.freeze({
    status: S.IDLE,
    scope: null,
    items: Object.freeze([]),
    errorType: null,
    retryable: false,
  });

const RESOURCE_KEYS = ['score', 'alerts', 'logs'];

const failureOf = errorType => ({
  status: S.ERROR,
  errorType,
  retryable: canRetryFdsError(errorType),
});

// 화면이 ref로 들고 있는 React 비의존 스토어(getSnapshot/subscribe). 모듈 전역 상태·저장소·타이머 사용 없음.
export const createFdsSession = ({
  fetchSafetyScore,
  fetchFdsAlerts,
  fetchFdsLogs,
  confirmFdsAlert,
} = {}) => {
  if (
    [fetchSafetyScore, fetchFdsAlerts, fetchFdsLogs, confirmFdsAlert].some(
      fn => typeof fn !== 'function'
    )
  ) {
    throw new TypeError('API-25~28 함수 4개가 모두 필요합니다.');
  }

  const gates = Object.fromEntries(RESOURCE_KEYS.map(key => [key, createRequestGate()]));
  const listeners = new Set();
  const inFlight = { score: null, alerts: null, logs: null }; // { scope, promise }

  let userId = null;
  let disposed = false;
  let epoch = 0; // 사용자 변경/dispose마다 증가 — 진행 중이던 확인(PATCH) 응답을 폐기하는 데 쓴다
  let activeTab = FDS_TAB.ALERTS;
  let unreadOnly = false;
  let score = idleResource();
  let alerts = idleAlerts();
  let logs = idleLogs();
  const confirming = new Set(); // 확인 요청 진행 중인 알림 id
  let confirmErrors = {}; // alertId → errorType (직전 확인 실패)
  let snapshot = null;

  const isUserValid = () => isValidOnboardingUserId(userId);

  const matchingCount = () => (unreadOnly ? alerts.unread : alerts.total);

  const build = () =>
    Object.freeze({
      userId,
      activeTab,
      unreadOnly,
      score,
      alerts: Object.freeze({
        ...alerts,
        items: Object.freeze(
          alerts.items.map(item =>
            Object.freeze({
              ...item,
              confirming: confirming.has(item.alertId),
              canConfirm: !disposed && !item.isConfirmed && !confirming.has(item.alertId),
              confirmErrorMessage: Object.prototype.hasOwnProperty.call(confirmErrors, item.alertId)
                ? describeConfirmError(confirmErrors[item.alertId])
                : null,
            })
          )
        ),
        // 서버 집계가 반환 개수보다 크면 일부만 보여주는 중이다(서버는 offset을 지원하지 않는다).
        isTruncated: alerts.status === S.READY && matchingCount() > alerts.returned,
      }),
      logs: Object.freeze({
        ...logs,
        isTruncated: logs.status === S.READY && logs.items.length >= LOGS_LIMIT,
      }),
    });

  const commit = () => {
    if (disposed) return;
    snapshot = build();
    [...listeners].forEach(listener => listener());
  };

  const getSnapshot = () => snapshot;

  const subscribe = listener => {
    if (disposed) return () => {};
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const invalidateRequests = () => {
    epoch += 1;
    RESOURCE_KEYS.forEach(key => {
      gates[key].invalidate();
      inFlight[key] = null;
    });
    confirming.clear();
  };

  // 한 자원을 GET으로 불러온다.
  // - 같은 scope 요청이 진행 중이면 그 요청을 이어받는다(force가 아니면). 이미 시도한 scope는 다시 요청하지 않는다.
  // - 오류 뒤 재요청은 force(retry)로만 한다. 구간 전환·재진입으로는 자동 재시도하지 않는다.
  const loadResource = (key, scope, fetchFn, applyOk, getCurrent, setCurrent, makeIdle, force) => {
    if (disposed || !isUserValid()) return Promise.resolve();

    const current = getCurrent();
    if (!force) {
      if (inFlight[key] && inFlight[key].scope === scope) return inFlight[key].promise;
      if (current.scope === scope && current.status !== S.IDLE) return Promise.resolve();
    }

    const token = gates[key].begin(scope);
    setCurrent({ ...makeIdle(), status: S.LOADING, scope });
    commit();

    const entry = { scope };
    entry.promise = (async () => {
      const result = await runFdsRequest(fetchFn);
      if (inFlight[key] === entry) inFlight[key] = null;
      if (disposed || !gates[key].isCurrent(token)) return; // 사용자 변경·dispose·재요청 뒤의 늦은 응답

      if (result.ok) {
        try {
          setCurrent({ ...makeIdle(), ...applyOk(result.value), scope });
        } catch {
          // API 모듈이 검증한 응답이므로 변환 실패는 응답 해석 오류로 본다.
          setCurrent({ ...makeIdle(), ...failureOf(T.INVALID_RESPONSE), scope });
        }
      } else if (result.canceled) {
        setCurrent(makeIdle());
      } else {
        setCurrent({ ...makeIdle(), ...failureOf(result.errorType), scope });
      }
      commit();
    })();
    inFlight[key] = entry;
    return entry.promise;
  };

  const loadScore = (force = false) =>
    loadResource(
      'score',
      'score',
      () => fetchSafetyScore(userId),
      value => ({ status: S.READY, viewModel: Object.freeze(buildScoreViewModel(value)) }),
      () => score,
      next => {
        score = Object.freeze(next);
      },
      idleResource,
      force
    );

  const loadAlerts = (force = false) =>
    loadResource(
      'alerts',
      unreadOnly ? 'unread' : 'all',
      () => fetchFdsAlerts(userId, { limit: ALERTS_LIMIT, unread: unreadOnly }),
      value => ({
        status: S.READY,
        items: Object.freeze(value.alerts.map(buildAlertViewModel)),
        total: value.total,
        unread: value.unread,
        returned: value.returned,
      }),
      () => alerts,
      next => {
        alerts = Object.freeze(next);
        confirmErrors = {};
      },
      idleAlerts,
      force
    );

  const loadLogs = (force = false) =>
    loadResource(
      'logs',
      'logs',
      () => fetchFdsLogs(userId, { limit: LOGS_LIMIT }),
      value => ({ status: S.READY, items: Object.freeze(value.map(buildLogViewModel)) }),
      () => logs,
      next => {
        logs = Object.freeze(next);
      },
      idleLogs,
      force
    );

  // 현재 구간에 필요한 GET만 요청한다. 이미 불러온 구간은 다시 요청하지 않는다.
  const loadActiveTab = () => {
    if (disposed || !isUserValid()) return Promise.resolve();
    return activeTab === FDS_TAB.LOGS ? loadLogs() : Promise.all([loadScore(), loadAlerts()]);
  };

  const resetAll = nextUserId => {
    invalidateRequests();
    userId = nextUserId;
    activeTab = FDS_TAB.ALERTS;
    unreadOnly = false;
    score = idleResource();
    alerts = idleAlerts();
    logs = idleLogs();
    confirmErrors = {};
  };

  snapshot = build();

  // 사용자가 바뀌면 이전 사용자의 목록·점수·진행 중 요청을 모두 버린다. 같은 사용자면 아무것도 하지 않는다.
  // 유효한 사용자면 첫 구간(알림)의 GET만 요청한다. PATCH는 요청하지 않는다.
  const setUser = nextUserId => {
    if (disposed || nextUserId === userId) return Promise.resolve();
    resetAll(nextUserId);
    commit();
    return loadActiveTab();
  };

  const selectTab = tab => {
    if (disposed || !Object.values(FDS_TAB).includes(tab) || tab === activeTab) {
      return Promise.resolve();
    }
    activeTab = tab;
    commit();
    return loadActiveTab();
  };

  // '확인하지 않은 알림만 보기' 전환: 이전 필터의 요청·목록을 버리고 새 필터의 첫 목록을 요청한다(GET).
  const setUnreadOnly = value => {
    if (disposed || typeof value !== 'boolean' || value === unreadOnly) return Promise.resolve();
    unreadOnly = value;
    gates.alerts.invalidate();
    inFlight.alerts = null;
    alerts = idleAlerts();
    confirmErrors = {};
    commit();
    return loadAlerts();
  };

  // 사용자가 직접 다시 요청한다. 재시도 가능한 오류에서만 의미가 있다.
  const retry = key => {
    switch (key) {
      case 'score':
        return loadScore(true);
      case 'alerts':
        return loadAlerts(true);
      case 'logs':
        return loadLogs(true);
      default:
        return Promise.resolve();
    }
  };

  // 알림 목록·점수를 서버에서 다시 읽는다(GET만). 화면의 '새로고침' 버튼에서 쓴다.
  const refreshAlerts = () => Promise.all([loadScore(true), loadAlerts(true)]);

  const rejected = (reason, extra = {}) => Promise.resolve({ started: false, reason, ...extra });

  // API-27. '확인' 버튼 탭에서만 호출한다. 같은 알림의 동시 PATCH는 차단하고 자동 재시도는 없다.
  // 성공하면 서버 응답(is_confirmed, confirmed_at)으로만 해당 알림을 확인됨으로 바꾸고, 미확인 집계는 그만큼만 줄인다.
  const confirmAlert = alertId => {
    if (disposed) return rejected(CONFIRM_REJECT.DISPOSED);
    if (!isUserValid()) return rejected(CONFIRM_REJECT.NO_USER);

    const target = alerts.items.find(item => item.alertId === alertId);
    if (!target) return rejected(CONFIRM_REJECT.UNKNOWN_ALERT);
    if (target.isConfirmed) return rejected(CONFIRM_REJECT.ALREADY_CONFIRMED);
    if (confirming.has(alertId)) return rejected(CONFIRM_REJECT.IN_FLIGHT);

    const startEpoch = epoch;
    const targetUserId = userId;
    confirming.add(alertId);
    delete confirmErrors[alertId];
    commit();

    return (async () => {
      const result = await runFdsRequest(() => confirmFdsAlert(targetUserId, alertId));
      // 사용자 변경·dispose 뒤의 응답은 화면에 반영하지 않는다(서버 처리는 되돌릴 수 없다).
      if (disposed || epoch !== startEpoch) return { started: true, discarded: true };
      confirming.delete(alertId);

      if (result.ok) {
        const wasUnconfirmed = alerts.items.some(
          item => item.alertId === alertId && !item.isConfirmed
        );
        alerts = Object.freeze({
          ...alerts,
          items: Object.freeze(
            alerts.items.map(item =>
              item.alertId === alertId
                ? Object.freeze({
                    ...item,
                    isConfirmed: true,
                    confirmedText: formatServerDateTime(result.value.confirmedAt),
                  })
                : item
            )
          ),
          unread: wasUnconfirmed ? Math.max(0, alerts.unread - 1) : alerts.unread,
        });
        commit();
        return { started: true, confirmed: true };
      }

      if (result.canceled) {
        commit();
        return { started: true, canceled: true };
      }

      confirmErrors = { ...confirmErrors, [alertId]: result.errorType };
      commit();
      return { started: true, confirmed: false, errorType: result.errorType };
    })();
  };

  // 화면을 떠날 때 호출한다. 이후 도착하는 응답은 상태를 바꾸지 않는다.
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    invalidateRequests();
    listeners.clear();
  };

  return {
    getSnapshot,
    subscribe,
    setUser,
    selectTab,
    setUnreadOnly,
    retry,
    refreshAlerts,
    confirmAlert,
    dispose,
  };
};
