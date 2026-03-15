import pino from "pino";
import { getConfig } from "@hospital-cms/config";

// STRUCTURED LOGGER
// Production: JSON to stdout (for log shippers)
// Development: pretty-printed to stdout
// Never log secrets, passwords, or PII in raw form.

export type LogLevel = "error" | "warn" | "info" | "debug" | "trace";

export interface LogContext {
  traceId?: string;
  userId?: string;
  hospitalId?: string;
  module?: string;
  [key: string]: unknown;
}

let _rootLogger: pino.Logger | null = null;

function buildRootLogger(): pino.Logger {
  const cfg = getConfig();
  const isDev = cfg.NODE_ENV === "development";

  const transport = isDev
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      }
    : undefined;

  return pino(
    {
      level: cfg.LOG_LEVEL,
      base: {
        service: "hospital-cms",
        env: cfg.NODE_ENV,
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: {
        paths: [
          "password",
          "passwordHash",
          "mfaSecret",
          "*.password",
          "*.passwordHash",
          "*.mfaSecret",
          "authorization",
          "*.authorization",
        ],
        censor: "[REDACTED]",
      },
      formatters: {
        level(label) {
          return { level: label };
        },
      },
    },
    transport ? pino.transport(transport) : undefined,
  );
}

export function getRootLogger(): pino.Logger {
  if (!_rootLogger) {
    _rootLogger = buildRootLogger();
  }
  return _rootLogger;
}

export function createLogger(context: LogContext & { module: string }) {
  return getRootLogger().child(context);
}

export type Logger = ReturnType<typeof createLogger>;

// Convenience factory that can be used anywhere in the system
export function logger(module: string, ctx?: LogContext) {
  return createLogger({ module, ...ctx });
}

// Request-scoped logger — attach to req context
export function requestLogger(
  traceId: string,
  userId?: string,
  hospitalId?: string,
) {
  return getRootLogger().child({
    traceId,
    userId,
    hospitalId,
  });
}
