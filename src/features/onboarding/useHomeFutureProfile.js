// 홈 머니 타입 탭의 서버 Future Profile(API-35) 조회 Hook.
// enabled(서버 온보딩 사용 + 탭이 열림)일 때 현재 사용자의 결과가 없으면 1회 요청한다. 실패 후 자동 재시도는 없고
// retry()를 부르면(사용자 동작) 다시 요청한다. 결과에는 조회한 userId를 함께 저장해 다른 사용자의 결과를 쓰지 않는다.
import { useCallback, useEffect, useRef, useState } from 'react';
import { getWorkOnboardingRepository } from './adapters/workOnboardingRepository';
import { loadHomeFutureProfile, shouldLoadHomeFutureProfile } from './homeMoneyTypeLogic';

export default function useHomeFutureProfile({ enabled, userId }) {
  const [profileState, setProfileState] = useState(null);
  const inFlightUserIdRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;
    if (
      !shouldLoadHomeFutureProfile({
        userId,
        profileState,
        loading: inFlightUserIdRef.current === userId,
      })
    ) {
      return;
    }
    let repository = null;
    try {
      repository = getWorkOnboardingRepository(userId);
    } catch (e) {
      return;
    }
    inFlightUserIdRef.current = userId;
    loadHomeFutureProfile(repository).then(result => {
      if (inFlightUserIdRef.current === userId) inFlightUserIdRef.current = null;
      setProfileState({ userId, ...result });
    });
  }, [enabled, userId, profileState]);

  const retry = useCallback(() => setProfileState(null), []);
  return { profileState, retry };
}
