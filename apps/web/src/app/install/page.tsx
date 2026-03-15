"use client";

import { useState } from "react";
import { StepConnectivity } from "../../components/installer/StepConnectivity";
import { StepActivation } from "../../components/installer/StepActivation";
import { StepHospitalProfile } from "../../components/installer/StepHospitalProfile";
import { StepAdminUser } from "../../components/installer/StepAdminUser";
import { StepFinalize } from "../../components/installer/StepFinalize";
import { StepSuccess } from "../../components/installer/StepSuccess";

// INSTALLER WIZARD PAGE
// 6-step installation flow. State is accumulated as the user
// progresses through steps and submitted in one final request.

export type InstallerStep =
  | "connectivity"
  | "activation"
  | "hospital"
  | "admin"
  | "finalize"
  | "success";

export interface InstallerFormData {
  mongoUri: string;
  redisUrl: string;
  // Vendor activation
  controlPanelUrl: string;
  registrationToken: string;
  // Hospital profile
  hospitalName: string;
  hospitalSlug: string;
  address: {
    line1: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
  };
  contact: {
    email: string;
    phone: string;
  };
  settings: {
    timezone: string;
    currency: string;
    dateFormat: string;
    defaultLanguage: string;
  };
  adminUser: {
    firstName: string;
    lastName: string;
    email: string;
    username: string;
    password: string;
    confirmPassword: string;
  };
}

const STEPS: InstallerStep[] = [
  "connectivity",
  "activation",
  "hospital",
  "admin",
  "finalize",
  "success",
];

const STEP_LABELS: Record<InstallerStep, string> = {
  connectivity: "Database",
  activation: "Activation",
  hospital: "Hospital Profile",
  admin: "Administrator",
  finalize: "Review & Install",
  success: "Complete",
};

const DEFAULT_CONTROL_PANEL_URL = process.env["NEXT_PUBLIC_CONTROL_PANEL_URL"] === undefined
  ? "http://localhost:4001"
  : process.env["NEXT_PUBLIC_CONTROL_PANEL_URL"];

export default function InstallerPage() {
  const [step, setStep] = useState<InstallerStep>("connectivity");
  const [formData, setFormData] = useState<Partial<InstallerFormData>>({
    mongoUri: "mongodb://localhost:27017/hospital_cms",
    redisUrl: "redis://localhost:6379",
    controlPanelUrl: DEFAULT_CONTROL_PANEL_URL,
    settings: {
      timezone: "UTC",
      currency: "USD",
      dateFormat: "MM/DD/YYYY",
      defaultLanguage: "en",
    },
  });
  const [instanceId, setInstanceId] = useState<string>("");

  const currentIndex = STEPS.indexOf(step);

  const updateData = (data: Partial<InstallerFormData>) => {
    setFormData((prev) => ({ ...prev, ...data }));
  };

  const goNext = () => {
    const next = STEPS[currentIndex + 1];
    if (next) setStep(next);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Hospital CMS</h1>
          <p className="text-gray-500 text-sm mt-1">Installation Wizard</p>
        </div>

        {/* Progress bar */}
        {step !== "success" && (
          <div className="mb-6">
            <div className="flex justify-between mb-2">
              {STEPS.filter((s) => s !== "success").map((s, i) => (
                <div
                  key={s}
                  className={`text-xs font-medium ${
                    i <= currentIndex ? "text-blue-600" : "text-gray-400"
                  }`}
                >
                  {STEP_LABELS[s]}
                </div>
              ))}
            </div>
            <div className="h-2 bg-gray-200 rounded-full">
              <div
                className="h-2 bg-blue-600 rounded-full transition-all duration-500"
                style={{
                  width: `${(currentIndex / (STEPS.length - 2)) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Step content */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {step === "connectivity" && (
            <StepConnectivity
              data={formData}
              onNext={(data) => {
                updateData(data);
                goNext();
              }}
            />
          )}
          {step === "activation" && (
            <StepActivation
              data={{ controlPanelUrl: formData.controlPanelUrl ?? "", registrationToken: formData.registrationToken ?? "" }}
              onNext={(data) => {
                updateData(data);
                goNext();
              }}
              onBack={() => setStep("connectivity")}
            />
          )}
          {step === "hospital" && (
            <StepHospitalProfile
              data={formData}
              onNext={(data) => {
                updateData(data);
                goNext();
              }}
              onBack={() => setStep("activation")}
            />
          )}
          {step === "admin" && (
            <StepAdminUser
              data={formData}
              onNext={(data) => {
                updateData(data);
                goNext();
              }}
              onBack={() => setStep("hospital")}
            />
          )}
          {step === "finalize" && (
            <StepFinalize
              data={formData as InstallerFormData}
              onSuccess={(id) => {
                setInstanceId(id);
                setStep("success");
              }}
              onBack={() => setStep("admin")}
            />
          )}
          {step === "success" && <StepSuccess instanceId={instanceId} />}
        </div>
      </div>
    </div>
  );
}
