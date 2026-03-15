/**
 * Server-Sent Events (SSE) connection manager.
 *
 * Each authenticated user gets one SSE channel per hospital.
 * Events are pushed from audit hooks, plugin events, and alert service.
 *
 * Connections are stored in memory — for HA setups pair with Redis pub/sub
 * to broadcast across API pods.
 */
import type { Response } from "express";

export interface SseClient {
  userId: string;
  hospitalId: string;
  res: Response;
  connectedAt: Date;
}

const clients = new Map<string, SseClient>(); // key: `${hospitalId}:${userId}`

function key(hospitalId: string, userId: string): string {
  return `${hospitalId}:${userId}`;
}

export function sseConnect(
  hospitalId: string,
  userId: string,
  res: Response,
): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // nginx: disable buffering
  res.flushHeaders();

  // Displace existing connection for same user (new tab/reload)
  const existing = clients.get(key(hospitalId, userId));
  if (existing) {
    existing.res.end();
  }

  const client: SseClient = { userId, hospitalId, res, connectedAt: new Date() };
  clients.set(key(hospitalId, userId), client);

  // Heartbeat every 25s to keep connection alive through proxies
  const heartbeat = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(heartbeat);
      clients.delete(key(hospitalId, userId));
      return;
    }
    res.write(": heartbeat\n\n");
  }, 25_000);

  res.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(key(hospitalId, userId));
  });

  // Send initial connected event
  pushToClient(client, "connected", { message: "SSE stream established" });
}

export function pushToUser(
  hospitalId: string,
  userId: string,
  event: string,
  data: unknown,
): void {
  const client = clients.get(key(hospitalId, userId));
  if (client && !client.res.writableEnded) {
    pushToClient(client, event, data);
  }
}

export function broadcastToHospital(
  hospitalId: string,
  event: string,
  data: unknown,
): void {
  for (const client of clients.values()) {
    if (client.hospitalId === hospitalId && !client.res.writableEnded) {
      pushToClient(client, event, data);
    }
  }
}

function pushToClient(client: SseClient, event: string, data: unknown): void {
  try {
    client.res.write(`event: ${event}\n`);
    client.res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch {
    // Connection dropped — will be cleaned up on next heartbeat
  }
}

export function getConnectionCount(hospitalId: string): number {
  let count = 0;
  for (const client of clients.values()) {
    if (client.hospitalId === hospitalId) count++;
  }
  return count;
}
