import type { AuthResponse, AuthUser } from "../types";

// Tokens live in localStorage (D2: Bearer tokens, not cookies — the frontend
// and API are on different sites). Kept in one module because both the axios
// interceptors and the authProvider read/write them.
const KEYS = {
  accessToken: "triage.accessToken",
  refreshToken: "triage.refreshToken",
  user: "triage.user",
} as const;

export const getAccessToken = () => localStorage.getItem(KEYS.accessToken);
export const getRefreshToken = () => localStorage.getItem(KEYS.refreshToken);

export const getStoredUser = (): AuthUser | null => {
  const raw = localStorage.getItem(KEYS.user);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null; // corrupted value — treat as "no cached user"
  }
};

export const saveUser = (user: AuthUser) =>
  localStorage.setItem(KEYS.user, JSON.stringify(user));

export const saveSession = ({ accessToken, refreshToken, user }: AuthResponse) => {
  localStorage.setItem(KEYS.accessToken, accessToken);
  localStorage.setItem(KEYS.refreshToken, refreshToken);
  saveUser(user);
};

export const clearSession = () =>
  Object.values(KEYS).forEach((key) => localStorage.removeItem(key));
