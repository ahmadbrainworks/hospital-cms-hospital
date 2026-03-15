import pino from "pino";

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
  const nodeEnv = process.env["NODE_ENV"] === "development"
    ? "development"
    : process.env["NODE_ENV"] === "test"
      ? "test"
      : "production";
  const logLevel = (
    process.env["LOG_LEVEL"] === "error"
    || process.env["LOG_LEVEL"] === "warn"
    || process.env["LOG_LEVEL"] === "info"
    || process.env["LOG_LEVEL"] === "debug"
    || process.env["LOG_LEVEL"] === "trace"
  )
    ? process.env["LOG_LEVEL"]
    : "info";
  const isDev = nodeEnv === "development";

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
      level: logLevel,
      base: {
        service: "hospital-cms",
        env: nodeEnv,
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
