import { createSlice } from '@reduxjs/toolkit';
import {
  loginUser,
  registerUser,
  logoutUser,
  restoreSession,
  fetchCurrentUser,
  verifyUnlockPin,
} from './authApi';

// 마지막으로 시작한 인증 요청(login/register/restore/fetchCurrentUser)의 결과만 상태에 반영한다.
// 로그아웃 이전에 시작했거나 새 요청에 밀려난 요청의 늦은 fulfilled/rejected는 무시한다(thunk의 세션 검사에 더한 2차 방어).
const isLatestAuthRequest = (state, action) => action.meta.requestId === state.authRequestId;

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
    // 없이 자연스럽게 보장된다. true가 되는 경로는 네 가지뿐이다:
    // PIN 로그인 / 회원가입 / 로그인 직후 /me 재시도 / API-50 잠금 해제 성공(verifyUnlockPin.fulfilled).
    // 세션 복원(restoreSession)과 일반 refresh는 이 값을 true로 만들지 않는다.
    isAppUnlocked: false,
    // 마지막 인증 요청의 requestId(UI와 무관). logoutUser.pending이 비우면 그 이전 요청의 늦은 결과가 무시된다.
    authRequestId: null,
  },
  reducers: {
    logout: state => {
      state.user = null;
      state.isAuthenticated = false;
      state.isAppUnlocked = false;
      state.isLoading = false;
      state.error = null;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(restoreSession.pending, (state, action) => {
        state.isLoading = true;
        state.error = null;
        state.authRequestId = action.meta.requestId;
      })
      .addCase(restoreSession.fulfilled, (state, action) => {
        // 복원 시도가 끝났다는 표시는 최신 요청 여부와 무관하게 항상 남긴다(Splash에 머물지 않도록).
        state.isSessionRestored = true;
        if (!isLatestAuthRequest(state, action)) return;
        state.isLoading = false;
        // /me로 사용자 정보를 확인했을 때만 복원한다(payload null = 토큰 없음·세션 무효·일시 오류).
        if (action.payload) {
          state.user = action.payload.user;
          state.isAuthenticated = true;
          // 복원은 PIN을 확인하지 않았으므로 항상 잠금 상태로 둔다(API-50 성공 전에는 홈에 진입할 수 없다).
          state.isAppUnlocked = false;
        }
      })
      .addCase(restoreSession.rejected, (state, action) => {
        state.isSessionRestored = true;
        if (!isLatestAuthRequest(state, action)) return;
        state.isLoading = false;
      })

      .addCase(loginUser.pending, (state, action) => {
        state.isLoading = true;
        state.error = null;
        state.authRequestId = action.meta.requestId;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        if (!isLatestAuthRequest(state, action)) return;
        state.user = action.payload.user;
        state.isAuthenticated = true;
        state.isAppUnlocked = true; // 방금 PIN을 직접 입력했으므로 App Lock 재확인 불필요
        state.isLoading = false;
        state.error = null;
      })
      .addCase(loginUser.rejected, (state, action) => {
        if (!isLatestAuthRequest(state, action)) return;
        state.isLoading = false;
        state.error = action.payload?.message ?? '로그인에 실패했습니다.';
      })

      .addCase(registerUser.pending, (state, action) => {
        state.isLoading = true;
        state.error = null;
        state.authRequestId = action.meta.requestId;
      })
      .addCase(registerUser.fulfilled, (state, action) => {
        if (!isLatestAuthRequest(state, action)) return;
        // 버그 수정: 기존에는 isLoading만 리셋하고 로그인 상태를 반영하지 않아 가입 완료 후에도
        // 인증되지 않은 상태로 남았다. loginUser.fulfilled와 동일하게 반영한다.
        state.user = action.payload.user;
        state.isAuthenticated = true;
        state.isAppUnlocked = true; // 방금 PIN을 직접 입력했으므로 App Lock 재확인 불필요
        state.isLoading = false;
      })
      .addCase(registerUser.rejected, (state, action) => {
        if (!isLatestAuthRequest(state, action)) return;
        state.isLoading = false;
        state.error = action.payload?.message ?? '회원가입에 실패했습니다.';
      })

      // 앱 잠금 해제(API-50). 요청 시작 시 소유권(requestId)을 가져가므로, 로그아웃(requestId 비움)이나
      // 재로그인·재복원(새 requestId) 이후에 도착하는 이전 세션의 결과는 아래에서 모두 무시된다.
      .addCase(verifyUnlockPin.pending, (state, action) => {
        state.authRequestId = action.meta.requestId;
      })
      .addCase(verifyUnlockPin.fulfilled, (state, action) => {
        if (!isLatestAuthRequest(state, action)) return;
        if (!state.isAuthenticated) return; // 인증 상태가 아니면 잠금 해제 대상이 없다
        state.isAppUnlocked = true;
      })
      .addCase(verifyUnlockPin.rejected, (state, action) => {
        if (!isLatestAuthRequest(state, action)) return;
        // 이 세션이 정리된 경우(토큰 없음·저장 실패)만 일반 로그인 화면으로 돌려보낸다.
        // 잘못된 PIN(모호한 401)·423·네트워크 오류는 인증·잠금 상태를 그대로 둔다.
        if (action.payload?.sessionEnded === true) {
          state.user = null;
          state.isAuthenticated = false;
          state.isAppUnlocked = false;
          state.isLoading = false;
          state.error = null;
        }
      })

      // 로그아웃을 시작하는 순간 그 이전에 시작된 인증 요청은 모두 무효가 된다(늦은 결과 무시).
      // 로그아웃 도중·이후에 새로 시작한 요청은 자신의 pending에서 새 requestId를 받으므로 영향이 없다.
      .addCase(logoutUser.pending, state => {
        state.authRequestId = null;
      })
      .addCase(logoutUser.fulfilled, state => {
        state.user = null;
        state.isAuthenticated = false;
        state.isAppUnlocked = false;
        state.isLoading = false;
        state.error = null;
      })

      // 로그인 직후 /me 재시도 성공 = 인증 완료(서버 사용자 정보 확인 후에만 전환)
      .addCase(fetchCurrentUser.pending, (state, action) => {
        state.authRequestId = action.meta.requestId;
      })
      .addCase(fetchCurrentUser.fulfilled, (state, action) => {
        if (!isLatestAuthRequest(state, action)) return;
        state.user = action.payload.user;
        state.isAuthenticated = true;
        state.isAppUnlocked = true; // 직전에 PIN 로그인에 성공한 상태에서만 호출된다
        state.error = null;
      })
      .addCase(fetchCurrentUser.rejected, (state, action) => {
        if (!isLatestAuthRequest(state, action)) return;
        state.error = action.payload?.message ?? '사용자 정보 조회에 실패했습니다.';
      });
  },
});

export const { logout } = authSlice.actions;
export default authSlice.reducer;
