import { describe, it, expect } from "vitest";
import {
  validateManifestSchema,
  verifyManifestSignature,
  getSigningPayload,
} from "../manifest-validator";
import {
  generateRsaKeyPair,
  signWithPrivateKey,
} from "@hospital-cms/crypto-vendor";
import { Permission } from "@hospital-cms/shared-types";
import { ValidationError, PluginSignatureError } from "@hospital-cms/errors";

const BASE_MANIFEST = {
  pluginId: "radiology-viewer",
  name: "Radiology Viewer",
  version: "1.0.0",
  description: "View DICOM images inside patient records",
  author: "Hospital CMS Vendor",
  vendorSigned: true as const,
  signature: "", // filled below
  publicKeyId: "vendor-key-001",
  entryPoint: "index.js",
  permissions: [Permission.PATIENT_READ],
  routes: [
    {
      method: "GET" as const,
      path: "/dicom/:studyId",
      description: "Fetch DICOM study",
    },
  ],
  events: ["patient.created"],
  uiSlots: [],
  minCoreVersion: "1.0.0",
};

describe("validateManifestSchema", () => {
  it("accepts a valid manifest", () => {
    const result = validateManifestSchema({
      ...BASE_MANIFEST,
      signature: "sig",
    });
    expect(result.pluginId).toBe("radiology-viewer");
  });

  it("rejects missing required fields", () => {
    expect(() => validateManifestSchema({ pluginId: "test" })).toThrow(
      ValidationError,
    );
  });

  it("rejects pluginId with uppercase", () => {
    expect(() =>
      validateManifestSchema({
        ...BASE_MANIFEST,
        pluginId: "UPPERCASE",
        signature: "sig",
      }),
    ).toThrow(ValidationError);
  });

  it("rejects non-semver version", () => {
    expect(() =>
      validateManifestSchema({
        ...BASE_MANIFEST,
        version: "1.0",
        signature: "sig",
      }),
    ).toThrow(ValidationError);
  });

  it("rejects vendorSigned: false", () => {
    expect(() =>
      validateManifestSchema({
        ...BASE_MANIFEST,
        vendorSigned: false,
        signature: "sig",
      }),
    ).toThrow(ValidationError);
  });

  it("rejects route without leading slash", () => {
    expect(() =>
      validateManifestSchema({
        ...BASE_MANIFEST,
        signature: "sig",
        routes: [{ method: "GET", path: "no-slash", description: "x" }],
      }),
    ).toThrow(ValidationError);
  });
});

describe("verifyManifestSignature", () => {
  it("accepts a correctly signed manifest", () => {
    const pair = generateRsaKeyPair();
    const { signature: _sig, ...rest } = BASE_MANIFEST;
    const payload = getSigningPayload(
      rest as Parameters<typeof getSigningPayload>[0],
    );
    const signature = signWithPrivateKey(payload, pair.privateKey);
    const manifest = { ...BASE_MANIFEST, signature };

    expect(() =>
      verifyManifestSignature(manifest, pair.publicKey),
    ).not.toThrow();
  });

  it("rejects a tampered manifest", () => {
    const pair = generateRsaKeyPair();
    const { signature: _sig, ...rest } = BASE_MANIFEST;
    const payload = getSigningPayload(
      rest as Parameters<typeof getSigningPayload>[0],
    );
    const signature = signWithPrivateKey(payload, pair.privateKey);
    const manifest = {
      ...BASE_MANIFEST,
      name: "TAMPERED NAME", // altered after signing
      signature,
    };

    expect(() => verifyManifestSignature(manifest, pair.publicKey)).toThrow(
      PluginSignatureError,
    );
  });

  it("rejects a manifest signed with a different key", () => {
    const pair1 = generateRsaKeyPair();
    const pair2 = generateRsaKeyPair();
    const { signature: _sig, ...rest } = BASE_MANIFEST;
    const payload = getSigningPayload(
      rest as Parameters<typeof getSigningPayload>[0],
    );
    const signature = signWithPrivateKey(payload, pair1.privateKey);
    const manifest = { ...BASE_MANIFEST, signature };

    expect(
      () => verifyManifestSignature(manifest, pair2.publicKey), // wrong public key
    ).toThrow(PluginSignatureError);
  });
});
