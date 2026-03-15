/**
 * SSE routes
 *
 * POST /events/ticket  — exchange a valid JWT for a short-lived, single-use
 *                        SSE ticket (30 s TTL). Requires Authorization header.
 *
 * GET  /events?ticket= — open the SSE stream. The ticket is validated once and
 *                        deleted immediately (no JWT in query string / logs).
 *
 * EventSource cannot send custom headers, so we use the two-step ticket
 * exchange instead of embedding the JWT directly in the URL.
 */
import { Router } from "express";
import { verifyAccessToken } from "@hospital-cms/auth";
import { UnauthorizedError } from "@hospital-cms/errors";
import { sseConnect } from "../modules/sse/sse-manager";
import { issueTicket, consumeTicket } from "../modules/sse/sse-ticket-store";

export function sseRouter(): Router {
  const router = Router();

  /**
   * POST /events/ticket
   *
   * The client calls this with a valid Bearer JWT to obtain a short-lived
   * ticket that can be passed to the GET endpoint below.
   */
  router.post("/ticket", (req, res, next) => {
    try {
      const authHeader = req.headers["authorization"];
      if (!authHeader?.startsWith("Bearer ")) {
        throw new UnauthorizedError("Missing Authorization header");
      }
      const payload = verifyAccessToken(authHeader.slice(7));
      if (!payload.hospitalId || !payload.sub) {
        throw new UnauthorizedError("Invalid token");
      }
      const ticket = issueTicket(payload.hospitalId, payload.sub);
      res.json({ success: true, data: { ticket } });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /events?ticket=<ticket>
   *
   * Opens the SSE stream. The ticket is consumed on first use.
   */
  router.get("/", (req, res, next) => {
    try {
      const raw = req.query["ticket"];
      if (!raw || typeof raw !== "string") {
        throw new UnauthorizedError("Missing ticket");
      }
      const identity = consumeTicket(raw);
      if (!identity) {
        throw new UnauthorizedError("Invalid or expired SSE ticket");
      }
      sseConnect(identity.hospitalId, identity.userId, res);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
