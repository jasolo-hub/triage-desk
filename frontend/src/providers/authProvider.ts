import type { AuthProvider, HttpError } from "@refinedev/core";
import type { AuthResponse, AuthUser, Me, Permissions } from "../types";
import { axiosInstance } from "./api";
import { queryClient } from "./queryClient";
import { clearSession, getAccessToken, getStoredUser, saveSession, saveUser } from "./session";

// `GET /auth/me` once per session, shared by getIdentity, getPermissions and
// accessControlProvider.can. Refine calls those many times on every page
// (one `can` per menu item and button), so all callers await one cached
// promise instead of each sending a request. The role is inside the JWT, so
// it cannot change mid-session anyway — a role change applies on next login.
let mePromise: Promise<Me> | null = null;

const toUser = ({ id, email, name, role }: Me): AuthUser => ({ id, email, name, role });

export const getMe = (): Promise<Me> => {
  mePromise ??= axiosInstance
    .get<Me>("/auth/me")
    .then(({ data }) => {
      saveUser(toUser(data)); // keep the stored copy (fallback in getIdentity) fresh
      return data;
    })
    .catch((error) => {
      mePromise = null; // don't cache a failure; the next caller retries
      throw error;
    });
  return mePromise;
};

const resetMe = () => {
  mePromise = null;
};

export const authProvider: AuthProvider = {
  login: async ({ email, password }) => {
    try {
      const { data } = await axiosInstance.post<AuthResponse>("/auth/login", { email, password });
      saveSession(data);
      resetMe(); // a different user may have been logged in before
      // Also drop cached `can` answers and lists: anything cached while logged
      // out or as another user (e.g. a `can: false` from a failed /auth/me)
      // would otherwise hide menu items for this user until it goes stale.
      queryClient.clear();
      return { success: true, redirectTo: "/" };
    } catch (error) {
      // 401 → "Invalid credentials", 429 → throttler message; shown by AuthPage
      const { message } = error as HttpError;
      return { success: false, error: { name: "Login failed", message } };
    }
  },

  logout: async () => {
    if (getAccessToken()) {
      // Revokes the refresh token server-side. Best effort: an offline API
      // must not keep the user stuck in the app.
      await axiosInstance.post("/auth/logout").catch(() => undefined);
    }
    clearSession();
    resetMe();
    queryClient.clear(); // see queryClient.ts
    return { success: true, redirectTo: "/login" };
  },

  // Cheap local check on every route change; an expired token is handled by
  // the 401 → refresh interceptor, a dead session by onError below.
  check: async () =>
    getAccessToken()
      ? { authenticated: true }
      : { authenticated: false, logout: true, redirectTo: "/login" },

  getIdentity: async () => {
    try {
      return toUser(await getMe());
    } catch {
      return getStoredUser(); // e.g. API briefly down: still show who is logged in
    }
  },

  getPermissions: async (): Promise<Permissions> => {
    try {
      return (await getMe()).permissions;
    } catch {
      return {}; // unknown permissions = nothing allowed (UI only; API decides)
    }
  },

  onError: async (error: HttpError) => {
    // 401 reaches here only after the refresh already failed (see api.ts).
    if (error?.statusCode === 401) {
      return { logout: true, redirectTo: "/login", error };
    }
    // 403 = "not allowed for your role / not your ticket": stay logged in.
    // Refine's data hooks already show the error notification with the API's
    // message, so there is nothing else to do here.
    return {};
  },
};
