import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_AUTO_LOGIN = '@auth:autoLogin';
const KEY_ONBOARDING_DONE = '@auth:onboardingDone';

export const setAutoLogin = enabled =>
  AsyncStorage.setItem(KEY_AUTO_LOGIN, JSON.stringify(enabled));

export const getAutoLogin = async () => {
  const value = await AsyncStorage.getItem(KEY_AUTO_LOGIN);
  return value ? JSON.parse(value) : false;
};

export const markOnboardingDone = () => AsyncStorage.setItem(KEY_ONBOARDING_DONE, 'true');

export const isOnboardingDone = async () => {
  const value = await AsyncStorage.getItem(KEY_ONBOARDING_DONE);
  return value === 'true';
};

// 로그아웃·세션 정리가 끝났는지 확인되기 전에 앱이 종료되는 경우를 위한 표식(불리언 값, 토큰·개인정보 없음).
// 다음 실행의 restoreSession이 이 표식을 보면 저장된 토큰이 남아 있어도 복원하지 않고 정리를 다시 시도한다.
// 세 함수 모두 예외를 삼키고 성공 여부(boolean)만 반환한다 — 표식 실패가 로그아웃을 막지 않는다.
const KEY_LOGOUT_PENDING = '@auth:logoutPending';

export const markLogoutPending = async () => {
  try {
    await AsyncStorage.setItem(KEY_LOGOUT_PENDING, 'true');
    return true;
  } catch {
    return false;
  }
};

export const isLogoutPending = async () => {
  try {
    return (await AsyncStorage.getItem(KEY_LOGOUT_PENDING)) === 'true';
  } catch {
    return false;
  }
};

export const clearLogoutPending = async () => {
  try {
    await AsyncStorage.removeItem(KEY_LOGOUT_PENDING);
    return true;
  } catch {
    return false;
  }
};
