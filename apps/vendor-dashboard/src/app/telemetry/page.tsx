"use client";

import { useState } from "react";
import useSWR from "swr";
import { cpApi } from "../../lib/api";
import { Shell } from "../../components/Shell";

interface TelemetryEvent {
  instanceId: string;
  category: string;
  action: string;
  severity: string;
  occurredAt: string;
  meta?: Record<string, unknown>;
}

interface TelemetrySummary {
  [severity: string]: number;
}

interface TimeSeriesPoint {
  bucket: string;
  count: number;
  errorCount: number;
  warnCount: number;
}

interface TimeSeriesResult {
  from: string;
  to: string;
  series: TimeSeriesPoint[];
  totalEvents: number;
}

interface InstanceOption {
  instanceId: string;
  hospitalName: string;
}

interface InstancesResponse {
  data: InstanceOption[] | {
    instances: InstanceOption[];
    total?: number;
  };
}

const fetcher = (path: string): Promise<any> => cpApi.get(path);

const SEVERITY_COLORS: Record<string, string> = {
  info: "bg-blue-100 text-blue-800",
  warn: "bg-yellow-100 text-yellow-800",
  error: "bg-red-100 text-red-800",
  critical: "bg-red-200 text-red-900 font-bold",
};

const CATEGORY_COLORS: Record<string, string> = {
  auth: "bg-amber-100 text-amber-700",
  patient: "bg-teal-100 text-teal-700",
  billing: "bg-green-100 text-green-700",
  system: "bg-gray-100 text-gray-700",
  package: "bg-indigo-100 text-indigo-700",
  license: "bg-cyan-100 text-cyan-700",
  security: "bg-purple-100 text-purple-700",
};

export default function TelemetryPage() {
  const [instanceId, setInstanceId] = useState("");
  const [hours, setHours] = useState(24);

  // Fetch instances for the selector
  const { data: instancesData } = useSWR<InstancesResponse>(
    "/api/vendor/instances",
    fetcher,
  );

  const instances = Array.isArray(instancesData?.data)
    ? instancesData.data
    : instancesData?.data.instances ?? [];

  // Summary counts
  const { data: summaryData } = useSWR<{ data: TelemetrySummary }>(
    instanceId ? `/api/vendor/telemetry/summary/${instanceId}?hours=${hours}` : null,
    fetcher,
    { refreshInterval: 30000 },
  );

  // Recent events
  const { data: recentData, isLoading } = useSWR<{ data: TelemetryEvent[] }>(
    instanceId ? `/api/vendor/telemetry/recent/${instanceId}?limit=100` : null,
    fetcher,
    { refreshInterval: 10000 },
  );

  // Time series
  const now = new Date();
  const from = new Date(now.getTime() - hours * 3600_000);
  const { data: seriesData } = useSWR<{ data: TimeSeriesResult }>(
    instanceId
      ? `/api/vendor/telemetry/query?instanceId=${instanceId}&from=${from.toISOString()}&to=${now.toISOString()}&bucketMinutes=60`
      : null,
    fetcher,
    { refreshInterval: 60000 },
  );

  const summary = summaryData?.data ?? {};
  const events = recentData?.data ?? [];
  const series = seriesData?.data?.series ?? [];
  const maxCount = Math.max(1, ...series.map((s) => s.count));

  return (
    <Shell>
    <div>
      <h1 className="text-2xl font-bold mb-6">Telemetry</h1>

      {/* Instance selector */}
      <div className="flex gap-4 mb-6">
        <select
          value={instanceId}
          onChange={(e) => setInstanceId(e.target.value)}
          className="border rounded px-3 py-2 min-w-[300px]"
        >
          <option value="">Select instance...</option>
          {instances.map((inst) => (
            <option key={inst.instanceId} value={inst.instanceId}>
              {inst.hospitalName} ({inst.instanceId.slice(0, 12)}...)
            </option>
          ))}
        </select>

        <select
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          className="border rounded px-3 py-2"
        >
          <option value={1}>Last 1 hour</option>
          <option value={6}>Last 6 hours</option>
          <option value={24}>Last 24 hours</option>
          <option value={72}>Last 3 days</option>
          <option value={168}>Last 7 days</option>
        </select>
      </div>

      {!instanceId && (
        <p className="text-gray-500">Select an instance to view telemetry data.</p>
      )}

      {instanceId && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {(["info", "warn", "error", "critical"] as const).map((sev) => (
              <div key={sev} className="bg-white border rounded-lg p-4 shadow-sm">
                <div className="text-sm text-gray-500 uppercase tracking-wide">{sev}</div>
                <div className="text-3xl font-bold mt-1">{summary[sev] ?? 0}</div>
              </div>
            ))}
          </div>

          {/* Simple bar chart */}
          {series.length > 0 && (
            <div className="bg-white border rounded-lg p-4 shadow-sm mb-6">
              <h2 className="text-lg font-semibold mb-3">Event Volume (hourly)</h2>
              <div className="flex items-end gap-1 h-32">
                {series.map((point, i) => {
                  const height = (point.count / maxCount) * 100;
                  const errorPct = point.count > 0 ? (point.errorCount / point.count) * 100 : 0;
                  return (
                    <div
                      key={i}
                      className="flex-1 relative group"
                      title={`${new Date(point.bucket).toLocaleString()}\n${point.count} events (${point.errorCount} errors)`}
                    >
                      <div
                        className="bg-blue-400 rounded-t w-full transition-all"
                        style={{ height: `${height}%` }}
                      >
                        {errorPct > 0 && (
                          <div
                            className="bg-red-400 rounded-t w-full absolute bottom-0"
                            style={{ height: `${(point.errorCount / maxCount) * 100}%` }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>{new Date(from).toLocaleTimeString()}</span>
                <span>{new Date(now).toLocaleTimeString()}</span>
              </div>
            </div>
          )}

          {/* Recent events table */}
          <div className="bg-white border rounded-lg shadow-sm">
            <h2 className="text-lg font-semibold p-4 border-b">Recent Events</h2>
            {isLoading && <p className="p-4 text-gray-400">Loading...</p>}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-4 py-2">Time</th>
                    <th className="px-4 py-2">Category</th>
                    <th className="px-4 py-2">Severity</th>
                    <th className="px-4 py-2">Action</th>
                    <th className="px-4 py-2">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {events.map((ev, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2 whitespace-nowrap font-mono text-xs text-gray-500">
                        {new Date(ev.occurredAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded text-xs ${CATEGORY_COLORS[ev.category] ?? "bg-gray-100"}`}>
                          {ev.category}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded text-xs ${SEVERITY_COLORS[ev.severity] ?? "bg-gray-100"}`}>
                          {ev.severity}
                        </span>
                      </td>
                      <td className="px-4 py-2">{ev.action}</td>
                      <td className="px-4 py-2 text-xs text-gray-500 max-w-xs truncate">
                        {ev.meta ? JSON.stringify(ev.meta) : "—"}
                      </td>
                    </tr>
                  ))}
                  {events.length === 0 && !isLoading && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                        No telemetry events found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
    </Shell>
  );
}
