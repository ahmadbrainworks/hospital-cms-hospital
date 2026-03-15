import type { ThemeManifest } from "@hospital-cms/shared-types";

// DEFAULT THEME
// Loaded when no vendor-assigned theme is active.
// Follows a clean, accessible medical UI palette.

export const DEFAULT_THEME: Omit<ThemeManifest, "signature" | "publicKeyId"> = {
  themeId: "default",
  name: "Hospital CMS Default",
  version: "1.0.0",
  description: "Clean, accessible default theme",
  author: "Hospital CMS Vendor",
  variables: [
    {
      key: "--color-primary",
      value: "#2563eb",
      description: "Primary brand color",
    },
    {
      key: "--color-primary-dark",
      value: "#1d4ed8",
      description: "Primary dark hover",
    },
    {
      key: "--color-primary-light",
      value: "#dbeafe",
      description: "Primary light background",
    },
    {
      key: "--color-secondary",
      value: "#0891b2",
      description: "Secondary accent",
    },
    {
      key: "--color-success",
      value: "#16a34a",
      description: "Success / positive state",
    },
    { key: "--color-warning", value: "#d97706", description: "Warning state" },
    {
      key: "--color-danger",
      value: "#dc2626",
      description: "Error / danger state",
    },
    { key: "--color-neutral-50", value: "#f8fafc" },
    { key: "--color-neutral-100", value: "#f1f5f9" },
    { key: "--color-neutral-200", value: "#e2e8f0" },
    { key: "--color-neutral-700", value: "#334155" },
    { key: "--color-neutral-900", value: "#0f172a" },
    {
      key: "--font-family-base",
      value:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    {
      key: "--font-family-mono",
      value: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
    },
    { key: "--border-radius-sm", value: "0.375rem" },
    { key: "--border-radius-md", value: "0.5rem" },
    { key: "--border-radius-lg", value: "0.75rem" },
    { key: "--border-radius-xl", value: "1rem" },
    { key: "--shadow-sm", value: "0 1px 2px 0 rgb(0 0 0 / 0.05)" },
    { key: "--shadow-md", value: "0 4px 6px -1px rgb(0 0 0 / 0.1)" },
    { key: "--shadow-xl", value: "0 20px 25px -5px rgb(0 0 0 / 0.1)" },
    { key: "--sidebar-width", value: "16rem" },
    { key: "--header-height", value: "4rem" },
  ],
};
