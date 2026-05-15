import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_LAST_EMAIL = '@auth:lastEmail';
const KEY_AUTO_LOGIN = '@auth:autoLogin';
const KEY_ONBOARDING_DONE = '@auth:onboardingDone';

export const saveLastEmail = (email) =>
  AsyncStorage.setItem(KEY_LAST_EMAIL, email);

export const getLastEmail = () =>
  AsyncStorage.getItem(KEY_LAST_EMAIL);

export const setAutoLogin = (enabled) =>
  AsyncStorage.setItem(KEY_AUTO_LOGIN, JSON.stringify(enabled));

export const getAutoLogin = async () => {
  const value = await AsyncStorage.getItem(KEY_AUTO_LOGIN);
  return value ? JSON.parse(value) : false;
};

export const markOnboardingDone = () =>
  AsyncStorage.setItem(KEY_ONBOARDING_DONE, 'true');

export const isOnboardingDone = async () => {
  const value = await AsyncStorage.getItem(KEY_ONBOARDING_DONE);
  return value === 'true';
};
