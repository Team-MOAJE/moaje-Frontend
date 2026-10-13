// OnboardingGateBoundary / WorkOnboardingRouteScreens가 쓰는 동작 로직. JSX와 React에 의존하지 않는 순수 모듈이라
// Node 모의 테스트로 검증한다. 실제 navigation/Alert/BackHandler/logout은 모두 호출부가 주입한다.
// 기능 플래그(WORK_ONBOARDING_ENABLED)가 false인 동안에는 실행되지 않는다.
import { runGuardedLogout } from '../features/auth/guardedLogout';
import { GATE_STATUS } from '../features/onboarding/useOnboardingGate';
import {
  LOCAL_RESULT_NOTICE,
  ROOT_BACK_ACTION,
  buildOpenResultAction,
  buildRetakeAction,
  buildStartOnboardingAction,
  canRetry,
  createCompletionDispatcher,
  createNavigationHandlers,
  getGateErrorActions,
  nextRetryRequested,
  resolveGateView,
  resolveRootBackAction,
} from '../features/onboarding/workOnboardingNavigation';

// ── Gate 경계 ────────────────────────────────────────────────

// Gate 스냅샷 + 부모 상태 → 경계가 그릴 화면.
// - retryState: { userId, requested } / lastError: { userId, type } — 사용자 키를 함께 보관해서
//   사용자가 바뀌면 이전 사용자의 재시도 상태/오류 종류를 쓰지 않는다.
// - 재시도 해제는 여기서 계산한다(effect 지연으로 한 프레임 동안 잘못 표시되는 것을 방지).
export const deriveBoundaryState = ({ gate, retryState, lastError, userId } = {}) => {
  const status = gate?.status;
  const requestedForUser =
    retryState && retryState.userId === userId ? Boolean(retryState.requested) : false;
  const retryRequested = nextRetryRequested(requestedForUser, status);

  let lastErrorType = lastError && lastError.userId === userId ? lastError.type : undefined;
  if (status === GATE_STATUS.ERROR && gate?.error?.type) lastErrorType = gate.error.type;

  const view = resolveGateView({ status, retryRequested, error: gate?.error, lastErrorType });
  return {
    ...view,
    retryRequested,
    lastErrorType,
    actions: view.view === 'error' ? getGateErrorActions() : [],
  };
};

// "다시 시도" 누르기. error 상태이고 재시도 중이 아닐 때만 Gate.retry()를 호출한다.
// requested는 retry()가 실제로 새 조회를 시작했을 때만 true(연타/checking 중 호출은 무시).
export const pressRetry = ({ status, isRetrying, retry }) => {
  if (!canRetry(status) || isRetrying) return { called: false, requested: false };
  const started = retry() === true;
  return { called: true, requested: started };
};

export const LOGOUT_CONFIRM = Object.freeze({
  title: '로그아웃',
  message: '로그아웃하고 다시 로그인할까요?\n다시 이용하려면 전화번호와 PIN이 필요해요.',
});

export const hasLogoutAction = onLogout => typeof onLogout === 'function';

// 경계 오류 화면의 로그아웃. 새 로그아웃 로직을 만들지 않고 기존 runGuardedLogout에 위임한다
// (중복 실행 방지, 완료/실패 후 busy 해제, 언마운트 후 setBusy 안 함). 실제 logout은 6-3에서 주입.
export const runBoundaryLogout = ({ onLogout, busyRef, mountedRef, setBusy }) => {
  if (!hasLogoutAction(onLogout)) return Promise.resolve(false);
  return runGuardedLogout({ busyRef, mountedRef, setBusy, logout: onLogout });
};

// ── 라우트 래퍼 ──────────────────────────────────────────────

export const resolveRouteMode = params => (params?.mode === 'retake' ? 'retake' : 'initial');

export const IOS_ROOT_BACK_NOTICE = Object.freeze({
  title: '온보딩 안내',
  message: '온보딩을 완료해야 앱을 이용할 수 있어요.',
});

const readCanGoBack = canGoBack => (typeof canGoBack === 'function' ? canGoBack() : canGoBack);

// 질문 화면 콜백. 호출할 때마다 독립된 완료 디스패처(1회 실행 상태)를 새로 만들므로, 사용자/모드가 바뀌어
// 콜백을 다시 만들면 이전 사용자의 "이미 완료 이동함" 상태가 새 사용자에게 이어지지 않는다.
// - onComplete: navigation.reset([HOME, WORK_RESULT])를 최대 1번
// - onCancel: 이전 화면이 있으면 goBack / Android 루트는 앱 종료 / iOS 루트는 종료·홈 우회 없이 안내만
export const createQuestionCallbacks = ({
  scope,
  dispatch,
  canGoBack,
  goBack,
  platform,
  exitApp,
  showNotice,
} = {}) => ({
  scope,
  onComplete: createCompletionDispatcher(dispatch),
  onCancel: () => {
    const action = resolveRootBackAction({ platform, canGoBack: readCanGoBack(canGoBack) });
    if (action === ROOT_BACK_ACTION.GO_BACK) goBack();
    else if (action === ROOT_BACK_ACTION.EXIT_APP) exitApp();
    else showNotice(IOS_ROOT_BACK_NOTICE);
    return action;
  },
});

// 결과 화면 콜백: 시작(mode initial) / 재검사(mode retake) / 홈(reset [HOME])
// onStart/onRetake는 서버 미완료 근거(gateEvidence)를 싣지 않는다. Stack.Screen initialParams와 params가
// 얕게 병합되어 이전 근거가 상속되지 않도록 gateEvidence를 undefined로 명시적으로 덮어쓴다.
// (결과 화면의 empty/not_completed만으로 API-34 미완료를 확정하지 않으므로 이 경로는 로컬 결과 안내를 하지 않는다.)
const withoutEvidence = action => ({
  ...action,
  payload: { ...action.payload, params: { ...action.payload.params, gateEvidence: undefined } },
});

export const createResultCallbacks = ({ scope, dispatch } = {}) => {
  const { onGoHome } = createNavigationHandlers(dispatch);
  return {
    scope,
    onStart: () => dispatch(withoutEvidence(buildStartOnboardingAction())),
    onRetake: () => dispatch(withoutEvidence(buildRetakeAction())),
    onGoHome,
  };
};

// 기능 플래그에 따른 재무 온보딩 진입 정책(CategoryScreen). 서버 상태를 추정하지 않고 결과 화면으로만 보낸다.
export const resolveFinancialOnboardingEntry = ({ flagEnabled } = {}) =>
  flagEnabled === true
    ? { kind: 'server_result', action: buildOpenResultAction() }
    : { kind: 'legacy_local' };

// 로컬 결과 안내 Hook 설정. Hook은 항상 호출하고 enabled로만 켜고 끈다(호출 순서 고정).
// 활성 조건: 기능 플래그 true + mode initial + Gate가 API-34 미완료를 확인한 최초 진입의 근거(evidenceAvailable).
// 근거가 없는 진입(결과 화면 onStart, retake, 직접 navigate, 이미 소비된 근거)은 비활성 → 안내하지 않는다.
// 근거는 안내 표시 판단에만 쓰이며 온보딩 완료 여부는 API-34가 결정한다.
export const resolveNoticeSettings = ({ mode, flagEnabled, evidenceAvailable } = {}) => ({
  enabled: flagEnabled === true && mode === 'initial' && evidenceAvailable === true,
  serverStatus: GATE_STATUS.INCOMPLETE,
});

// ── 서버 미완료 근거 토큰 (로컬 결과 안내 판단 전용) ─────────
// 토큰은 "Gate가 API-34 incomplete를 확인한 최초 진입"에서만 쓸 수 있는 1회용 값이다.
// 전역 상태를 바꾸는 issue / revoke / consume 은 반드시 커밋 이후 useEffect 안에서만 호출한다
// (렌더, useMemo, useState 초기화에서는 isAvailable 읽기만 사용). 사용자당 활성 토큰은 항상 1개 이하이며,
// 소비된 토큰은 initialParams 병합으로 상속되어도 다시 쓸 수 없다.
const userIdOfToken = token => {
  if (typeof token !== 'string') return null;
  const index = token.lastIndexOf('|');
  return index > 0 ? token.slice(0, index) : null;
};

export const createEvidenceRegistry = () => {
  let counter = 0;
  const active = new Map(); // userId → 현재 활성 토큰
  const consumed = new Set();

  return {
    // 새 토큰을 발급하고 같은 사용자의 이전 활성 토큰을 즉시 무효화한다.
    issue: userId => {
      if (typeof userId !== 'string' || userId === '') return null;
      counter += 1;
      const token = `${userId}|${counter}`;
      active.set(userId, token);
      return token;
    },
    // 해당 토큰이 현재 활성일 때만 비활성화(이미 바뀌었으면 무시, 멱등).
    revoke: token => {
      const userId = userIdOfToken(token);
      if (userId !== null && active.get(userId) === token) active.delete(userId);
    },
    // 순수 읽기: 현재 사용자의 활성 토큰이고 소비되지 않았을 때만 true.
    isAvailable: (token, userId) =>
      typeof token === 'string' &&
      typeof userId === 'string' &&
      userIdOfToken(token) === userId &&
      active.get(userId) === token &&
      !consumed.has(token),
    // 소비 기록은 유지한다(멱등). 이후 같은 토큰은 사용할 수 없다.
    consume: token => {
      if (typeof token === 'string') consumed.add(token);
    },
  };
};

// 마운트 시 한 번 읽어 둔 근거({ userId, available })가 현재 사용자에게 유효한지(사용자가 바뀌면 무효).
export const isEvidenceUsable = (evidence, userId) =>
  evidence?.userId === userId && evidence?.available === true;

// 앱 실행 중 유지되는 모듈 단위 레지스트리(화면 재마운트로 초기화되지 않는다).
export const gateEvidenceRegistry = createEvidenceRegistry();

// 커밋 이후 useEffect에서 쓰는 수명주기 헬퍼: 발급 → onIssued → cleanup에서 revoke.
// StrictMode의 setup→cleanup→setup에서는 첫 토큰이 cleanup에서 무효화되고 마지막 토큰만 활성으로 남는다.
export const startGateEvidence = ({ registry, userId, onIssued } = {}) => {
  const token = registry.issue(userId);
  if (token === null) return () => {};
  onIssued?.(token);
  return () => registry.revoke(token);
};

// ── 로컬 결과 안내 표시 ──────────────────────────────────────

// 안내(Alert) 표시기. 표시한 사용자 기록은 이 인스턴스가 메모리로 보관한다.
// - shouldShow가 아니거나 notice가 없으면 표시 안 함
// - 이미 표시한 사용자(이 표시기 기록 또는 hasShown 콜백)는 다시 표시 안 함 → StrictMode의 effect 이중 실행에도 1회
// - isCurrent()가 false(사용자 변경/언마운트 후 도착한 오래된 결과)면 표시 안 함
// - markShown은 showAlert 호출이 성공한 뒤에만 호출(실제로 표시한 경우에만 기록)
export const createLocalNoticePresenter = () => {
  const presented = new Set();

  return {
    present: ({ shouldShow, notice, userId, hasShown, isCurrent, showAlert, markShown } = {}) => {
      if (!shouldShow || !notice) return false;
      if (presented.has(userId)) return false;
      if (typeof hasShown === 'function' && hasShown(userId)) return false;
      if (typeof isCurrent === 'function' && !isCurrent()) return false;

      try {
        showAlert(notice);
      } catch {
        return false; // 표시하지 못했으면 기록하지 않는다
      }

      presented.add(userId);
      markShown?.();
      return true;
    },
    reset: () => presented.clear(),
  };
};

// 앱 실행 중 유지되는 모듈 단위 표시기(화면 재마운트로 초기화되지 않고, 사용자별로 분리된다).
const localNoticePresenter = createLocalNoticePresenter();
export const presentLocalResultNotice = args => localNoticePresenter.present(args);

export { LOCAL_RESULT_NOTICE };
