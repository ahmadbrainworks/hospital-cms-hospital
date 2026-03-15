import { describe, it, expect } from "vitest";
import {
  validateThemeManifest,
  buildCssVariables,
  getThemeSigningPayload,
  verifyThemeSignature,
} from "../theme-validator";
import {
  generateRsaKeyPair,
  signWithPrivateKey,
} from "@hospital-cms/crypto-vendor";
import { ValidationError } from "@hospital-cms/errors";

const BASE_MANIFEST = {
  themeId: "corp-blue",
  name: "Corporate Blue",
  version: "1.0.0",
  description: "Corporate blue theme for hospital branding",
  author: "Vendor",
  signature: "placeholder",
  publicKeyId: "key-001",
  variables: [
    { key: "--color-primary", value: "#1e40af" },
    { key: "--font-family-base", value: "Inter, sans-serif" },
  ],
};

describe("validateThemeManifest", () => {
  it("accepts a valid manifest", () => {
    const r = validateThemeManifest(BASE_MANIFEST);
    expect(r.themeId).toBe("corp-blue");
    expect(r.variables).toHaveLength(2);
  });

  it("rejects invalid themeId", () => {
    expect(() =>
      validateThemeManifest({ ...BASE_MANIFEST, themeId: "Corp_Blue!" }),
    ).toThrow(ValidationError);
  });

  it("rejects variable key without -- prefix", () => {
    expect(() =>
      validateThemeManifest({
        ...BASE_MANIFEST,
        variables: [{ key: "primaryColor", value: "#000" }],
      }),
    ).toThrow(ValidationError);
  });

  it("rejects empty variables array", () => {
    expect(() =>
      validateThemeManifest({ ...BASE_MANIFEST, variables: [] }),
    ).toThrow(ValidationError);
  });

  it("rejects non-semver version", () => {
    expect(() =>
      validateThemeManifest({ ...BASE_MANIFEST, version: "1.0" }),
    ).toThrow(ValidationError);
  });
});

describe("verifyThemeSignature", () => {
  it("passes for correctly signed manifest", () => {
    const pair = generateRsaKeyPair();
    const { signature: _, ...rest } = BASE_MANIFEST;
    const payload = getThemeSigningPayload(
      rest as Parameters<typeof getThemeSigningPayload>[0],
    );
    const signature = signWithPrivateKey(payload, pair.privateKey);
    expect(() =>
      verifyThemeSignature(
        { ...BASE_MANIFEST, signature } as Parameters<
          typeof verifyThemeSignature
        >[0],
        pair.publicKey,
      ),
    ).not.toThrow();
  });

  it("rejects tampered manifest", () => {
    const pair = generateRsaKeyPair();
    const { signature: _, ...rest } = BASE_MANIFEST;
    const payload = getThemeSigningPayload(
      rest as Parameters<typeof getThemeSigningPayload>[0],
    );
    const signature = signWithPrivateKey(payload, pair.privateKey);
    expect(() =>
      verifyThemeSignature(
        { ...BASE_MANIFEST, name: "TAMPERED", signature } as Parameters<
          typeof verifyThemeSignature
        >[0],
        pair.publicKey,
      ),
    ).toThrow();
  });
});

describe("buildCssVariables", () => {
  it("produces :root block with declarations", () => {
    const css = buildCssVariables([
      { key: "--color-primary", value: "#1e40af" },
      { key: "--font-family-base", value: "Inter, sans-serif" },
    ]);
    expect(css).toContain(":root {");
    expect(css).toContain("--color-primary: #1e40af;");
    expect(css).toContain("--font-family-base: Inter, sans-serif;");
  });
});
