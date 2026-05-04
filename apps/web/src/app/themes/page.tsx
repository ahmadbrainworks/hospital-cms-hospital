"use client";

import useSWR from "swr";
import { api, ApiError } from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";
import { hasPermission } from "../../lib/permissions";
import { Permission } from "@hospital-cms/shared-types";

// Inline default theme variables to avoid bundling server-only @hospital-cms/theme-engine
const DEFAULT_THEME = {
  variables: {
    "--color-primary": "#2563eb",
    "--color-primary-dark": "#1d4ed8",
    "--color-primary-light": "#dbeafe",
    "--color-secondary": "#0891b2",
    "--color-success": "#16a34a",
    "--color-warning": "#d97706",
    "--color-error": "#dc2626",
    "--color-bg": "#f8fafc",
    "--color-surface": "#ffffff",
    "--color-border": "#e2e8f0",
    "--color-text": "#0f172a",
    "--color-text-muted": "#64748b",
  } as Record<string, string>,
};

interface ThemeAssignment {
  hospitalId: string;
  themeId: string;
  name: string;
  version: string;
  variables: Record<string, string>;
  activatedAt: string;
}

const THEME_URL = "/api/v1/themes/active";
const fetcher = (url: string): Promise<any> =>
  api.get<ThemeAssignment | null>(url).then((r) => r.data);

function ColorSwatch({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="w-8 h-8 rounded border border-gray-200 shadow-sm flex-shrink-0"
        style={{ backgroundColor: value }}
      />
      <div className="min-w-0">
        <p className="text-xs font-mono text-gray-700 truncate">{name}</p>
        <p className="text-xs text-gray-400">{value}</p>
      </div>
    </div>
  );
}

function ThemeVariablesGrid({
  variables,
}: {
  variables: Record<string, string>;
}) {
  const colorVars = Object.entries(variables).filter(
    ([, v]) => v.startsWith("#") || v.startsWith("rgb"),
  );
  const otherVars = Object.entries(variables).filter(
    ([, v]) => !v.startsWith("#") && !v.startsWith("rgb"),
  );

  return (
    <div>
      {colorVars.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Colors
          </p>
          <div className="grid grid-cols-2 gap-3">
            {colorVars.map(([k, v]) => (
              <ColorSwatch key={k} name={k} value={v} />
            ))}
          </div>
        </div>
      )}
      {otherVars.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Other
          </p>
          <div className="grid grid-cols-2 gap-1">
            {otherVars.map(([k, v]) => (
              <div key={k} className="text-xs">
                <span className="font-mono text-gray-600">{k}:</span>{" "}
                <span className="text-gray-800">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ThemesPage() {
  const { user } = useAuth();
  const canView = user
    ? hasPermission(user, Permission.SYSTEM_THEMES_MANAGE)
    : false;

  const { data: activeTheme, isLoading, error } = useSWR<ThemeAssignment | null>(
    THEME_URL,
    fetcher,
    { refreshInterval: 30_000 },
  );

  const isLicenseError =
    error instanceof ApiError &&
    (error.code === "LICENSE_EXPIRED" || error.code === "LICENSE_FEATURE_DISABLED");

  if (isLicenseError) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="max-w-lg mx-auto mt-16 text-center">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-8">
            <p className="text-4xl mb-3">&#9888;</p>
            <h2 className="text-lg font-semibold text-amber-800">License Required</h2>
            <p className="text-sm text-amber-700 mt-2">
              {error.code === "LICENSE_FEATURE_DISABLED"
                ? "Themes are not available on your current license tier. Contact your vendor to upgrade."
                : "Your license has expired or is not active. Contact your vendor to renew."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="max-w-lg mx-auto mt-16 text-center">
          <div className="bg-red-50 border border-red-200 rounded-xl p-8">
            <h2 className="text-lg font-semibold text-red-800">Failed to load theme</h2>
            <p className="text-sm text-red-600 mt-2">
              {error instanceof ApiError ? error.message : "An unexpected error occurred."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Theme</h1>
          <p className="text-sm text-gray-500 mt-1">
            Your theme is managed by your vendor. Contact your vendor to request changes.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
          Vendor Managed
        </span>
      </div>

      {isLoading ? (
        <p className="text-gray-500 text-sm">Loading theme...</p>
      ) : activeTheme ? (
        <div className="bg-white border rounded-lg p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-gray-900 text-lg">
                {activeTheme.name}
              </h2>
              <p className="text-sm text-gray-500 font-mono mt-0.5">
                {activeTheme.themeId} v{activeTheme.version}
              </p>
            </div>
            <span className="bg-green-100 text-green-800 text-xs font-medium px-2 py-1 rounded-full">
              Active
            </span>
          </div>
          <p className="text-xs text-gray-400 mb-4">
            Activated {new Date(activeTheme.activatedAt).toLocaleString()}
          </p>
          <ThemeVariablesGrid variables={activeTheme.variables} />
        </div>
      ) : (
        <div className="bg-white border rounded-lg p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-gray-900 text-lg">
                Default Theme
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Built-in hospital theme
              </p>
            </div>
            <span className="bg-gray-100 text-gray-700 text-xs font-medium px-2 py-1 rounded-full">
              Default
            </span>
          </div>
          <ThemeVariablesGrid variables={DEFAULT_THEME.variables} />
        </div>
      )}
    </div>
  );
}
