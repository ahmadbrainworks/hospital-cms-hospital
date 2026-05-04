"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { api } from "../../../lib/api-client";
import useSWR from "swr";

const GENDERS = ["Male", "Female", "Other"];
const QUALIFICATIONS = [
  "MD (Doctor of Medicine)",
  "DO (Doctor of Osteopathic Medicine)",
  "DDS (Doctor of Dental Surgery)",
  "DMD (Doctor of Medicine in Dentistry)",
  "PhD",
  "Board Certified",
];
const SPECIALIZATIONS = [
  "General Practice",
  "Cardiology",
  "Neurology",
  "Oncology",
  "Orthopedics",
  "Pediatrics",
  "Psychiatry",
  "Surgery",
  "Gastroenterology",
  "Pulmonology",
  "Nephrology",
  "Endocrinology",
  "Rheumatology",
  "Emergency Medicine",
  "Radiology",
  "Pathology",
];

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function EditDoctorPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const { data: doctor, isLoading } = useSWR(
    id ? `/api/v1/doctors/${id}` : null,
    fetcher,
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    gender: "Male",
    qualifications: [] as string[],
    specialization: "",
    licenseNumber: "",
    email: "",
    phone: "",
    photoUrl: "",
    isActive: true,
  });

  useEffect(() => {
    if (doctor) {
      setFormData({
        name: doctor.name || "",
        gender: doctor.gender || "Male",
        qualifications: doctor.qualifications || [],
        specialization: doctor.specialization || "",
        licenseNumber: doctor.licenseNumber || "",
        email: doctor.email || "",
        phone: doctor.phone || "",
        photoUrl: doctor.photoUrl || "",
        isActive: doctor.isActive !== false,
      });
    }
  }, [doctor]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await api.put(`/api/v1/doctors/${id}`, formData);
      router.push("/doctors");
    } catch (err: any) {
      setError(err.message || "Failed to update doctor");
    } finally {
      setLoading(false);
    }
  };

  const toggleQualification = (qual: string) => {
    setFormData((prev) => ({
      ...prev,
      qualifications: prev.qualifications.includes(qual)
        ? prev.qualifications.filter((q) => q !== qual)
        : [...prev.qualifications, qual],
    }));
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="text-center text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6 animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Edit Doctor</h1>
        <p className="text-sm text-gray-500 mt-1">Update doctor information</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6 max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Dr. John Doe"
            />
          </div>

          {/* Gender */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Gender
            </label>
            <select
              value={formData.gender}
              onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {GENDERS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          {/* Specialization */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Specialization
            </label>
            <select
              value={formData.specialization}
              onChange={(e) =>
                setFormData({ ...formData, specialization: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select specialization</option>
              {SPECIALIZATIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Qualifications */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Qualifications
            </label>
            <div className="grid grid-cols-2 gap-3">
              {QUALIFICATIONS.map((qual) => (
                <label key={qual} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.qualifications.includes(qual)}
                    onChange={() => toggleQualification(qual)}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">{qual}</span>
                </label>
              ))}
            </div>
          </div>

          {/* License Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              License Number
            </label>
            <input
              type="text"
              value={formData.licenseNumber}
              onChange={(e) =>
                setFormData({ ...formData, licenseNumber: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="LIC123456"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="doctor@hospital.com"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="+1 (555) 123-4567"
            />
          </div>

          {/* Photo URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Photo URL
            </label>
            <input
              type="url"
              value={formData.photoUrl}
              onChange={(e) => setFormData({ ...formData, photoUrl: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="https://..."
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
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
