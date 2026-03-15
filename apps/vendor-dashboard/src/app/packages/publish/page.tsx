"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cpApi } from "@/lib/api";
import { Shell } from "@/components/Shell";
import Link from "next/link";

export default function PublishPackagePage() {
  const router = useRouter();

  const [packageId, setPackageId] = useState("");
  const [name, setName] = useState("");
  const [version, setVersion] = useState("");
  const [type, setType] = useState<"plugin" | "theme" | "widget">("plugin");
  const [description, setDescription] = useState("");
  const [author, setAuthor] = useState("");
  const [archivePath, setArchivePath] = useState("");
  const [checksum, setChecksum] = useState("");
  const [size, setSize] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [minCmsVersion, setMinCmsVersion] = useState("1.0.0");
  const [entryPoint, setEntryPoint] = useState("./dist/index.js");

  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");

  const handlePublish = async () => {
    setPublishing(true);
    setError("");
    try {
      const manifest: Record<string, unknown> = {
        packageId: packageId.trim(),
        type,
        version: version.trim(),
        name: name.trim(),
        description: description.trim(),
        author: author.trim(),
        checksum: checksum.trim(),
        size: parseInt(size) || 0,
        downloadUrl: downloadUrl.trim(),
        publishedAt: new Date().toISOString(),
        compatibility: {
          minCmsVersion: minCmsVersion.trim(),
          requiredLicenseTiers: [],
          requiredFeatures: [],
        },
      };

      if (type === "plugin") {
        manifest["entryPoint"] = entryPoint.trim();
        manifest["permissions"] = [];
        manifest["routes"] = [];
        manifest["events"] = [];
        manifest["uiSlots"] = [];
      }

      if (type === "theme") {
        manifest["tokens"] = {};
        manifest["cssVariablesDaisyui"] = {};
        manifest["cssVariablesShadcn"] = {};
      }

      if (type === "widget") {
        manifest["zone"] = "dashboard.top";
        manifest["defaultEnabled"] = true;
        manifest["componentPath"] = "./dist/widget.js";
      }

      await cpApi.post("/api/vendor/packages", {
        manifest,
        archivePath: archivePath.trim(),
      });

      router.push("/packages");
    } catch (err: any) {
      setError(err.message ?? "Publish failed");
    } finally {
      setPublishing(false);
    }
  };

  const canPublish =
    packageId.trim() &&
    name.trim() &&
    version.trim() &&
    archivePath.trim() &&
    checksum.trim();

  return (
    <Shell>
      <div className="mb-6">
        <Link
          href="/packages"
          className="text-sm text-indigo-600 hover:text-indigo-800 mb-2 inline-block"
        >
          &larr; Packages
        </Link>
        <h1 className="text-xl font-bold text-gray-900">Publish Package</h1>
        <p className="text-sm text-gray-500 mt-1">
          Register a new package version in the vendor registry. The manifest
          will be signed automatically with the vendor RSA key.
        </p>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* Package Identity */}
        <div className="bg-white border rounded-lg p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-gray-800">Package Identity</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Package ID
              </label>
              <input
                type="text"
                value={packageId}
                onChange={(e) => setPackageId(e.target.value)}
                placeholder="patient-alerts"
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Patient Alerts"
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Version (semver)
              </label>
              <input
                type="text"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="1.0.0"
                className="w-full border rounded-md px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              >
                <option value="plugin">Plugin</option>
                <option value="theme">Theme</option>
                <option value="widget">Widget</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Description
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the package..."
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Author
            </label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Vendor Team"
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* Archive */}
        <div className="bg-white border rounded-lg p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-gray-800">Archive</h2>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Archive Path (on vendor storage)
            </label>
            <input
              type="text"
              value={archivePath}
              onChange={(e) => setArchivePath(e.target.value)}
              placeholder="/packages/patient-alerts/1.0.0/package.zip"
              className="w-full border rounded-md px-3 py-2 text-sm font-mono"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                SHA-256 Checksum
              </label>
              <input
                type="text"
                value={checksum}
                onChange={(e) => setChecksum(e.target.value)}
                placeholder="a1b2c3d4..."
                className="w-full border rounded-md px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Size (bytes)
              </label>
              <input
                type="number"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                placeholder="102400"
                className="w-full border rounded-md px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Download URL (CDN)
            </label>
            <input
              type="text"
              value={downloadUrl}
              onChange={(e) => setDownloadUrl(e.target.value)}
              placeholder="https://cdn.hospitalcms.io/packages/patient-alerts/1.0.0/package.zip"
              className="w-full border rounded-md px-3 py-2 text-sm font-mono"
            />
          </div>
        </div>

        {/* Compatibility */}
        <div className="bg-white border rounded-lg p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-gray-800">Compatibility</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Min CMS Version
              </label>
              <input
                type="text"
                value={minCmsVersion}
                onChange={(e) => setMinCmsVersion(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm font-mono"
              />
            </div>
            {type === "plugin" && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Entry Point
                </label>
                <input
                  type="text"
                  value={entryPoint}
                  onChange={(e) => setEntryPoint(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm font-mono"
                />
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}
        <div className="flex gap-3">
          <button
            onClick={handlePublish}
            disabled={publishing || !canPublish}
            className="px-6 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {publishing ? "Publishing..." : "Publish & Sign"}
          </button>
          <Link
            href="/packages"
            className="px-6 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </Link>
        </div>

        <p className="text-xs text-gray-400">
          The manifest will be automatically signed with the vendor RSA-4096
          private key. Hospitals will verify this signature before installation.
        </p>
      </div>
    </Shell>
  );
}
