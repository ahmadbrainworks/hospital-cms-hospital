"use client";

import { useState } from "react";

export interface ActivationData {
  registrationToken: string;
}

interface Props {
  data: Partial<ActivationData>;
  onNext: (data: ActivationData) => void;
  onBack: () => void;
}

export function StepActivation({ data, onNext, onBack }: Props) {
  const [registrationToken, setRegistrationToken] = useState(
    data.registrationToken ?? "",
  );
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleNext() {
    setError(null);
    setValidating(true);
    try {
      const res = await fetch("/install/api/validate-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationToken }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? "Token validation failed");
        return;
      }
      onNext({ registrationToken });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setValidating(false);
    }
  }

  const isValid = registrationToken.length >= 8;

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-1">
        Vendor Activation
      </h2>
      <p className="text-sm text-gray-500 mb-6">
        Enter the registration token issued by your vendor control panel. This
        links your hospital instance to the vendor management platform.
      </p>

      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Registration Token
          </label>
          <input
            type="password"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Paste your registration token here"
            value={registrationToken}
            onChange={(e) => setRegistrationToken(e.target.value)}
          />
          <p className="text-xs text-gray-400 mt-1">
            Obtain this token from the vendor dashboard under &ldquo;New
            Instance&rdquo;.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      <div className="flex gap-3 mt-8">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 py-2.5 px-4 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={!isValid || validating}
          className="flex-1 py-2.5 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {validating ? "Validating…" : "Validate & Continue"}
        </button>
      </div>
    </div>
  );
}
