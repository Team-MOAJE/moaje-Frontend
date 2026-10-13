// TODO: 아래 path 중 "명세 확정" 표시가 없는 값은 백엔드 Gateway 확정 전 임시값입니다.
// 기준 명세: docs/moaje-frontend-api-guide-20261011.pdf — 각 연동 단계에서 이 파일의 값만 수정하세요.
// 절대 각 API 모듈이나 화면 파일에 path를 직접 하드코딩하지 마세요.
export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/api/v1/auth/login', // 명세 확정 (API-02)
    REFRESH: '/api/v1/auth/refresh', // 명세 확정 (API-07)
    LOGOUT: '/api/v1/auth/logout', // 명세 확정 (API-08)
    REGISTER: '/api/v1/auth/register', // 명세 확정 (API-01)
    ME: '/api/v1/auth/me', // 명세 확정 (API-47)
    // API-50 앱 잠금 해제: Refresh Token + PIN으로 인증하고 Refresh Token을 회전한다.
    // 명세는 "Gateway JWT 필요"이나, 실행 중 Gateway(AUTH_PUBLIC_ENDPOINTS)는 이 경로를 JWT 검사 제외로 둔다(2026-10-12 컨테이너 설정 확인, 실요청 검증 전).
    SESSION_UNLOCK: '/api/v1/auth/session/unlock',
    CHECK_PHONE: null, // TODO: 백엔드 확정 필요 (로그인 전 전화번호 가입 여부 확인). null이면 'unavailable' 처리
  },
  // 명세상 "JWT 불필요"인 Auth 경로. apiClient는 이 경로에 Authorization 헤더를 붙이지 않는다.
  // (GET /api/v1/auth/token/validate는 검증 대상 토큰을 헤더로 보내므로 여기서 제외)
  AUTH_PUBLIC: [
    { method: 'post', path: '/api/v1/auth/register' }, // API-01
    { method: 'post', path: '/api/v1/auth/login' }, // API-02
    { method: 'post', path: '/api/v1/auth/token/validate' }, // API-03
    { method: 'post', path: '/api/v1/auth/refresh' }, // API-07
    { method: 'post', path: '/api/v1/auth/logout' }, // API-08
    // API-50: 실행 중 Gateway 설정 기준 공개 경로(명세와 다름). Refresh Token+PIN으로 인증하므로 Access Token을 붙이지 않는다.
    { method: 'post', path: '/api/v1/auth/session/unlock' },
  ],
  ASSET: {
    ACCOUNTS: '/api/v1/assets/accounts', // TODO: 백엔드 확정 필요
    ACCOUNT_SUMMARY: '/api/v1/assets/summary', // TODO: 백엔드 확정 필요
    AVAILABLE_BALANCE: '/api/v1/assets/available-balance', // TODO: 백엔드 확정 필요
    TRANSACTIONS: '/api/v1/assets/transactions', // TODO: 백엔드 확정 필요
    TRANSACTION_DETAIL: id => `/api/v1/assets/transactions/${id}`, // TODO: 백엔드 확정 필요
  },
  TRANSFER: {
    CREATE: '/api/v1/transfers', // TODO: 백엔드 확정 필요
    DETAIL: id => `/api/v1/transfers/${id}`, // TODO: 백엔드 확정 필요
  },
  WORK: {
    DAILY_LIMIT: '/api/v1/work/daily-limit', // TODO: 백엔드 확정 필요
    RECOMMENDATIONS: '/api/v1/work/recommendations', // TODO: 백엔드 확정 필요
    // 재무 온보딩. userId는 호출 전에 onboardingApi.js가 검증한 숫자 문자열만 전달한다.
    ONBOARDING: {
      QUESTIONS: '/api/v1/work/onboarding/questions', // 명세 확정 (API-30)
      ANSWERS: userId => `/api/v1/work/onboarding/${userId}/answers`, // 명세 확정 (API-31 POST / API-33 GET)
      ANSWER: (userId, questionNo) => `/api/v1/work/onboarding/${userId}/answers/${questionNo}`, // 명세 확정 (API-32)
      PROGRESS: userId => `/api/v1/work/onboarding/${userId}/progress`, // 명세 확정 (API-34)
      PROFILE: userId => `/api/v1/work/onboarding/${userId}/profile`, // 명세 확정 (API-35)
    },
    // 사회인 준비도. userId는 readinessApi.js가 검증한 숫자 문자열만 전달한다.
    READINESS: userId => `/api/v1/work/readiness/${userId}`, // 명세 확정 (API-36)
    // Money Recap. userId/yearMonth는 recapApi.js가 검증한 값만 전달한다.
    RECAP_MONTHS: userId => `/api/v1/work/recap/${userId}/months`, // 명세 확정 (API-37)
    RECAP: (userId, yearMonth) => `/api/v1/work/recap/${userId}/${yearMonth}`, // 명세 확정 (API-38)
    // 미래 자금 시뮬레이션. userId는 simulatorApi.js가 검증한 숫자 문자열만 전달한다.
    SIMULATOR_BASELINES: '/api/v1/work/simulator/baselines', // 명세 확정 (API-39, user_id 없음)
    SIMULATE: userId => `/api/v1/work/simulator/${userId}/simulate`, // 명세 확정 (API-40)
    ADJUST: userId => `/api/v1/work/simulator/${userId}/adjust`, // 명세 확정 (API-41)
  },
};
