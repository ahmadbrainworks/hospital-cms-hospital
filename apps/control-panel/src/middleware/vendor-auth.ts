/**
 * Vendor dashboard authentication for control-panel management routes.
 *
 * Requests must carry two headers:
 *   X-Vendor-Timestamp  — Unix epoch seconds (request is rejected if > 5 min skew)
 *   X-Vendor-Signature  — HMAC-SHA256(secret, "method\npath\ntimestamp\nbodyHash")
 *
 * The VENDOR_API_KEY env var is the shared secret used to produce and verify
 * the HMAC. It never travels over the wire, eliminating bearer-token exposure.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { createHash } from "crypto";
import { Request, Response, NextFunction } from "express";
import { UnauthorizedError } from "@hospital-cms/errors";

const MAX_SKEW_SECONDS = 300; // 5 minutes

function buildSigningString(
  method: string,
  path: string,
  timestamp: string,
  rawBody: string,
): string {
  const bodyHash = createHash("sha256").update(rawBody).digest("hex");
  return `${method.toUpperCase()}\n${path}\n${timestamp}\n${bodyHash}`;
}

function computeHmac(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

export function requireVendorApiKey(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const secret = process.env["VENDOR_API_KEY"];
  if (!secret) {
    next(new Error("VENDOR_API_KEY not configured on server"));
    return;
  }

  const timestamp = req.headers["x-vendor-timestamp"] as string | undefined;
  const signature = req.headers["x-vendor-signature"] as string | undefined;

  if (!timestamp || !signature) {
    next(new UnauthorizedError("Missing X-Vendor-Timestamp or X-Vendor-Signature header"));
    return;
  }

  // Replay prevention: reject requests outside the allowed time window
  const ts = parseInt(timestamp, 10);
  if (Number.isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > MAX_SKEW_SECONDS) {
    next(new UnauthorizedError("Request timestamp out of acceptable range"));
    return;
  }

  // Reconstruct the raw body string (express.json has already parsed it)
  const rawBody = req.body != null ? JSON.stringify(req.body) : "";
  const signingString = buildSigningString(req.method, req.path, timestamp, rawBody);
  const expected = computeHmac(secret, signingString);

  if (!safeEqual(expected, signature)) {
    next(new UnauthorizedError("Invalid vendor signature"));
    return;
  }

  next();
}
