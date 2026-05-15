import * as SecureStore from "expo-secure-store";
import axios from "axios";

const SECURE_KEY_ACCESS_TOKEN = "ACCESS_TOKEN";
const SECURE_KEY_REFRESH_TOKEN = "REFRESH_TOKEN";

let _accessTokenMemory = null;

export const getAccessToken = async () => {
  if (_accessTokenMemory) return _accessTokenMemory;

  try {
    const stored = await SecureStore.getItemAsync(SECURE_KEY_ACCESS_TOKEN);

    if (stored) {
      _accessTokenMemory = stored;
    }

    return stored;
  } catch {
    return null;
  }
};

export const getRefreshToken = async () => {
  try {
    return await SecureStore.getItemAsync(SECURE_KEY_REFRESH_TOKEN);
  } catch {
    return null;
  }
};

export const setTokens = async (accessToken, refreshToken) => {
  _accessTokenMemory = accessToken;

  await Promise.all([
    SecureStore.setItemAsync(SECURE_KEY_ACCESS_TOKEN, accessToken),
    SecureStore.setItemAsync(SECURE_KEY_REFRESH_TOKEN, refreshToken),
  ]);
};

export const clearTokens = async () => {
  _accessTokenMemory = null;

  await Promise.all([
    SecureStore.deleteItemAsync(SECURE_KEY_ACCESS_TOKEN),
    SecureStore.deleteItemAsync(SECURE_KEY_REFRESH_TOKEN),
  ]);
};

export const refreshAccessToken = async () => {
  const refreshToken = await getRefreshToken();

  if (!refreshToken) {
    throw new Error("No refresh token available");
  }

  const baseURL = process.env.EXPO_PUBLIC_API_BASE_URL;

  const response = await axios.post(`${baseURL}/api/auth/refresh`, {
    refreshToken,
  });

  const envelope = response.data;

  if (!envelope.success) {
    throw new Error(envelope.message || "Token refresh failed");
  }

  const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
    envelope.data;

  await setTokens(newAccessToken, newRefreshToken ?? refreshToken);

  return newAccessToken;
};
