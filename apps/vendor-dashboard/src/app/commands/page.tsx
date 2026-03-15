"use client";

import useSWR from "swr";
import { cpApi } from "../../lib/api";
import { Shell } from "../../components/Shell";

interface CommandRecord {
  commandId: string;
  instanceId: string;
  type: string;
  status: string;
  issuedAt: string;
  expiresAt: string;
  executedAt?: string;
  result?: { success: boolean; output?: string };
}

export default function CommandsPage() {
  const { data, error, isLoading } = useSWR<{ data: CommandRecord[] }>(
    "/api/vendor/commands",
    (path: string): Promise<any> => cpApi.get(path),
    { refreshInterval: 10_000 },
  );

  return (
    <Shell>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Commands</h1>
        <p className="text-sm text-gray-500 mt-1">
          RSA-signed commands issued to hospital agents. Commands are fetched during heartbeat and executed once.
        </p>
      </div>

      {isLoading && <div className="text-sm text-gray-400">Loading…</div>}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error.message}
        </div>
      )}

      {data && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">Command</th>
                <th className="px-4 py-3">Instance</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Issued</th>
                <th className="px-4 py-3">Executed</th>
                <th className="px-4 py-3">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.data.map((cmd) => {
                const expired = !cmd.executedAt && new Date(cmd.expiresAt) < new Date();
                const statusLabel = cmd.executedAt
                  ? cmd.result?.success
                    ? "SUCCESS"
                    : "FAILED"
                  : expired
                  ? "EXPIRED"
                  : "PENDING";
                const statusColor =
                  statusLabel === "SUCCESS"
                    ? "bg-green-100 text-green-800"
                    : statusLabel === "FAILED" || statusLabel === "EXPIRED"
                    ? "bg-red-100 text-red-800"
                    : "bg-yellow-100 text-yellow-800";

                return (
                  <tr key={cmd.commandId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs font-medium">{cmd.type}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{cmd.instanceId}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusColor}`}>
                        {statusLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{new Date(cmd.issuedAt).toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {cmd.executedAt ? new Date(cmd.executedAt).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">
                      {cmd.result?.output ?? "—"}
                    </td>
                  </tr>
                );
              })}
              {data.data.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">
                    No commands issued yet.
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
