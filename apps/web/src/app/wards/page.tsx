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

interface Ward {
  _id: string;
  name: string;
  wardType: string;
  totalBeds: number;
  occupiedBeds?: number;
  isActive: boolean;
}

export default function WardsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const canManage = user ? hasPermission(user, Permission.SYSTEM_SETTINGS_MANAGE) : false;

  const { data: response, error, isLoading, mutate } = useSWR(
    "/api/v1/wards",
    fetcher,
  );

  const wards: Ward[] = response?.items || [];

  const filteredWards = wards.filter((ward) =>
    ward.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ward.wardType?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/api/v1/wards/${id}`);
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
          You don't have permission to manage wards.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Wards</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage hospital wards and bed allocation
          </p>
        </div>
        <Link
          href="/wards/new"
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Add Ward
        </Link>
      </div>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search by name or type..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          Failed to load wards
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="text-center text-gray-500 py-8">Loading wards...</div>
      )}

      {/* Table */}
      {!isLoading && filteredWards.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">
                  Ward Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">
                  Ward Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">
                  Total Beds
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">
                  Occupied Beds
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
              {filteredWards.map((ward) => (
                <tr key={ward._id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {ward.name}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {ward.wardType || "—"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {ward.totalBeds}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {ward.occupiedBeds || 0}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        ward.isActive
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {ward.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-sm space-x-2">
                    <Link
                      href={`/wards/${ward._id}`}
                      className="text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Edit
                    </Link>
                    <button
                      onClick={() => {
                        setDeletingId(ward._id);
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
      {!isLoading && filteredWards.length === 0 && (
        <div className="text-center py-8 bg-white border border-gray-200 rounded-lg">
          <p className="text-gray-500">No wards found</p>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && deletingId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Delete Ward?
            </h3>
            <p className="text-gray-600 mb-6">
              This action cannot be undone. The ward will be removed from the system.
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
