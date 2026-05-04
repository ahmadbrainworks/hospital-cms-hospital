"use client";

import {
  useState,
} from "react";
import useSWR from "swr";
import Link from "next/link";
import { api, ApiError } from "../../lib/api-client";
import type {
  ApiMeta,
  Patient,
  PaginatedResult,
} from "@hospital-cms/shared-types";
import { useAuth } from "../../lib/auth-context";
import { hasPermission } from "../../lib/permissions";
import { Permission } from "@hospital-cms/shared-types";

// PATIENT LISTING PAGE

interface PatientListData {
  items: Patient[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const fetcher = async (url: string): Promise<PatientListData> => {
  const res = await api.get<PaginatedResult<Patient> | Patient[]>(url);
  const payload = res.data;
  const meta = (res.meta ?? {}) as ApiMeta;

  const paginatedPayload = Array.isArray(payload) ? null : payload;
  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : [];

  const page = paginatedPayload?.page ?? meta.page ?? 1;
  const limit = paginatedPayload?.limit ?? meta.limit ?? 20;
  const total = paginatedPayload?.total ?? meta.total ?? items.length;
  const totalPages =
    paginatedPayload?.totalPages ??
    meta.totalPages ??
    Math.max(1, Math.ceil(total / Math.max(1, limit)));

  return { items, total, page, limit, totalPages };
};

export default function PatientsPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const canCreate = user
    ? hasPermission(user, Permission.PATIENT_CREATE)
    : false;

  const url = `/api/v1/patients?page=${page}&limit=20${
    debouncedSearch ? `&q=${encodeURIComponent(debouncedSearch)}` : ""
  }`;

  const { data, error, isLoading } = useSWR<PatientListData>(url, fetcher);
  const items = data?.items ?? [];
  const total = data?.total ?? items.length;
  const totalPages = data?.totalPages ?? 1;
  const currentPage = data?.page ?? page;

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setPage(1);
    const timer = setTimeout(() => setDebouncedSearch(val), 400);
    return () => clearTimeout(timer);
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Patients</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {data ? `${total} total patients` : "Loading..."}
          </p>
        </div>
        {canCreate && (
          <Link
            href="/patients/new"
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            + Register Patient
          </Link>
        )}
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="search"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search by name, phone, national ID..."
          className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">
                Patient #
              </th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">
                Name
              </th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">
                Date of Birth
              </th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">
                Phone
              </th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">
                Status
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  Loading patients...
                </td>
              </tr>
            )}
            {error && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center">
                  {error instanceof ApiError &&
                  (error.code === "LICENSE_EXPIRED" || error.code === "LICENSE_FEATURE_DISABLED") ? (
                    <div className="inline-flex flex-col items-center gap-2">
                      <span className="text-3xl">&#9888;</span>
                      <span className="font-semibold text-amber-800">License Required</span>
                      <span className="text-sm text-amber-700">
                        {error.code === "LICENSE_FEATURE_DISABLED"
                          ? "This feature is not available on your current license tier. Contact your vendor to upgrade."
                          : "Your license has expired or is not active. Contact your vendor to renew."}
                      </span>
                    </div>
                  ) : (
                    <span className="text-red-500">
                      Failed to load patients.{" "}
                      {error instanceof ApiError ? error.message : ""}
                    </span>
                  )}
                </td>
              </tr>
            )}
            {items.map((patient: Patient) => (
                <tr key={patient._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    {patient.patientNumber}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">
                      {patient.profile.lastName}, {patient.profile.firstName}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {new Date(patient.profile.dateOfBirth).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {patient.contactInfo.phone}
                  </td>
                  <td className="px-4 py-3">
                    <PatientStatusBadge status={patient.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/patients/${patient._id}`}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ),
            )}
            {items.length === 0 && !isLoading && !error && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  {search
                    ? "No patients found matching your search."
                    : "No patients registered yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-500">
              Page {currentPage} of {totalPages} ({total} results)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-white disabled:opacity-40"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
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

function PatientStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; class: string }> = {
    ACTIVE: { label: "Active", class: "bg-green-100 text-green-700" },
    INACTIVE: { label: "Inactive", class: "bg-gray-100 text-gray-600" },
    DECEASED: { label: "Deceased", class: "bg-red-100 text-red-700" },
    TRANSFERRED: {
      label: "Transferred",
      class: "bg-yellow-100 text-yellow-700",
    },
  };
  const cfg = config[status] ?? {
    label: status,
    class: "bg-gray-100 text-gray-600",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.class}`}
    >
      {cfg.label}
    </span>
  );
}
