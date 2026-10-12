export const ROUTES = {
  AUTH_STACK: 'AuthStack',
  LOGIN: 'Login',
  PHONE_LOGIN: 'PhoneLogin',
  SIGNUP: 'Signup',
  SIGNUP_PHONE: 'SignupPhone',
  SIGNUP_NAME: 'SignupName',
  MAIN_STACK: 'MainStack',
  HOME: 'Home',
  ACCOUNT_LIST: 'AccountList',
  ACCOUNT_DETAIL: 'AccountDetail',
  DAILY_LIMIT: 'DailyLimit',
  TRANSFER: 'Transfer',
  RECOMMENDATION: 'Recommendation',
  MFA_SCREEN: 'MFAScreen',
  CATEGORY: 'Category',
  MONEY_RECAP: 'MoneyRecap',
  PROFILE: 'Profile',
  SETTINGS: 'Settings',
  TRANSACTION_HISTORY: 'TransactionHistory',
  TRANSACTION_DETAIL: 'TransactionDetail',
  ANALYSIS: 'Analysis',
  PIN_INPUT: 'PinInput',
  // 앱 잠금 전용 경로. AuthNavigator의 PIN_INPUT과 이름이 같으면 잠금 화면에서 로그아웃할 때
  // React Navigation이 이전 root 상태의 PIN_INPUT(params 포함)을 AuthNavigator로 이어받아 잠금 화면이 남는다.
  APP_LOCK_PIN: 'AppLockPin',
  PIN_RESET_VERIFY: 'PinResetVerify',

  // 재무 온보딩(My Future)
  FINANCIAL_ONBOARDING: 'FinancialOnboarding',
  FINANCIAL_ONBOARDING_RESULT: 'FinancialOnboardingResult',

  // 공통 상태 화면
  STATUS_SPLASH_LOADING: 'StatusSplashLoading',
  STATUS_DATA_LOADING: 'StatusDataLoading',
  STATUS_SKELETON_LOADING: 'StatusSkeletonLoading',
  STATUS_ERROR: 'StatusError',

  // 개발용 미리보기 (__DEV__ 환경에서만 사용)
  DEV_STATE_PREVIEW: 'DevStatePreview',
  DEV_COMPONENT_STATES: 'DevComponentStates',
};
