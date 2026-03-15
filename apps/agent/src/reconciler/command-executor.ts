import { createLogger } from "@hospital-cms/logger";
import { verifyPayload } from "@hospital-cms/crypto";
import type { CommandRecord } from "../services/types";

const logger = createLogger({ module: "CommandExecutor" });

export type CommandResult = { success: boolean; message: string };

export type CommandHandler = (
  payload: Record<string, unknown>,
) => Promise<CommandResult>;

/**
 * Executes vendor-issued, RSA-signed operational commands.
 * Each command type maps to a registered handler.
 * Unknown commands are rejected; expired commands are skipped.
 */
export class CommandExecutor {
  private readonly handlers = new Map<string, CommandHandler>();

  constructor(
    private readonly vendorPublicKey: string,
    private readonly apiBaseUrl: string,
    private readonly apiAdminToken: string,
  ) {
    this.registerBuiltins();
  }

  register(type: string, handler: CommandHandler): void {
    this.handlers.set(type, handler);
  }

  async execute(command: CommandRecord): Promise<CommandResult> {
    // Check expiry
    if (new Date(command.expiresAt) < new Date()) {
      logger.warn(
        { commandId: command.commandId, type: command.type },
        "Command expired, skipping",
      );
      return { success: false, message: "Command expired" };
    }

    // Verify signature — stored as JSON-stringified SignedPayload
    let valid = false;
    try {
      const signedPayload = JSON.parse(command.signature);
      valid = verifyPayload(signedPayload, this.vendorPublicKey);
    } catch {
      valid = false;
    }
    if (!valid) {
      logger.error(
        { commandId: command.commandId },
        "Command signature invalid — rejecting",
      );
      return { success: false, message: "Invalid command signature" };
    }

    const handler = this.handlers.get(command.type);
    if (!handler) {
      logger.warn(
        { commandId: command.commandId, type: command.type },
        "Unknown command type",
      );
      return {
        success: false,
        message: `Unknown command type: ${command.type}`,
      };
    }

    logger.info(
      { commandId: command.commandId, type: command.type },
      "Executing command",
    );
    try {
      const result = await handler(command.payload);
      logger.info(
        { commandId: command.commandId, success: result.success },
        "Command executed",
      );
      return result;
    } catch (err) {
      const message = (err as Error).message;
      logger.error(
        { commandId: command.commandId, err },
        "Command execution failed",
      );
      return { success: false, message };
    }
  }

  private registerBuiltins(): void {
    // RESTART_API — sends SIGTERM to the API process (managed by process supervisor)
    this.register("RESTART_API", async (_payload) => {
      logger.info("Executing RESTART_API command");
      // In production this would signal systemd/supervisor; here we demonstrate the pattern
      process.emit("SIGUSR2" as any);
      return { success: true, message: "Restart signal sent to API process" };
    });

    // CLEAR_CACHE — triggers a cache clear via local API (uses agent config, not payload)
    this.register("CLEAR_CACHE", async (_payload) => {
      const response = await fetch(`${this.apiBaseUrl}/api/v1/system/cache/clear`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiAdminToken}` },
        signal: AbortSignal.timeout(10000),
      });
      return {
        success: response.ok,
        message: response.ok
          ? "Cache cleared"
          : `Cache clear failed: ${response.status}`,
      };
    });

    // ROTATE_KEYS — initiates key rotation (placeholder; real implementation is system-specific)
    this.register("ROTATE_KEYS", async (_payload) => {
      logger.info(
        "ROTATE_KEYS command received — initiate key rotation workflow",
      );
      return { success: true, message: "Key rotation initiated" };
    });

    // SET_LOG_LEVEL — adjusts runtime log level
    this.register("SET_LOG_LEVEL", async (payload) => {
      const level = payload["level"] as string;
      if (!["trace", "debug", "info", "warn", "error"].includes(level)) {
        return { success: false, message: `Invalid log level: ${level}` };
      }
      process.env["LOG_LEVEL"] = level;
      logger.info({ level }, "Log level updated");
      return { success: true, message: `Log level set to ${level}` };
    });
  }
}
