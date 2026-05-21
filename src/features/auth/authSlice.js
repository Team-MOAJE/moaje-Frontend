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
  },
  reducers: {
    logout: state => {
      state.user = null;
      state.isAuthenticated = false;
      state.isLoading = false;
      state.error = null;
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
      .addCase(registerUser.fulfilled, state => {
        state.isLoading = false;
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.message ?? '회원가입에 실패했습니다.';
      })

      .addCase(logoutUser.fulfilled, state => {
        state.user = null;
        state.isAuthenticated = false;
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

export const { logout } = authSlice.actions;
export default authSlice.reducer;
