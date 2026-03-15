"use client";

import { useState } from "react";
import type { InstallerFormData } from "../../app/install/page";

interface Props {
  data: InstallerFormData;
  onSuccess: (instanceId: string) => void;
  onBack: () => void;
}

export function StepFinalize({ data, onSuccess, onBack }: Props) {
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState("");
  const [log, setLog] = useState<string[]>([]);

  const addLog = (msg: string) => setLog((prev) => [...prev, msg]);

  const handleInstall = async () => {
    setInstalling(true);
    setError("");
    setLog([]);

    addLog("Starting installation...");

    try {
      addLog("Connecting to MongoDB...");
      addLog("Creating database indexes...");
      addLog("Generating RSA key pair...");
      addLog("Creating hospital instance...");
      addLog("Creating SUPER_ADMIN account...");
      addLog("Writing installer lock...");

      const res = await fetch("/install/api/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const body = await res.json();

      if (!res.ok) {
        setError(body.error?.message ?? "Installation failed");
        addLog(`ERROR: ${body.error?.message ?? "Unknown error"}`);
        return;
      }

      addLog("Installation complete!");
      onSuccess(body.data.instanceId);
    } catch {
      setError("Network error during installation.");
      addLog("ERROR: Network error");
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-1">
        Review & Install
      </h2>
      <p className="text-sm text-gray-500 mb-6">
        Review the configuration below. Click Install to complete setup.
      </p>

      <div className="space-y-4 mb-6">
        <Section title="Database">
          <Row label="MongoDB" value={maskUri(data.mongoUri)} />
          <Row label="Redis" value={maskUri(data.redisUrl)} />
        </Section>

        <Section title="Hospital">
          <Row label="Name" value={data.hospitalName} />
          <Row label="Slug" value={data.hospitalSlug} />
          <Row label="Email" value={data.contact.email} />
          <Row label="Phone" value={data.contact.phone} />
          <Row label="Timezone" value={data.settings.timezone} />
          <Row label="Currency" value={data.settings.currency} />
        </Section>

        <Section title="Administrator">
          <Row
            label="Name"
            value={`${data.adminUser.firstName} ${data.adminUser.lastName}`}
          />
          <Row label="Email" value={data.adminUser.email} />
          <Row label="Username" value={data.adminUser.username} />
          <Row label="Password" value="••••••••" />
        </Section>
      </div>

      {log.length > 0 && (
        <div className="mb-4 p-3 bg-gray-900 rounded-lg font-mono text-xs text-green-400 max-h-32 overflow-y-auto">
          {log.map((line, i) => (
            <div key={i}>{`> ${line}`}</div>
          ))}
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onBack}
          disabled={installing}
          className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
        >
          Back
        </button>
        <button
          onClick={handleInstall}
          disabled={installing}
          className="flex-1 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          {installing ? "Installing..." : "Install Hospital CMS"}
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {title}
        </h3>
      </div>
      <div className="divide-y divide-gray-100">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center px-4 py-2">
      <span className="text-sm text-gray-500 w-28 shrink-0">{label}</span>
      <span className="text-sm text-gray-900 font-medium">{value}</span>
    </div>
  );
}

function maskUri(uri: string): string {
  try {
    const url = new URL(uri);
    if (url.password) url.password = "***";
    return url.toString();
  } catch {
    return uri;
  }
}
