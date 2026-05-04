"use client";

import { useState } from "react";
import type { InstallerFormData } from "../../app/install/page";

interface Props {
  data: Partial<InstallerFormData>;
  onNext: (data: Partial<InstallerFormData>) => void;
  onBack: () => void;
}

export function StepHospitalProfile({ data, onNext, onBack }: Props) {
  const [name, setName] = useState(data.hospitalName ?? "");
  const [slug, setSlug] = useState(data.hospitalSlug ?? "");
  const [email, setEmail] = useState(data.contact?.email ?? "");
  const [phone, setPhone] = useState(data.contact?.phone ?? "");
  const [line1, setLine1] = useState(data.address?.line1 ?? "");
  const [city, setCity] = useState(data.address?.city ?? "");
  const [state, setState] = useState(data.address?.state ?? "");
  const [country, setCountry] = useState(data.address?.country ?? "");
  const [postalCode, setPostalCode] = useState(data.address?.postalCode ?? "");
  const [timezone, setTimezone] = useState(data.settings?.timezone ?? "Africa/Lagos");
  const [currency, setCurrency] = useState(data.settings?.currency ?? "NGN");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!name.trim()) e["name"] = "Hospital name is required";
    if (!slug.trim() || !/^[a-z0-9-]+$/.test(slug))
      e["slug"] = "Slug must be lowercase letters, numbers, and hyphens only";
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      e["email"] = "Valid email is required";
    if (!phone.trim()) e["phone"] = "Phone is required";
    if (!line1.trim()) e["line1"] = "Address is required";
    if (!city.trim()) e["city"] = "City is required";
    if (!country.trim()) e["country"] = "Country is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => {
    if (!validate()) return;
    onNext({
      hospitalName: name,
      hospitalSlug: slug,
      contact: { email, phone },
      address: { line1, city, state, country, postalCode },
      settings: {
        timezone,
        currency,
        dateFormat: "MM/DD/YYYY",
        defaultLanguage: "en",
      },
    });
  };

  const generateSlug = (n: string) =>
    n
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-1">
        Hospital Profile
      </h2>
      <p className="text-sm text-gray-500 mb-6">
        Basic information about your hospital that will be displayed throughout
        the system.
      </p>

      <div className="space-y-4">
        <FormField label="Hospital Name" error={errors["name"]}>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slug) setSlug(generateSlug(e.target.value));
            }}
            placeholder="General Hospital"
            className={inputClass(!!errors["name"])}
          />
        </FormField>

        <FormField
          label="URL Slug"
          error={errors["slug"]}
          hint="Unique identifier for this installation"
        >
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(generateSlug(e.target.value))}
            placeholder="general-hospital"
            className={inputClass(!!errors["slug"])}
          />
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Contact Email" error={errors["email"]}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass(!!errors["email"])}
            />
          </FormField>
          <FormField label="Phone" error={errors["phone"]}>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass(!!errors["phone"])}
            />
          </FormField>
        </div>

        <FormField label="Street Address" error={errors["line1"]}>
          <input
            type="text"
            value={line1}
            onChange={(e) => setLine1(e.target.value)}
            className={inputClass(!!errors["line1"])}
          />
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="City" error={errors["city"]}>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className={inputClass(!!errors["city"])}
            />
          </FormField>
          <FormField label="State / Province">
            <input
              type="text"
              value={state}
              onChange={(e) => setState(e.target.value)}
              className={inputClass(false)}
            />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Country" error={errors["country"]}>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className={inputClass(!!errors["country"])}
            />
          </FormField>
          <FormField label="Postal Code">
            <input
              type="text"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              className={inputClass(false)}
            />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Timezone">
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className={inputClass(false)}
            >
              <option value="Africa/Lagos">Africa/Lagos</option>
              <option value="UTC">UTC</option>
              <option value="America/New_York">America/New_York</option>
              <option value="America/Chicago">America/Chicago</option>
              <option value="America/Los_Angeles">America/Los_Angeles</option>
              <option value="Europe/London">Europe/London</option>
              <option value="Asia/Dubai">Asia/Dubai</option>
              <option value="Asia/Karachi">Asia/Karachi</option>
              <option value="Asia/Kolkata">Asia/Kolkata</option>
            </select>
          </FormField>
          <FormField label="Currency">
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={inputClass(false)}
            >
              <option value="NGN">NGN — Nigerian Naira</option>
              <option value="USD">USD — US Dollar</option>
              <option value="EUR">EUR — Euro</option>
              <option value="GBP">GBP — British Pound</option>
              <option value="PKR">PKR — Pakistani Rupee</option>
              <option value="INR">INR — Indian Rupee</option>
              <option value="KES">KES — Kenyan Shilling</option>
            </select>
          </FormField>
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button
          onClick={onBack}
          className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50"
        >
          Back
        </button>
        <button
          onClick={handleNext}
          className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function FormField({
  label,
  children,
  error,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  error?: string | undefined;
  hint?: string | undefined;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function inputClass(hasError: boolean): string {
  return `w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
    hasError ? "border-red-300 focus:ring-red-500" : "border-gray-300"
  }`;
}
