"use client";

import { Shell } from "@/components/Shell";
import { useAuth } from "@/lib/auth-context";
import { cpApi } from "@/lib/api";
import useSWR from "swr";

interface InstanceSummary {
  instanceId: string;
  hospitalName: string;
  status: string;
  lastHeartbeat?: string;
}

interface LicenseSummary {
  licenseId: string;
  instanceId: string;
  tier: string;
  status: string;
  expiresAt: string;
}

interface InstancesResponse {
  success: boolean;
  data: InstanceSummary[] | {
    instances: InstanceSummary[];
    total?: number;
  };
}

function SummaryCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
      <div className="text-sm font-medium text-gray-500">{title}</div>
      <div className="mt-1 text-2xl font-bold text-gray-900">{value}</div>
      {subtitle && (
        <div className="mt-1 text-xs text-gray-400">{subtitle}</div>
      )}
    </div>
  );
}

export default function OverviewPage() {
  const { user, loading } = useAuth();

  const { data: instancesData } = useSWR(
    user ? "/api/vendor/instances" : null,
    (url: string) => cpApi.get<InstancesResponse>(url),
    { refreshInterval: 30_000 },
  );

  const { data: licensesData } = useSWR(
    user ? "/api/vendor/licenses" : null,
    (url: string) => cpApi.get<{ success: boolean; data: LicenseSummary[] }>(url),
    { refreshInterval: 60_000 },
  );

  if (loading) {
    return (
      <Shell>
        <div className="text-gray-500">Loading...</div>
      </Shell>
    );
  }

  const instances = Array.isArray(instancesData?.data)
    ? instancesData.data
    : instancesData?.data?.instances ?? [];
  const licenses: LicenseSummary[] = (licensesData as any)?.data?.licenses ?? [];
  const activeInstances = instances.filter((i) => i.status === "ACTIVE").length;
  const activeLicenses = licenses.filter((l) => l.status === "ACTIVE").length;
  const expiringSoon = licenses.filter((l) => {
    if (l.status !== "ACTIVE") return false;
    const expires = new Date(l.expiresAt);
    const daysLeft = (expires.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return daysLeft <= 30 && daysLeft > 0;
  }).length;

  return (
    <Shell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard Overview</h1>
        <p className="text-sm text-gray-500 mt-1">
          Welcome back, {user?.displayName ?? "Admin"}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <SummaryCard
          title="Total Instances"
          value={instances.length}
          subtitle={`${activeInstances} active`}
        />
        <SummaryCard
          title="Active Licenses"
          value={activeLicenses}
          subtitle={`of ${licenses.length} total`}
        />
        <SummaryCard
          title="Expiring Soon"
          value={expiringSoon}
          subtitle="within 30 days"
        />
        <SummaryCard
          title="Your Role"
          value={user?.role?.replace(/_/g, " ") ?? "-"}
        />
      </div>

      {/* Recent instances table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">
            Recent Instances
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="px-5 py-2 font-medium">Hospital</th>
                <th className="px-5 py-2 font-medium">Status</th>
                <th className="px-5 py-2 font-medium">Last Heartbeat</th>
              </tr>
            </thead>
            <tbody>
              {instances.slice(0, 10).map((inst) => (
                <tr
                  key={inst.instanceId}
                  className="border-b border-gray-50 hover:bg-gray-50"
                >
                  <td className="px-5 py-2.5 font-medium text-gray-900">
                    {inst.hospitalName}
                  </td>
                  <td className="px-5 py-2.5">
                    <span
                      className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${
                        inst.status === "ACTIVE"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {inst.status}
                    </span>
                  </td>
                  <td className="px-5 py-2.5 text-gray-500">
                    {inst.lastHeartbeat
                      ? new Date(inst.lastHeartbeat).toLocaleString()
                      : "Never"}
                  </td>
                </tr>
              ))}
              {instances.length === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    className="px-5 py-8 text-center text-gray-400"
                  >
                    No instances registered yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
