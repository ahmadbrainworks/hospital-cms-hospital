"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { api, ApiError } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import { hasPermission } from "../../../lib/permissions";
import {
  EncounterType,
  Permission,
  type Doctor,
  type Patient,
  type Ward,
} from "@hospital-cms/shared-types";

interface PaginatedLike<T> {
  items: T[];
}

interface WardBedAvailability {
  ward: {
    _id: string;
    name: string;
    bedStart: number;
    bedEnd: number;
  };
  beds: Array<{
    bedNumber: number;
    isAvailable: boolean;
  }>;
}

function extractItems<T>(payload: T[] | PaginatedLike<T> | unknown): T[] {
  if (Array.isArray(payload)) return payload;
  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as PaginatedLike<T>).items)
  ) {
    return (payload as PaginatedLike<T>).items;
  }
  return [];
}

export default function NewEncounterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const canCreate = user
    ? hasPermission(user, Permission.ENCOUNTER_CREATE)
    : false;

  const [patientQuery, setPatientQuery] = useState(
    searchParams.get("patientId") ?? "",
  );
  const [patientId, setPatientId] = useState(searchParams.get("patientId") ?? "");
  const [showPatientSuggestions, setShowPatientSuggestions] = useState(false);
  const [debouncedPatientQuery, setDebouncedPatientQuery] = useState("");

  const [type, setType] = useState<EncounterType>(EncounterType.OPD);
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [assignedDoctor, setAssignedDoctor] = useState("");
  const [wardId, setWardId] = useState("");
  const [bedNumber, setBedNumber] = useState("");
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const queryPatientId = searchParams.get("patientId") ?? "";
    if (queryPatientId) {
      setPatientId(queryPatientId);
      setPatientQuery(queryPatientId);
    }
  }, [searchParams]);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedPatientQuery(patientQuery.trim()),
      250,
    );
    return () => window.clearTimeout(timer);
  }, [patientQuery]);

  const patientSearchUrl = debouncedPatientQuery
    ? `/api/v1/patients?q=${encodeURIComponent(debouncedPatientQuery)}&limit=8`
    : null;

  const { data: patientSuggestions = [] } = useSWR<Patient[]>(
    patientSearchUrl,
    async (url: string) => {
      const res = await api.get<Patient[] | PaginatedLike<Patient>>(url);
      return extractItems<Patient>(res.data);
    },
  );

  const { data: doctors = [] } = useSWR<Doctor[]>(
    "/api/v1/doctors?activeOnly=true&limit=200",
    async (url: string) => {
      const res = await api.get<Doctor[] | PaginatedLike<Doctor>>(url);
      return extractItems<Doctor>(res.data);
    },
  );

  const { data: wards = [] } = useSWR<Ward[]>(
    "/api/v1/wards?activeOnly=true&limit=100",
    async (url: string) => {
      const res = await api.get<Ward[] | PaginatedLike<Ward>>(url);
      return extractItems<Ward>(res.data);
    },
  );

  const selectedWard = useMemo(
    () => wards.find((w) => w._id === wardId),
    [wardId, wards],
  );

  const { data: wardBedsData } = useSWR<WardBedAvailability>(
    selectedWard ? `/api/v1/wards/${selectedWard._id}/beds` : null,
    async (url: string) => {
      const res = await api.get<WardBedAvailability>(url);
      return res.data;
    },
  );

  const availableBeds = useMemo(
    () => (wardBedsData?.beds ?? []).filter((bed) => bed.isAvailable),
    [wardBedsData],
  );

  useEffect(() => {
    setBedNumber("");
  }, [wardId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const resolvedPatientId = patientId.trim() || patientQuery.trim();
      const body: Record<string, string> = {
        patientId: resolvedPatientId,
        type,
        chiefComplaint: chiefComplaint.trim(),
      };
      if (assignedDoctor.trim()) body["assignedDoctor"] = assignedDoctor.trim();
      if (selectedWard?.name) body["ward"] = selectedWard.name;
      if (bedNumber.trim()) body["bedNumber"] = bedNumber.trim();
      if (notes.trim()) body["notes"] = notes.trim();

      const res = await api.post<{ _id: string }>("/api/v1/encounters", body);
      router.push(`/encounters/${res.data._id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to create encounter. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (!canCreate) {
    return (
      <div className="p-6">
        <div className="max-w-lg mx-auto mt-16 text-center bg-amber-50 border border-amber-200 rounded-xl p-8">
          <h2 className="text-lg font-semibold text-amber-800">Access Denied</h2>
          <p className="text-sm text-amber-700 mt-2">
            You do not have permission to create encounters.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="text-sm text-gray-500 hover:text-gray-700 mb-2 flex items-center gap-1"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Create Encounter</h1>
        <p className="text-sm text-gray-500 mt-1">
          Open a new encounter for a patient and assign clinical details.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Encounter Details
          </h2>

          <Field label="Patient (ID or Name)" required>
            <div className="relative">
              <input
                value={patientQuery}
                onChange={(e) => {
                  setPatientQuery(e.target.value);
                  setPatientId("");
                  setShowPatientSuggestions(true);
                }}
                onFocus={() => setShowPatientSuggestions(true)}
                onBlur={() =>
                  window.setTimeout(() => setShowPatientSuggestions(false), 120)
                }
                required
                placeholder="Type patient ID, number, MRN, or name"
                className={inputCls}
              />
              {showPatientSuggestions &&
                debouncedPatientQuery &&
                patientSuggestions.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-64 overflow-y-auto">
                    {patientSuggestions.map((patient) => (
                      <button
                        key={patient._id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setPatientId(patient._id);
                          setPatientQuery(
                            `${patient.patientNumber} — ${patient.profile.lastName}, ${patient.profile.firstName}`,
                          );
                          setShowPatientSuggestions(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b last:border-b-0 border-gray-100"
                      >
                        <p className="text-sm text-gray-900">
                          {patient.profile.lastName}, {patient.profile.firstName}
                        </p>
                        <p className="text-xs text-gray-500">
                          {patient.patientNumber} • {patient.mrn} • {patient.contactInfo.phone}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
            </div>
            {patientId && (
              <p className="text-xs text-green-700 mt-1">
                Selected patient ID: {patientId}
              </p>
            )}
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Encounter Type" required>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as EncounterType)}
                className={inputCls}
              >
                {Object.values(EncounterType).map((encType) => (
                  <option key={encType} value={encType}>
                    {encType}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Assigned Doctor">
              <select
                value={assignedDoctor}
                onChange={(e) => setAssignedDoctor(e.target.value)}
                className={inputCls}
              >
                <option value="">Unassigned</option>
                {doctors.map((doctor) => (
                  <option key={doctor._id} value={doctor._id}>
                    Dr. {doctor.lastName}, {doctor.firstName}
                    {doctor.specialization ? ` (${doctor.specialization})` : ""}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Chief Complaint" required>
            <textarea
              value={chiefComplaint}
              onChange={(e) => setChiefComplaint(e.target.value)}
              required
              rows={4}
              placeholder="Primary reason for this encounter"
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Ward">
              <select
                value={wardId}
                onChange={(e) => setWardId(e.target.value)}
                className={inputCls}
              >
                <option value="">No ward selected</option>
                {wards.map((ward) => (
                  <option key={ward._id} value={ward._id}>
                    {ward.name} (Beds {ward.bedStart}-{ward.bedEnd})
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Bed Number">
              <select
                value={bedNumber}
                onChange={(e) => setBedNumber(e.target.value)}
                disabled={!selectedWard}
                className={inputCls}
              >
                <option value="">
                  {selectedWard ? "No bed selected" : "Select ward first"}
                </option>
                {availableBeds.map((bed) => (
                  <option key={bed.bedNumber} value={String(bed.bedNumber)}>
                    Bed {bed.bedNumber}
                  </option>
                ))}
              </select>
              {selectedWard && wardBedsData && (
                <p className="text-xs text-gray-500 mt-1">
                  {availableBeds.length} of {wardBedsData.beds.length} beds available
                </p>
              )}
            </Field>
          </div>

          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Optional encounter notes"
              className={inputCls}
            />
          </Field>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Creating..." : "Create Encounter"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/encounters")}
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-gray-600">
        {label}
        {required ? " *" : ""}
      </span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
