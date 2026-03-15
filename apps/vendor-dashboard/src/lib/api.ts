/**
 * Control panel API client for the vendor dashboard.
 *
 * Uses JWT-based authentication. Tokens are stored in localStorage.
 * Access token is sent as Authorization: Bearer <token>.
 * On 401, attempts a transparent refresh using the stored refresh token.
 */
const BASE =
  process.env["NEXT_PUBLIC_CONTROL_PANEL_URL"] ?? "http://localhost:4001";

const TOKEN_KEY = "cp_access_token";
const REFRESH_KEY = "cp_refresh_token";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
  }
}

// ─── Token storage ─────────────────────────────────────────────────

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export function hasTokens(): boolean {
  return !!getAccessToken() && !!getRefreshToken();
}

// ─── Refresh lock ──────────────────────────────────────────────────

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const rt = getRefreshToken();
  if (!rt) return false;

  try {
    const res = await fetch(`${BASE}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: rt }),
    });

    if (!res.ok) {
      clearTokens();
      return false;
    }

    const json = await res.json();
    const data = json.data;
    setTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    clearTokens();
    return false;
  }
}

/** Coalesce concurrent refresh attempts into one request. */
function refreshOnce(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = tryRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

// ─── Core fetch ────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  isRetry = false,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };

  const token = getAccessToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, { ...init, headers });

  // On 401, try a transparent refresh (once)
  if (res.status === 401 && !isRetry) {
    const refreshed = await refreshOnce();
    if (refreshed) {
      return apiFetch<T>(path, init, true);
    }
    // Refresh failed — force redirect to login
    if (typeof window !== "undefined") {
      clearTokens();
      window.location.href = "/login";
    }
    throw new ApiError(401, "Session expired");
  }

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(
      res.status,
      json?.error?.message ?? "Request failed",
      json?.error?.code,
    );
  }
  return json as T;
}

// ─── Public API ────────────────────────────────────────────────────

export const cpApi = {
  get: <T>(path: string): Promise<T> => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown): Promise<T> =>
    apiFetch<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body: unknown): Promise<T> =>
    apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown): Promise<T> =>
    apiFetch<T>(path, { method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string): Promise<T> =>
    apiFetch<T>(path, { method: "DELETE" }),
};

// ─── Auth helpers ──────────────────────────────────────────────────

export interface LoginResponse {
  success: boolean;
  data: {
    staff: {
      staffId: string;
      email: string;
      username: string;
      displayName: string;
      role: string;
      status: string;
    };
    tokens: {
      accessToken: string;
      refreshToken: string;
      expiresIn: string;
    };
    sessionId: string;
  };
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(
      res.status,
      json?.error?.message ?? "Login failed",
      json?.error?.code,
    );
  }

  const data = json as LoginResponse;
  setTokens(data.data.tokens.accessToken, data.data.tokens.refreshToken);
  return data;
}

export async function logout(): Promise<void> {
  try {
    await cpApi.post("/api/auth/logout");
  } finally {
    clearTokens();
  }
}
