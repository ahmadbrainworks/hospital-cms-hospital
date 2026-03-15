/**
 * Single-use SSE ticket store.
 *
 * A ticket is a short-lived (30 s) opaque token issued by
 * POST /api/v1/events/ticket (authenticated endpoint).
 * The client presents it once to GET /api/v1/events?ticket=<t>.
 * After that single use, or on expiry, the ticket is deleted.
 */
import { randomBytes } from "crypto";

interface Ticket {
  hospitalId: string;
  userId: string;
  expiresAt: number;
}

const TICKET_TTL_MS = 30_000; // 30 seconds

const store = new Map<string, Ticket>();

export function issueTicket(hospitalId: string, userId: string): string {
  const token = randomBytes(32).toString("hex");
  store.set(token, { hospitalId, userId, expiresAt: Date.now() + TICKET_TTL_MS });
  return token;
}

/** Consume (and delete) a ticket. Returns null if missing or expired. */
export function consumeTicket(token: string): { hospitalId: string; userId: string } | null {
  const ticket = store.get(token);
  if (!ticket) return null;
  store.delete(token); // single-use
  if (Date.now() > ticket.expiresAt) return null;
  return { hospitalId: ticket.hospitalId, userId: ticket.userId };
}

/** Sweep expired tickets — called periodically. */
export function sweepExpired(): void {
  const now = Date.now();
  for (const [token, ticket] of store.entries()) {
    if (now > ticket.expiresAt) store.delete(token);
  }
}

// Run sweep every 60 s (background housekeeping)
setInterval(sweepExpired, 60_000).unref();
