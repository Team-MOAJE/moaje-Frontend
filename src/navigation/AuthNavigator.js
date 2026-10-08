import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ROUTES } from '../constants/routes';
import LoginScreen from '../screens/auth/LoginScreen';
import PhoneLoginScreen from '../screens/auth/PhoneLoginScreen';
import PinInputScreen from '../screens/auth/PinInputScreen';
import SignupTermsScreen from '../screens/auth/signup/SignupTermsScreen';
import SignupPhoneScreen from '../screens/auth/signup/SignupPhoneScreen';
import SignupNameScreen from '../screens/auth/signup/SignupNameScreen';
import PinResetVerifyScreen from '../screens/auth/PinResetVerifyScreen';

const Stack = createNativeStackNavigator();

const AuthNavigator = () => (
  <Stack.Navigator initialRouteName={ROUTES.LOGIN} screenOptions={{ headerShown: false }}>
    <Stack.Screen name={ROUTES.LOGIN} component={LoginScreen} />
    <Stack.Screen name={ROUTES.PHONE_LOGIN} component={PhoneLoginScreen} />
    <Stack.Screen name={ROUTES.SIGNUP} component={SignupTermsScreen} />
    <Stack.Screen name={ROUTES.SIGNUP_PHONE} component={SignupPhoneScreen} />
    <Stack.Screen name={ROUTES.SIGNUP_NAME} component={SignupNameScreen} />
    <Stack.Screen name={ROUTES.PIN_INPUT} component={PinInputScreen} />
    <Stack.Screen name={ROUTES.PIN_RESET_VERIFY} component={PinResetVerifyScreen} />
  </Stack.Navigator>
);

export default AuthNavigator;
