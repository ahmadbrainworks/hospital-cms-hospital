"use client";

import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import { api } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import { hasPermission } from "../../../lib/permissions";
import { Permission } from "@hospital-cms/shared-types";
import type { Patient, Encounter, Invoice } from "@hospital-cms/shared-types";
import Link from "next/link";

// PATIENT DETAIL PAGE

const fetcher = (url: string): Promise<any> => api.get(url).then((r) => r.data);

export default function PatientDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const router = useRouter();

  const { data: patient, error } = useSWR<Patient>(
    id ? `/api/v1/patients/${id}` : null,
    fetcher,
  );

  const { data: encountersData } = useSWR<{ items: Encounter[] }>(
    id ? `/api/v1/encounters?patientId=${id}&limit=10` : null,
    fetcher,
  );
  const encounters = Array.isArray(encountersData?.items)
    ? encountersData.items
    : [];

  const { data: invoicesData } = useSWR<{ items: Invoice[] }>(
    id && user && hasPermission(user, Permission.BILLING_READ)
      ? `/api/v1/billing/invoices?patientId=${id}&limit=10`
      : null,
    fetcher,
  );

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
          Failed to load patient.{" "}
          <button onClick={() => router.back()} className="underline">
            Go back
          </button>
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  const fullName = `${patient.profile.lastName}, ${patient.profile.firstName}${
    patient.profile.middleName ? " " + patient.profile.middleName : ""
  }`;

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <button
            onClick={() => router.back()}
            className="text-sm text-gray-500 hover:text-gray-700 mb-2 flex items-center gap-1"
          >
            ← Patients
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{fullName}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="font-mono text-sm text-gray-500">
              {patient.patientNumber}
            </span>
            <span className="text-gray-300">•</span>
            <span className="font-mono text-sm text-gray-500">
              {patient.mrn}
            </span>
            <span className="text-gray-300">•</span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                patient.status === "ACTIVE"
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {patient.status}
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <Link
            href={`/encounters/new?patientId=${id}`}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            New Encounter
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Personal Info */}
        <div className="col-span-2 space-y-4">
          <InfoCard title="Personal Information">
            <InfoRow label="Full Name" value={fullName} />
            <InfoRow
              label="Date of Birth"
              value={new Date(patient.profile.dateOfBirth).toLocaleDateString()}
            />
            <InfoRow label="Gender" value={patient.profile.gender} />
            {patient.profile.nationalId && (
              <InfoRow label="National ID" value={patient.profile.nationalId} />
            )}
          </InfoCard>

          <InfoCard title="Contact Information">
            <InfoRow label="Phone" value={patient.contactInfo.phone} />
            {patient.contactInfo.alternatePhone && (
              <InfoRow
                label="Alternate Phone"
                value={patient.contactInfo.alternatePhone}
              />
            )}
            {patient.contactInfo.email && (
              <InfoRow label="Email" value={patient.contactInfo.email} />
            )}
            <InfoRow
              label="Address"
              value={[
                patient.contactInfo.address.line1,
                patient.contactInfo.address.city,
                patient.contactInfo.address.state,
                patient.contactInfo.address.country,
              ]
                .filter(Boolean)
                .join(", ")}
            />
          </InfoCard>

          {/* Encounters */}
          <InfoCard title="Recent Encounters">
            {!encounters.length ? (
              <p className="text-sm text-gray-400">No encounters found.</p>
            ) : (
              <div className="space-y-2">
                {encounters.map((enc) => (
                  <Link
                    key={enc._id}
                    href={`/encounters/${enc._id}`}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-blue-50 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {enc.encounterNumber} — {enc.type}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(enc.admittedAt).toLocaleDateString()} •{" "}
                        {enc.chiefComplaint}
                      </p>
                    </div>
                    <EncounterStatusBadge status={enc.status} />
                  </Link>
                ))}
              </div>
            )}
          </InfoCard>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Medical Info */}
          <InfoCard title="Medical Info">
            <InfoRow
              label="Blood Group"
              value={patient.medicalInfo.bloodGroup ?? "Unknown"}
            />
            <InfoRow
              label="Allergies"
              value={
                patient.medicalInfo.allergies.length
                  ? patient.medicalInfo.allergies.join(", ")
                  : "None"
              }
            />
            {patient.medicalInfo.chronicConditions.length > 0 && (
              <InfoRow
                label="Chronic"
                value={patient.medicalInfo.chronicConditions.join(", ")}
              />
            )}
          </InfoCard>

          {/* Emergency Contact */}
          {patient.emergencyContact && (
            <InfoCard title="Emergency Contact">
              <InfoRow label="Name" value={patient.emergencyContact.name} />
              <InfoRow
                label="Relationship"
                value={patient.emergencyContact.relationship}
              />
              <InfoRow label="Phone" value={patient.emergencyContact.phone} />
            </InfoCard>
          )}

          {/* Insurance */}
          {patient.insurance && patient.insurance.length > 0 && (
            <InfoCard title="Insurance">
              {patient.insurance.map((ins, i) => (
                <div key={i} className="mb-2 last:mb-0">
                  <p className="text-sm font-medium text-gray-900">
                    {ins.provider}
                    {ins.isPrimary && (
                      <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                        Primary
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">
                    Policy: {ins.policyNumber}
                  </p>
                </div>
              ))}
            </InfoCard>
          )}
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-xs text-gray-400 w-24 shrink-0 pt-0.5">
        {label}
      </span>
      <span className="text-sm text-gray-900 flex-1">{value}</span>
    </div>
  );
}

function EncounterStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    REGISTERED: "bg-blue-100 text-blue-700",
    WITH_DOCTOR: "bg-purple-100 text-purple-700",
    DISCHARGED: "bg-gray-100 text-gray-600",
    BILLING: "bg-orange-100 text-orange-700",
    CANCELLED: "bg-red-100 text-red-700",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        colors[status] ?? "bg-gray-100 text-gray-600"
      }`}
    >
      {status}
    </span>
  );
}
