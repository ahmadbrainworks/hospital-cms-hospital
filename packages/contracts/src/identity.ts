/**
 * Identity contract.
 *
 * Describes the cryptographic identity documents exchanged during
 * instance registration and subsequent authenticated communication.
 */

/** Sent by the installer to the control-panel to register a new instance */
export interface InstanceRegistrationRequest {
  /**
   * Short-lived token issued by the vendor and entered during installation.
   * The control-panel verifies this before accepting registration.
   */
  registrationToken: string;
  /** Instance's RSA-4096 public key in PEM format */
  publicKey: string;
  hospitalName: string;
  /** Requested license tier */
  tier: string;
  agentVersion: string;
  /** ISO-8601 */
  registeredAt: string;
}

/** Returned by the control-panel on successful registration */
export interface InstanceRegistrationResponse {
  instanceId: string;
  /** Initial signed license token (JWT) */
  licenseToken: string;
  /** Vendor RSA-4096 public key in PEM format (for verifying signed commands) */
  vendorPublicKey: string;
  /** ISO-8601 */
  activatedAt: string;
}

/**
 * Command envelope sent from the control-panel to the agent.
 * The body is an opaque JSON object; its schema depends on `type`.
 */
export type CommandType =
  | "INSTALL_PACKAGE"
  | "REMOVE_PACKAGE"
  | "APPLY_CONFIG"
  | "RESTART_SERVICE"
  | "ROTATE_LICENSE"
  | "CLEAR_CACHE"
  | "COLLECT_DIAGNOSTICS";

export interface CommandEnvelope {
  commandId: string;
  instanceId: string;
  type: CommandType;
  payload: Record<string, unknown>;
  /** ISO-8601 */
  issuedAt: string;
  /**
   * RSA-4096 signature (base64) over canonical JSON of this envelope
   * (signature field set to "" before signing).
   * Signed with the vendor private key; verified by the agent using the
   * vendorPublicKey obtained at registration.
   */
  signature: string;
}

/** Result posted back to the control-panel after command execution */
export interface CommandResult {
  commandId: string;
  instanceId: string;
  success: boolean;
  /** ISO-8601 */
  completedAt: string;
  output?: string;
  error?: string;
  /**
   * RSA-4096 signature (base64) over canonical JSON of this result
   * (signature field set to "" before signing).
   * Signed with the instance private key.
   */
  signature: string;
}
