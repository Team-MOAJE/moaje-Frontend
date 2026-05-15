import axios from "axios";
import {
  getAccessToken,
  refreshAccessToken,
  clearTokens,
} from "./tokenService";
import { generateIdempotencyKey } from "../utils/idempotencyKey";
import { API_CODES } from "../constants/apiCodes";
import { REQUIRED_ACTIONS } from "../constants/requiredActions";

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
const TIMEOUT = Number(process.env.EXPO_PUBLIC_API_TIMEOUT) || 10000;

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: TIMEOUT,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

apiClient.interceptors.request.use(
  async (config) => {
    const token = await getAccessToken();

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    if (config.idempotent) {
      config.headers["Idempotency-Key"] = generateIdempotencyKey();
    }

    return config;
  },
  (error) => Promise.reject(error),
);

apiClient.interceptors.response.use(
  (response) => {
    const envelope = response.data;

    if (envelope?.success === true) {
      return envelope.data;
    }

    const apiError = new Error(envelope?.message || "API Error");
    apiError.envelope = envelope;
    return Promise.reject(apiError);
  },
  async (error) => {
    const originalRequest = error.config;
    const envelope = error.response?.data;

    if (!envelope) {
      const networkError = new Error("네트워크 연결을 확인해주세요.");
      networkError.isNetworkError = true;
      return Promise.reject(networkError);
    }

    const { code, error: responseError } = envelope;
    const requiredAction = responseError?.requiredAction;

    const isRefreshRequired =
      code === API_CODES.AUTH_ACCESS_TOKEN_EXPIRED ||
      requiredAction === REQUIRED_ACTIONS.REFRESH_TOKEN;

    if (isRefreshRequired && originalRequest && !originalRequest._isRetry) {
      originalRequest._isRetry = true;

      try {
        const newAccessToken = await refreshAccessToken();
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return apiClient(originalRequest);
      } catch {
        await clearTokens();

        const reLoginError = new Error(
          "세션이 만료되었습니다. 다시 로그인해주세요.",
        );
        reLoginError.envelope = {
          ...envelope,
          error: {
            ...envelope.error,
            requiredAction: REQUIRED_ACTIONS.RE_LOGIN,
          },
        };

        return Promise.reject(reLoginError);
      }
    }

    if (requiredAction === REQUIRED_ACTIONS.RE_LOGIN) {
      await clearTokens();
    }

    const apiError = new Error(envelope.message || "오류가 발생했습니다.");
    apiError.envelope = envelope;
    return Promise.reject(apiError);
  },
);

export default apiClient;
