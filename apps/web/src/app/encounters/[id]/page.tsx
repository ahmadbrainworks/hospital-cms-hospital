"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { api, ApiError } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import { hasPermission } from "../../../lib/permissions";
import {
  EncounterStatus,
  Permission,
  type Encounter,
  type Patient,
} from "@hospital-cms/shared-types";

const fetcher = (url: string): Promise<any> => api.get(url).then((r) => r.data);

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

export default function EncounterDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();

  const encounterId = useMemo(() => {
    const raw = params["id"];
    if (typeof raw === "string") return raw;
    if (Array.isArray(raw)) return raw[0] ?? "";
    return "";
  }, [params]);

  const canRead = user ? hasPermission(user, Permission.ENCOUNTER_READ) : false;
  const canUpdate = user
    ? hasPermission(user, Permission.ENCOUNTER_UPDATE)
    : false;

  const { data: encounter, error, mutate } = useSWR<Encounter>(
    canRead && encounterId ? `/api/v1/encounters/${encounterId}` : null,
    fetcher,
  );

  const { data: patient } = useSWR<Patient>(
    canRead && encounter?.patientId ? `/api/v1/patients/${encounter.patientId}` : null,
    fetcher,
  );

  const [status, setStatus] = useState<EncounterStatus>(EncounterStatus.REGISTERED);
  const [assignedDoctor, setAssignedDoctor] = useState("");
  const [assignedNurse, setAssignedNurse] = useState("");
  const [ward, setWard] = useState("");
  const [bedNumber, setBedNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  useEffect(() => {
    if (!encounter) return;
    setStatus(encounter.status);
    setAssignedDoctor(encounter.assignedDoctor ?? "");
    setAssignedNurse(encounter.assignedNurse ?? "");
    setWard(encounter.ward ?? "");
    setBedNumber(encounter.bedNumber ?? "");
    setNotes(encounter.notes ?? "");
  }, [encounter]);

  const handleSave = async () => {
    if (!encounter || !canUpdate) return;

    setSaveError("");
    setSaveSuccess("");

    const payload: Record<string, string> = {};
    if (status !== encounter.status) payload["status"] = status;
    if (assignedDoctor !== (encounter.assignedDoctor ?? "")) {
      payload["assignedDoctor"] = assignedDoctor;
    }
    if (assignedNurse !== (encounter.assignedNurse ?? "")) {
      payload["assignedNurse"] = assignedNurse;
    }
    if (ward !== (encounter.ward ?? "")) payload["ward"] = ward;
    if (bedNumber !== (encounter.bedNumber ?? "")) payload["bedNumber"] = bedNumber;
    if (notes !== (encounter.notes ?? "")) payload["notes"] = notes;

    if (Object.keys(payload).length === 0) {
      setSaveSuccess("No changes to save.");
      return;
    }

    setSaving(true);
    try {
      const res = await api.patch<Encounter>(
        `/api/v1/encounters/${encounter._id}`,
        payload,
      );
      await mutate(res.data, false);
      setSaveSuccess("Encounter updated successfully.");
    } catch (err) {
      if (err instanceof ApiError) {
        setSaveError(err.message);
      } else {
        setSaveError("Failed to update encounter.");
      }
    } finally {
      setSaving(false);
    }
  };

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

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
          Failed to load encounter.{" "}
          <button onClick={() => router.back()} className="underline">
            Go back
          </button>
        </div>
      </div>
    );
  }

  if (!encounter) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="text-sm text-gray-500 hover:text-gray-700 mb-2 flex items-center gap-1"
        >
          ← Back
        </button>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Encounter {encounter.encounterNumber}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Created {new Date(encounter.createdAt).toLocaleString()}
            </p>
          </div>
          <EncounterStatusBadge status={encounter.status} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <InfoCard title="Clinical Summary">
            <InfoRow label="Type" value={encounter.type} />
            <InfoRow
              label="Admitted At"
              value={new Date(encounter.admittedAt).toLocaleString()}
            />
            <InfoRow label="Chief Complaint" value={encounter.chiefComplaint} />
            {encounter.dischargedAt && (
              <InfoRow
                label="Discharged At"
                value={new Date(encounter.dischargedAt).toLocaleString()}
              />
            )}
          </InfoCard>

          <InfoCard title="Update Encounter">
            <div className="space-y-4">
              <Field label="Status">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as EncounterStatus)}
                  disabled={!canUpdate}
                  className={inputCls}
                >
                  {Object.values(EncounterStatus).map((encStatus) => (
                    <option key={encStatus} value={encStatus}>
                      {encStatus}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Assigned Doctor">
                  <input
                    value={assignedDoctor}
                    onChange={(e) => setAssignedDoctor(e.target.value)}
                    disabled={!canUpdate}
                    className={inputCls}
                  />
                </Field>
                <Field label="Assigned Nurse">
                  <input
                    value={assignedNurse}
                    onChange={(e) => setAssignedNurse(e.target.value)}
                    disabled={!canUpdate}
                    className={inputCls}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Ward">
                  <input
                    value={ward}
                    onChange={(e) => setWard(e.target.value)}
                    disabled={!canUpdate}
                    className={inputCls}
                  />
                </Field>
                <Field label="Bed Number">
                  <input
                    value={bedNumber}
                    onChange={(e) => setBedNumber(e.target.value)}
                    disabled={!canUpdate}
                    className={inputCls}
                  />
                </Field>
              </div>

              <Field label="Notes">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  disabled={!canUpdate}
                  className={inputCls}
                />
              </Field>
            </div>

            {saveError && (
              <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {saveError}
              </p>
            )}
            {saveSuccess && (
              <p className="mt-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                {saveSuccess}
              </p>
            )}

            {canUpdate && (
              <div className="mt-4">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            )}
          </InfoCard>
        </div>

        <div className="space-y-4">
          <InfoCard title="Patient">
            <InfoRow label="Patient ID" value={encounter.patientId} />
            {patient && (
              <>
                <InfoRow
                  label="Name"
                  value={`${patient.profile.lastName}, ${patient.profile.firstName}`}
                />
                <InfoRow label="Patient #" value={patient.patientNumber} />
              </>
            )}
            <Link
              href={`/patients/${encounter.patientId}`}
              className="inline-flex mt-3 text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              Open Patient Record
            </Link>
          </InfoCard>

          <InfoCard title="Metadata">
            <InfoRow label="Encounter ID" value={encounter._id} mono />
            <InfoRow label="Created By" value={encounter.createdBy} mono />
            {encounter.workflowRunId && (
              <InfoRow label="Workflow Run" value={encounter.workflowRunId} mono />
            )}
          </InfoCard>
        </div>
      </div>
    </div>
  );
}

function InfoCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-xs text-gray-400 w-24 shrink-0 pt-0.5">{label}</span>
      <span className={`${mono ? "font-mono text-xs" : "text-sm"} text-gray-900 flex-1`}>
        {value}
      </span>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500";
