"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import Link from "next/link";
import { cpApi } from "@/lib/api";
import { Shell } from "@/components/Shell";

interface Instance {
  instanceId: string;
  hospitalName: string;
  hospitalSlug: string;
  lastHeartbeatAt: string | null;
}

interface PackageVersion {
  packageId: string;
  name: string;
  version: string;
  yanked: boolean;
}

export default function AssignPackagePage() {
  const params = useParams();
  const router = useRouter();
  const packageId = params.packageId as string;

  const [selectedInstances, setSelectedInstances] = useState<string[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<
    Array<{ instanceId: string; success: boolean; error?: string }>
  >([]);

  const { data: instancesData } = useSWR(
    "/api/vendor/instances",
    (url: string): Promise<any> => cpApi.get(url),
  );

  const { data: versionsData } = useSWR(
    `/api/vendor/packages/${packageId}`,
    (url: string): Promise<any> => cpApi.get(url),
  );

  const instances: Instance[] =
    (instancesData as any)?.data?.instances ?? [];
  const versions: PackageVersion[] = (versionsData?.data ?? []).filter(
    (v: PackageVersion) => !v.yanked,
  );

  // Auto-select latest version
  if (!selectedVersion && versions.length > 0) {
    setSelectedVersion(versions[0]!.version);
  }

  const toggleInstance = (id: string) => {
    setSelectedInstances((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const selectAll = () => {
    setSelectedInstances(instances.map((i) => i.instanceId));
  };

  const clearAll = () => {
    setSelectedInstances([]);
  };

  const handleAssign = async () => {
    if (!selectedVersion || selectedInstances.length === 0) return;
    setAssigning(true);
    setError("");
    setResults([]);

    try {
      if (selectedInstances.length === 1) {
        await cpApi.post("/api/vendor/assignments", {
          instanceId: selectedInstances[0],
          packageId,
          version: selectedVersion,
          notes: notes.trim() || undefined,
        });
        setResults([
          { instanceId: selectedInstances[0]!, success: true },
        ]);
      } else {
        const res: any = await cpApi.post("/api/vendor/assignments/bulk", {
          instanceIds: selectedInstances,
          packageId,
          version: selectedVersion,
          notes: notes.trim() || undefined,
        });
        const assigned = res?.data?.assignments ?? [];
        setResults(
          selectedInstances.map((id) => ({
            instanceId: id,
            success: assigned.some(
              (a: any) => a.instanceId === id,
            ),
          })),
        );
      }
    } catch (err: any) {
      setError(err.message ?? "Assignment failed");
    } finally {
      setAssigning(false);
    }
  };

  return (
    <Shell>
      <div className="mb-6">
        <Link
          href={`/packages/${packageId}`}
          className="text-sm text-indigo-600 hover:text-indigo-800 mb-2 inline-block"
        >
          &larr; {packageId}
        </Link>
        <h1 className="text-xl font-bold text-gray-900">
          Assign Package to Hospitals
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Select hospitals and a version to assign{" "}
          <span className="font-mono">{packageId}</span>.
        </p>
      </div>

      <div className="max-w-3xl space-y-6">
        {/* Version Selector */}
        <div className="bg-white border rounded-lg p-5 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-3">Select Version</h2>
          <select
            value={selectedVersion}
            onChange={(e) => setSelectedVersion(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm font-mono"
          >
            {versions.map((v) => (
              <option key={v.version} value={v.version}>
                v{v.version}
              </option>
            ))}
          </select>
        </div>

        {/* Hospital Selector */}
        <div className="bg-white border rounded-lg p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-800">
              Select Hospitals ({selectedInstances.length} selected)
            </h2>
            <div className="flex gap-2">
              <button
                onClick={selectAll}
                className="text-xs text-indigo-600 hover:text-indigo-800"
              >
                Select all
              </button>
              <button
                onClick={clearAll}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Clear
              </button>
            </div>
          </div>

          {instances.length === 0 ? (
            <p className="text-sm text-gray-400">No instances registered.</p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {instances.map((inst) => (
                <label
                  key={inst.instanceId}
                  className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedInstances.includes(inst.instanceId)}
                    onChange={() => toggleInstance(inst.instanceId)}
                    className="rounded border-gray-300"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {inst.hospitalName}
                    </div>
                    <div className="text-xs text-gray-400 font-mono">
                      {inst.instanceId.slice(0, 12)}...
                    </div>
                  </div>
                  <div className="text-xs text-gray-400">
                    {inst.lastHeartbeatAt
                      ? `Last seen ${new Date(inst.lastHeartbeatAt).toLocaleDateString()}`
                      : "Never connected"}
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="bg-white border rounded-lg p-5 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-3">Notes (optional)</h2>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Internal notes about this assignment..."
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm font-medium text-green-800 mb-2">
              Assignment complete
            </p>
            <p className="text-xs text-green-600">
              {results.filter((r) => r.success).length} of {results.length}{" "}
              hospitals assigned. Packages will be synced on the next agent
              heartbeat.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleAssign}
            disabled={
              assigning ||
              selectedInstances.length === 0 ||
              !selectedVersion
            }
            className="px-6 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {assigning
              ? "Assigning..."
              : `Assign to ${selectedInstances.length} Hospital${selectedInstances.length !== 1 ? "s" : ""}`}
          </button>
          <Link
            href={`/packages/${packageId}`}
            className="px-6 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </div>
    </Shell>
  );
}
