/**
 * FHIR R4 resource builders.
 *
 * Produces FHIR-compliant JSON resources from internal domain objects.
 * Spec: https://www.hl7.org/fhir/R4/
 *
 * No external FHIR library dependency — lightweight, schema-only output.
 */
import type { Patient, Encounter } from "@hospital-cms/shared-types";
import { EncounterStatus } from "@hospital-cms/shared-types";

// ─── Primitive helpers ────────────────────────────────────────────────────────

function fhirDate(d: Date | string): string {
  return new Date(d).toISOString();
}

function genderMap(g: string): string {
  const m: Record<string, string> = {
    MALE: "male",
    FEMALE: "female",
    OTHER: "other",
    UNKNOWN: "unknown",
  };
  return m[g?.toUpperCase()] ?? "unknown";
}

// ─── Patient → FHIR Patient R4 ───────────────────────────────────────────────

export function buildFhirPatient(p: Patient, baseUrl: string): object {
  const name = [
    {
      use: "official",
      family: p.profile.lastName,
      given: [
        p.profile.firstName,
        ...(p.profile.middleName ? [p.profile.middleName] : []),
      ],
    },
  ];

  const identifier: object[] = [
    { system: `${baseUrl}/patient-number`, value: p.patientNumber },
    { system: `${baseUrl}/mrn`, value: p.mrn },
  ];

  if (p.profile.nationalId) {
    identifier.push({ system: "urn:oid:2.16.840.1.113883.4.1", value: p.profile.nationalId });
  }

  const telecom: object[] = [
    { system: "phone", value: p.contactInfo.phone, use: "home" },
  ];
  if (p.contactInfo.email) {
    telecom.push({ system: "email", value: p.contactInfo.email });
  }

  const address = {
    use: "home",
    line: [p.contactInfo.address.line1, p.contactInfo.address.line2].filter(Boolean),
    city: p.contactInfo.address.city,
    state: p.contactInfo.address.state,
    postalCode: p.contactInfo.address.postalCode,
    country: p.contactInfo.address.country,
  };

  const extension: object[] = [];
  if (p.medicalInfo.bloodGroup) {
    extension.push({
      url: `${baseUrl}/StructureDefinition/blood-group`,
      valueString: p.medicalInfo.bloodGroup,
    });
  }

  return {
    resourceType: "Patient",
    id: p._id,
    meta: {
      lastUpdated: fhirDate(p.updatedAt ?? p.createdAt),
      profile: ["http://hl7.org/fhir/StructureDefinition/Patient"],
    },
    ...(extension.length ? { extension } : {}),
    identifier,
    active: p.status === "ACTIVE",
    name,
    telecom,
    gender: genderMap(p.profile.gender),
    birthDate: new Date(p.profile.dateOfBirth).toISOString().split("T")[0],
    address: [address],
    ...(p.medicalInfo.allergies.length
      ? {
          // Allergies referenced as contained resources in a separate AllergyIntolerance bundle
          // Listed here as a note for completeness
        }
      : {}),
  };
}

// ─── Encounter → FHIR Encounter R4 ───────────────────────────────────────────

function encounterClassMap(type: string): object {
  const m: Record<string, { code: string; display: string }> = {
    INPATIENT: { code: "IMP", display: "inpatient encounter" },
    OUTPATIENT: { code: "AMB", display: "ambulatory" },
    EMERGENCY: { code: "EMER", display: "emergency" },
    DAY_SURGERY: { code: "SS", display: "short stay" },
    VIRTUAL: { code: "VR", display: "virtual" },
  };
  const v = m[type?.toUpperCase()] ?? { code: "AMB", display: "ambulatory" };
  return { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", ...v };
}

function encounterStatusMap(s: string): string {
  const m: Record<string, string> = {
    SCHEDULED: "planned",
    ADMITTED: "in-progress",
    DISCHARGED: "finished",
    CANCELLED: "cancelled",
    TRANSFERRED: "finished",
  };
  return m[s?.toUpperCase()] ?? "unknown";
}

export function buildFhirEncounter(enc: Encounter, baseUrl: string): object {
  const period: Record<string, string> = {
    start: fhirDate(enc.admittedAt),
  };
  if (enc.dischargedAt) {
    period["end"] = fhirDate(enc.dischargedAt);
  }

  const participants: object[] = [];
  if (enc.assignedDoctor) {
    participants.push({
      type: [
        {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/v3-ParticipationType",
              code: "ATND",
              display: "attender",
            },
          ],
        },
      ],
      individual: { reference: `Practitioner/${enc.assignedDoctor}` },
    });
  }

  const location: object[] = [];
  if (enc.ward) {
    location.push({
      location: { display: enc.bedNumber ? `${enc.ward} / Bed ${enc.bedNumber}` : enc.ward },
      status: (enc.status === EncounterStatus.DISCHARGED || enc.status === EncounterStatus.CANCELLED) ? "completed" : "active",
    });
  }

  return {
    resourceType: "Encounter",
    id: enc._id,
    meta: {
      lastUpdated: fhirDate(enc.updatedAt ?? enc.admittedAt),
      profile: ["http://hl7.org/fhir/StructureDefinition/Encounter"],
    },
    identifier: [{ system: `${baseUrl}/encounter-number`, value: enc.encounterNumber }],
    status: encounterStatusMap(enc.status),
    class: encounterClassMap(enc.type),
    subject: { reference: `Patient/${enc.patientId}` },
    period,
    ...(participants.length ? { participant: participants } : {}),
    ...(location.length ? { location } : {}),
    ...(enc.chiefComplaint
      ? { reasonCode: [{ text: enc.chiefComplaint }] }
      : {}),
  };
}

// ─── FHIR Bundle ─────────────────────────────────────────────────────────────

export function buildFhirBundle(
  entries: object[],
  bundleType: "collection" | "searchset" = "collection",
): object {
  return {
    resourceType: "Bundle",
    type: bundleType,
    total: entries.length,
    timestamp: new Date().toISOString(),
    entry: entries.map((resource) => ({ resource })),
  };
}
