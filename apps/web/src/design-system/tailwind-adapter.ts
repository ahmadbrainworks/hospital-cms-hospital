/**
 * Tailwind CSS adapter.
 *
 * Maps design token CSS custom properties to Tailwind utility classes
 * via CSS variable references. This allows `className="bg-primary-500"`
 * to resolve to `var(--color-primary-500)` at runtime.
 */

/** Generate a Tailwind color config that references CSS custom properties. */
function cssVarColor(prefix: string) {
  const shades: Record<string, string> = {};
  for (const shade of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]) {
    shades[shade] = `var(${prefix}-${shade})`;
  }
  shades["DEFAULT"] = `var(${prefix}-500)`;
  return shades;
}

/**
 * Tailwind theme extension that maps to design token CSS custom properties.
 * Use in tailwind.config.js: `theme: { extend: tokenThemeExtension }`
 */
export const tokenThemeExtension = {
  colors: {
    primary: cssVarColor("--color-primary"),
    secondary: cssVarColor("--color-secondary"),
    accent: cssVarColor("--color-accent"),
    neutral: cssVarColor("--color-neutral"),
    success: cssVarColor("--color-success"),
    warning: cssVarColor("--color-warning"),
    error: cssVarColor("--color-error"),
    info: cssVarColor("--color-info"),
    bg: "var(--color-bg)",
    surface: "var(--color-surface)",
    "surface-raised": "var(--color-surface-raised)",
    "text-primary": "var(--color-text)",
    "text-secondary": "var(--color-text-secondary)",
    border: "var(--color-border)",
    "border-strong": "var(--color-border-strong)",
  },
  fontFamily: {
    sans: "var(--font-family)",
    heading: "var(--font-family-heading, var(--font-family))",
    mono: "var(--font-family-mono, ui-monospace, monospace)",
  },
  borderRadius: {
    sm: "var(--radius-sm)",
    md: "var(--radius-md)",
    lg: "var(--radius-lg)",
    full: "var(--radius-full)",
  },
  boxShadow: {
    sm: "var(--shadow-sm)",
    md: "var(--shadow-md)",
    lg: "var(--shadow-lg)",
    xl: "var(--shadow-xl)",
  },
};
