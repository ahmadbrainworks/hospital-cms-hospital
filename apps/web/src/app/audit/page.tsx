"use client";

import { useState } from "react";
import useSWR from "swr";
import { api, ApiError } from "../../lib/api-client";
import type { AuditLog, PaginatedResult } from "@hospital-cms/shared-types";

const fetcher = (url: string): Promise<any> =>
  api.get<PaginatedResult<AuditLog>>(url).then((r) => r.data);

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [actorId, setActorId] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [action, setAction] = useState("");

  const params = new URLSearchParams({ page: String(page), limit: "30" });
  if (actorId) params.set("actorId", actorId);
  if (resourceType) params.set("resourceType", resourceType);
  if (action) params.set("action", action);

  const { data, isLoading, error } = useSWR<PaginatedResult<AuditLog>>(
    `/api/v1/audit/logs?${params.toString()}`,
    fetcher,
  );
  const items = Array.isArray(data?.items) ? data.items : [];

  const isLicenseError =
    error instanceof ApiError &&
    (error.code === "LICENSE_EXPIRED" || error.code === "LICENSE_FEATURE_DISABLED");

  if (isLicenseError) {
    return (
      <div className="p-6">
        <div className="max-w-lg mx-auto mt-16 text-center">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-8">
            <p className="text-4xl mb-3">&#9888;</p>
            <h2 className="text-lg font-semibold text-amber-800">License Required</h2>
            <p className="text-sm text-amber-700 mt-2">
              {error.code === "LICENSE_FEATURE_DISABLED"
                ? "Audit logs are not available on your current license tier. Contact your vendor to upgrade."
                : "Your license has expired or is not active. Contact your vendor to renew."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="max-w-lg mx-auto mt-16 text-center">
          <div className="bg-red-50 border border-red-200 rounded-xl p-8">
            <h2 className="text-lg font-semibold text-red-800">Failed to load audit logs</h2>
            <p className="text-sm text-red-600 mt-2">
              {error instanceof ApiError ? error.message : "An unexpected error occurred."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Immutable record of all system activity. Tampering is detectable.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          value={actorId}
          onChange={(e) => {
            setActorId(e.target.value);
            setPage(1);
          }}
          placeholder="Filter by User ID"
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-52 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="text"
          value={resourceType}
          onChange={(e) => {
            setResourceType(e.target.value);
            setPage(1);
          }}
          placeholder="Resource type (Patient, Invoice...)"
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-52 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="text"
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
          placeholder="Action (patient.created...)"
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-52 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Timestamp
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Actor
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Action
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Resource
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Outcome
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                IP
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-gray-400"
                >
                  Loading...
                </td>
              </tr>
            )}
            {items.map((entry) => (
              <tr key={entry._id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 font-mono text-xs text-gray-500 whitespace-nowrap">
                  {new Date(entry.createdAt)
                    .toISOString()
                    .replace("T", " ")
                    .slice(0, 19)}
                </td>
                <td className="px-4 py-2.5">
                  <div className="font-medium text-gray-800 text-xs">
                    {entry.actor.username}
                  </div>
                  <div className="text-xs text-gray-400">
                    {entry.actor.role}
                  </div>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-blue-700">
                  {entry.action}
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-600">
                  {entry.resource.type}
                  {entry.resource.id && (
                    <span className="text-gray-400 ml-1">
                      #{entry.resource.id.slice(-6)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                      entry.outcome === "SUCCESS"
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {entry.outcome}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-gray-400">
                  {entry.ipAddress ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-500">
              Page {data.page} of {data.totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-white disabled:opacity-40"
              >
                Previous
              </button>
              <button
                onClick={() =>
                  setPage((p) => Math.min(data.totalPages, p + 1))
                }
                disabled={page === data.totalPages}
                className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-white disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
