import { beforeEach, describe, expect, it, vi } from "vitest";

const upsertLease = vi.fn().mockResolvedValue(undefined);
const revokeLease = vi.fn().mockResolvedValue(undefined);

vi.mock("@hospital-cms/database", () => ({
  LicenseLeaseRepository: vi.fn().mockImplementation(() => ({
    upsertLease,
    revokeLease,
  })),
}));

vi.mock("@hospital-cms/crypto", () => ({
  verifyWithPublicKey: vi.fn(),
}));

import { verifyWithPublicKey } from "@hospital-cms/crypto";
import { LicenseRefresher } from "./license-refresher";

describe("LicenseRefresher", () => {
  const config = {
    INSTANCE_ID: "550e8400-e29b-41d4-a716-446655440000",
    VENDOR_PUBLIC_KEY: "vendor-public-key",
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("revokes the local lease when control-panel returns null", async () => {
    const refresher = new LicenseRefresher({} as never, config as never);

    await refresher.processHeartbeatLicense(null);

    expect(revokeLease).toHaveBeenCalledWith(config.INSTANCE_ID);
    expect(upsertLease).not.toHaveBeenCalled();
  });

  it("skips lease updates when the vendor signature is invalid", async () => {
    vi.mocked(verifyWithPublicKey).mockReturnValue(false);
    const refresher = new LicenseRefresher({} as never, config as never);

    await refresher.processHeartbeatLicense({
      tier: "professional",
      features: ["workflow_engine"],
      maxBeds: 250,
      issuedAt: "2026-03-11T10:00:00.000Z",
      expiresAt: "2026-03-12T10:00:00.000Z",
      signature: "bad-signature",
    });

    expect(upsertLease).not.toHaveBeenCalled();
    expect(revokeLease).not.toHaveBeenCalled();
  });

  it("writes a refreshed lease when the vendor signature is valid", async () => {
    vi.mocked(verifyWithPublicKey).mockReturnValue(true);
    const refresher = new LicenseRefresher({} as never, config as never);

    await refresher.processHeartbeatLicense({
      tier: "enterprise",
      features: ["workflow_engine", "plugin_runtime"],
      maxBeds: 999,
      issuedAt: "2026-03-11T10:00:00.000Z",
      expiresAt: "2026-03-12T10:00:00.000Z",
      signature: "good-signature",
    });

    expect(upsertLease).toHaveBeenCalledTimes(1);
    expect(upsertLease).toHaveBeenCalledWith(
      expect.objectContaining({
        instanceId: config.INSTANCE_ID,
        tier: "enterprise",
        features: ["workflow_engine", "plugin_runtime"],
        maxBeds: 999,
        issuedAt: "2026-03-11T10:00:00.000Z",
        expiresAt: "2026-03-12T10:00:00.000Z",
        vendorSignature: "good-signature",
        status: "active",
      }),
    );
  });
});
