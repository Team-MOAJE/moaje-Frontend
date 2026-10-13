// 서버(Work API-34) 기반 재무 온보딩 완료 판단 Gate. 아직 MainNavigator 등 앱 흐름에 연결되어 있지 않다(6단계).
//
// 완료 판단의 기준은 Work API-34의 is_completed 하나뿐이다.
// - Auth의 onboardingCompleted, 로컬 AsyncStorage(기존 온보딩 결과/Draft)는 읽지 않는다.
// - 서버 조회 실패/검증 실패는 항상 error다. 네트워크·타임아웃·401·403·4xx·5xx·잘못된 응답을
//   complete/incomplete로 대체하지 않는다. 자동 재시도도 하지 않는다(retry()는 사용자 동작으로만 호출).
// - 401은 apiClient의 토큰 갱신/세션 만료 처리를 그대로 두고, 이 Gate는 error(UNAUTHORIZED)로만 노출한다.
//
// 구성: createOnboardingGate()(React 비의존 컨트롤러) + useOnboardingGate()(useSyncExternalStore Hook)
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { getOnboardingErrorType, isValidOnboardingUserId } from './onboardingApi';
import { getWorkOnboardingRepository } from './adapters/workOnboardingRepository';
import { createRequestGate } from './workOnboardingScreenLogic';

export const GATE_STATUS = {
  CHECKING: 'checking',
  COMPLETE: 'complete',
  INCOMPLETE: 'incomplete',
  ERROR: 'error',
};

// getOnboardingErrorType 값 외에 Gate가 직접 만드는 오류 종류(잘못된 userId / repository 없음).
export const GATE_ERROR_INVALID_USER = 'INVALID_USER';

// 응답이 boolean이 아니면 판단하지 않는다(Repository가 이미 검증하지만 Gate도 방어한다).
const GATE_ERROR_INVALID_RESPONSE = 'INVALID_RESPONSE';

const createSnapshot = (userId, status, errorType) =>
  Object.freeze({
    status,
    error: errorType ? Object.freeze({ type: errorType }) : null,
    isChecking: status === GATE_STATUS.CHECKING,
    userId: userId ?? null,
  });

// 컨트롤러. 생성만으로는 요청이 발생하지 않으며(start() 호출 시 시작), 생성 직후 상태는 checking이다.
//
// 수명주기 (재시작 가능)
// - start(): 시작되지 않았거나 dispose된 상태에서 호출하면 서버 상태를 (다시) 조회한다. 이미 시작된 상태면 무시.
// - dispose(): 진행 중 요청을 무효화하고 시작 전 상태로 돌린다. 영구 비활성 플래그가 없어서
//   StrictMode의 effect 재실행(start → dispose → start)이나 Fast Refresh 뒤에도 start()로 정상 재시작된다.
export function createOnboardingGate({ userId, repository } = {}) {
  const listeners = new Set();
  const requestGate = createRequestGate();
  const validUser = isValidOnboardingUserId(userId) && Boolean(repository);

  let snapshot = createSnapshot(userId, GATE_STATUS.CHECKING, null);
  let started = false;
  let inFlight = false;
  let run = 0;

  // 내용이 바뀔 때만 새 스냅샷을 만들어 알린다(getSnapshot 참조 안정).
  const setState = (status, errorType = null) => {
    if (snapshot.status === status && (snapshot.error?.type ?? null) === errorType) return;
    snapshot = createSnapshot(userId, status, errorType);
    listeners.forEach(listener => listener());
  };

  const check = async () => {
    if (!validUser) {
      inFlight = false;
      setState(GATE_STATUS.ERROR, GATE_ERROR_INVALID_USER); // 서버 요청 없음
      return;
    }

    run += 1;
    const token = requestGate.begin(`${userId}:${run}`);
    inFlight = true;
    setState(GATE_STATUS.CHECKING);

    let progress;
    try {
      progress = await repository.loadProgress();
    } catch (error) {
      if (!requestGate.isCurrent(token)) return; // 재시도/dispose/사용자 변경 후 도착한 오래된 응답
      inFlight = false;
      setState(GATE_STATUS.ERROR, getOnboardingErrorType(error));
      return;
    }
    if (!requestGate.isCurrent(token)) return;

    inFlight = false;
    if (progress?.isCompleted === true) setState(GATE_STATUS.COMPLETE);
    else if (progress?.isCompleted === false) setState(GATE_STATUS.INCOMPLETE);
    else setState(GATE_STATUS.ERROR, GATE_ERROR_INVALID_RESPONSE);
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    start: () => {
      if (started) return false; // 중복 요청 방지
      started = true;
      check();
      return true;
    },

    dispose: () => {
      started = false;
      inFlight = false;
      requestGate.invalidate();
    },

    // 사용자 동작으로 호출하는 수동 재시도. error 상태이고 진행 중 요청이 없을 때만 새로 조회한다.
    retry: () => {
      if (!started || inFlight || snapshot.status !== GATE_STATUS.ERROR) return false;
      check();
      return true;
    },
  };
}

const tryGetRepository = userId => {
  try {
    return getWorkOnboardingRepository(userId);
  } catch {
    return null; // 유효하지 않은 user_id → 컨트롤러가 INVALID_USER error로 처리
  }
};

// Hook: { status, error, isChecking, retry }
// userId(또는 repository)가 바뀌면 새 컨트롤러를 만들어 이전 사용자 상태를 재사용하지 않고 checking부터 시작한다.
// 이전 컨트롤러는 effect cleanup(dispose)에서 요청이 무효화되어 이전 사용자의 응답이 반영되지 않는다.
export function useOnboardingGate({ userId, repository } = {}) {
  const ref = useRef(null);

  if (
    ref.current === null ||
    ref.current.userId !== userId ||
    ref.current.repository !== repository
  ) {
    ref.current = {
      userId,
      repository,
      // 생성자는 부작용과 요청이 없으므로 렌더 중 생성해도 안전하다.
      controller: createOnboardingGate({
        userId,
        repository: repository ?? tryGetRepository(userId),
      }),
    };
  }
  const { controller } = ref.current;

  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);

  useEffect(() => {
    controller.start();
    return () => controller.dispose();
  }, [controller]);

  return {
    status: snapshot.status,
    error: snapshot.error,
    isChecking: snapshot.isChecking,
    retry: controller.retry,
  };
}
