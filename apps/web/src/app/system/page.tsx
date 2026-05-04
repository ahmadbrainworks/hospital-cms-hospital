"use client";

import useSWR from "swr";
import { api, ApiError } from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";
import { hasPermission } from "../../lib/permissions";
import { Permission } from "@hospital-cms/shared-types";

interface SystemMetrics {
  app: {
    totalPatients: number;
    activeEncounters: number;
    totalUsers: number;
    pendingLabOrders: number;
    pendingInvoices: number;
    auditEventsLast24h: number;
  };
  system: {
    uptimeSeconds: number;
    memoryMb: { heapUsed: number; heapTotal: number; rss: number };
    nodeVersion: string;
    platform: string;
  };
  license: {
    tier: string;
    expiresAt: string;
    features: string[];
  } | null;
  timestamp: string;
}

interface LicenseDetail {
  license: {
    plan: string;
    status: string;
    features: string[];
    maxUsers: number;
    expiresAt: string;
  } | null;
  verified: {
    tier: string;
    features: string[];
    maxBeds: number;
    maxUsers: number;
    expiresAt: string;
    verifiedAt: string;
    signatureValid: boolean;
  } | null;
}

const fetcher = (url: string): Promise<any> => api.get<unknown>(url).then((r) => r.data);

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      className={`bg-white border rounded-xl p-5 shadow-sm ${accent ? `border-l-4 ${accent}` : ""}`}
    >
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

function LicenseBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    community: "bg-gray-100 text-gray-700",
    professional: "bg-blue-100 text-blue-800",
    enterprise: "bg-purple-100 text-purple-800",
  };
  return (
    <span
      className={`px-3 py-1 rounded-full text-sm font-semibold capitalize ${colors[tier] ?? "bg-gray-100 text-gray-700"}`}
    >
      {tier}
    </span>
  );
}

export default function SystemPage() {
  const { user } = useAuth();
  const canView = user
    ? hasPermission(user, Permission.SYSTEM_SETTINGS_READ)
    : false;
  const canWrite = user
    ? hasPermission(user, Permission.SYSTEM_SETTINGS_WRITE)
    : false;

  const {
    data: metrics,
    isLoading: metricsLoading,
    error: metricsError,
    mutate: refreshMetrics,
  } = useSWR<SystemMetrics>("/api/v1/system/metrics", fetcher, {
    refreshInterval: 30000,
  });

  const { data: licenseDetail, error: licenseError, mutate: refreshLicense } = useSWR<LicenseDetail>(
    "/api/v1/system/license",
    fetcher,
  );

  if (!canView) {
    return (
      <div className="p-6 text-center text-gray-500">
        <p>You don't have permission to view system information.</p>
      </div>
    );
  }

  const isLicenseError =
    (metricsError instanceof ApiError &&
      (metricsError.code === "LICENSE_EXPIRED" || metricsError.code === "LICENSE_FEATURE_DISABLED")) ||
    (licenseError instanceof ApiError &&
      (licenseError.code === "LICENSE_EXPIRED" || licenseError.code === "LICENSE_FEATURE_DISABLED"));

  if (isLicenseError) {
    const err = (metricsError ?? licenseError) as ApiError;
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">System</h1>
        <div className="max-w-lg mx-auto mt-8 text-center">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-8">
            <p className="text-4xl mb-3">&#9888;</p>
            <h2 className="text-lg font-semibold text-amber-800">License Required</h2>
            <p className="text-sm text-amber-700 mt-2">
              {err.code === "LICENSE_FEATURE_DISABLED"
                ? "System metrics are not available on your current license tier. Contact your vendor to upgrade."
                : "Your license has expired or is not active. Contact your vendor to renew."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleRefreshLicense = async () => {
    await api.post("/api/v1/system/license/refresh", {});
    refreshLicense();
    refreshMetrics();
  };

  const daysUntilExpiry = licenseDetail?.verified?.expiresAt
    ? Math.ceil(
        (new Date(licenseDetail.verified.expiresAt).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24),
      )
    : null;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">System</h1>
        <button
          onClick={() => {
            refreshMetrics();
            refreshLicense();
          }}
          className="text-sm text-indigo-600 hover:text-indigo-800"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Operational metrics */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Operations
        </h2>
        {metricsLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="bg-white border rounded-xl p-5 shadow-sm animate-pulse h-24"
              />
            ))}
          </div>
        ) : metrics ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <StatCard
              label="Total Patients"
              value={metrics.app.totalPatients.toLocaleString()}
              accent="border-indigo-500"
            />
            <StatCard
              label="Active Encounters"
              value={metrics.app.activeEncounters}
              accent="border-green-500"
            />
            <StatCard label="Active Users" value={metrics.app.totalUsers} />
            <StatCard
              label="Pending Lab Orders"
              value={metrics.app.pendingLabOrders}
              accent={
                metrics.app.pendingLabOrders > 20 ? "border-amber-500" : ""
              }
            />
            <StatCard
              label="Open Invoices"
              value={metrics.app.pendingInvoices}
            />
            <StatCard
              label="Audit Events (24h)"
              value={metrics.app.auditEventsLast24h.toLocaleString()}
            />
          </div>
        ) : null}
      </section>

      {/* License */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            License
          </h2>
          {canWrite && (
            <button
              onClick={handleRefreshLicense}
              className="text-xs text-indigo-600 hover:text-indigo-800"
            >
              Force re-verify
            </button>
          )}
        </div>
        <div className="bg-white border rounded-xl p-5 shadow-sm">
          {licenseDetail?.verified ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <LicenseBadge tier={licenseDetail.verified.tier} />
                  {licenseDetail.verified.signatureValid && (
                    <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded">
                      ✓ RSA signature valid
                    </span>
                  )}
                </div>
                {daysUntilExpiry !== null && (
                  <span
                    className={`text-sm font-medium ${daysUntilExpiry < 30 ? "text-amber-600" : "text-gray-600"}`}
                  >
                    Expires in {daysUntilExpiry} day
                    {daysUntilExpiry !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-500">Max Beds</p>
                  <p className="font-semibold">
                    {licenseDetail.verified.maxBeds === 99999
                      ? "Unlimited"
                      : licenseDetail.verified.maxBeds}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Max Users</p>
                  <p className="font-semibold">
                    {licenseDetail.verified.maxUsers === 99999
                      ? "Unlimited"
                      : licenseDetail.verified.maxUsers}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Expires</p>
                  <p className="font-semibold">
                    {new Date(
                      licenseDetail.verified.expiresAt,
                    ).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Last Verified</p>
                  <p className="font-semibold">
                    {new Date(
                      licenseDetail.verified.verifiedAt,
                    ).toLocaleTimeString()}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-500 mb-2">Features</p>
                <div className="flex flex-wrap gap-1.5">
                  {licenseDetail.verified.features.map((f) => (
                    <span
                      key={f}
                      className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-100"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-gray-500">
              <p className="text-amber-600 font-medium">
                ⚠ License not verified
              </p>
              <p className="text-sm mt-1">
                No valid signed license found. Contact your vendor.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Process health */}
      {metrics && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Process Health
          </h2>
          <div className="bg-white border rounded-xl p-5 shadow-sm grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-500">Uptime</p>
              <p className="font-semibold">
                {formatUptime(metrics.system.uptimeSeconds)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Heap Used / Total</p>
              <p className="font-semibold">
                {metrics.system.memoryMb.heapUsed} /{" "}
                {metrics.system.memoryMb.heapTotal} MB
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">RSS</p>
              <p className="font-semibold">{metrics.system.memoryMb.rss} MB</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Node.js</p>
              <p className="font-semibold font-mono">
                {metrics.system.nodeVersion}
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2 text-right">
            Last updated: {new Date(metrics.timestamp).toLocaleTimeString()} ·
            auto-refreshes every 30s
          </p>
        </section>
      )}
    </div>
  );
}
