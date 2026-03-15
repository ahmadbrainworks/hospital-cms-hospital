"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { cpApi } from "@/lib/api";
import { Shell } from "@/components/Shell";
import { useAuth } from "@/lib/auth-context";
import { P } from "@/lib/permissions";

interface PackageRecord {
  packageId: string;
  name: string;
  version: string;
  type: string;
  publishedAt: string;
  description?: string;
  size?: number;
  yanked?: boolean;
}

const PACKAGES_URL = "/api/vendor/packages";

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    plugin: "bg-violet-50 text-violet-700",
    theme: "bg-cyan-50 text-cyan-700",
    widget: "bg-amber-50 text-amber-700",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[type] ?? "bg-gray-50 text-gray-700"}`}
    >
      {type}
    </span>
  );
}

export default function PackagesPage() {
  const { data, error, isLoading } = useSWR(
    PACKAGES_URL,
    (url: string): Promise<any> => cpApi.get(url),
    { refreshInterval: 30_000 },
  );
  const { hasPermission } = useAuth();

  const [typeFilter, setTypeFilter] = useState<string>("all");

  const packages: PackageRecord[] = data?.data ?? [];
  const filtered =
    typeFilter === "all"
      ? packages
      : packages.filter((p) => p.type === typeFilter);

  const types = Array.from(new Set(packages.map((p) => p.type)));

  return (
    <Shell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Package Registry</h1>
          <p className="text-sm text-gray-500 mt-1">
            Vendor-signed plugins, themes, and widgets.
          </p>
        </div>
        {hasPermission(P.PACKAGE_CREATE) && (
          <Link
            href="/packages/publish"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            + Publish New
          </Link>
        )}
      </div>

      {/* Type filter */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTypeFilter("all")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            typeFilter === "all"
              ? "bg-indigo-100 text-indigo-800"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          All ({packages.length})
        </button>
        {types.map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
              typeFilter === t
                ? "bg-indigo-100 text-indigo-800"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t}s ({packages.filter((p) => p.type === t).length})
          </button>
        ))}
      </div>

      {isLoading && <div className="text-sm text-gray-400">Loading...</div>}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error.message}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Latest</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Published</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((pkg) => (
                <tr key={`${pkg.packageId}-${pkg.version}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/packages/${pkg.packageId}`}
                      className="font-medium text-indigo-700 hover:text-indigo-900"
                    >
                      {pkg.name}
                    </Link>
                    <div className="text-xs text-gray-400 font-mono">
                      {pkg.packageId}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">
                    {pkg.version}
                  </td>
                  <td className="px-4 py-3">
                    <TypeBadge type={pkg.type} />
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(pkg.publishedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {pkg.size
                      ? `${(pkg.size / 1024).toFixed(1)} KB`
                      : "-"}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">
                    {pkg.description ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
          {packages.length === 0
            ? "No packages published yet."
            : "No packages match the selected filter."}
        </div>
      )}
    </Shell>
  );
}
