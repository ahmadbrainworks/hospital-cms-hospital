"use client";

import useSWR from "swr";
import { api, ApiError } from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";
import { hasPermission } from "../../lib/permissions";
import { Permission } from "@hospital-cms/shared-types";
import type { PaginatedResult } from "@hospital-cms/shared-types";

interface Plugin {
  pluginId: string;
  name: string;
  version: string;
  description: string;
  status: "active" | "disabled" | "error" | "installing";
  vendorSigned: boolean;
}

const PLUGINS_URL = "/api/v1/plugins";
const fetcher = (url: string): Promise<Plugin[]> =>
  api.get<PaginatedResult<Plugin> | Plugin[]>(url).then((r) => {
    const payload = r.data;
    if (Array.isArray(payload)) return payload;
    return Array.isArray(payload?.items) ? payload.items : [];
  });

function StatusBadge({ status }: { status: Plugin["status"] }) {
  const map: Record<string, string> = {
    active: "bg-green-100 text-green-800",
    disabled: "bg-gray-100 text-gray-700",
    error: "bg-red-100 text-red-800",
    installing: "bg-yellow-100 text-yellow-800",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? "bg-gray-100 text-gray-700"}`}
    >
      {status}
    </span>
  );
}

function PluginCard({ plugin }: { plugin: Plugin }) {
  return (
    <div className="bg-white border rounded-lg p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-900">{plugin.name}</p>
            {plugin.vendorSigned && (
              <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200">
                Signed
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5 font-mono">
            {plugin.pluginId} v{plugin.version}
          </p>
          {plugin.description && (
            <p className="text-sm text-gray-600 mt-2">{plugin.description}</p>
          )}
        </div>
        <StatusBadge status={plugin.status} />
      </div>
    </div>
  );
}

export default function PluginsPage() {
  const { user } = useAuth();
  const canView = user
    ? hasPermission(user, Permission.SYSTEM_PLUGINS_MANAGE)
    : false;

  const { data: rawPlugins, isLoading, error } = useSWR<Plugin[]>(PLUGINS_URL, fetcher, {
    refreshInterval: 30_000,
  });
  const plugins = Array.isArray(rawPlugins) ? rawPlugins : [];

  const isLicenseError =
    error instanceof ApiError &&
    (error.code === "LICENSE_EXPIRED" || error.code === "LICENSE_FEATURE_DISABLED");

  const active = plugins.filter((p) => p.status === "active");
  const inactive = plugins.filter((p) => p.status !== "active");

  if (isLicenseError) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="max-w-lg mx-auto mt-16 text-center">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-8">
            <p className="text-4xl mb-3">&#9888;</p>
            <h2 className="text-lg font-semibold text-amber-800">License Required</h2>
            <p className="text-sm text-amber-700 mt-2">
              {error.code === "LICENSE_FEATURE_DISABLED"
                ? "Plugins are not available on your current license tier. Contact your vendor to upgrade."
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
            <h2 className="text-lg font-semibold text-red-800">Failed to load plugins</h2>
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
          <h1 className="text-2xl font-bold text-gray-900">Plugins</h1>
          <p className="text-sm text-gray-500 mt-1">
            Plugins are managed by your vendor. Contact your vendor to request changes.
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
        <p className="text-gray-500 text-sm">Loading plugins...</p>
      ) : (
        <>
          {active.length > 0 && (
            <section className="mb-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Active ({active.length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {active.map((p) => (
                  <PluginCard key={p.pluginId} plugin={p} />
                ))}
              </div>
            </section>
          )}

          {inactive.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Inactive ({inactive.length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {inactive.map((p) => (
                  <PluginCard key={p.pluginId} plugin={p} />
                ))}
              </div>
            </section>
          )}

          {plugins.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <p className="text-4xl mb-3">---</p>
              <p className="font-medium">No plugins installed</p>
              <p className="text-sm mt-1">
                Your vendor has not assigned any plugins to this hospital yet.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
