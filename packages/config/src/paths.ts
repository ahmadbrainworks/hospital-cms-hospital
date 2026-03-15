/**
 * Shared path constants for the hospital CMS data directory.
 *
 * All generated files (lock file, keys, state, packages, plugins, themes)
 * live under a single `.data/` directory in the project root.
 * Override with HOSPITAL_DATA_DIR env var for custom deployments.
 */
import { resolve } from "node:path";

const MONOREPO_ROOT = resolve(__dirname, "../../..");

export const DATA_DIR =
  process.env["HOSPITAL_DATA_DIR"] ?? resolve(MONOREPO_ROOT, ".data");

export const DEFAULT_LOCK_FILE = resolve(DATA_DIR, "installer.lock");
export const DEFAULT_PRIVATE_KEY_PATH = resolve(DATA_DIR, "instance.key");
export const DEFAULT_PUBLIC_KEY_PATH = resolve(DATA_DIR, "instance.pub");
export const DEFAULT_STATE_FILE = resolve(DATA_DIR, "state.json");
export const DEFAULT_PACKAGES_DIR = resolve(DATA_DIR, "packages");
export const DEFAULT_PLUGINS_DIR = resolve(DATA_DIR, "plugins");
export const DEFAULT_THEMES_DIR = resolve(DATA_DIR, "themes");

/** Fixed vendor control-panel API URL — all hospital instances communicate here. */
export const VENDOR_CP_API_URL = "https://cp-api.hospitalcms.com";

/**
 * Vendor RSA-4096 public key (PEM).
 * Used to verify signed licenses, commands, and packages from the vendor.
 * This is a trust anchor — embedded at build time, updated via key rotation.
 */
export const EMBEDDED_VENDOR_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAxOkR/NNMaIpjtWpU2Ngb
8dVC1NRnqBkY7KV0IuFalpoZpSR1Fc7Jsm3pILT9TrJOV+dtfpIXSSPpX6WUHKz4
GkSf6Du7P7gsgMljKsnvgWpKe8DhWTtPag9Cdg4I1W5bUIgCeYjz924omfUMOwoF
hFo1yuFsyOoJCzUGei1CwnnYV3vSNLOQsdi/uWacebV3HROxVi/ZZqXpFR3nIKgq
0fIuKjMLGmZdcz5YFTPrsIU7LqwFYb20ioo2vBaY7k9PFGAIMpYQpZfFgQydH8Wb
Zg7/vrUhAzOSMH4EKSAjwnh0wgJyGWhAZk10u1JnBP8rHIEq97OpxtBLUybfwQE5
p3hywkM4rt2MU6ybCDuPUYFwTnshWprq/J+XbLQ86Vc6WSoXwZTuT+NpfdjqIpkH
W49AICpRd9xQwTr2mgbqXrQYDEG+1g5l3H+DN5yyPNZpfbzC1pFoVKS0zR6j60t3
Kf4N52OiVC8nV3GQppH1Q9fSTMkQdbSS9hcdITbXiISlZfo8hYa9/YugTBn+XrNL
dklpBkgQzuP3YgKINwA8UIDQvRv/ZqQIj6+TVga1ebuyg8sQXWbdVOcBtumM5XxR
wYk+LrrbsofZubaDRFs3bhyI5IzwZLJwRgdagTYiE98DKSC1slZfVk/PQ0vX9ruq
g2OdLuP8ZH71CqcqN4D6wB8CAwEAAQ==
-----END PUBLIC KEY-----`;
