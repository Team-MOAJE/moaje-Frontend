// 서버(Work API) 기반 신규 온보딩 화면을 Navigator 라우트로 쓰기 위한 래퍼. MainNavigator의 Work 경로(기능 플래그 true)에서만 등록된다.
// 라우트 이름은 workOnboardingNavigation.js의 WORK_ONBOARDING_ROUTES를 쓴다(6-3에서 routes.js와 일치시킨다).
// 4단계 화면 파일은 수정하지 않고 완료/취소/시작/재검사/홈 콜백만 바인딩한다.
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, BackHandler, Platform } from 'react-native';
import { useSelector } from 'react-redux';
import WorkFinancialOnboardingScreen from '../screens/onboarding/WorkFinancialOnboardingScreen';
import WorkFinancialOnboardingResultScreen from '../screens/onboarding/WorkFinancialOnboardingResultScreen';
import { useLocalOnboardingNotice } from '../features/onboarding/useLocalOnboardingNotice';
import { WORK_ONBOARDING_ENABLED } from '../features/onboarding/workOnboardingConfig';
import {
  createQuestionCallbacks,
  gateEvidenceRegistry,
  isEvidenceUsable,
  createResultCallbacks,
  presentLocalResultNotice,
  resolveNoticeSettings,
  resolveRouteMode,
} from './workOnboardingRouteLogic';

const showNotice = notice => Alert.alert(notice.title, notice.message);

// 질문 라우트. params: { mode: 'initial' | 'retake' }
export function WorkOnboardingQuestionRoute({ navigation, route }) {
  const userId = useSelector(state => state.auth.user?.userId);
  const mode = resolveRouteMode(route?.params);

  // 사용자/모드/내비게이션이 바뀌면 콜백(완료 1회 실행 상태 포함)을 새로 만든다.
  const callbacks = useMemo(
    () =>
      createQuestionCallbacks({
        scope: `${userId}:${mode}`,
        dispatch: action => navigation.dispatch(action),
        canGoBack: () => navigation.canGoBack(),
        goBack: () => navigation.goBack(),
        platform: Platform.OS,
        exitApp: () => BackHandler.exitApp(),
        showNotice,
      }),
    [navigation, mode, userId]
  );

  // 서버 미완료 근거(Gate가 API-34 incomplete를 확인한 최초 진입의 1회용 토큰)는 마운트 시 한 번만 "읽는다".
  // 렌더 중에는 읽기(isAvailable)만 하고, 소비(consume)는 아래 커밋 이후 effect에서 한다.
  // 토큰은 로컬 결과 안내 표시 판단에만 쓰이며 온보딩 완료 여부는 API-34가 결정한다.
  const evidenceToken = route?.params?.gateEvidence;
  const [evidence] = useState(() => ({
    userId,
    available: gateEvidenceRegistry.isAvailable(evidenceToken, userId),
  }));

  // 항상 소비한다(안내 표시 여부와 무관). 이후 initialParams 병합으로 상속돼도 다시 쓸 수 없다.
  useEffect(() => {
    gateEvidenceRegistry.consume(evidenceToken);
  }, [evidenceToken]);

  // Hook은 항상 같은 순서로 호출하고 enabled로만 제어한다(initial + 플래그 true + 근거가 있을 때만 활성).
  const { enabled, serverStatus } = resolveNoticeSettings({
    mode,
    flagEnabled: WORK_ONBOARDING_ENABLED,
    evidenceAvailable: isEvidenceUsable(evidence, userId),
  });
  const localNotice = useLocalOnboardingNotice({ userId, serverStatus, enabled });

  // 서버 미완료 + 기존 로컬 결과가 있는 사용자에게 앱 실행당 1회 안내한다(삭제·업로드·변환 없음).
  useEffect(() => {
    let active = true;
    presentLocalResultNotice({
      shouldShow: localNotice.shouldShow,
      notice: localNotice.notice,
      userId,
      isCurrent: () => active,
      showAlert: showNotice,
      markShown: localNotice.markShown,
    });
    return () => {
      active = false;
    };
  }, [localNotice.shouldShow, localNotice.notice, localNotice.markShown, userId]);

  return (
    <WorkFinancialOnboardingScreen
      key={`${userId}:${mode}`}
      mode={mode}
      userId={userId}
      onComplete={callbacks.onComplete}
      onCancel={callbacks.onCancel}
    />
  );
}

// 결과 라우트
export function WorkOnboardingResultRoute({ navigation }) {
  const userId = useSelector(state => state.auth.user?.userId);

  const callbacks = useMemo(
    () =>
      createResultCallbacks({
        scope: `${userId}`,
        dispatch: action => navigation.dispatch(action),
      }),
    [navigation, userId]
  );

  return (
    <WorkFinancialOnboardingResultScreen
      key={`${userId}`}
      userId={userId}
      onStart={callbacks.onStart}
      onRetake={callbacks.onRetake}
      onGoHome={callbacks.onGoHome}
    />
  );
}
