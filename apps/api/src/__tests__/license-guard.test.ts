/**
 * License guard unit tests — Phase 4
 *
 * We test the guard in isolation by mocking @hospital-cms/database and
 * @hospital-cms/crypto so no real MongoDB or RSA keys are needed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";

//  Mocks must be declared before importing the module under test
vi.mock("@hospital-cms/database", () => ({
  LicenseRepository: vi.fn().mockImplementation(() => ({
    findActiveLicense: vi.fn(),
    markValidated: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("@hospital-cms/crypto", () => ({
  verifyLicenseToken: vi.fn(),
}));

// Stub hospital_instance lookup
const mockDbFindOne = vi.fn();
const mockDb = {
  collection: vi.fn().mockReturnValue({ findOne: mockDbFindOne }),
} as any;

//  Import after mocks are in place
import {
  licenseGuard,
  requireFeature,
  _resetLicenseCache,
  getCachedLicenseInfo,
} from "../middleware/license-guard";
import { LicenseRepository } from "@hospital-cms/database";
import { verifyLicenseToken } from "@hospital-cms/crypto";
import {
  LicenseExpiredError,
  LicenseFeatureDisabledError,
} from "@hospital-cms/errors";

const res = {} as Response;
const makeNext = () => vi.fn() as unknown as NextFunction;

function verifiedResult(
  overrides: Partial<{
    licenseId: string;
    instanceId: string;
    tier: string;
    features: string[];
    issuedAt: string;
    expiresAt: string;
    maxBeds: number;
    maxUsers: number;
  }> = {},
) {
  return {
    licenseId: "lic-001",
    instanceId: "instance-001",
    tier: "professional",
    features: ["patients", "workflow_engine", "plugin_runtime"],
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    maxBeds: 500,
    maxUsers: 200,
    ...overrides,
  };
}

beforeEach(() => {
  _resetLicenseCache();
  vi.clearAllMocks();
  process.env["VENDOR_PUBLIC_KEY"] = "";

  mockDbFindOne.mockResolvedValue({ instanceId: "instance-001" });

  const repoInstance = new (LicenseRepository as any)();
  repoInstance.findActiveLicense.mockResolvedValue({
    licenseId: "lic-001",
    instanceId: "instance-001",
    tier: "professional",
    status: "ACTIVE",
    features: ["patients", "workflow_engine", "plugin_runtime"],
    maxUsers: 200,
    maxBeds: 500,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    token: "signed.token.here",
    signature: "sig",
  });
  (LicenseRepository as any).mockImplementation(() => repoInstance);
});

describe("licenseGuard", () => {
  it("passes when no VENDOR_PUBLIC_KEY set (dev mode — DB-only check)", async () => {
    const next = makeNext();
    await licenseGuard(mockDb)({} as Request, res, next);
    expect(next).toHaveBeenCalledWith(); // no error arg
  });

  it("passes when license token verifies correctly", async () => {
    process.env["VENDOR_PUBLIC_KEY"] = "fake-pub-key";
    vi.mocked(verifyLicenseToken).mockReturnValue(verifiedResult());

    const next = makeNext();
    await licenseGuard(mockDb)({} as Request, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(getCachedLicenseInfo()?.tier).toBe("professional");
  });

  it("caches license and skips DB on second call", async () => {
    process.env["VENDOR_PUBLIC_KEY"] = "fake-pub-key";
    vi.mocked(verifyLicenseToken).mockReturnValue(verifiedResult());

    const guard = licenseGuard(mockDb);
    await guard({} as Request, res, makeNext());
    await guard({} as Request, res, makeNext());

    // findActiveLicense should only be called once (cache hit on second call)
    const repo = new (LicenseRepository as any)();
    expect(repo.findActiveLicense).toHaveBeenCalledTimes(1);
  });

  it("returns LicenseExpiredError when token expiry is in the past", async () => {
    process.env["VENDOR_PUBLIC_KEY"] = "fake-pub-key";
    vi.mocked(verifyLicenseToken).mockReturnValue(
      verifiedResult({ expiresAt: new Date(Date.now() - 1000).toISOString() }),
    );

    const next = makeNext();
    await licenseGuard(mockDb)({} as Request, res, next);
    const err = (next as any).mock.calls[0][0];
    expect(err).toBeInstanceOf(LicenseExpiredError);
  });

  it("returns LicenseExpiredError when signature verification fails", async () => {
    process.env["VENDOR_PUBLIC_KEY"] = "fake-pub-key";
    vi.mocked(verifyLicenseToken).mockImplementation(() => {
      throw new Error("Invalid signature");
    });

    const next = makeNext();
    await licenseGuard(mockDb)({} as Request, res, next);
    const err = (next as any).mock.calls[0][0];
    expect(err).toBeInstanceOf(LicenseExpiredError);
  });

  it("returns LicenseExpiredError when no hospital_instance found", async () => {
    mockDbFindOne.mockResolvedValue(null);
    const next = makeNext();
    await licenseGuard(mockDb)({} as Request, res, next);
    const err = (next as any).mock.calls[0][0];
    expect(err).toBeInstanceOf(LicenseExpiredError);
  });
});

describe("requireFeature", () => {
  it("passes when feature is in license", async () => {
    process.env["VENDOR_PUBLIC_KEY"] = "fake-pub-key";
    vi.mocked(verifyLicenseToken).mockReturnValue(verifiedResult());
    // Load the cache first
    await licenseGuard(mockDb)({} as Request, res, makeNext());

    const next = makeNext();
    await requireFeature("workflow_engine")({} as Request, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it("blocks when feature is missing from license", async () => {
    process.env["VENDOR_PUBLIC_KEY"] = "fake-pub-key";
    vi.mocked(verifyLicenseToken).mockReturnValue(
      verifiedResult({ features: ["patients"] }),
    );
    await licenseGuard(mockDb)({} as Request, res, makeNext());

    const next = makeNext();
    await requireFeature("plugin_runtime")({} as Request, res, next);
    const err = (next as any).mock.calls[0][0];
    expect(err).toBeInstanceOf(LicenseFeatureDisabledError);
  });
});
