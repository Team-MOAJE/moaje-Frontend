// 서버 온보딩 완료 판단(Work API-34) Gate의 경계 컴포넌트. 아직 MainNavigator에 연결되어 있지 않다(6-3).
//
// props
// - userId: Auth user_id 문자열
// - onLogout: 오류 화면의 "로그아웃" 동작(예: () => dispatch(logoutUser()).unwrap()). 6-3에서 주입한다.
//             없으면 로그아웃 버튼을 그리지 않는다. 이 컴포넌트는 로그아웃 로직을 새로 만들지 않는다.
// - renderMain({ initialRouteName, initialParams }): 서버 상태가 complete/incomplete일 때 상위 Navigator를 그린다.
//
// checking → 로딩, error → 오류 화면(다시 시도 / 로그아웃 둘뿐, 홈 우회 없음),
// complete → 홈 진입용 renderMain, incomplete → 신규 온보딩 진입용 renderMain.
// 재시도 중에는 오류 화면을 유지하고 "다시 시도" 버튼에 로딩을 표시한다. 자동 재시도는 하지 않는다.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';
import SplashLoadingScreen from '../screens/status/SplashLoadingScreen';
import { useOnboardingGate } from '../features/onboarding/useOnboardingGate';
import { GATE_VIEW } from '../features/onboarding/workOnboardingNavigation';
import WorkOnboardingGateError from '../components/onboarding/WorkOnboardingGateError';
import { PanelButton } from '../components/onboarding/WorkOnboardingStatePanel';
import {
  LOGOUT_CONFIRM,
  deriveBoundaryState,
  hasLogoutAction,
  pressRetry,
  runBoundaryLogout,
} from './workOnboardingRouteLogic';

export default function OnboardingGateBoundary({ userId, onLogout, renderMain }) {
  const gate = useOnboardingGate({ userId });

  // 사용자 키를 함께 보관해 사용자가 바뀌면 이전 사용자의 재시도 상태/오류 종류를 쓰지 않는다.
  const [retryState, setRetryState] = useState({ userId: null, requested: false });
  const lastErrorRef = useRef({ userId: null, type: undefined });
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const isLoggingOutRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const boundary = deriveBoundaryState({
    gate,
    retryState,
    lastError: lastErrorRef.current,
    userId,
  });

  // 오류 종류를 기억해 재시도 중(checking)에도 오류 화면에 같은 문구를 유지한다.
  useEffect(() => {
    if (gate.status === 'error' && gate.error?.type) {
      lastErrorRef.current = { userId, type: gate.error.type };
    }
  }, [gate.status, gate.error, userId]);

  // 재시도 결과가 나오면 상태를 해제한다(화면 결정 자체는 deriveBoundaryState가 이미 반영).
  useEffect(() => {
    if (!boundary.retryRequested && retryState.requested) {
      setRetryState({ userId, requested: false });
    }
  }, [boundary.retryRequested, retryState.requested, userId]);

  const handleRetry = useCallback(() => {
    const result = pressRetry({
      status: gate.status,
      isRetrying: boundary.isRetrying,
      retry: gate.retry,
    });
    if (result.requested) setRetryState({ userId, requested: true });
  }, [gate.status, gate.retry, boundary.isRetrying, userId]);

  const handleLogoutPress = useCallback(() => {
    if (isLoggingOutRef.current) return;
    const performLogout = () =>
      runBoundaryLogout({
        onLogout,
        busyRef: isLoggingOutRef,
        mountedRef: isMountedRef,
        setBusy: setIsLoggingOut,
      });
    Alert.alert(LOGOUT_CONFIRM.title, LOGOUT_CONFIRM.message, [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: performLogout },
    ]);
  }, [onLogout]);

  if (boundary.view === GATE_VIEW.SPLASH) {
    return <SplashLoadingScreen />;
  }

  if (boundary.view === GATE_VIEW.ERROR) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <WorkOnboardingGateError
          errorType={boundary.errorType}
          onRetry={handleRetry}
          isRetrying={boundary.isRetrying}
        />
        {hasLogoutAction(onLogout) && (
          <View style={styles.footer}>
            <PanelButton
              label="로그아웃"
              variant="secondary"
              loading={isLoggingOut}
              disabled={boundary.isRetrying}
              onPress={handleLogoutPress}
            />
          </View>
        )}
      </SafeAreaView>
    );
  }

  // complete(HOME) / incomplete(신규 온보딩): 상위 Navigator가 이 초기 라우트로 마운트한다.
  return renderMain
    ? renderMain({
        initialRouteName: boundary.initialRouteName,
        initialParams: boundary.initialParams,
      })
    : null;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgMain,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
});
