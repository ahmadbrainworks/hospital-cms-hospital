"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "../../../lib/api-client";
import { Gender, BloodGroup } from "@hospital-cms/shared-types";

// PATIENT REGISTRATION PAGE

export default function NewPatientPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState<Gender>(Gender.MALE);
  const [nationalId, setNationalId] = useState("");
  const [phone, setPhone] = useState("");
  const [altPhone, setAltPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState({
    line1: "",
    city: "",
    state: "",
    country: "",
    postalCode: "",
  });
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyRelationship, setEmergencyRelationship] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [bloodGroup, setBloodGroup] = useState<BloodGroup | "">("");
  const [allergies, setAllergies] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const body: Record<string, unknown> = {
        profile: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          ...(middleName && { middleName: middleName.trim() }),
          dateOfBirth: dob,
          gender,
          ...(nationalId && { nationalId: nationalId.trim() }),
        },
        contactInfo: {
          phone: phone.trim(),
          ...(altPhone && { alternatePhone: altPhone.trim() }),
          ...(email && { email: email.trim() }),
          address,
        },
        ...(emergencyName && {
          emergencyContact: {
            name: emergencyName.trim(),
            relationship: emergencyRelationship.trim(),
            phone: emergencyPhone.trim(),
          },
        }),
        medicalInfo: {
          ...(bloodGroup && { bloodGroup }),
          allergies: allergies
            ? allergies
                .split(",")
                .map((a) => a.trim())
                .filter(Boolean)
            : [],
          chronicConditions: [],
          currentMedications: [],
        },
      };

      const res = await api.post<{ _id: string }>("/api/v1/patients", body);
      router.push(`/patients/${res.data._id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to register patient. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="text-sm text-gray-500 hover:text-gray-700 mb-2 flex items-center gap-1"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-gray-900">
          Register New Patient
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Personal Information */}
        <FormSection title="Personal Information">
          <div className="grid grid-cols-3 gap-4">
            <Field label="First Name" required>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                className={inputCls}
              />
            </Field>
            <Field label="Middle Name">
              <input
                value={middleName}
                onChange={(e) => setMiddleName(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Last Name" required>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                className={inputCls}
              />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Date of Birth" required>
              <input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                required
                className={inputCls}
              />
            </Field>
            <Field label="Gender" required>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as Gender)}
                className={inputCls}
              >
                {Object.values(Gender).map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="National ID">
              <input
                value={nationalId}
                onChange={(e) => setNationalId(e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>
        </FormSection>

        {/* Contact Information */}
        <FormSection title="Contact Information">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Phone" required>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className={inputCls}
              />
            </Field>
            <Field label="Alternate Phone">
              <input
                type="tel"
                value={altPhone}
                onChange={(e) => setAltPhone(e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Email Address">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
            />
          </Field>

          <Field label="Street Address" required>
            <input
              value={address.line1}
              onChange={(e) =>
                setAddress((a) => ({ ...a, line1: e.target.value }))
              }
              required
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="City" required>
              <input
                value={address.city}
                onChange={(e) =>
                  setAddress((a) => ({ ...a, city: e.target.value }))
                }
                required
                className={inputCls}
              />
            </Field>
            <Field label="State">
              <input
                value={address.state}
                onChange={(e) =>
                  setAddress((a) => ({ ...a, state: e.target.value }))
                }
                className={inputCls}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Country" required>
              <input
                value={address.country}
                onChange={(e) =>
                  setAddress((a) => ({ ...a, country: e.target.value }))
                }
                required
                className={inputCls}
              />
            </Field>
            <Field label="Postal Code">
              <input
                value={address.postalCode}
                onChange={(e) =>
                  setAddress((a) => ({ ...a, postalCode: e.target.value }))
                }
                className={inputCls}
              />
            </Field>
          </div>
        </FormSection>

        {/* Emergency Contact */}
        <FormSection title="Emergency Contact (Optional)">
          <div className="grid grid-cols-3 gap-4">
            <Field label="Name">
              <input
                value={emergencyName}
                onChange={(e) => setEmergencyName(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Relationship">
              <input
                value={emergencyRelationship}
                onChange={(e) => setEmergencyRelationship(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Phone">
              <input
                type="tel"
                value={emergencyPhone}
                onChange={(e) => setEmergencyPhone(e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>
        </FormSection>

        {/* Medical Info */}
        <FormSection title="Medical Information (Optional)">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Blood Group">
              <select
                value={bloodGroup}
                onChange={(e) => setBloodGroup(e.target.value as BloodGroup)}
                className={inputCls}
              >
                <option value="">Unknown</option>
                {Object.values(BloodGroup).map((bg) => (
                  <option key={bg} value={bg}>
                    {bg}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Allergies" hint="Comma-separated list">
            <input
              value={allergies}
              onChange={(e) => setAllergies(e.target.value)}
              placeholder="Penicillin, Latex, Peanuts"
              className={inputCls}
            />
          </Field>
        </FormSection>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 px-4 py-2.5 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Registering..." : "Register Patient"}
          </button>
        </div>
      </form>
    </div>
  );
}

function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
      <h2 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-2">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
  required,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

const inputCls =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
