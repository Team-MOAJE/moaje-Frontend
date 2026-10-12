import { configureStore } from '@reduxjs/toolkit';
import authReducer, { logout } from '../features/auth/authSlice';
import assetReducer from '../features/asset/assetSlice';
import workReducer from '../features/work/workSlice';
import { setSessionExpiredHandler } from '../services/apiClient';

const store = configureStore({
  reducer: {
    auth: authReducer,
    asset: assetReducer,
    work: workReducer,
  },
});

// Refresh Token 재발급 실패 시 로그인 필요 상태로 전환한다(토큰 삭제는 tokenService가 처리).
setSessionExpiredHandler(() => store.dispatch(logout()));

export default store;
