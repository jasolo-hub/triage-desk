import type { AccessControlProvider } from "@refinedev/core";
import { getMe } from "./authProvider";

// Hiding is cosmetic: it only stops the UI from offering what the role can't
// do. The real gate is the backend Casbin check, which returns 403 for every
// one of these calls regardless of what the browser shows.
export const accessControlProvider: AccessControlProvider = {
  can: async ({ resource, action }) => {
    if (!resource) return { can: false }; // deny by default
    // `permissions` comes from the same Casbin policy the API enforces, so
    // the UI and the API cannot drift apart. Unknown resource → denied.
    // If /auth/me fails (API blip, expired session) this throws on purpose:
    // react-query then retries and refetches on the next render instead of
    // caching a `can: false` that would hide menu items for `staleTime`.
    const { permissions } = await getMe();
    return { can: permissions[resource]?.includes(action) ?? false };
  },
  options: {
    buttons: {
      enableAccessControl: true, // ask `can` for Create/Edit/Delete/Clone/Show buttons…
      hideIfUnauthorized: true, // …and hide them instead of rendering them disabled
    },
    queryOptions: {
      // `can` answers can't change during a session (see getMe), so let
      // react-query reuse them while navigating; logout clears the cache.
      staleTime: 5 * 60 * 1000,
    },
  },
};
