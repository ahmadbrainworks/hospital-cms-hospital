import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("production"),
  CONTROL_PANEL_PORT: z.coerce.number().int().positive().default(4001),
  CONTROL_PANEL_MONGODB_URI: z
    .string()
    .min(1, "CONTROL_PANEL_MONGODB_URI is required"),
  VENDOR_API_KEY: z.string().min(8, "VENDOR_API_KEY must be at least 8 chars"),
  /** RSA-4096 vendor private key (PEM) for signing licenses/commands */
  VENDOR_PRIVATE_KEY: z.string().min(100),
  /** RSA-4096 vendor public key (PEM) distributed to instances */
  VENDOR_PUBLIC_KEY: z.string().min(100),
  VENDOR_DASHBOARD_ORIGIN: z.string().optional(),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug", "trace"]).default("info"),
  /** HMAC secret for vendor → control-panel webhook signatures (if used) */
  VENDOR_HMAC_SECRET: z.string().optional(),

  // Staff authentication (JWT-based, separate from client CMS)
  CP_JWT_SECRET: z.string().min(32, "CP_JWT_SECRET must be at least 32 chars").default("dev-vendor-jwt-secret-change-in-production!!"),
  CP_JWT_EXPIRY: z.string().default("15m"),
  CP_REFRESH_TOKEN_SECRET: z.string().min(32, "CP_REFRESH_TOKEN_SECRET must be at least 32 chars").default("dev-vendor-refresh-secret-change-in-prod!!"),
  CP_REFRESH_TOKEN_EXPIRY: z.string().default("7d"),

  // Initial admin seed (used on first startup when cp_staff is empty)
  CP_INITIAL_ADMIN_EMAIL: z.string().email().optional(),
  CP_INITIAL_ADMIN_PASSWORD: z.string().min(8).optional(),
});

export type ControlPanelConfig = z.infer<typeof schema>;

let _config: ControlPanelConfig | null = null;

export function getControlPanelConfig(): ControlPanelConfig {
  if (!_config) {
    const result = schema.safeParse(process.env);
    if (!result.success) {
      const formatted = result.error.errors
        .map((e) => `  ${e.path.join(".")}: ${e.message}`)
        .join("\n");
      throw new Error(`Control-panel config validation failed:\n${formatted}`);
    }
    _config = result.data;
  }
  return _config;
}

export function resetControlPanelConfig(): void {
  _config = null;
}
