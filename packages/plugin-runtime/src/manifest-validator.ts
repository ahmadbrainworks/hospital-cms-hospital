import { z } from "zod";
import type { PluginManifest } from "@hospital-cms/shared-types";
import { Permission } from "@hospital-cms/shared-types";
import { PluginSignatureError, ValidationError } from "@hospital-cms/errors";
import { verifyWithPublicKey } from "@hospital-cms/crypto";

// PLUGIN MANIFEST VALIDATOR
// Every plugin must carry a vendor-signed manifest.
// Unsigned or tampered plugins are rejected before loading.

const routeDefSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  path: z.string().min(1).startsWith("/"),
  requiredPermission: z.nativeEnum(Permission).optional(),
  description: z.string(),
});

const uiSlotSchema = z.object({
  slotId: z.string().min(1),
  component: z.string().min(1),
  props: z.record(z.unknown()).optional(),
});

export const pluginManifestSchema = z.object({
  pluginId: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[a-z0-9-]+$/, "pluginId must be lowercase-hyphenated"),
  name: z.string().min(1).max(100),
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, "version must be semver (x.y.z)"),
  description: z.string().min(1).max(500),
  author: z.string().min(1),
  vendorSigned: z.literal(true),
  signature: z.string().min(1),
  publicKeyId: z.string().min(1),
  entryPoint: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z0-9_/.-]+\.js$/, "entryPoint must be a .js path"),
  permissions: z.array(z.nativeEnum(Permission)),
  routes: z.array(routeDefSchema),
  events: z.array(z.string()),
  uiSlots: z.array(uiSlotSchema),
  minCoreVersion: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, "minCoreVersion must be semver"),
  maxCoreVersion: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/)
    .optional(),
});

export function validateManifestSchema(
  raw: unknown,
): z.infer<typeof pluginManifestSchema> {
  const result = pluginManifestSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.errors.reduce<Record<string, string>>(
      (acc, e: z.ZodIssue) => {
        acc[e.path.join(".")] = e.message;
        return acc;
      },
      {},
    );
    throw new ValidationError("Plugin manifest is invalid", details);
  }
  return result.data;
}

// Manifest signing covers all fields EXCEPT the signature itself.
function manifestSigningPayload(manifest: PluginManifest): string {
  const { signature, ...rest } = manifest;
  return JSON.stringify(rest, Object.keys(rest).sort());
}

export function verifyManifestSignature(
  manifest: PluginManifest,
  vendorPublicKeyPem: string,
): void {
  const payload = manifestSigningPayload(manifest);
  const valid = verifyWithPublicKey(
    payload,
    manifest.signature,
    vendorPublicKeyPem,
  );
  if (!valid) {
    throw new PluginSignatureError(manifest.pluginId);
  }
}

/**
 * Verify a manifest signature using a key registry.
 * Supports vendor signing key rotation by looking up the key
 * that matches the manifest's `publicKeyId`.
 *
 * During key rotation, both old and new keys are present in the registry,
 * allowing verification of manifests signed by either key.
 */
export function verifyManifestSignatureMultiKey(
  manifest: PluginManifest,
  vendorPublicKeys: Record<string, string>,
): void {
  const keyPem = vendorPublicKeys[manifest.publicKeyId];
  if (!keyPem) {
    throw new PluginSignatureError(
      `${manifest.pluginId}: Unknown publicKeyId '${manifest.publicKeyId}'`,
    );
  }
  const payload = manifestSigningPayload(manifest);
  const valid = verifyWithPublicKey(payload, manifest.signature, keyPem);
  if (!valid) {
    throw new PluginSignatureError(manifest.pluginId);
  }
}

// Returns the canonical signing payload so the vendor can sign it
export function getSigningPayload(
  manifest: Omit<PluginManifest, "signature">,
): string {
  return JSON.stringify(manifest, Object.keys(manifest).sort());
}
