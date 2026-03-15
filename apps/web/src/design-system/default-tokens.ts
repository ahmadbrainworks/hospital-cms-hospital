/**
 * Default design tokens.
 *
 * Used when no vendor-assigned theme is active. These tokens produce
 * the same visual output as the legacy DEFAULT_THEME variables but
 * through the structured DesignTokens contract.
 */
import type { DesignTokens } from "@hospital-cms/contracts";

export const DEFAULT_TOKENS: DesignTokens = {
  colors: {
    primary: {
      50: "#eff6ff", 100: "#dbeafe", 200: "#bfdbfe", 300: "#93c5fd",
      400: "#60a5fa", 500: "#3b82f6", 600: "#2563eb", 700: "#1d4ed8",
      800: "#1e40af", 900: "#1e3a8a", 950: "#172554",
    },
    secondary: {
      50: "#ecfeff", 100: "#cffafe", 200: "#a5f3fc", 300: "#67e8f9",
      400: "#22d3ee", 500: "#06b6d4", 600: "#0891b2", 700: "#0e7490",
      800: "#155e75", 900: "#164e63", 950: "#083344",
    },
    accent: {
      50: "#fdf4ff", 100: "#fae8ff", 200: "#f5d0fe", 300: "#f0abfc",
      400: "#e879f9", 500: "#d946ef", 600: "#c026d3", 700: "#a21caf",
      800: "#86198f", 900: "#701a75", 950: "#4a044e",
    },
    neutral: {
      50: "#f8fafc", 100: "#f1f5f9", 200: "#e2e8f0", 300: "#cbd5e1",
      400: "#94a3b8", 500: "#64748b", 600: "#475569", 700: "#334155",
      800: "#1e293b", 900: "#0f172a", 950: "#020617",
    },
    success: {
      50: "#f0fdf4", 100: "#dcfce7", 200: "#bbf7d0", 300: "#86efac",
      400: "#4ade80", 500: "#22c55e", 600: "#16a34a", 700: "#15803d",
      800: "#166534", 900: "#14532d", 950: "#052e16",
    },
    warning: {
      50: "#fffbeb", 100: "#fef3c7", 200: "#fde68a", 300: "#fcd34d",
      400: "#fbbf24", 500: "#f59e0b", 600: "#d97706", 700: "#b45309",
      800: "#92400e", 900: "#78350f", 950: "#451a03",
    },
    error: {
      50: "#fef2f2", 100: "#fee2e2", 200: "#fecaca", 300: "#fca5a5",
      400: "#f87171", 500: "#ef4444", 600: "#dc2626", 700: "#b91c1c",
      800: "#991b1b", 900: "#7f1d1d", 950: "#450a0a",
    },
    info: {
      50: "#eff6ff", 100: "#dbeafe", 200: "#bfdbfe", 300: "#93c5fd",
      400: "#60a5fa", 500: "#3b82f6", 600: "#2563eb", 700: "#1d4ed8",
      800: "#1e40af", 900: "#1e3a8a", 950: "#172554",
    },
    background: "#f8fafc",
    surface: "#ffffff",
    surfaceRaised: "#ffffff",
    textPrimary: "#0f172a",
    textSecondary: "#64748b",
    textDisabled: "#94a3b8",
    textInverse: "#ffffff",
    border: "#e2e8f0",
    borderStrong: "#cbd5e1",
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontFamilyMono: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
    baseFontSize: 16,
    lineHeight: 1.5,
    scaleRatio: 1.25,
  },
  spacing: {
    baseUnit: 4,
  },
  border: {
    radiusSm: 6,
    radiusMd: 8,
    radiusLg: 12,
    radiusFull: 9999,
    borderWidth: 1,
  },
  shadows: {
    sm: { value: "0 1px 2px 0 rgb(0 0 0 / 0.05)" },
    md: { value: "0 4px 6px -1px rgb(0 0 0 / 0.1)" },
    lg: { value: "0 10px 15px -3px rgb(0 0 0 / 0.1)" },
    xl: { value: "0 20px 25px -5px rgb(0 0 0 / 0.1)" },
  },
};
