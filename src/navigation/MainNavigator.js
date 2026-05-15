import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ROUTES } from '../constants/routes';
import HomeScreen from '../screens/home/HomeScreen';
import AccountListScreen from '../screens/asset/AccountListScreen';
import DailyLimitScreen from '../screens/asset/DailyLimitScreen';
import TransferScreen from '../screens/asset/TransferScreen';
import RecommendationScreen from '../screens/work/RecommendationScreen';
import MFAScreen from '../screens/auth/MFAScreen';
import SupportScreen from '../screens/support/SupportScreen';

const Stack = createNativeStackNavigator();

const MainNavigator = () => (
  <Stack.Navigator
    initialRouteName={ROUTES.HOME}
    screenOptions={{
      headerStyle: { backgroundColor: '#2563EB' },
      headerTintColor: '#fff',
      headerTitleStyle: { fontWeight: 'bold' },
    }}
  >
    <Stack.Screen name={ROUTES.HOME} component={HomeScreen} options={{ title: '홈' }} />
    <Stack.Screen
      name={ROUTES.ACCOUNT_LIST}
      component={AccountListScreen}
      options={{ title: '내 계좌' }}
    />
    <Stack.Screen
      name={ROUTES.DAILY_LIMIT}
      component={DailyLimitScreen}
      options={{ title: '일일 한도' }}
    />
    <Stack.Screen
      name={ROUTES.TRANSFER}
      component={TransferScreen}
      options={{ title: '이체' }}
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
  </Stack.Navigator>
);

export default MainNavigator;
