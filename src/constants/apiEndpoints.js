// TODO: 아래 모든 path는 백엔드 Gateway 확정 전 임시값입니다.
// 백엔드 팀이 실제 endpoint를 제공하면 이 파일의 값만 수정하세요.
// 절대 각 API 모듈이나 화면 파일에 path를 직접 하드코딩하지 마세요.
export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/api/auth/login', // TODO: 백엔드 확정 필요
    REFRESH: '/api/auth/refresh', // TODO: 백엔드 확정 필요
    LOGOUT: '/api/auth/logout', // TODO: 백엔드 확정 필요
    REGISTER: '/api/auth/register', // TODO: 백엔드 확정 필요
    ME: '/api/auth/me', // TODO: 백엔드 확정 필요
    CHECK_PHONE: null, // TODO: 백엔드 확정 필요 (로그인 전 전화번호 가입 여부 확인). null이면 'unavailable' 처리
  },
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
  },
};
