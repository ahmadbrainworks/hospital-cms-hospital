"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  login as apiLogin,
  logout as apiLogout,
  hasTokens,
  clearTokens,
  cpApi,
} from "./api";

export interface StaffUser {
  staffId: string;
  email: string;
  username: string;
  displayName: string;
  role: string;
  permissions: string[];
}

interface AuthState {
  user: StaffUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (...permissions: string[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

const PUBLIC_PATHS = ["/login"];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<StaffUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // Hydrate user from /api/auth/me on mount if tokens exist
  useEffect(() => {
    if (!hasTokens()) {
      setLoading(false);
      if (!PUBLIC_PATHS.includes(pathname)) {
        router.replace("/login");
      }
      return;
    }

    cpApi
      .get<{ success: boolean; data: StaffUser }>("/api/auth/me")
      .then((res) => {
        setUser(res.data);
      })
      .catch(() => {
        clearTokens();
        if (!PUBLIC_PATHS.includes(pathname)) {
          router.replace("/login");
        }
      })
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Redirect unauthenticated users away from protected pages
  useEffect(() => {
    if (!loading && !user && !PUBLIC_PATHS.includes(pathname)) {
      router.replace("/login");
    }
  }, [loading, user, pathname, router]);

  const loginFn = useCallback(
    async (email: string, password: string) => {
      const res = await apiLogin(email, password);
      // After login, fetch full profile to get permissions from JWT
      const profile = await cpApi.get<{ success: boolean; data: StaffUser }>(
        "/api/auth/me",
      );
      setUser(profile.data);
      router.replace("/");
    },
    [router],
  );

  const logoutFn = useCallback(async () => {
    await apiLogout();
    setUser(null);
    router.replace("/login");
  }, [router]);

  const hasPermission = useCallback(
    (permission: string): boolean => {
      if (!user) return false;
      return user.permissions.includes(permission);
    },
    [user],
  );

  const hasAnyPermission = useCallback(
    (...permissions: string[]): boolean => {
      if (!user) return false;
      return permissions.some((p) => user.permissions.includes(p));
    },
    [user],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login: loginFn,
        logout: logoutFn,
        hasPermission,
        hasAnyPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
