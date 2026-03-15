"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { api } from "./api-client";
import type { UserPublic } from "@hospital-cms/shared-types";

// AUTH CONTEXT
// Persists auth state across page navigations.
// Exposes login/logout helpers consumed by UI components.

interface AuthState {
  user: UserPublic | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (accessToken: string, refreshToken: string, user: UserPublic) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  const refreshUser = useCallback(async () => {
    const token = api.getAccessToken();
    if (!token) {
      setState({ user: null, isLoading: false, isAuthenticated: false });
      return;
    }

    try {
      const res = await api.get<UserPublic>("/api/v1/auth/me");
      setState({
        user: res.data,
        isLoading: false,
        isAuthenticated: true,
      });
    } catch {
      api.clearTokens();
      setState({ user: null, isLoading: false, isAuthenticated: false });
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = useCallback(
    (accessToken: string, refreshToken: string, user: UserPublic) => {
      api.setTokens(accessToken, refreshToken);
      setState({ user, isLoading: false, isAuthenticated: true });
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/api/v1/auth/logout", {});
    } catch {
      // Ignore logout errors — clear local state regardless
    }
    api.clearTokens();
    setState({ user: null, isLoading: false, isAuthenticated: false });
    window.location.href = "/login";
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return ctx;
}

export function useRequireAuth(): AuthContextValue {
  const auth = useAuth();
  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated) {
      window.location.href = "/login";
    }
  }, [auth.isLoading, auth.isAuthenticated]);
  return auth;
}
