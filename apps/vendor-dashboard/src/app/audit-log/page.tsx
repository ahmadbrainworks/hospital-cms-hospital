"use client";

import { useState } from "react";
import useSWR from "swr";
import { cpApi } from "@/lib/api";
import { Shell } from "@/components/Shell";

interface AuditEntry {
  staffId: string;
  staffEmail: string;
  action: string;
  detail: Record<string, unknown>;
  ipAddress: string;
  timestamp: string;
}

export default function AuditLogPage() {
  const [staffId, setStaffId] = useState("");
  const [action, setAction] = useState("");
  const [page, setPage] = useState(0);
  const limit = 50;

  const params = new URLSearchParams();
  if (staffId) params.set("staffId", staffId);
  if (action) params.set("action", action);
  params.set("limit", String(limit));
  params.set("offset", String(page * limit));

  const { data, isLoading } = useSWR(
    `/api/vendor/audit?${params.toString()}`,
    (url: string): Promise<any> => cpApi.get(url),
    { refreshInterval: 15_000 },
  );

  const { data: actionsData } = useSWR(
    "/api/vendor/audit/actions",
    (url: string): Promise<any> => cpApi.get(url),
  );

  const entries: AuditEntry[] = data?.data?.entries ?? [];
  const total: number = data?.data?.total ?? 0;
  const actions: string[] = actionsData?.data ?? [];
  const totalPages = Math.ceil(total / limit);

  return (
    <Shell>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Audit Log</h1>
        <p className="text-sm text-gray-500 mt-1">
          Staff actions and authentication events.
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-4">
        <input
          type="text"
          placeholder="Filter by Staff ID..."
          value={staffId}
          onChange={(e) => { setStaffId(e.target.value); setPage(0); }}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2 w-64 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        />
        <select
          value={action}
          onChange={(e) => { setAction(e.target.value); setPage(0); }}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        >
          <option value="">All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <span className="text-sm text-gray-500 self-center">
          {total} total entries
        </span>
      </div>

      {isLoading && <div className="text-sm text-gray-400">Loading...</div>}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Staff</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">IP Address</th>
              <th className="px-4 py-3">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {entries.map((entry, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap font-mono">
                  {new Date(entry.timestamp).toLocaleString()}
                </td>
                <td className="px-4 py-2.5 text-gray-700">
                  {entry.staffEmail}
                </td>
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700">
                    {entry.action}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-500 font-mono">
                  {entry.ipAddress}
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-500 max-w-xs truncate">
                  {JSON.stringify(entry.detail)}
                </td>
              </tr>
            ))}
            {entries.length === 0 && !isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">
                  No audit entries found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">
            Page {page + 1} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
          >
            Next
          </button>
        </div>
      )}
    </Shell>
  );
}
