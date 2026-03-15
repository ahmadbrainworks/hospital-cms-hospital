"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { cpApi } from "@/lib/api";
import { Shell } from "../../components/Shell";

interface ColorScale {
  [shade: string]: string;
}

interface TokenPreview {
  colors: Record<string, ColorScale | string>;
  typography: { fontFamily: string; baseFontSize: number; lineHeight: number };
  border: { radiusSm: number; radiusMd: number; radiusLg: number };
}

const DEFAULT_COLORS: Record<string, string> = {
  primary: "#2563eb",
  secondary: "#0891b2",
  accent: "#d946ef",
  success: "#16a34a",
  warning: "#d97706",
  error: "#dc2626",
  background: "#f8fafc",
  surface: "#ffffff",
  text: "#0f172a",
  border: "#e2e8f0",
};

function hexToHSL(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  if (s === 0) {
    const v = Math.round(l * 255).toString(16).padStart(2, "0");
    return `#${v}${v}${v}`;
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hue2rgb(p, q, h / 360 + 1/3) * 255).toString(16).padStart(2, "0");
  const g = Math.round(hue2rgb(p, q, h / 360) * 255).toString(16).padStart(2, "0");
  const b = Math.round(hue2rgb(p, q, h / 360 - 1/3) * 255).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}

function generateScale(baseHex: string): Record<number, string> {
  const { h, s } = hexToHSL(baseHex);
  const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
  const lightnesses = [0.97, 0.93, 0.86, 0.76, 0.64, 0.50, 0.42, 0.35, 0.27, 0.20, 0.12];
  const out: Record<number, string> = {};
  for (let i = 0; i < shades.length; i++) {
    out[shades[i]!] = hslToHex(h, s, lightnesses[i]!);
  }
  return out;
}

export default function ThemeBuilderPage() {
  const router = useRouter();
  const [colors, setColors] = useState(DEFAULT_COLORS);
  const [fontFamily, setFontFamily] = useState("Inter, sans-serif");
  const [fontSize, setFontSize] = useState(16);
  const [radiusMd, setRadiusMd] = useState(8);
  const [themeName, setThemeName] = useState("My Custom Theme");
  const [themeId, setThemeId] = useState("my-custom-theme");
  const [themeVersion, setThemeVersion] = useState("1.0.0");
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [publishSuccess, setPublishSuccess] = useState(false);

  const scales = useMemo(() => {
    const result: Record<string, Record<number, string>> = {};
    for (const role of ["primary", "secondary", "accent", "success", "warning", "error"]) {
      result[role] = generateScale(colors[role]!);
    }
    return result;
  }, [colors]);

  const cssPreview = useMemo(() => {
    const lines: string[] = [":root {"];
    for (const [role, scale] of Object.entries(scales)) {
      for (const [shade, hex] of Object.entries(scale)) {
        lines.push(`  --color-${role}-${shade}: ${hex};`);
      }
    }
    lines.push(`  --color-bg: ${colors.background};`);
    lines.push(`  --color-surface: ${colors.surface};`);
    lines.push(`  --color-text: ${colors.text};`);
    lines.push(`  --color-border: ${colors.border};`);
    lines.push(`  --font-family: ${fontFamily};`);
    lines.push(`  --font-size-base: ${fontSize}px;`);
    lines.push(`  --radius-md: ${radiusMd}px;`);
    lines.push("}");
    return lines.join("\n");
  }, [scales, colors, fontFamily, fontSize, radiusMd]);

  const updateColor = (key: string, value: string) => {
    setColors((prev) => ({ ...prev, [key]: value }));
  };

  const handlePublishTheme = async () => {
    setPublishing(true);
    setPublishError("");
    setPublishSuccess(false);
    try {
      // Build variables array from CSS preview
      const variables: Array<{ key: string; value: string }> = [];
      for (const [role, scale] of Object.entries(scales)) {
        for (const [shade, hex] of Object.entries(scale)) {
          variables.push({ key: `--color-${role}-${shade}`, value: hex as string });
        }
      }
      variables.push({ key: "--color-bg", value: colors.background! });
      variables.push({ key: "--color-surface", value: colors.surface! });
      variables.push({ key: "--color-text", value: colors.text! });
      variables.push({ key: "--color-border", value: colors.border! });
      variables.push({ key: "--font-family", value: fontFamily });
      variables.push({ key: "--font-size-base", value: `${fontSize}px` });
      variables.push({ key: "--radius-md", value: `${radiusMd}px` });

      const manifest: Record<string, unknown> = {
        packageId: themeId.trim(),
        type: "theme",
        version: themeVersion.trim(),
        name: themeName.trim(),
        description: `Theme: ${themeName.trim()}`,
        author: "Vendor Team",
        checksum: "pending",
        size: 0,
        downloadUrl: "",
        publishedAt: new Date().toISOString(),
        compatibility: {
          minCmsVersion: "1.0.0",
          requiredLicenseTiers: [],
          requiredFeatures: [],
        },
        tokens: {},
        cssVariablesDaisyui: {},
        cssVariablesShadcn: {},
        variables,
      };

      await cpApi.post("/api/vendor/packages", {
        manifest,
        archivePath: `/themes/${themeId.trim()}/${themeVersion.trim()}/theme.zip`,
      });
      setPublishSuccess(true);
    } catch (err: any) {
      setPublishError(err.message ?? "Publish failed");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <Shell>
    <div>
      <h1 className="text-2xl font-bold mb-6">Theme Builder</h1>

      <div className="grid grid-cols-2 gap-6">
        {/* Controls */}
        <div className="space-y-6">
          <div className="bg-white border rounded-lg p-4 shadow-sm space-y-3">
            <h2 className="font-semibold mb-3">Theme Info</h2>
            <input
              type="text"
              value={themeName}
              onChange={(e) => setThemeName(e.target.value)}
              className="border rounded px-3 py-2 w-full text-sm"
              placeholder="Theme name"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                value={themeId}
                onChange={(e) => setThemeId(e.target.value)}
                className="border rounded px-3 py-2 w-full text-sm font-mono"
                placeholder="theme-id"
              />
              <input
                type="text"
                value={themeVersion}
                onChange={(e) => setThemeVersion(e.target.value)}
                className="border rounded px-3 py-2 w-full text-sm font-mono"
                placeholder="1.0.0"
              />
            </div>
          </div>

          <div className="bg-white border rounded-lg p-4 shadow-sm">
            <h2 className="font-semibold mb-3">Colors</h2>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(colors).map(([key, value]) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="color"
                    value={value}
                    onChange={(e) => updateColor(key, e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border"
                  />
                  <span className="capitalize">{key}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="bg-white border rounded-lg p-4 shadow-sm">
            <h2 className="font-semibold mb-3">Typography</h2>
            <label className="block text-sm mb-2">
              Font Family
              <input
                type="text"
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
                className="border rounded px-3 py-2 w-full mt-1"
              />
            </label>
            <label className="block text-sm">
              Base Font Size: {fontSize}px
              <input
                type="range"
                min={12}
                max={20}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-full mt-1"
              />
            </label>
          </div>

          <div className="bg-white border rounded-lg p-4 shadow-sm">
            <h2 className="font-semibold mb-3">Border Radius</h2>
            <label className="block text-sm">
              Medium: {radiusMd}px
              <input
                type="range"
                min={0}
                max={24}
                value={radiusMd}
                onChange={(e) => setRadiusMd(Number(e.target.value))}
                className="w-full mt-1"
              />
            </label>
            <div className="flex gap-2 mt-3">
              {[0, 4, 8, 12, 16].map((r) => (
                <div
                  key={r}
                  className="w-12 h-12 border-2 border-gray-300"
                  style={{
                    borderRadius: `${r}px`,
                    backgroundColor: colors.primary,
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="space-y-6">
          {/* Color scales preview */}
          <div className="bg-white border rounded-lg p-4 shadow-sm">
            <h2 className="font-semibold mb-3">Color Scales</h2>
            {Object.entries(scales).map(([role, scale]) => (
              <div key={role} className="mb-3">
                <div className="text-xs text-gray-500 uppercase mb-1">{role}</div>
                <div className="flex rounded overflow-hidden">
                  {Object.entries(scale).map(([shade, hex]) => (
                    <div
                      key={shade}
                      className="flex-1 h-8"
                      style={{ backgroundColor: hex }}
                      title={`${shade}: ${hex}`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* UI Preview */}
          <div
            className="border rounded-lg p-6 shadow-sm"
            style={{
              backgroundColor: colors.background,
              color: colors.text,
              fontFamily,
              fontSize: `${fontSize}px`,
            }}
          >
            <h2 className="text-lg font-semibold mb-4">UI Preview — {themeName}</h2>
            <div className="flex gap-3 mb-4">
              <button
                className="px-4 py-2 text-white text-sm font-medium"
                style={{ backgroundColor: colors.primary, borderRadius: `${radiusMd}px` }}
              >
                Primary Button
              </button>
              <button
                className="px-4 py-2 text-white text-sm font-medium"
                style={{ backgroundColor: colors.secondary, borderRadius: `${radiusMd}px` }}
              >
                Secondary
              </button>
              <button
                className="px-4 py-2 border text-sm"
                style={{ borderColor: colors.border, borderRadius: `${radiusMd}px` }}
              >
                Outline
              </button>
            </div>
            <div
              className="p-4 mb-4"
              style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: `${radiusMd}px` }}
            >
              <div className="font-medium mb-1">Card Component</div>
              <div className="text-sm" style={{ color: "#64748b" }}>
                This card uses surface and border colors from your theme.
              </div>
            </div>
            <div className="flex gap-2">
              <span className="px-2 py-1 text-xs text-white rounded" style={{ backgroundColor: scales.success?.[600] }}>
                Success
              </span>
              <span className="px-2 py-1 text-xs text-white rounded" style={{ backgroundColor: scales.warning?.[600] }}>
                Warning
              </span>
              <span className="px-2 py-1 text-xs text-white rounded" style={{ backgroundColor: scales.error?.[600] }}>
                Error
              </span>
            </div>
          </div>

          {/* CSS Output */}
          <div className="bg-white border rounded-lg p-4 shadow-sm">
            <h2 className="font-semibold mb-3">Generated CSS Variables</h2>
            <pre className="bg-gray-900 text-green-400 text-xs p-4 rounded overflow-x-auto max-h-64">
              {cssPreview}
            </pre>
          </div>

          {/* Publish to Registry */}
          <div className="bg-white border rounded-lg p-4 shadow-sm space-y-3">
            <h2 className="font-semibold">Publish to Registry</h2>
            <p className="text-xs text-gray-500">
              Publish this theme to the package registry. After publishing, you
              can assign it to hospitals from the Packages page.
            </p>
            {publishError && (
              <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                {publishError}
              </div>
            )}
            {publishSuccess && (
              <div className="p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">
                Theme published successfully! Go to{" "}
                <a href={`/packages/${themeId}`} className="underline">
                  Packages
                </a>{" "}
                to assign it to hospitals.
              </div>
            )}
            <button
              onClick={handlePublishTheme}
              disabled={publishing || !themeName.trim() || !themeId.trim() || !themeVersion.trim()}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {publishing ? "Publishing..." : "Publish & Sign Theme"}
            </button>
          </div>
        </div>
      </div>
    </div>
    </Shell>
  );
}
