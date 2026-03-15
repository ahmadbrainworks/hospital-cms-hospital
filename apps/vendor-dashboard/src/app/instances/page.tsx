"use client";

import useSWR from "swr";
import { cpApi } from "../../lib/api";
import { Shell } from "../../components/Shell";
import Link from "next/link";

interface Instance {
  instanceId: string;
  hospitalName: string;
  status: string;
  tier: string;
  lastHeartbeat?: string;
  metrics?: {
    cpuPercent?: number;
    memoryPercent?: number;
    diskPercent?: number;
  };
  licenseExpiresAt?: string;
}

interface InstancesResponse {
  data: Instance[] | {
    instances: Instance[];
    total?: number;
  };
}

function StatusBadge({ status }: { status: string }) {
  const colours: Record<string, string> = {
    ACTIVE: "bg-green-100 text-green-800",
    SUSPENDED: "bg-yellow-100 text-yellow-800",
    DECOMMISSIONED: "bg-red-100 text-red-800",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colours[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}

function MetricBar({ value, warn = 80, danger = 90 }: { value?: number; warn?: number; danger?: number }) {
  if (value == null) return <span className="text-gray-300 text-xs">—</span>;
  const colour = value >= danger ? "bg-red-500" : value >= warn ? "bg-yellow-400" : "bg-green-400";
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 bg-gray-100 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${colour}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className="text-xs text-gray-600">{value.toFixed(0)}%</span>
    </div>
  );
}

export default function InstancesPage() {
  const { data, error, isLoading } = useSWR<InstancesResponse>(
    "/api/vendor/instances",
    (path: string): Promise<any> => cpApi.get(path),
    { refreshInterval: 30_000 },
  );
  const instances = Array.isArray(data?.data)
    ? data.data
    : data?.data.instances ?? [];

  return (
    <Shell>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Hospital Instances</h1>
        <p className="text-sm text-gray-500 mt-1">All distributed CMS instances reporting to this control panel.</p>
      </div>

      {isLoading && (
        <div className="text-sm text-gray-400">Loading instances…</div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          Failed to load instances: {error.message}
        </div>
      )}

      {data && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">Hospital</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Tier</th>
                <th className="px-4 py-3">CPU</th>
                <th className="px-4 py-3">Memory</th>
                <th className="px-4 py-3">Disk</th>
                <th className="px-4 py-3">Last Heartbeat</th>
                <th className="px-4 py-3">License Expires</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {instances.map((inst) => (
                <tr key={inst.instanceId} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{inst.hospitalName}</td>
                  <td className="px-4 py-3"><StatusBadge status={inst.status} /></td>
                  <td className="px-4 py-3 capitalize text-gray-600">{inst.tier}</td>
                  <td className="px-4 py-3"><MetricBar value={inst.metrics?.cpuPercent} /></td>
                  <td className="px-4 py-3"><MetricBar value={inst.metrics?.memoryPercent} /></td>
                  <td className="px-4 py-3"><MetricBar value={inst.metrics?.diskPercent} /></td>
                  <td className="px-4 py-3 text-gray-500">
                    {inst.lastHeartbeat
                      ? new Date(inst.lastHeartbeat).toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {inst.licenseExpiresAt
                      ? new Date(inst.licenseExpiresAt).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/instances/${inst.instanceId}`}
                      className="text-indigo-600 hover:text-indigo-800 font-medium text-xs"
                    >
                      Manage →
                    </Link>
                  </td>
                </tr>
              ))}
              {instances.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-400 text-sm">
                    No instances registered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
