import React, { useEffect, useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSelector } from 'react-redux';
import { ROUTES } from '../constants/routes';
import { getOnboardingRepository } from '../features/onboarding/onboardingRepository';
import SplashLoadingScreen from '../screens/status/SplashLoadingScreen';
import HomeScreen from '../screens/home/HomeScreen';
import AccountListScreen from '../screens/asset/AccountListScreen';
import AccountDetailScreen from '../screens/asset/AccountDetailScreen';
import DailyLimitScreen from '../screens/asset/DailyLimitScreen';
import AnalysisScreen from '../screens/asset/AnalysisScreen';
import TransferScreen from '../screens/asset/TransferScreen';
import RecommendationScreen from '../screens/work/RecommendationScreen';
import MFAScreen from '../screens/auth/MFAScreen';
import SupportScreen from '../screens/support/SupportScreen';
import CategoryScreen from '../screens/category/CategoryScreen';
import MoneyRecapScreen from '../screens/asset/MoneyRecapScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import TransactionHistoryScreen from '../screens/asset/TransactionHistoryScreen';
import TransactionDetailScreen from '../screens/asset/TransactionDetailScreen';
import PinInputScreen from '../screens/auth/PinInputScreen';
import FinancialOnboardingScreen from '../screens/onboarding/FinancialOnboardingScreen';
import FinancialOnboardingResultScreen from '../screens/onboarding/FinancialOnboardingResultScreen';

const Stack = createNativeStackNavigator();

const MainNavigator = () => {
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

  return (
    <Stack.Navigator
      initialRouteName={gateStatus === 'incomplete' ? ROUTES.FINANCIAL_ONBOARDING : ROUTES.HOME}
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
        name={ROUTES.RECOMMENDATION}
        component={RecommendationScreen}
        options={{ title: '소득 추천' }}
      />
      <Stack.Screen
        name={ROUTES.MFA_SCREEN}
        component={MFAScreen}
        options={{ title: '추가 인증' }}
      />
      <Stack.Screen
        name={ROUTES.SUPPORT_SCREEN}
        component={SupportScreen}
        options={{ title: '고객센터' }}
      />
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
    </Stack.Navigator>
  );
};

export default MainNavigator;
