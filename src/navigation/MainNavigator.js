import React, { useCallback, useEffect, useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useDispatch, useSelector } from 'react-redux';
import { ROUTES } from '../constants/routes';
import { getOnboardingRepository } from '../features/onboarding/onboardingRepository';
import { logoutUser } from '../features/auth/authApi';
import { WORK_ONBOARDING_ENABLED } from '../features/onboarding/workOnboardingConfig';
import {
  getQuestionRouteOptions,
  getResultRouteOptions,
} from '../features/onboarding/workOnboardingNavigation';
import SplashLoadingScreen from '../screens/status/SplashLoadingScreen';
import HomeScreen from '../screens/home/HomeScreen';
import AccountListScreen from '../screens/asset/AccountListScreen';
import AccountDetailScreen from '../screens/asset/AccountDetailScreen';
import DailyLimitScreen from '../screens/asset/DailyLimitScreen';
import AnalysisScreen from '../screens/asset/AnalysisScreen';
import TransferScreen from '../screens/asset/TransferScreen';
import AccountOpenScreen from '../screens/asset/AccountOpenScreen';
import RecommendationScreen from '../screens/work/RecommendationScreen';
import ReadinessScreen from '../screens/work/ReadinessScreen';
import SimulatorScreen from '../screens/work/SimulatorScreen';
import SpendingScreen from '../screens/work/SpendingScreen';
import FdsAlertsScreen from '../screens/work/FdsAlertsScreen';
import MFAScreen from '../screens/auth/MFAScreen';
import CategoryScreen from '../screens/category/CategoryScreen';
import MoneyRecapScreen from '../screens/asset/MoneyRecapScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import TransactionHistoryScreen from '../screens/asset/TransactionHistoryScreen';
import TransactionDetailScreen from '../screens/asset/TransactionDetailScreen';
import PinInputScreen from '../screens/auth/PinInputScreen';
import FinancialOnboardingScreen from '../screens/onboarding/FinancialOnboardingScreen';
import FinancialOnboardingResultScreen from '../screens/onboarding/FinancialOnboardingResultScreen';
import OnboardingGateBoundary from './OnboardingGateBoundary';
import {
  WorkOnboardingQuestionRoute,
  WorkOnboardingResultRoute,
} from './WorkOnboardingRouteScreens';
import { gateEvidenceRegistry, startGateEvidence } from './workOnboardingRouteLogic';

const Stack = createNativeStackNavigator();

// 기존 화면 Stack 정의(공통). Hook이 없는 일반 함수다.
// - includeWorkRoutes=false(기능 플래그 off, Legacy): 기존과 동일한 라우트 집합만 등록한다.
// - includeWorkRoutes=true(Work 경로): 서버 온보딩 라우트 2개를 추가로 등록한다.
// - onboardingInitialParams: Work 경로에서 Gate가 incomplete를 확인한 최초 진입에만 전달하는 initialParams.
//   (serverStatus 같은 고정 근거를 initialParams에 두지 않는다.)
const renderMainStack = ({
  initialRouteName,
  includeWorkRoutes = false,
  onboardingInitialParams,
}) => (
  <Stack.Navigator
    initialRouteName={initialRouteName}
    screenOptions={{
      headerStyle: { backgroundColor: '#2563EB' },
      headerTintColor: '#fff',
      headerTitleStyle: { fontWeight: 'bold' },
    }}
  >
    <Stack.Screen name={ROUTES.HOME} component={HomeScreen} options={{ headerShown: false }} />
    <Stack.Screen
      name={ROUTES.ACCOUNT_LIST}
      component={AccountListScreen}
      options={{ title: '내 계좌' }}
    />
    <Stack.Screen
      name={ROUTES.ACCOUNT_DETAIL}
      component={AccountDetailScreen}
      options={{ headerShown: false, animation: 'none' }}
    />
    <Stack.Screen
      name={ROUTES.DAILY_LIMIT}
      component={DailyLimitScreen}
      options={{ headerShown: false }}
    />
    <Stack.Screen
      name={ROUTES.ANALYSIS}
      component={AnalysisScreen}
      options={{ headerShown: false }}
    />
    <Stack.Screen
      name={ROUTES.TRANSFER}
      component={TransferScreen}
      options={{ headerShown: false }}
    />
    <Stack.Screen
      name={ROUTES.ACCOUNT_OPEN}
      component={AccountOpenScreen}
      options={{ headerShown: false }}
    />
    <Stack.Screen
      name={ROUTES.RECOMMENDATION}
      component={RecommendationScreen}
      options={{ title: '소득 추천' }}
    />
    <Stack.Screen name={ROUTES.MFA_SCREEN} component={MFAScreen} options={{ title: '추가 인증' }} />
    <Stack.Screen
      name={ROUTES.CATEGORY}
      component={CategoryScreen}
      options={{ headerShown: false }}
    />
    <Stack.Screen
      name={ROUTES.MONEY_RECAP}
      component={MoneyRecapScreen}
      options={{ headerShown: false, animation: 'none' }}
    />
    <Stack.Screen
      name={ROUTES.PROFILE}
      component={ProfileScreen}
      options={{ headerShown: false }}
    />
    <Stack.Screen
      name={ROUTES.SETTINGS}
      component={SettingsScreen}
      options={{ headerShown: false }}
    />
    <Stack.Screen
      name={ROUTES.TRANSACTION_HISTORY}
      component={TransactionHistoryScreen}
      options={{ headerShown: false }}
    />
    <Stack.Screen
      name={ROUTES.TRANSACTION_DETAIL}
      component={TransactionDetailScreen}
      options={{ headerShown: false }}
    />
    <Stack.Screen
      name={ROUTES.FINANCIAL_ONBOARDING}
      component={FinancialOnboardingScreen}
      options={{ headerShown: false }}
    />
    <Stack.Screen
      name={ROUTES.FINANCIAL_ONBOARDING_RESULT}
      component={FinancialOnboardingResultScreen}
      options={{ headerShown: false }}
    />
    <Stack.Screen
      name={ROUTES.PIN_INPUT}
      component={PinInputScreen}
      options={{ headerShown: false }}
    />
    <Stack.Screen
      name={ROUTES.WORK_READINESS}
      component={ReadinessScreen}
      options={{ headerShown: false }}
    />
    <Stack.Screen
      name={ROUTES.WORK_SIMULATOR}
      component={SimulatorScreen}
      options={{ headerShown: false }}
    />
    <Stack.Screen
      name={ROUTES.WORK_SPENDING}
      component={SpendingScreen}
      options={{ headerShown: false }}
    />
    <Stack.Screen
      name={ROUTES.WORK_FDS}
      component={FdsAlertsScreen}
      options={{ headerShown: false }}
    />
    {includeWorkRoutes && (
      <Stack.Screen
        name={ROUTES.WORK_FINANCIAL_ONBOARDING}
        component={WorkOnboardingQuestionRoute}
        options={getQuestionRouteOptions()}
        initialParams={onboardingInitialParams}
      />
    )}
    {includeWorkRoutes && (
      <Stack.Screen
        name={ROUTES.WORK_FINANCIAL_ONBOARDING_RESULT}
        component={WorkOnboardingResultRoute}
        options={getResultRouteOptions()}
      />
    )}
  </Stack.Navigator>
);

// ── 기존(로컬) 온보딩 게이트: 기능 플래그 off에서 사용. 동작은 이전과 동일하다. ─────────────
const LegacyMainNavigator = () => {
  const userId = useSelector(state => state.auth.user?.userId);
  // 'checking' | 'incomplete' | 'complete' — 온보딩 상태를 다 확인하기 전에는 Stack.Navigator
  // 자체를 마운트하지 않는다(initialRouteName은 최초 마운트 시에만 적용되므로, 먼저 마운트한 뒤
  // 나중에 바꾸는 방식은 쓰지 않는다).
  const [gateStatus, setGateStatus] = useState('checking');

  useEffect(() => {
    // 사용자 식별자가 아직 없으면 조회하지 않고 'checking'(로딩)을 유지한다 — 'guest' 등으로
    // fallback해서 조회하면 production 사용자의 데이터가 잘못된 네임스페이스에 쌓일 수 있다.
    if (!userId) return;
    let cancelled = false;
    getOnboardingRepository(userId)
      .loadResult()
      .then(result => {
        if (!cancelled) setGateStatus(result ? 'complete' : 'incomplete');
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (gateStatus === 'checking') {
    return <SplashLoadingScreen />;
  }

  return renderMainStack({
    initialRouteName: gateStatus === 'incomplete' ? ROUTES.FINANCIAL_ONBOARDING : ROUTES.HOME,
  });
};

// ── 서버(Work API-34) 기반 Gate 경로: 기능 플래그 on(6-4 이후)에서만 렌더된다. ────────────

// Gate가 API-34 incomplete를 확인했을 때만 마운트된다. 서버 미완료 "근거 토큰"은 커밋 이후 useEffect에서만
// 발급하고(렌더 중 전역 상태 변경 없음), 토큰이 준비되기 전에는 질문 Stack을 마운트하지 않는다.
// effect deps는 [userId]뿐이라 리렌더로 재발급되지 않고, StrictMode의 effect 재실행·사용자 변경·언마운트에서는
// cleanup이 이전 토큰을 무효화한다. 토큰은 로컬 결과 안내 표시 판단에만 쓰인다.
const IncompleteOnboardingStackHost = ({ userId }) => {
  const [issued, setIssued] = useState(null); // { userId, token } | null

  useEffect(
    () =>
      startGateEvidence({
        registry: gateEvidenceRegistry,
        userId,
        onIssued: token => setIssued({ userId, token }),
      }),
    [userId]
  );

  if (!issued || issued.userId !== userId) {
    return <SplashLoadingScreen />;
  }

  return renderMainStack({
    initialRouteName: ROUTES.WORK_FINANCIAL_ONBOARDING,
    includeWorkRoutes: true,
    onboardingInitialParams: { mode: 'initial', gateEvidence: issued.token },
  });
};

// Boundary의 renderMain 콜백(순수 함수): 레지스트리를 호출하지 않는다.
const renderWorkMain = ({ initialRouteName, userId }) =>
  initialRouteName === ROUTES.WORK_FINANCIAL_ONBOARDING ? (
    <IncompleteOnboardingStackHost userId={userId} />
  ) : (
    renderMainStack({ initialRouteName, includeWorkRoutes: true })
  );

const WorkMainNavigator = () => {
  const dispatch = useDispatch();
  const userId = useSelector(state => state.auth.user?.userId);
  // 오류 화면의 로그아웃: PIN 잠금 화면과 같은 기존 logoutUser 흐름(경계가 runGuardedLogout으로 감싼다).
  const handleLogout = useCallback(() => dispatch(logoutUser()).unwrap(), [dispatch]);
  const renderMain = useCallback(
    ({ initialRouteName }) => renderWorkMain({ initialRouteName, userId }),
    [userId]
  );

  return <OnboardingGateBoundary userId={userId} onLogout={handleLogout} renderMain={renderMain} />;
};

// 기능 플래그는 모듈 상수라 컴포넌트 선택(타입) 수준에서 분기한다 — 각 컴포넌트의 Hook 호출은 항상 동일하다.
// 플래그 off(기본)에서는 WorkMainNavigator가 렌더되지 않으므로 서버 Gate(API-34) 요청이 발생하지 않는다.
const MainNavigator = () =>
  WORK_ONBOARDING_ENABLED ? <WorkMainNavigator /> : <LegacyMainNavigator />;

export default MainNavigator;
