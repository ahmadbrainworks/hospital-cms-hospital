/**
 * Design token → CSS custom property compiler.
 *
 * Converts a DesignTokens object into a flat map of CSS custom properties
 * that can be injected as :root variables or scoped to a container.
 */
import type { DesignTokens, ColorScale } from "@hospital-cms/contracts";

function colorScaleVars(prefix: string, scale: ColorScale): Record<string, string> {
  const out: Record<string, string> = {};
  for (const shade of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const) {
    out[`${prefix}-${shade}`] = scale[shade];
  }
  return out;
}

export function tokensToCustomProperties(tokens: DesignTokens): Record<string, string> {
  const vars: Record<string, string> = {};

  // Colors — semantic scales
  const colorRoles = ["primary", "secondary", "accent", "neutral", "success", "warning", "error", "info"] as const;
  for (const role of colorRoles) {
    Object.assign(vars, colorScaleVars(`--color-${role}`, tokens.colors[role]));
  }

  // Colors — flat semantic
  vars["--color-bg"] = tokens.colors.background;
  vars["--color-surface"] = tokens.colors.surface;
  vars["--color-surface-raised"] = tokens.colors.surfaceRaised;
  vars["--color-text"] = tokens.colors.textPrimary;
  vars["--color-text-secondary"] = tokens.colors.textSecondary;
  vars["--color-text-disabled"] = tokens.colors.textDisabled;
  vars["--color-text-inverse"] = tokens.colors.textInverse;
  vars["--color-border"] = tokens.colors.border;
  vars["--color-border-strong"] = tokens.colors.borderStrong;

  // Typography
  vars["--font-family"] = tokens.typography.fontFamily;
  if (tokens.typography.fontFamilyHeading) {
    vars["--font-family-heading"] = tokens.typography.fontFamilyHeading;
  }
  if (tokens.typography.fontFamilyMono) {
    vars["--font-family-mono"] = tokens.typography.fontFamilyMono;
  }
  vars["--font-size-base"] = `${tokens.typography.baseFontSize}px`;
  vars["--line-height"] = String(tokens.typography.lineHeight);
  vars["--scale-ratio"] = String(tokens.typography.scaleRatio);

  // Spacing
  vars["--space-unit"] = `${tokens.spacing.baseUnit}px`;

  // Border
  vars["--radius-sm"] = `${tokens.border.radiusSm}px`;
  vars["--radius-md"] = `${tokens.border.radiusMd}px`;
  vars["--radius-lg"] = `${tokens.border.radiusLg}px`;
  vars["--radius-full"] = `${tokens.border.radiusFull}px`;
  vars["--border-width"] = `${tokens.border.borderWidth}px`;

  // Shadows
  vars["--shadow-sm"] = tokens.shadows.sm.value;
  vars["--shadow-md"] = tokens.shadows.md.value;
  vars["--shadow-lg"] = tokens.shadows.lg.value;
  vars["--shadow-xl"] = tokens.shadows.xl.value;

  // Custom
  if (tokens.custom) {
    for (const [k, v] of Object.entries(tokens.custom)) {
      vars[`--custom-${k}`] = String(v);
    }
  }

  return vars;
}

/** Build a CSS :root block from custom properties. */
export function buildCssFromTokens(tokens: DesignTokens): string {
  const vars = tokensToCustomProperties(tokens);
  const decls = Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");
  return `:root {\n${decls}\n}`;
}
