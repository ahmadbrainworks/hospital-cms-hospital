/**
 * Design token contract shared between the vendor theme builder and the
 * client theme-engine.  All values are resolved at build time by the
 * vendor and embedded inside ThemePackageManifest.
 */

export interface ColorScale {
  /** 50–950 shade keys, hex values */
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
  800: string;
  900: string;
  950: string;
}

export interface TypographyTokens {
  /** Font-family stack for body text */
  fontFamily: string;
  /** Font-family stack for headings */
  fontFamilyHeading?: string;
  /** Font-family stack for monospace / code */
  fontFamilyMono?: string;

  /** Base font size (px) */
  baseFontSize: number;
  /** Unitless line-height multiplier */
  lineHeight: number;

  /** Modular scale ratio (e.g. 1.25 = Major Third) */
  scaleRatio: number;
}

export interface SpacingTokens {
  /** Base spacing unit in px (default 4) */
  baseUnit: number;
}

export interface BorderTokens {
  /** Default border-radius in px */
  radiusSm: number;
  radiusMd: number;
  radiusLg: number;
  radiusFull: number;

  /** Default border width in px */
  borderWidth: number;
}

export interface ShadowToken {
  /** CSS box-shadow value */
  value: string;
}

export interface DesignTokens {
  /** Semantic colour roles — each maps to a hex value or CSS colour */
  colors: {
    primary: ColorScale;
    secondary: ColorScale;
    accent: ColorScale;
    neutral: ColorScale;
    success: ColorScale;
    warning: ColorScale;
    error: ColorScale;
    info: ColorScale;

    /** Background colours */
    background: string;
    surface: string;
    surfaceRaised: string;

    /** Text colours */
    textPrimary: string;
    textSecondary: string;
    textDisabled: string;
    textInverse: string;

    /** Border colour */
    border: string;
    borderStrong: string;
  };

  typography: TypographyTokens;
  spacing: SpacingTokens;
  border: BorderTokens;

  shadows: {
    sm: ShadowToken;
    md: ShadowToken;
    lg: ShadowToken;
    xl: ShadowToken;
  };

  /** Arbitrary extra tokens the theme designer may include */
  custom?: Record<string, string | number>;
}
