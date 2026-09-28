import { createSlice } from '@reduxjs/toolkit';
import { loginUser, registerUser, logoutUser, restoreSession, fetchCurrentUser } from './authApi';

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: null,
    isAuthenticated: false,
    isSessionRestored: false,
    isLoading: false,
    error: null,
    // 이번 앱 실행에서 App Lock PIN으로 잠금 해제했는지. Redux는 프로세스 재시작 시 항상
    // 초기값(false)으로 돌아오므로, "앱을 새로 실행하면 항상 다시 잠긴 상태"가 별도 리셋 로직
    // 없이 자연스럽게 보장된다. App Lock 기능 자체는 isAppLockFeatureEnabled(authApi.js,
    // endpoint 준비 여부로 파생)가 꺼져 있는 동안은 이 값과 무관하게 항상 우회된다.
    isAppUnlocked: false,
  },
  reducers: {
    logout: state => {
      state.user = null;
      state.isAuthenticated = false;
      state.isAppUnlocked = false;
      state.isLoading = false;
      state.error = null;
    },
    unlockApp: state => {
      state.isAppUnlocked = true;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(restoreSession.pending, state => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(restoreSession.fulfilled, (state, action) => {
        state.isSessionRestored = true;
        state.isLoading = false;
        if (action.payload) {
          state.user = action.payload.user ?? action.payload;
          state.isAuthenticated = true;
        }
      })
      .addCase(restoreSession.rejected, state => {
        state.isSessionRestored = true;
        state.isLoading = false;
      })

      .addCase(loginUser.pending, state => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.user = action.payload?.user ?? null;
        state.isAuthenticated = true;
        state.isAppUnlocked = true; // 방금 PIN을 직접 입력했으므로 App Lock 재확인 불필요
        state.isLoading = false;
        state.error = null;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.message ?? '로그인에 실패했습니다.';
      })

      .addCase(registerUser.pending, state => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(registerUser.fulfilled, (state, action) => {
        // 버그 수정: 기존에는 isLoading만 리셋하고 로그인 상태를 반영하지 않아 가입 완료 후에도
        // 인증되지 않은 상태로 남았다. loginUser.fulfilled와 동일하게 반영한다.
        state.user = action.payload?.user ?? null;
        state.isAuthenticated = true;
        state.isAppUnlocked = true; // 방금 PIN을 직접 입력했으므로 App Lock 재확인 불필요
        state.isLoading = false;
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.message ?? '회원가입에 실패했습니다.';
      })

      .addCase(logoutUser.fulfilled, state => {
        state.user = null;
        state.isAuthenticated = false;
        state.isAppUnlocked = false;
        state.isLoading = false;
        state.error = null;
      })

      .addCase(fetchCurrentUser.fulfilled, (state, action) => {
        state.user = action.payload?.user ?? action.payload;
      })
      .addCase(fetchCurrentUser.rejected, (state, action) => {
        state.error = action.payload?.message ?? '사용자 정보 조회에 실패했습니다.';
      });
  },
});

export const { logout, unlockApp } = authSlice.actions;
export default authSlice.reducer;
