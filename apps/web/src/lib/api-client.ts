// API CLIENT
// Type-safe fetch wrapper with auth token injection,
// automatic token refresh, and centralized error handling.

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("accessToken");
}

function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("refreshToken");
}

function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem("accessToken", accessToken);
  localStorage.setItem("refreshToken", refreshToken);
}

function clearTokens(): void {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
}

let isRefreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

async function attemptTokenRefresh(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      clearTokens();
      window.location.href = "/login";
      return null;
    }

    const data = await res.json();
    const { accessToken, refreshToken: newRefresh } = data.data;
    setTokens(accessToken, newRefresh);
    return accessToken;
  } catch {
    clearTokens();
    return null;
  }
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const token = getAccessToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) ?? {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const traceId = crypto.randomUUID();
  headers["X-Trace-ID"] = traceId;

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401 && retry) {
    // Token expired — try refresh
    if (isRefreshing) {
      const newToken = await new Promise<string>((resolve) => {
        refreshQueue.push(resolve);
      });
      return apiFetch<T>(path, options, false);
    }

    isRefreshing = true;
    const newToken = await attemptTokenRefresh();
    isRefreshing = false;

    refreshQueue.forEach((cb) => cb(newToken ?? ""));
    refreshQueue = [];

    if (newToken) {
      return apiFetch<T>(path, options, false);
    }

    throw new ApiError("UNAUTHORIZED", "Session expired", 401);
  }

  const data = await res.json();

  if (!res.ok || data.success === false) {
    throw new ApiError(
      data.error?.code ?? "UNKNOWN_ERROR",
      data.error?.message ?? "Request failed",
      res.status,
      data.error?.details,
    );
  }

  return data as T;
}

export const api = {
  get: <T>(path: string, options?: RequestInit) =>
    apiFetch<{ success: true; data: T; meta?: unknown }>(path, {
      method: "GET",
      ...options,
    }),

  post: <T>(path: string, body: unknown, options?: RequestInit) =>
    apiFetch<{ success: true; data: T; meta?: unknown }>(path, {
      method: "POST",
      body: JSON.stringify(body),
      ...options,
    }),

  put: <T>(path: string, body: unknown, options?: RequestInit) =>
    apiFetch<{ success: true; data: T; meta?: unknown }>(path, {
      method: "PUT",
      body: JSON.stringify(body),
      ...options,
    }),

  patch: <T>(path: string, body: unknown, options?: RequestInit) =>
    apiFetch<{ success: true; data: T; meta?: unknown }>(path, {
      method: "PATCH",
      body: JSON.stringify(body),
      ...options,
    }),

  delete: <T>(path: string, options?: RequestInit) =>
    apiFetch<{ success: true; data: T }>(path, {
      method: "DELETE",
      ...options,
    }),

  setTokens,
  clearTokens,
  getAccessToken,
};
