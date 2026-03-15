import { createLogger } from "@hospital-cms/logger";
import { generateRsaKeyPair, signWithPrivateKey } from "@hospital-cms/crypto-vendor";
import { writeFileSync } from "node:fs";

const logger = createLogger({ module: "KeyRotator" });

export interface KeyRotationResult {
  success: boolean;
  message: string;
}

/**
 * Handles ROTATE_INSTANCE_KEY commands from the vendor control panel.
 *
 * Protocol:
 * 1. Generate new RSA-4096 key pair
 * 2. Sign { instanceId, newPublicKey, timestamp } with OLD private key
 * 3. Send rotation request to CP
 * 4. CP verifies with stored old key, stores new key with 24h grace period
 * 5. Agent updates in-memory key and persists to disk if key path is set
 * 6. Future heartbeats use the new key
 */
export class KeyRotator {
  constructor(
    private readonly controlPanelUrl: string,
    private readonly instanceId: string,
    private readonly getCurrentPrivateKey: () => string,
    private readonly onKeyRotated: (newPrivateKey: string) => void,
    private readonly privateKeyPath?: string,
  ) {}

  async rotate(): Promise<KeyRotationResult> {
    try {
      // 1. Read current private key
      const oldPrivateKey = this.getCurrentPrivateKey();

      // 2. Generate new RSA-4096 key pair
      const newKeyPair = generateRsaKeyPair();
      logger.info("New RSA-4096 key pair generated");

      // 3. Build and sign rotation request with OLD key
      const timestamp = Date.now();
      const unsigned = {
        instanceId: this.instanceId,
        newPublicKey: newKeyPair.publicKey,
        timestamp,
      };
      const signedData = JSON.stringify(unsigned, Object.keys(unsigned).sort());
      const signature = signWithPrivateKey(Buffer.from(signedData), oldPrivateKey);

      // 4. Send to control panel
      const response = await fetch(
        `${this.controlPanelUrl}/api/agent/rotate-key`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...unsigned, signature }),
          signal: AbortSignal.timeout(15000),
        },
      );

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Key rotation rejected: ${response.status} ${body}`);
      }

      // 5. Persist new private key to disk if path is configured
      if (this.privateKeyPath) {
        writeFileSync(this.privateKeyPath, newKeyPair.privateKey, { mode: 0o600 });
        logger.info({ path: this.privateKeyPath }, "New private key persisted to disk");
      }

      // 6. Update in-memory key for immediate use
      this.onKeyRotated(newKeyPair.privateKey);

      logger.info({ instanceId: this.instanceId }, "Instance key rotation completed successfully");

      return { success: true, message: "Key rotation completed" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err, instanceId: this.instanceId }, "Key rotation failed");
      return { success: false, message: `Key rotation failed: ${message}` };
    }
  }
}
