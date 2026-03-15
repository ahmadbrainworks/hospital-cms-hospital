import { MongoClient, Db } from "mongodb";
import { getConfig } from "@hospital-cms/config";
import { logger } from "@hospital-cms/logger";
import { DatabaseError } from "@hospital-cms/errors";

// MONGODB CLIENT SINGLETON
// Manages connection lifecycle and exposes the Db instance.

type DatabaseLogger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};

let _log: DatabaseLogger | null = null;

function getLog(): DatabaseLogger {
  if (_log) {
    return _log;
  }

  try {
    _log = logger("database:client");
  } catch {
    _log = {
      info: (obj, msg) =>
        console.info("[database:client]", msg ?? obj, msg ? obj : ""),
      warn: (obj, msg) =>
        console.warn("[database:client]", msg ?? obj, msg ? obj : ""),
      error: (obj, msg) =>
        console.error("[database:client]", msg ?? obj, msg ? obj : ""),
    };
  }

  return _log;
}

let _client: MongoClient | null = null;
let _db: Db | null = null;

export async function connectDatabase(): Promise<Db> {
  const log = getLog();

  if (_db !== null) {
    return _db;
  }

  const cfg = getConfig();
  const client = new MongoClient(cfg.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 30000,
    maxPoolSize: 50,
    minPoolSize: 5,
    retryWrites: true,
    retryReads: true,
  });

  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });

    _client = client;
    _db = client.db(cfg.MONGODB_DB_NAME);

    log.info({ uri: sanitizeUri(cfg.MONGODB_URI) }, "MongoDB connected");

    client.on("close", () => {
      log.warn("MongoDB connection closed");
      _db = null;
      _client = null;
    });

    client.on("error", (err) => {
      log.error({ err }, "MongoDB client error");
    });

    return _db;
  } catch (err) {
    log.error({ err }, "Failed to connect to MongoDB");
    throw new DatabaseError("Failed to connect to MongoDB", {
      cause: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function disconnectDatabase(): Promise<void> {
  const log = getLog();

  if (_client) {
    await _client.close();
    _client = null;
    _db = null;
    log.info("MongoDB disconnected");
  }
}

export function getDb(): Db {
  if (!_db) {
    throw new DatabaseError(
      "Database not connected. Call connectDatabase() first.",
    );
  }
  return _db;
}

export function getClient(): MongoClient {
  if (!_client) {
    throw new DatabaseError(
      "Database not connected. Call connectDatabase() first.",
    );
  }
  return _client;
}

function sanitizeUri(uri: string): string {
  try {
    const url = new URL(uri);
    if (url.password) url.password = "***";
    return url.toString();
  } catch {
    return "[invalid uri]";
  }
}
