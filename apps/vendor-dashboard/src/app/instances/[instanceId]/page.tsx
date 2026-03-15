"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { cpApi, ApiError } from "../../../lib/api";
import { Shell } from "../../../components/Shell";
import { useAuth } from "../../../lib/auth-context";
import { P } from "../../../lib/permissions";

interface InstanceDetail {
  instanceId: string;
  hospitalName: string;
  status: string;
  tier: string;
  lastHeartbeat?: string;
  metrics?: Record<string, unknown>;
  desiredState?: {
    plugins: unknown[];
    themeId?: string;
    config: Record<string, string>;
  };
  licenseExpiresAt?: string;
  agentVersion?: string;
  hostname?: string;
}

interface PackageAssignment {
  assignmentId: string;
  instanceId: string;
  packageId: string;
  packageType: string;
  assignedVersion: string;
  status: string;
  assignedAt: string;
  lastSyncAt?: string;
  lastError?: string;
}

function AssignmentStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-green-100 text-green-800",
    assigned: "bg-blue-100 text-blue-800",
    installing: "bg-yellow-100 text-yellow-800",
    pending_update: "bg-orange-100 text-orange-800",
    pending_removal: "bg-red-100 text-red-700",
    disabled: "bg-gray-100 text-gray-700",
    removed: "bg-gray-50 text-gray-400",
    failed: "bg-red-100 text-red-800",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[status] ?? "bg-gray-100 text-gray-700"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

const COMMAND_TYPES = [
  "RESTART_API",
  "CLEAR_CACHE",
  "ROTATE_KEYS",
  "SET_LOG_LEVEL",
] as const;

export default function InstanceDetailPage() {
  const { instanceId } = useParams<{ instanceId: string }>();
  const key = `/api/vendor/instances/${instanceId}`;

  const { data, error, isLoading } = useSWR<{ data: InstanceDetail }>(
    key,
    (path: string): Promise<any> => cpApi.get(path),
    { refreshInterval: 15_000 },
  );

  const { hasPermission } = useAuth();

  const { data: assignmentsData } = useSWR(
    `/api/vendor/assignments/instance/${instanceId}`,
    (url: string): Promise<any> => cpApi.get(url),
    { refreshInterval: 15_000 },
  );
  const assignments: PackageAssignment[] = assignmentsData?.data ?? [];

  const [cmdType, setCmdType] = useState<string>(COMMAND_TYPES[0]);
  const [cmdPayload, setCmdPayload] = useState("{}");
  const [cmdLoading, setCmdLoading] = useState(false);
  const [cmdMsg, setCmdMsg] = useState("");

  const [removingPkg, setRemovingPkg] = useState<string | null>(null);
  const handleRemoveAssignment = async (packageId: string) => {
    if (!confirm(`Remove ${packageId} from this instance? It will be uninstalled on the next sync.`)) return;
    setRemovingPkg(packageId);
    try {
      await cpApi.delete(`/api/vendor/assignments/${instanceId}/${packageId}`);
      mutate(`/api/vendor/assignments/instance/${instanceId}`);
    } catch (err: any) {
      alert(err.message ?? "Remove failed");
    } finally {
      setRemovingPkg(null);
    }
  };

  const handleDisableAssignment = async (packageId: string) => {
    try {
      await cpApi.put(`/api/vendor/assignments/${instanceId}/${packageId}/disable`);
      mutate(`/api/vendor/assignments/instance/${instanceId}`);
    } catch (err: any) {
      alert(err.message ?? "Disable failed");
    }
  };

  const issueCommand = async () => {
    setCmdLoading(true);
    setCmdMsg("");
    try {
      let payload: unknown = {};
      try { payload = JSON.parse(cmdPayload); } catch { /* use empty object */ }
      await cpApi.post(`/api/vendor/instances/${instanceId}/commands`, {
        type: cmdType,
        payload,
      });
      setCmdMsg("Command queued successfully.");
    } catch (err) {
      setCmdMsg(err instanceof ApiError ? err.message : "Failed to issue command.");
    } finally {
      setCmdLoading(false);
    }
  };

  const inst = data?.data;

  return (
    <Shell>
      <div className="mb-6 flex items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {inst?.hospitalName ?? instanceId}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Instance ID: {instanceId}</p>
        </div>
        {inst && (
          <span className={`ml-auto inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            inst.status === "ACTIVE" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
          }`}>
            {inst.status}
          </span>
        )}
      </div>

      {isLoading && <div className="text-sm text-gray-400">Loading…</div>}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error.message}
        </div>
      )}

      {inst && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Instance info */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">Instance Info</h2>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-gray-500">Tier</dt>
              <dd className="font-medium capitalize">{inst.tier}</dd>
              <dt className="text-gray-500">License Expires</dt>
              <dd className="font-medium">{inst.licenseExpiresAt ? new Date(inst.licenseExpiresAt).toLocaleDateString() : "—"}</dd>
              <dt className="text-gray-500">Agent Version</dt>
              <dd className="font-medium">{inst.agentVersion ?? "—"}</dd>
              <dt className="text-gray-500">Hostname</dt>
              <dd className="font-medium font-mono text-xs">{inst.hostname ?? "—"}</dd>
              <dt className="text-gray-500">Last Heartbeat</dt>
              <dd className="font-medium">{inst.lastHeartbeat ? new Date(inst.lastHeartbeat).toLocaleString() : "—"}</dd>
            </dl>
          </div>

          {/* Metrics */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">System Metrics</h2>
            {inst.metrics ? (
              <dl className="grid grid-cols-2 gap-y-2 text-sm">
                {Object.entries(inst.metrics).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-gray-500">{k}</dt>
                    <dd className="font-medium font-mono">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-gray-400">No metrics yet.</p>
            )}
          </div>

          {/* Issue command */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Issue Command</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Command Type</label>
                <select
                  value={cmdType}
                  onChange={(e) => setCmdType(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {COMMAND_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Payload (JSON)</label>
                <textarea
                  value={cmdPayload}
                  onChange={(e) => setCmdPayload(e.target.value)}
                  rows={3}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              {cmdMsg && (
                <p className={`text-sm ${cmdMsg.includes("success") ? "text-green-600" : "text-red-600"}`}>
                  {cmdMsg}
                </p>
              )}
              <button
                onClick={issueCommand}
                disabled={cmdLoading}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {cmdLoading ? "Sending…" : "Send Command"}
              </button>
            </div>
          </div>

          {/* Desired state */}
          {inst.desiredState && (
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">Desired State</h2>
              <pre className="text-xs bg-gray-50 rounded-lg p-3 overflow-auto max-h-48 font-mono">
                {JSON.stringify(inst.desiredState, null, 2)}
              </pre>
            </div>
          )}

          {/* Assigned Packages */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">
                Assigned Packages ({assignments.length})
              </h2>
              {hasPermission(P.PACKAGE_ASSIGN) && (
                <Link
                  href={`/packages`}
                  className="text-xs text-indigo-600 hover:text-indigo-800"
                >
                  + Assign Package
                </Link>
              )}
            </div>
            {assignments.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-100">
                    <th className="pb-2">Package</th>
                    <th className="pb-2">Type</th>
                    <th className="pb-2">Version</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2">Last Sync</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {assignments.map((a) => (
                    <tr key={a.assignmentId} className="hover:bg-gray-50">
                      <td className="py-2">
                        <Link
                          href={`/packages/${a.packageId}`}
                          className="text-indigo-700 hover:text-indigo-900 font-mono text-xs"
                        >
                          {a.packageId}
                        </Link>
                      </td>
                      <td className="py-2 text-xs text-gray-500 capitalize">
                        {a.packageType}
                      </td>
                      <td className="py-2 font-mono text-xs text-gray-600">
                        {a.assignedVersion}
                      </td>
                      <td className="py-2">
                        <AssignmentStatusBadge status={a.status} />
                        {a.lastError && (
                          <div className="text-xs text-red-500 mt-0.5 truncate max-w-xs" title={a.lastError}>
                            {a.lastError}
                          </div>
                        )}
                      </td>
                      <td className="py-2 text-xs text-gray-400">
                        {a.lastSyncAt
                          ? new Date(a.lastSyncAt).toLocaleString()
                          : "Pending"}
                      </td>
                      <td className="py-2 text-right">
                        {hasPermission(P.PACKAGE_ASSIGN) &&
                          a.status !== "removed" &&
                          a.status !== "pending_removal" && (
                            <div className="flex gap-2 justify-end">
                              {a.status === "active" && (
                                <button
                                  onClick={() => handleDisableAssignment(a.packageId)}
                                  className="text-xs text-gray-500 hover:text-gray-700"
                                >
                                  Disable
                                </button>
                              )}
                              <button
                                onClick={() => handleRemoveAssignment(a.packageId)}
                                disabled={removingPkg === a.packageId}
                                className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
                              >
                                {removingPkg === a.packageId ? "..." : "Remove"}
                              </button>
                            </div>
                          )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-gray-400">
                No packages assigned to this instance yet.
              </p>
            )}
          </div>
        </div>
      )}
    </Shell>
  );
}
