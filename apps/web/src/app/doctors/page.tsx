"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { api } from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";
import { hasPermission } from "../../lib/permissions";
import { Permission } from "@hospital-cms/shared-types";

const fetcher = (url: string) => api.get(url).then((r) => r.data);

interface Doctor {
  _id: string;
  name: string;
  gender: string;
  qualifications: string[];
  specialization?: string;
  licenseNumber?: string;
  isActive: boolean;
}

export default function DoctorsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const canManage = user ? hasPermission(user, Permission.SYSTEM_SETTINGS_MANAGE) : false;

  const { data: response, error, isLoading, mutate } = useSWR(
    "/api/v1/doctors",
    fetcher,
  );

  const doctors: Doctor[] = response?.items || [];

  const filteredDoctors = doctors.filter((doctor) =>
    doctor.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doctor.specialization?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/api/v1/doctors/${id}`);
      await mutate();
      setShowDeleteConfirm(false);
      setDeletingId(null);
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  if (!canManage) {
    return (
      <div className="p-6">
        <div className="text-center text-gray-500">
          You don't have permission to manage doctors.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Doctors</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage hospital doctors and medical staff
          </p>
        </div>
        <Link
          href="/doctors/new"
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Add Doctor
        </Link>
      </div>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search by name or specialization..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          Failed to load doctors
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="text-center text-gray-500 py-8">Loading doctors...</div>
      )}

      {/* Table */}
      {!isLoading && filteredDoctors.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">
                  Specialization
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">
                  Qualifications
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">
                  License
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredDoctors.map((doctor) => (
                <tr key={doctor._id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {doctor.name}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {doctor.specialization || "—"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {doctor.qualifications.join(", ") || "—"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {doctor.licenseNumber || "—"}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        doctor.isActive
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {doctor.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-sm space-x-2">
                    <Link
                      href={`/doctors/${doctor._id}`}
                      className="text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Edit
                    </Link>
                    <button
                      onClick={() => {
                        setDeletingId(doctor._id);
                        setShowDeleteConfirm(true);
                      }}
                      className="text-red-600 hover:text-red-700 font-medium"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredDoctors.length === 0 && (
        <div className="text-center py-8 bg-white border border-gray-200 rounded-lg">
          <p className="text-gray-500">No doctors found</p>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && deletingId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Delete Doctor?
            </h3>
            <p className="text-gray-600 mb-6">
              This action cannot be undone. The doctor will be removed from the system.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deletingId)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
