import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import type { HttpError } from "@refinedev/core";
import type { ApiErrorBody, AuthResponse } from "../types";
import { API_URL } from "./constants";
import { clearSession, getAccessToken, getRefreshToken, saveSession } from "./session";

// The one HTTP client of the app: the data provider and our own calls
// (auth, bulk actions, uploads, AI) all go through it, so the Bearer header
// and the refresh-on-401 logic live in exactly one place.
export const axiosInstance = axios.create({ baseURL: API_URL });

axiosInstance.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Same shape simple-rest's built-in client produces. Refine's notifications
// read `message`, its auth `onError` reads `statusCode`. Nest sends `message`
// as string[] for validation errors, so join it into one readable line.
const toHttpError = (error: AxiosError<ApiErrorBody>): HttpError => {
  const body = error.response?.data;
  const message = Array.isArray(body?.message)
    ? body.message.join(", ")
    : (body?.message ?? error.message);
  // 0 = no response at all (network down / CORS), like XHR's status 0.
  return { ...error, message, statusCode: error.response?.status ?? 0 };
};

// Single-flight refresh. Refine fires many requests at once (list, identity,
// one `can` per button…), so an expired access token yields a burst of 401s.
// If each one called /auth/refresh with the same refresh token, the first
// would rotate it and the rest would present the now-old token — which the
// backend treats as replay and revokes the session (API contract). One shared
// promise means one refresh; every waiting request retries with its result.
let refreshing: Promise<string> | null = null;

const refreshAccessToken = (): Promise<string> => {
  refreshing ??= axios // bare axios: this call must not pass through our own interceptors
    .post<AuthResponse>(`${API_URL}/auth/refresh`, { refreshToken: getRefreshToken() })
    .then(({ data }) => {
      saveSession(data); // rotated: the old refresh token is now invalid
      return data.accessToken;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
};

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

// A 401 from login means "wrong password", from refresh means "session over" —
// neither should trigger another refresh.
const isLoginOrRefresh = (url = "") => /\/auth\/(login|refresh)$/.test(url);

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    const original = error.config as RetriableConfig | undefined;
    const shouldRefresh =
      error.response?.status === 401 &&
      original &&
      !original._retried && // retry once; a second 401 is final
      !isLoginOrRefresh(original.url) &&
      getRefreshToken() !== null;

    if (!shouldRefresh) return Promise.reject(toHttpError(error));

    original._retried = true;
    try {
      const accessToken = await refreshAccessToken();
      original.headers.Authorization = `Bearer ${accessToken}`;
      return axiosInstance(original);
    } catch {
      // Refresh failed: drop the dead session and surface the original 401 —
      // Refine's authProvider.onError turns it into logout + redirect to /login.
      clearSession();
      return Promise.reject(toHttpError(error));
    }
  },
);
