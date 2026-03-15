"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { cpApi } from "@/lib/api";
import { Shell } from "@/components/Shell";
import { useAuth } from "@/lib/auth-context";
import { P } from "@/lib/permissions";

interface PackageVersion {
  packageId: string;
  name: string;
  version: string;
  type: string;
  publishedAt: string;
  description?: string;
  size?: number;
  author?: string;
  checksum?: string;
  yanked: boolean;
}

interface Assignment {
  assignmentId: string;
  instanceId: string;
  packageId: string;
  packageType: string;
  assignedVersion: string;
  status: string;
  assignedAt: string;
  lastSyncAt?: string;
  lastError?: string;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-green-100 text-green-800",
    assigned: "bg-blue-100 text-blue-800",
    installing: "bg-yellow-100 text-yellow-800",
    pending_update: "bg-orange-100 text-orange-800",
    pending_removal: "bg-red-100 text-red-700",
    disabled: "bg-gray-100 text-gray-700",
    removed: "bg-gray-50 text-gray-400",
    failed: "bg-red-100 text-red-800",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[status] ?? "bg-gray-100 text-gray-700"}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

export default function PackageDetailPage() {
  const params = useParams();
  const packageId = params.packageId as string;
  const { hasPermission } = useAuth();

  const [tab, setTab] = useState<"versions" | "assignments">("versions");
  const [yanking, setYanking] = useState<string | null>(null);

  const { data: versionsData, isLoading: loadingVersions } = useSWR(
    `/api/vendor/packages/${packageId}`,
    (url: string): Promise<any> => cpApi.get(url),
    { refreshInterval: 30_000 },
  );

  const { data: assignmentsData, isLoading: loadingAssignments } = useSWR(
    `/api/vendor/packages/${packageId}/assignments`,
    (url: string): Promise<any> => cpApi.get(url),
    { refreshInterval: 30_000 },
  );

  const versions: PackageVersion[] = versionsData?.data ?? [];
  const assignments: Assignment[] = assignmentsData?.data?.assignments ?? [];
  const activeCount: number = assignmentsData?.data?.activeCount ?? 0;
  const latest = versions.find((v) => !v.yanked);

  const handleYank = async (version: string) => {
    if (!confirm(`Yank ${packageId}@${version}? This will hide it from new installs.`)) return;
    setYanking(version);
    try {
      await cpApi.delete(`/api/vendor/packages/${packageId}/${version}`);
      mutate(`/api/vendor/packages/${packageId}`);
    } catch (err: any) {
      alert(err.message ?? "Yank failed");
    } finally {
      setYanking(null);
    }
  };

  return (
    <Shell>
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/packages"
          className="text-sm text-indigo-600 hover:text-indigo-800 mb-2 inline-block"
        >
          &larr; Packages
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {latest?.name ?? packageId}
            </h1>
            <p className="text-sm text-gray-500 font-mono mt-0.5">
              {packageId}
              {latest && (
                <>
                  {" "}
                  &middot; v{latest.version} &middot;{" "}
                  <span className="capitalize">{latest.type}</span>
                </>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            {hasPermission(P.PACKAGE_ASSIGN) && (
              <Link
                href={`/packages/${packageId}/assign`}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Assign to Hospital
              </Link>
            )}
          </div>
        </div>
        {latest?.description && (
          <p className="text-sm text-gray-600 mt-2">{latest.description}</p>
        )}
        <div className="flex gap-4 mt-3 text-xs text-gray-500">
          <span>{versions.length} version{versions.length !== 1 ? "s" : ""}</span>
          <span>{activeCount} active assignment{activeCount !== 1 ? "s" : ""}</span>
          {latest?.author && <span>by {latest.author}</span>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        <button
          onClick={() => setTab("versions")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "versions"
              ? "border-indigo-600 text-indigo-700"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Versions
        </button>
        <button
          onClick={() => setTab("assignments")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "assignments"
              ? "border-indigo-600 text-indigo-700"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Assigned Hospitals ({assignments.length})
        </button>
      </div>

      {/* Versions Tab */}
      {tab === "versions" && (
        <>
          {loadingVersions && (
            <div className="text-sm text-gray-400">Loading versions...</div>
          )}
          {versions.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-3">Version</th>
                    <th className="px-4 py-3">Published</th>
                    <th className="px-4 py-3">Size</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {versions.map((v) => (
                    <tr
                      key={v.version}
                      className={`hover:bg-gray-50 ${v.yanked ? "opacity-50" : ""}`}
                    >
                      <td className="px-4 py-3 font-mono text-sm">
                        {v.version}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {new Date(v.publishedAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {v.size ? `${(v.size / 1024).toFixed(1)} KB` : "-"}
                      </td>
                      <td className="px-4 py-3">
                        {v.yanked ? (
                          <span className="text-xs text-red-600 font-medium">
                            Yanked
                          </span>
                        ) : (
                          <span className="text-xs text-green-600 font-medium">
                            Published
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!v.yanked && hasPermission(P.PACKAGE_PUBLISH) && (
                          <button
                            onClick={() => handleYank(v.version)}
                            disabled={yanking === v.version}
                            className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
                          >
                            {yanking === v.version ? "Yanking..." : "Yank"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Assignments Tab */}
      {tab === "assignments" && (
        <>
          {loadingAssignments && (
            <div className="text-sm text-gray-400">Loading assignments...</div>
          )}
          {assignments.length > 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-3">Instance</th>
                    <th className="px-4 py-3">Version</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Assigned</th>
                    <th className="px-4 py-3">Last Sync</th>
                    <th className="px-4 py-3">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {assignments.map((a) => (
                    <tr key={a.assignmentId} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Link
                          href={`/instances/${a.instanceId}`}
                          className="text-indigo-700 hover:text-indigo-900 font-mono text-xs"
                        >
                          {a.instanceId.slice(0, 8)}...
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">
                        {a.assignedVersion}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={a.status} />
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {new Date(a.assignedAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {a.lastSyncAt
                          ? new Date(a.lastSyncAt).toLocaleString()
                          : "Never"}
                      </td>
                      <td className="px-4 py-3 text-xs text-red-600 max-w-xs truncate">
                        {a.lastError ?? "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
              This package has not been assigned to any hospitals yet.
            </div>
          )}
        </>
      )}
    </Shell>
  );
}
