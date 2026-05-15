import { createAsyncThunk } from "@reduxjs/toolkit";
import apiClient from "../../services/apiClient";
import { setTokens, clearTokens } from "../../services/tokenService";

export const loginUser = createAsyncThunk(
  "auth/loginUser",
  async (credentials, { rejectWithValue }) => {
    try {
      const data = await apiClient.post("/api/auth/login", credentials);

      await setTokens(data.accessToken, data.refreshToken);

      return data;
    } catch (error) {
      return rejectWithValue(
        error.envelope?.message || error.message || "로그인에 실패했습니다.",
      );
    }
  },
);

export const registerUser = createAsyncThunk(
  "auth/registerUser",
  async (userData, { rejectWithValue, dispatch }) => {
    try {
      await apiClient.post("/api/auth/register", userData);

      const result = await dispatch(
        loginUser({
          email: userData.email,
          password: userData.password,
        }),
      );

      return result.payload;
    } catch (error) {
      return rejectWithValue(
        error.envelope?.message || error.message || "회원가입에 실패했습니다.",
      );
    }
  },
);

export const logoutUser = createAsyncThunk(
  "auth/logoutUser",
  async (_, { rejectWithValue }) => {
    try {
      await apiClient.post("/api/auth/logout").catch(() => {});
      await clearTokens();
    } catch (error) {
      await clearTokens();
      return rejectWithValue(error.message);
    }
  },
);

export const refreshToken = createAsyncThunk(
  "auth/refreshToken",
  async (_, { rejectWithValue }) => {
    try {
      const { refreshAccessToken } =
        await import("../../services/tokenService");
      const newToken = await refreshAccessToken();

      return {
        accessToken: newToken,
      };
    } catch (error) {
      return rejectWithValue(error.message);
    }
  },
);
