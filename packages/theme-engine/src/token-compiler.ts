/**
 * Token compiler.
 *
 * Converts structured DesignTokens into:
 * 1. CSS custom properties (:root block)
 * 2. DaisyUI theme config object
 * 3. Tailwind theme extension
 *
 * This is run by the vendor theme builder when publishing a theme.
 * The output is embedded in the ThemePackageManifest.
 */
import type { DesignTokens, ColorScale } from "@hospital-cms/contracts";

function scaleToEntries(prefix: string, scale: ColorScale): Array<[string, string]> {
  return ([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const).map(
    (shade) => [`${prefix}-${shade}`, scale[shade]],
  );
}

/** Compile tokens to a flat CSS custom properties map. */
export function compileToCssVars(tokens: DesignTokens): Record<string, string> {
  const vars: Record<string, string> = {};
  const roles = ["primary", "secondary", "accent", "neutral", "success", "warning", "error", "info"] as const;
  for (const role of roles) {
    for (const [k, v] of scaleToEntries(`--color-${role}`, tokens.colors[role])) {
      vars[k] = v;
    }
  }
  vars["--color-bg"] = tokens.colors.background;
  vars["--color-surface"] = tokens.colors.surface;
  vars["--color-surface-raised"] = tokens.colors.surfaceRaised;
  vars["--color-text"] = tokens.colors.textPrimary;
  vars["--color-text-secondary"] = tokens.colors.textSecondary;
  vars["--color-text-disabled"] = tokens.colors.textDisabled;
  vars["--color-text-inverse"] = tokens.colors.textInverse;
  vars["--color-border"] = tokens.colors.border;
  vars["--color-border-strong"] = tokens.colors.borderStrong;

  vars["--font-family"] = tokens.typography.fontFamily;
  if (tokens.typography.fontFamilyHeading) vars["--font-family-heading"] = tokens.typography.fontFamilyHeading;
  if (tokens.typography.fontFamilyMono) vars["--font-family-mono"] = tokens.typography.fontFamilyMono;
  vars["--font-size-base"] = `${tokens.typography.baseFontSize}px`;
  vars["--line-height"] = String(tokens.typography.lineHeight);

  vars["--space-unit"] = `${tokens.spacing.baseUnit}px`;
  vars["--radius-sm"] = `${tokens.border.radiusSm}px`;
  vars["--radius-md"] = `${tokens.border.radiusMd}px`;
  vars["--radius-lg"] = `${tokens.border.radiusLg}px`;
  vars["--radius-full"] = `${tokens.border.radiusFull}px`;
  vars["--border-width"] = `${tokens.border.borderWidth}px`;

  vars["--shadow-sm"] = tokens.shadows.sm.value;
  vars["--shadow-md"] = tokens.shadows.md.value;
  vars["--shadow-lg"] = tokens.shadows.lg.value;
  vars["--shadow-xl"] = tokens.shadows.xl.value;

  if (tokens.custom) {
    for (const [k, v] of Object.entries(tokens.custom)) {
      vars[`--custom-${k}`] = String(v);
    }
  }
  return vars;
}

/** Build a complete :root CSS block. */
export function compileToCssBlock(tokens: DesignTokens): string {
  const vars = compileToCssVars(tokens);
  return `:root {\n${Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join("\n")}\n}`;
}

/** Compile tokens to DaisyUI theme format. */
export function compileToDaisyUI(tokens: DesignTokens): Record<string, string> {
  return {
    primary: tokens.colors.primary[600],
    "primary-content": tokens.colors.textInverse,
    secondary: tokens.colors.secondary[600],
    "secondary-content": tokens.colors.textInverse,
    accent: tokens.colors.accent[600],
    "accent-content": tokens.colors.textInverse,
    neutral: tokens.colors.neutral[700],
    "neutral-content": tokens.colors.textInverse,
    "base-100": tokens.colors.background,
    "base-200": tokens.colors.surface,
    "base-300": tokens.colors.border,
    "base-content": tokens.colors.textPrimary,
    info: tokens.colors.info[500],
    success: tokens.colors.success[600],
    warning: tokens.colors.warning[500],
    error: tokens.colors.error[600],
    "--rounded-btn": `${tokens.border.radiusMd}px`,
    "--rounded-box": `${tokens.border.radiusLg}px`,
  };
}
