"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../../lib/api-client";

const WARD_TYPES = [
  "General Ward",
  "ICU",
  "Cardiac Care",
  "Neonatal Care",
  "Pediatrics",
  "Orthopedics",
  "Surgery",
  "Oncology",
  "Psychiatry",
  "Emergency",
  "Isolation",
  "Burn Care",
];

export default function NewWardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    wardType: "",
    totalBeds: 10,
    isActive: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await api.post("/api/v1/wards", formData);
      router.push("/wards");
    } catch (err: any) {
      setError(err.message || "Failed to create ward");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Add Ward</h1>
        <p className="text-sm text-gray-500 mt-1">
          Create a new ward in the hospital system
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6 max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Ward Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ward Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Ward A, ICU North"
            />
          </div>

          {/* Ward Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ward Type *
            </label>
            <select
              required
              value={formData.wardType}
              onChange={(e) => setFormData({ ...formData, wardType: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select ward type</option>
              {WARD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* Total Beds */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Total Beds *
            </label>
            <input
              type="number"
              required
              min="1"
              max="1000"
              value={formData.totalBeds}
              onChange={(e) =>
                setFormData({ ...formData, totalBeds: parseInt(e.target.value, 10) || 0 })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Number of beds"
            />
          </div>

          {/* Active Status */}
          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) =>
                  setFormData({ ...formData, isActive: e.target.checked })
                }
                className="rounded"
              />
              <span className="text-sm font-medium text-gray-700">Active</span>
            </label>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Ward"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
