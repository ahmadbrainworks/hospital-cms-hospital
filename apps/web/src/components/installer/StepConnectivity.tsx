"use client";

import { useState, useEffect } from "react";

interface Props {
  onNext: () => void;
}

interface TestResult {
  mongodb: { ok: boolean; error?: string };
  redis: { ok: boolean; error?: string };
}

export function StepConnectivity({ onNext }: Props) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [error, setError] = useState("");

  const handleTest = async () => {
    setTesting(true);
    setError("");
    setTestResult(null);

    try {
      const res = await fetch("/install/api/test-connectivity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message ?? "Connectivity test failed");
        return;
      }

      setTestResult(data.data);
    } catch {
      setError("Network error. Check if the installer server is running.");
    } finally {
      setTesting(false);
    }
  };

  // Auto-test on mount
  useEffect(() => {
    handleTest();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const allOk = testResult?.mongodb.ok && testResult?.redis.ok;

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-1">
        Service Connectivity
      </h2>
      <p className="text-sm text-gray-500 mb-6">
        Verifying that MongoDB and Redis are running and reachable on this
        server. These services must be available before installation can proceed.
      </p>

      {testing && !testResult && (
        <div className="mb-6 p-4 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-700">
          Testing connections...
        </div>
      )}

      {testResult && (
        <div className="mb-6 p-4 rounded-lg bg-gray-50 border border-gray-200 space-y-2">
          <ConnectivityRow
            label="MongoDB"
            ok={testResult.mongodb.ok}
            error={testResult.mongodb.error}
          />
          <ConnectivityRow
            label="Redis"
            ok={testResult.redis.ok}
            error={testResult.redis.error}
          />
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {testResult && !allOk && (
        <p className="mb-4 text-sm text-gray-500">
          Ensure MongoDB and Redis are installed and running, then retry.
        </p>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleTest}
          disabled={testing}
          className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {testing ? "Testing..." : "Retry"}
        </button>
        <button
          onClick={onNext}
          disabled={!allOk}
          className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function ConnectivityRow({
  label,
  ok,
  error,
}: {
  label: string;
  ok: boolean;
  error?: string | undefined;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs ${
          ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
        }`}
      >
        {ok ? "\u2713" : "\u2717"}
      </span>
      <span className="text-sm font-medium text-gray-700">{label}</span>
      {!ok && error && (
        <span className="text-xs text-red-600 ml-1">{error}</span>
      )}
    </div>
  );
}
