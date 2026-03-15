import { z } from "zod";
import type { ThemeManifest } from "@hospital-cms/shared-types";
import { ValidationError } from "@hospital-cms/errors";
import { verifyWithPublicKey } from "@hospital-cms/crypto";

// THEME MANIFEST VALIDATOR
// Themes can ONLY alter visual presentation: colors, typography,
// branding, layout. They CANNOT alter business logic.

const CSS_VAR_PATTERN = /^--[a-z][a-z0-9-]*$/;
const HEX_OR_RGB = /^(#[0-9a-fA-F]{3,8}|rgb\(|rgba\(|hsl\(|var\(|[a-z]+)$/;

const themeVariableSchema = z.object({
  key: z
    .string()
    .regex(CSS_VAR_PATTERN, "key must be a CSS custom property (--name)"),
  value: z.string().min(1),
  description: z.string().optional(),
});

const themeFontSchema = z.object({
  family: z.string().min(1),
  url: z.string().url(),
  weights: z.array(z.number().int().positive()),
});

export const themeManifestSchema = z.object({
  themeId: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[a-z0-9-]+$/, "themeId must be lowercase-hyphenated"),
  name: z.string().min(1).max(100),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string().min(1).max(500),
  author: z.string().min(1),
  signature: z.string().min(1),
  publicKeyId: z.string().min(1),
  variables: z.array(themeVariableSchema).min(1),
  fonts: z.array(themeFontSchema).optional(),
  logo: z.string().url().optional().or(z.literal("")).optional(),
  favicon: z.string().url().optional().or(z.literal("")).optional(),
});

export type ValidatedThemeManifest = z.infer<typeof themeManifestSchema>;

export function validateThemeManifest(raw: unknown): ValidatedThemeManifest {
  const result = themeManifestSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.errors.reduce<Record<string, string>>(
      (acc, e: z.ZodIssue) => {
        acc[e.path.join(".")] = e.message;
        return acc;
      },
      {},
    );
    throw new ValidationError("Theme manifest is invalid", details);
  }
  return result.data;
}

function themeSigningPayload(manifest: ThemeManifest): string {
  const { signature, ...rest } = manifest;
  return JSON.stringify(rest, Object.keys(rest).sort());
}

export function verifyThemeSignature(
  manifest: ThemeManifest,
  vendorPublicKeyPem: string,
): void {
  const payload = themeSigningPayload(manifest);
  const valid = verifyWithPublicKey(
    payload,
    manifest.signature,
    vendorPublicKeyPem,
  );
  if (!valid) {
    throw new ValidationError(
      `Theme '${manifest.themeId}' has an invalid vendor signature.`,
    );
  }
}

// Build a CSS custom properties string for SSR injection
export function buildCssVariables(
  variables: ThemeManifest["variables"],
): string {
  const decls = variables.map((v) => `  ${v.key}: ${v.value};`).join("\n");
  return `:root {\n${decls}\n}`;
}

export function getThemeSigningPayload(
  manifest: Omit<ThemeManifest, "signature">,
): string {
  return JSON.stringify(manifest, Object.keys(manifest).sort());
}
