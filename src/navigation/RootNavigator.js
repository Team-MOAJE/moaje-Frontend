import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSelector, useDispatch } from 'react-redux';
import { restoreSession, isAppLockFeatureEnabled } from '../features/auth/authApi';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import { ROUTES } from '../constants/routes';

// ── 상태 화면 (로딩·에러) ──────────────────────────────────────
import SplashLoadingScreen from '../screens/status/SplashLoadingScreen';
import DataLoadingScreen from '../screens/status/DataLoadingScreen';
import SkeletonLoadingScreen from '../screens/status/SkeletonLoadingScreen';
import ErrorStateScreen from '../screens/status/ErrorStateScreen';

// ── App Lock (세션 있음 + PIN 잠김) ────────────────────────────
import PinInputScreen from '../screens/auth/PinInputScreen';

// ── 개발용 미리보기 ────────────────────────────────────────────
import DevStatePreviewScreen from '../screens/dev/DevStatePreviewScreen';
import DevComponentStatesScreen from '../screens/dev/DevComponentStatesScreen';

// ── 개발용 미리보기 토글 ───────────────────────────────────────
// false 로 변경하면 기존 앱 시작 흐름(로그인 → 홈)으로 즉시 복원됩니다
const ENABLE_DEV_STATE_PREVIEW = __DEV__ && false;
// true 로 변경하면 로그인 없이 바로 홈화면으로 진입합니다 (확인 후 false 로 복원)
const ENABLE_DEV_MAIN = __DEV__ && false;

const DevStack = createNativeStackNavigator();

const DevPreviewNavigator = () => (
  <DevStack.Navigator
    initialRouteName={ROUTES.DEV_STATE_PREVIEW}
    screenOptions={{ headerShown: false }}
  >
    <DevStack.Screen name={ROUTES.DEV_STATE_PREVIEW} component={DevStatePreviewScreen} />
    <DevStack.Screen name={ROUTES.DEV_COMPONENT_STATES} component={DevComponentStatesScreen} />
    <DevStack.Screen name={ROUTES.STATUS_SPLASH_LOADING} component={SplashLoadingScreen} />
    <DevStack.Screen name={ROUTES.STATUS_DATA_LOADING} component={DataLoadingScreen} />
    <DevStack.Screen name={ROUTES.STATUS_SKELETON_LOADING} component={SkeletonLoadingScreen} />
    <DevStack.Screen name={ROUTES.STATUS_ERROR} component={ErrorStateScreen} />
  </DevStack.Navigator>
);

const LockStack = createNativeStackNavigator();

// 세션(토큰)은 유효하지만 App Lock PIN 잠금 해제가 필요한 상태. PIN_INPUT 화면 1개만 등록한다.
// isAppLockFeatureEnabled가 false인 동안(현재)은 RootNavigator가 이 트리로 진입시키지 않는다.
const AppLockStack = () => (
  <LockStack.Navigator screenOptions={{ headerShown: false }}>
    <LockStack.Screen
      name={ROUTES.PIN_INPUT}
      component={PinInputScreen}
      initialParams={{ mode: 'unlock' }}
    />
  </LockStack.Navigator>
);

const RootNavigator = () => {
  const dispatch = useDispatch();
  const isAuthenticated = useSelector(state => state.auth.isAuthenticated);
  const isSessionRestored = useSelector(state => state.auth.isSessionRestored);
  const isAppUnlocked = useSelector(state => state.auth.isAppUnlocked);

  useEffect(() => {
    dispatch(restoreSession());
  }, [dispatch]);

  // App Lock: verifyUnlockPin endpoint가 아직 없으면(isAppLockFeatureEnabled=false) 이 분기를
  // 완전히 건너뛰고 기존 isAuthenticated → MainNavigator 흐름을 그대로 유지한다. endpoint 없이
  // 강제로 잠그면 세션이 있는 사용자가 PIN을 검증할 방법이 없어 영구히 잠기므로 절대 금지.
  const needsAppLock = isAuthenticated && isAppLockFeatureEnabled && !isAppUnlocked;

  return (
    <NavigationContainer>
      {__DEV__ && ENABLE_DEV_STATE_PREVIEW ? (
        <DevPreviewNavigator />
      ) : __DEV__ && ENABLE_DEV_MAIN ? (
        <MainNavigator />
      ) : !isSessionRestored ? (
        <SplashLoadingScreen />
      ) : !isAuthenticated ? (
        <AuthNavigator />
      ) : needsAppLock ? (
        <AppLockStack />
      ) : (
        <MainNavigator />
      )}
    </NavigationContainer>
  );
};

export default RootNavigator;
