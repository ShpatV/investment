import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  clearSession,
  errorMessage,
  getPortal,
  getRefreshToken,
  hasStoredSession,
  refreshSession,
  storeSession,
  subscribeToAuth,
  type PortalName,
} from "./api/client";
import { authApi } from "./api/endpoints";
import type { AuthUser, Role } from "./api/types";

export type AuthStatus = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  portal: PortalName | null;
  unreadNotifications: number;
  login: (portal: PortalName, email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  reloadUser: () => Promise<AuthUser | null>;
  setUnreadNotifications: (count: number) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const PORTAL_ROLES: Record<PortalName, Role[]> = {
  client: ["USER"],
  admin: ["ADMIN", "SUPER_ADMIN"],
  "super-admin": ["SUPER_ADMIN"],
};

export function portalForRole(role: Role): PortalName {
  if (role === "SUPER_ADMIN") return "super-admin";
  if (role === "ADMIN") return "admin";
  return "client";
}

export function roleCanAccessPortal(role: Role, portal: PortalName): boolean {
  return PORTAL_ROLES[portal].includes(role);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [portal, setPortal] = useState<PortalName | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const reloadUser = useCallback(async (): Promise<AuthUser | null> => {
    try {
      const me = await authApi.me();
      const nextUser: AuthUser = { ...me };
      setUser(nextUser);
      setUnreadNotifications(me.unreadNotifications ?? 0);
      setPortal(getPortal() ?? portalForRole(me.role));
      setStatus("authenticated");
      return nextUser;
    } catch {
      setUser(null);
      setStatus("anonymous");
      return null;
    }
  }, []);

  // Restore the session once on mount. Access tokens are never persisted, so a
  // reload always starts with a refresh-token rotation.
  useEffect(() => {
    let cancelled = false;

    // Safety timeout: if session restoration takes too long, redirect to login.
    const safetyTimer = setTimeout(() => {
      if (!cancelled) {
        setStatus("anonymous");
      }
    }, 10000);

    (async () => {
      try {
        if (!hasStoredSession()) {
          if (!cancelled) setStatus("anonymous");
          clearTimeout(safetyTimer);
          return;
        }
        const refreshed = await refreshSession();
        if (cancelled) return;
        if (!refreshed) {
          setStatus("anonymous");
          clearTimeout(safetyTimer);
          return;
        }
        await reloadUser();
        clearTimeout(safetyTimer);
      } catch (err) {
        console.error("Session restoration failed:", err);
        if (!cancelled) setStatus("anonymous");
        clearTimeout(safetyTimer);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(safetyTimer);
    };
  }, [reloadUser]);

  // A failed refresh inside the API client clears the session; mirror that here.
  useEffect(() => {
    return subscribeToAuth(() => {
      if (!getRefreshToken()) {
        setUser(null);
        setStatus("anonymous");
      }
    });
  }, []);

  const login = useCallback(
    async (targetPortal: PortalName, email: string, password: string): Promise<AuthUser> => {
      const session = await authApi.login(targetPortal, { email, password });
      storeSession(session);
      setUser(session.user);
      setPortal(session.portal ?? targetPortal);
      setStatus("authenticated");
      setUnreadNotifications(0);
      queryClient.clear();
      // Refresh `/auth/me` in the background for the unread counter and advisor.
      void reloadUser();
      return session.user;
    },
    [queryClient, reloadUser],
  );

  const logout = useCallback(async (): Promise<void> => {
    const token = getRefreshToken();
    try {
      if (token) await authApi.logout(token);
    } catch {
      // Revocation is best-effort: the local session is cleared regardless.
    }
    clearSession();
    setUser(null);
    setStatus("anonymous");
    setUnreadNotifications(0);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      portal,
      unreadNotifications,
      login,
      logout,
      reloadUser,
      setUnreadNotifications,
    }),
    [status, user, portal, unreadNotifications, login, logout, reloadUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

/** Maps an API failure to a readable message for toasts. */
export { errorMessage };
