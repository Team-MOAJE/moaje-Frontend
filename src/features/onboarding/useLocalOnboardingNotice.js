// 서버 온보딩이 미완료인데 이 기기에 기존 로컬 온보딩 결과가 남아 있는지 읽기 전용으로 확인하고,
// 안내(Alert)를 보여줘야 하는지 판단하는 Hook. 안내 UI는 표시하지 않으며 아직 어디에도 연결되어 있지 않다.
//
// 기존 로컬 Repository는 loadResult()만 호출한다. 저장/삭제/Draft 접근/서버 업로드/변환은 하지 않는다.
import { useCallback, useEffect, useRef, useState } from 'react';
import { isValidOnboardingUserId } from './onboardingApi';
import { getOnboardingRepository } from './onboardingRepository';
import { createRequestGate } from './workOnboardingScreenLogic';
import { WORK_ONBOARDING_ENABLED } from './workOnboardingConfig';
import {
  LOCAL_RESULT_NOTICE,
  LOCAL_RESULT_STATE,
  createNoticeTracker,
  decideLocalResultNotice,
  isNoticeServerStatus,
} from './workOnboardingNavigation';

// 기존 로컬 결과 존재 여부: 'exists' | 'none' | 'unknown'
// - 잘못된 userId('guest' 폴백 사용 안 함)는 저장소에 접근하지 않고 unknown
// - 조회 실패는 unknown (안내하지 않음, 오류를 던지지 않음)
export const readLocalResultState = async (
  userId,
  { repositoryFactory = getOnboardingRepository } = {}
) => {
  if (!isValidOnboardingUserId(userId)) return LOCAL_RESULT_STATE.UNKNOWN;

  try {
    const result = await repositoryFactory(userId).loadResult();
    return result ? LOCAL_RESULT_STATE.EXISTS : LOCAL_RESULT_STATE.NONE;
  } catch {
    return LOCAL_RESULT_STATE.UNKNOWN;
  }
};

// 모듈 단위 기본 트래커: 앱 실행 중 사용자별 1회(메모리 전용)
const defaultTracker = createNoticeTracker();

// serverStatus: Gate 'incomplete' 또는 결과 화면의 'empty' / 'not_completed' 등 호출부가 넘기는 서버 상태.
// enabled 기본값은 기능 플래그(WORK_ONBOARDING_ENABLED, 현재 false). false이면 저장소를 읽지 않는다.
// 반환: { shouldShow, notice, markShown }
export function useLocalOnboardingNotice({
  userId,
  serverStatus,
  enabled = WORK_ONBOARDING_ENABLED,
  tracker = defaultTracker,
} = {}) {
  const [localResult, setLocalResult] = useState(null); // { scope, state }
  const [, setShownVersion] = useState(0);
  const gateRef = useRef(null);
  if (gateRef.current === null) gateRef.current = createRequestGate();
  const gate = gateRef.current;

  const scope = `${userId}`;
  const shouldRead = Boolean(enabled) && isNoticeServerStatus(serverStatus);

  // 사용자 변경/언마운트 시 오래된 읽기 결과는 무시한다.
  useEffect(() => {
    if (!shouldRead) return undefined;
    const token = gate.begin(scope);
    readLocalResultState(userId).then(state => {
      if (gate.isCurrent(token)) setLocalResult({ scope, state });
    });
    return () => gate.invalidate();
  }, [gate, shouldRead, scope, userId]);

  const current = localResult?.scope === scope ? localResult.state : LOCAL_RESULT_STATE.UNKNOWN;
  const decision = shouldRead
    ? decideLocalResultNotice({
        serverStatus,
        localResult: current,
        alreadyShown: tracker.hasShown(userId),
      })
    : { show: false, reason: 'DISABLED_OR_STATUS' };

  // 표시 여부를 기록한다(메모리 전용). 안내 표시 자체는 호출부(6-2)가 한다.
  const markShown = useCallback(() => {
    tracker.markShown(userId);
    setShownVersion(version => version + 1);
  }, [tracker, userId]);

  return {
    shouldShow: decision.show,
    notice: decision.show ? LOCAL_RESULT_NOTICE : null,
    markShown,
  };
}
