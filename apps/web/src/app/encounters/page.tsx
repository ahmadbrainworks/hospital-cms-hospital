"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { api, ApiError } from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";
import { hasPermission } from "../../lib/permissions";
import {
  EncounterStatus,
  Permission,
  type ApiMeta,
  type Encounter,
  type PaginatedResult,
} from "@hospital-cms/shared-types";

interface EncounterListData {
  items: Encounter[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

function toPositiveInt(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

function toNonNegativeInt(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

const fetcher = async (url: string): Promise<EncounterListData> => {
  const res = await api.get<PaginatedResult<Encounter> | Encounter[]>(url);
  const payload = res.data;
  const meta = (res.meta ?? {}) as ApiMeta;

  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : [];

  const page = toPositiveInt(
    Array.isArray(payload) ? meta.page : payload?.page ?? meta.page,
    1,
  );
  const limit = toPositiveInt(
    Array.isArray(payload) ? meta.limit : payload?.limit ?? meta.limit,
    20,
  );
  const total = toNonNegativeInt(
    Array.isArray(payload) ? meta.total : payload?.total ?? meta.total,
    items.length,
  );
  const totalPages = toPositiveInt(
    Array.isArray(payload)
      ? meta.totalPages
      : payload?.totalPages ?? meta.totalPages,
    Math.max(1, Math.ceil(total / Math.max(1, limit))),
  );

  return { items, page, limit, total, totalPages };
};

function EncounterStatusBadge({ status }: { status: EncounterStatus }) {
  const colors: Record<EncounterStatus, string> = {
    REGISTERED: "bg-blue-100 text-blue-700",
    TRIAGE: "bg-indigo-100 text-indigo-700",
    WAITING: "bg-yellow-100 text-yellow-700",
    WITH_DOCTOR: "bg-purple-100 text-purple-700",
    PENDING_LAB: "bg-cyan-100 text-cyan-700",
    PENDING_PHARMACY: "bg-pink-100 text-pink-700",
    BILLING: "bg-orange-100 text-orange-700",
    DISCHARGED: "bg-gray-100 text-gray-700",
    CANCELLED: "bg-red-100 text-red-700",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[status]}`}
    >
      {status}
    </span>
  );
}

export default function EncountersPage() {
  const { user } = useAuth();
  const canRead = user ? hasPermission(user, Permission.ENCOUNTER_READ) : false;
  const canCreate = user
    ? hasPermission(user, Permission.ENCOUNTER_CREATE)
    : false;

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<EncounterStatus | "">("");
  const [patientId, setPatientId] = useState("");

  const params = new URLSearchParams({
    page: String(page),
    limit: "20",
  });
  if (status) params.set("status", status);
  if (patientId.trim()) params.set("patientId", patientId.trim());

  const { data, isLoading, error } = useSWR<EncounterListData>(
    canRead ? `/api/v1/encounters?${params.toString()}` : null,
    fetcher,
  );

  const isLicenseError =
    error instanceof ApiError &&
    (error.code === "LICENSE_EXPIRED" || error.code === "LICENSE_FEATURE_DISABLED");

  if (!canRead) {
    return (
      <div className="p-6">
        <div className="max-w-lg mx-auto mt-16 text-center bg-amber-50 border border-amber-200 rounded-xl p-8">
          <h2 className="text-lg font-semibold text-amber-800">Access Denied</h2>
          <p className="text-sm text-amber-700 mt-2">
            You do not have permission to view encounters.
          </p>
        </div>
      </div>
    );
  }

  if (isLicenseError) {
    return (
      <div className="p-6">
        <div className="max-w-lg mx-auto mt-16 text-center">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-8">
            <p className="text-4xl mb-3">&#9888;</p>
            <h2 className="text-lg font-semibold text-amber-800">License Required</h2>
            <p className="text-sm text-amber-700 mt-2">
              {error.code === "LICENSE_FEATURE_DISABLED"
                ? "Encounters are not available on your current license tier. Contact your vendor to upgrade."
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
            <h2 className="text-lg font-semibold text-red-800">Failed to load encounters</h2>
            <p className="text-sm text-red-600 mt-2">
              {error instanceof ApiError ? error.message : "An unexpected error occurred."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const encounters = data?.items ?? [];
  const total = data?.total ?? encounters.length;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Encounters</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} total encounters</p>
        </div>
        {canCreate && (
          <Link
            href="/encounters/new"
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            + New Encounter
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as EncounterStatus | "");
            setPage(1);
          }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All statuses</option>
          {Object.values(EncounterStatus).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <input
          value={patientId}
          onChange={(e) => {
            setPatientId(e.target.value);
            setPage(1);
          }}
          placeholder="Filter by patient ID"
          className="w-full sm:w-72 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Encounter #
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Patient ID
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Type
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Status
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Admitted
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Complaint
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  Loading encounters...
                </td>
              </tr>
            )}

            {!isLoading &&
              encounters.map((encounter) => (
                <tr key={encounter._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">
                    {encounter.encounterNumber}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    {encounter.patientId}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{encounter.type}</td>
                  <td className="px-4 py-3">
                    <EncounterStatusBadge status={encounter.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {new Date(encounter.admittedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-sm">
                    <p className="truncate">{encounter.chiefComplaint}</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/encounters/${encounter._id}`}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}

            {!isLoading && encounters.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  No encounters found.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-500">
              Page {data?.page ?? 1} of {totalPages} ({total} results)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={(data?.page ?? 1) === 1}
                className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-white disabled:opacity-40"
              >
                Previous
              </button>
              <button
                onClick={() =>
                  setPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={(data?.page ?? 1) >= totalPages}
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
