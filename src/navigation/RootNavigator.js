import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSelector } from 'react-redux';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import { ROUTES } from '../constants/routes';

// ── 상태 화면 (로딩·에러) ──────────────────────────────────────
import SplashLoadingScreen from '../screens/status/SplashLoadingScreen';
import DataLoadingScreen from '../screens/status/DataLoadingScreen';
import SkeletonLoadingScreen from '../screens/status/SkeletonLoadingScreen';
import ErrorStateScreen from '../screens/status/ErrorStateScreen';

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

const RootNavigator = () => {
  const isAuthenticated = useSelector(state => state.auth.isAuthenticated);

  return (
    <NavigationContainer>
      {__DEV__ && ENABLE_DEV_STATE_PREVIEW ? (
        <DevPreviewNavigator />
      ) : __DEV__ && ENABLE_DEV_MAIN ? (
        <MainNavigator />
      ) : isAuthenticated ? (
        <MainNavigator />
      ) : (
        <AuthNavigator />
      )}
    </NavigationContainer>
  );
};

export default RootNavigator;
