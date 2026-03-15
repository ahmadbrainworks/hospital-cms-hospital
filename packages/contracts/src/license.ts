/**
 * License contract types.
 *
 * These are the shapes exchanged between the vendor control-panel and the
 * hospital client runtime (via the agent). They MUST NOT contain any logic
 * for generating or signing — that stays in packages/crypto-vendor on the
 * vendor side only.
 */

export type LicenseTier = "community" | "professional" | "enterprise";

export type LicenseLeaseStatus = "active" | "restricted" | "suspended" | "revoked";

/**
 * Signed license token payload — embedded in the License DB record and
 * verified by the client using the vendor public key.
 */
export interface LicenseTokenPayload {
  licenseId: string;
  instanceId: string;
  tier: LicenseTier;
  features: string[];
  maxUsers: number;
  maxBeds: number;
  issuedAt: string;   // ISO-8601
  expiresAt: string;  // ISO-8601
}

/**
 * Short-lived lease document written by the agent to the local MongoDB
 * after each successful heartbeat. The license-guard middleware reads this
 * instead of the raw license record so enforcement is always current.
 *
 * TTL index on expiresAt ensures automatic cleanup.
 */
export interface LicenseLeaseDocument {
  /** instanceId this lease belongs to */
  instanceId: string;
  tier: string;
  features: string[];
  maxBeds: number;
  /** ISO-8601 — when the lease expires (typically 2-4 hours from issuance) */
  expiresAt: string;
  /** ISO-8601 — when the underlying license token was issued by vendor */
  issuedAt: string;
  /** ISO-8601 — when the agent last wrote/refreshed this lease */
  refreshedAt: string;
  /** RSA-4096 signature (base64) from the vendor over the license payload */
  vendorSignature: string;
  status: LicenseLeaseStatus;
  /** Populated only when status === "restricted" — ISO-8601 deadline */
  restrictedSince?: string;
}

/**
 * What the license-guard middleware attaches to res.locals.license
 * for downstream middleware and route handlers to consume.
 */
export interface ActiveLicenseContext {
  instanceId: string;
  /** License tier (e.g. "basic", "professional", "enterprise") */
  tier: string;
  features: string[];
  maxBeds: number;
  /** When the current lease expires */
  expiresAt: Date;
  /** True when status === "restricted" — read-only operations still allowed */
  isRestricted: boolean;
}
