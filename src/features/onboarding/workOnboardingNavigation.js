// 서버 온보딩 앱 연결(6단계)에서 쓰는 화면 이동 판단 로직. React / React Navigation / react-native에
// 의존하지 않는 순수 모듈이다. 실제 navigate/reset은 실행하지 않고, 판단 결과나 Navigation Action 객체만
// 반환한다(실행은 후속 단계의 화면/경계 컴포넌트가 dispatch로 한다). 아직 어떤 앱 코드에도 연결되어 있지 않다.
import { ROUTES } from '../../constants/routes';
import { GATE_STATUS } from './useOnboardingGate';

// 신규 서버 온보딩 라우트 이름. routes.js는 6-1에서 수정할 수 없어 이 모듈에 임시로 정의한다
// (6-3에서 routes.js로 옮기며 값은 그대로 유지). 기존 ROUTES 값과 겹치지 않아야 한다.
export const WORK_ONBOARDING_ROUTES = Object.freeze({
  ONBOARDING: 'WorkFinancialOnboarding',
  RESULT: 'WorkFinancialOnboardingResult',
});

// ── Gate 상태 → 화면 결정 ────────────────────────────────────

export const GATE_VIEW = Object.freeze({
  SPLASH: 'splash',
  ERROR: 'error',
  HOME: 'home',
  ONBOARDING: 'onboarding',
});

// 오류 화면에서 제공하는 동작. 홈으로 우회하는 동작은 없다(서버 상태를 확인하기 전에는 진행 불가).
export const GATE_ERROR_ACTIONS = Object.freeze(['retry', 'logout']);
export const getGateErrorActions = () => [...GATE_ERROR_ACTIONS];

const UNKNOWN_ERROR_TYPE = 'UNKNOWN';

// 재시도는 error 상태에서만 가능하다.
export const canRetry = status => status === GATE_STATUS.ERROR;

// 부모 경계가 들고 있는 "재시도 눌렀음" 상태의 갱신 규칙.
// 재시도 중(checking)에는 유지하고, 결과가 나오면(complete/incomplete/error) 해제한다.
export const nextRetryRequested = (prev, status) =>
  status === GATE_STATUS.CHECKING ? Boolean(prev) : false;

// Gate 스냅샷(+ 부모의 재시도 상태) → 어떤 화면을 그릴지.
// - checking(재시도 아님): 스플래시
// - checking + retryRequested: 오류 화면을 유지하고 버튼에 로딩 표시(isRetrying). 직전 오류 종류를 유지한다.
// - error: 오류 화면(재시도/로그아웃). 홈으로 우회하지 않는다.
// - complete: 홈 / incomplete: 신규 온보딩(mode: initial)
// - 알 수 없는 status: 오류 화면(홈으로 흘러가지 않음)
export const resolveGateView = ({ status, retryRequested = false, error, lastErrorType } = {}) => {
  switch (status) {
    case GATE_STATUS.CHECKING:
      if (retryRequested) {
        return {
          view: GATE_VIEW.ERROR,
          isRetrying: true,
          errorType: lastErrorType ?? error?.type ?? UNKNOWN_ERROR_TYPE,
        };
      }
      return { view: GATE_VIEW.SPLASH, isRetrying: false };

    case GATE_STATUS.ERROR:
      return {
        view: GATE_VIEW.ERROR,
        isRetrying: false,
        errorType: error?.type ?? UNKNOWN_ERROR_TYPE,
      };

    case GATE_STATUS.COMPLETE:
      return { view: GATE_VIEW.HOME, isRetrying: false, initialRouteName: ROUTES.HOME };

    case GATE_STATUS.INCOMPLETE:
      return {
        view: GATE_VIEW.ONBOARDING,
        isRetrying: false,
        initialRouteName: WORK_ONBOARDING_ROUTES.ONBOARDING,
        initialParams: { mode: 'initial' },
      };

    default:
      return { view: GATE_VIEW.ERROR, isRetrying: false, errorType: UNKNOWN_ERROR_TYPE };
  }
};

// ── Navigation Action (객체만 만들고 실행하지 않음) ───────────
// React Navigation의 CommonActions.navigate / CommonActions.reset과 같은 형태: navigation.dispatch(action)

const navigateAction = (name, params) => ({
  type: 'NAVIGATE',
  payload: params === undefined ? { name } : { name, params },
});

const resetAction = routeNames => ({
  type: 'RESET',
  payload: {
    index: routeNames.length - 1,
    routes: routeNames.map(name => ({ name })),
  },
});

export const buildStartOnboardingAction = () =>
  navigateAction(WORK_ONBOARDING_ROUTES.ONBOARDING, { mode: 'initial' });

export const buildRetakeAction = () =>
  navigateAction(WORK_ONBOARDING_ROUTES.ONBOARDING, { mode: 'retake' });

export const buildOpenResultAction = () => navigateAction(WORK_ONBOARDING_ROUTES.RESULT);

// 제출 완료 후: 스택을 [HOME, RESULT]로 교체한다. 질문 화면(및 incomplete 시작 화면)이 스택에서 사라져
// 뒤로가기로 되돌아갈 수 없고, 결과에서 뒤로 가면 홈이다.
export const buildCompletionResetAction = () =>
  resetAction([ROUTES.HOME, WORK_ONBOARDING_ROUTES.RESULT]);

export const buildGoHomeResetAction = () => resetAction([ROUTES.HOME]);

// 이동 어댑터: dispatch(action)를 주입받아 동작별 콜백을 만든다. 이동 판단은 위 순수 함수가 하고
// 여기서는 호출만 한다. 완료 이동(onComplete)은 몇 번 호출돼도 dispatch를 한 번만 실행한다.
export const createCompletionDispatcher = dispatch => {
  let dispatched = false;
  return () => {
    if (dispatched) return false;
    dispatched = true;
    dispatch(buildCompletionResetAction());
    return true;
  };
};

export const createNavigationHandlers = dispatch => ({
  onStart: () => dispatch(buildStartOnboardingAction()),
  onRetake: () => dispatch(buildRetakeAction()),
  onGoHome: () => dispatch(buildGoHomeResetAction()),
  onComplete: createCompletionDispatcher(dispatch),
});

// ── 뒤로가기 / 라우트 옵션 ───────────────────────────────────

export const ROOT_BACK_ACTION = Object.freeze({
  GO_BACK: 'GO_BACK',
  EXIT_APP: 'EXIT_APP',
  NONE: 'NONE',
});

// 질문 화면이 취소/뒤로가기를 요청했을 때의 정책.
// - 되돌아갈 화면이 있으면 뒤로
// - 루트(최초 온보딩이 첫 화면)인 Android는 기존 앱과 같이 종료
// - iOS 등: 강제 종료를 시도하지 않는다(최종 iOS 동작은 6-2 연결 설계에서 결정)
// 제출 중 뒤로가기 차단은 4단계 질문 화면이 담당한다.
export const resolveRootBackAction = ({ platform, canGoBack } = {}) => {
  if (canGoBack) return ROOT_BACK_ACTION.GO_BACK;
  if (platform === 'android') return ROOT_BACK_ACTION.EXIT_APP;
  return ROOT_BACK_ACTION.NONE;
};

// 질문 라우트: iOS 스와이프 뒤로가기 비활성(질문 간 이동은 화면의 이전 버튼 사용)
export const getQuestionRouteOptions = () => ({ headerShown: false, gestureEnabled: false });
export const getResultRouteOptions = () => ({ headerShown: false });

// ── Home 머니 타입 영역 정책 ─────────────────────────────────

export const HOME_FUTURE_PROFILE_GUIDE = Object.freeze({
  title: 'Future Profile',
  message: '서버에 저장된 Future Profile은 결과 화면에서 확인할 수 있어요.',
  ctaLabel: '결과 보기',
});

// 플래그 off: 기존 Home 동작(로컬 머니 타입) 유지.
// 플래그 on : 로컬 계산 결과는 어떤 경우에도 보여주지 않고(서버 결과와 충돌), 결과 화면으로 안내하는 중립 문구만 쓴다.
export const resolveHomeMoneyTypeView = ({ flagEnabled } = {}) =>
  flagEnabled === true
    ? {
        kind: 'server_guide',
        title: HOME_FUTURE_PROFILE_GUIDE.title,
        message: HOME_FUTURE_PROFILE_GUIDE.message,
        ctaLabel: HOME_FUTURE_PROFILE_GUIDE.ctaLabel,
        action: buildOpenResultAction(),
      }
    : { kind: 'legacy_local' };

// ── 기존 로컬 결과 안내 판단 ─────────────────────────────────

export const LOCAL_RESULT_STATE = Object.freeze({
  EXISTS: 'exists',
  NONE: 'none',
  UNKNOWN: 'unknown',
});

// 서버 기준으로 아직 완료되지 않은 상태들. Gate의 incomplete, 결과 화면의 empty / not_completed.
const NOTICE_SERVER_STATUSES = new Set([GATE_STATUS.INCOMPLETE, 'empty', 'not_completed']);

export const LOCAL_RESULT_NOTICE = Object.freeze({
  title: '이전 온보딩 결과 안내',
  message:
    '이 기기에 저장된 이전 온보딩 결과는 서버에 저장되어 있지 않아요. 서버에 저장하려면 새로 답변해야 해요. 이전 결과는 이 기기에 그대로 남아 있어요.',
});

// 안내(Alert)를 보여줄지 판단한다(표시는 하지 않는다).
// 서버가 미완료(incomplete/empty/not_completed)이고, 로컬 결과가 확실히 있고, 아직 보여주지 않았을 때만 true.
// 서버 완료·오류·확인 중, 로컬 결과 없음/확인 실패는 모두 안내하지 않는다.
export const decideLocalResultNotice = ({ serverStatus, localResult, alreadyShown } = {}) => {
  if (!NOTICE_SERVER_STATUSES.has(serverStatus)) return { show: false, reason: 'SERVER_STATUS' };
  if (localResult !== LOCAL_RESULT_STATE.EXISTS) return { show: false, reason: 'NO_LOCAL_RESULT' };
  if (alreadyShown) return { show: false, reason: 'ALREADY_SHOWN' };
  return { show: true, reason: 'LOCAL_RESULT_NOT_ON_SERVER' };
};

export const isNoticeServerStatus = serverStatus => NOTICE_SERVER_STATUSES.has(serverStatus);

// 앱 실행 중 사용자별 1회 표시를 기억하는 메모리 전용 트래커(AsyncStorage에 쓰지 않는다).
export const createNoticeTracker = () => {
  const shown = new Set();
  return {
    hasShown: userId => shown.has(userId),
    markShown: userId => {
      shown.add(userId);
    },
  };
};
