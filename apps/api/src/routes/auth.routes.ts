import { Router } from "express";
import { Db } from "mongodb";
import { z } from "zod";
import { AuthService } from "../modules/auth/auth.service";
import {
  loginSchema,
  refreshSchema,
  changePasswordSchema,
} from "../modules/auth/auth.validators";
import { authenticate } from "../middleware/authenticate";
import { sendSuccess } from "../helpers/response";
import { validatePasswordStrength, verifyAccessToken } from "@hospital-cms/auth";
import { ValidationError, UnauthorizedError } from "@hospital-cms/errors";
import { HospitalRepository } from "@hospital-cms/database";

const totpCodeSchema = z.object({ code: z.string().length(6).regex(/^\d+$/) });

// AUTH ROUTES
// POST /api/v1/auth/login
// POST /api/v1/auth/refresh
// POST /api/v1/auth/logout
// POST /api/v1/auth/change-password
// GET  /api/v1/auth/me

export function authRouter(db: Db): Router {
  const router = Router();
  const authService = new AuthService(db);
  const hospitalRepo = new HospitalRepository(db);

  // POST /login
  router.post("/login", async (req, res, next) => {
    try {
      const body = loginSchema.parse(req.body);

      // Get hospitalId from single-instance document
      const instance = await hospitalRepo.findSingle();
      const hospitalId = instance?._id ?? "default";

      const result = await authService.login({
        hospitalId,
        identifier: body.identifier,
        password: body.password,
        ipAddress: req.context.ipAddress,
        userAgent: req.context.userAgent,
        traceId: req.context.traceId,
      });

      sendSuccess(res, result, 200, undefined, req.context.traceId);
    } catch (err) {
      next(err);
    }
  });

  // POST /refresh
  router.post("/refresh", async (req, res, next) => {
    try {
      const body = refreshSchema.parse(req.body);

      const tokens = await authService.refresh({
        refreshToken: body.refreshToken,
        ipAddress: req.context.ipAddress,
        traceId: req.context.traceId,
      });

      sendSuccess(res, tokens, 200, undefined, req.context.traceId);
    } catch (err) {
      next(err);
    }
  });

  // POST /logout (requires auth)
  router.post("/logout", authenticate, async (req, res, next) => {
    try {
      await authService.logout({
        sessionId: req.context.sessionId!,
        userId: req.context.userId!,
        hospitalId: req.context.hospitalId!,
        username: req.context.username!,
        role: req.context.role!,
        traceId: req.context.traceId,
        ipAddress: req.context.ipAddress,
        userAgent: req.context.userAgent,
      });

      sendSuccess(res, { message: "Logged out successfully" });
    } catch (err) {
      next(err);
    }
  });

  // POST /change-password (requires auth)
  router.post("/change-password", authenticate, async (req, res, next) => {
    try {
      const body = changePasswordSchema.parse(req.body);

      const strength = validatePasswordStrength(body.newPassword);
      if (!strength.valid) {
        throw new ValidationError("New password does not meet requirements", {
          errors: strength.errors,
        });
      }

      await authService.changePassword({
        userId: req.context.userId!,
        hospitalId: req.context.hospitalId!,
        currentPassword: body.currentPassword,
        newPassword: body.newPassword,
        traceId: req.context.traceId,
        ipAddress: req.context.ipAddress,
      });

      sendSuccess(res, {
        message: "Password changed. Please log in again.",
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /me (requires auth)
  router.get("/me", authenticate, async (req, res, next) => {
    try {
      const { UserRepository } = await import("@hospital-cms/database");
      const userRepo = new UserRepository(db);
      const user = await userRepo.findByIdOrThrow(req.context.userId!);
      const { passwordHash, mfaSecret, ...safe } = user;
      sendSuccess(res, safe, 200, undefined, req.context.traceId);
    } catch (err) {
      next(err);
    }
  });

  // ── MFA routes ─────────────────────────────────────────────────────────────

  // POST /auth/mfa/complete — exchange mfaToken + TOTP code for full session
  router.post("/mfa/complete", async (req, res, next) => {
    try {
      const { mfaToken, code } = z
        .object({ mfaToken: z.string(), code: z.string().length(6).regex(/^\d+$/) })
        .parse(req.body);

      // The mfaToken is a limited-scope access token signed with the normal secret
      const payload = verifyAccessToken(mfaToken);
      if ((payload as any).role !== "MFA_PENDING") {
        throw new UnauthorizedError("Invalid MFA token");
      }

      const instance = await hospitalRepo.findSingle();
      const hospitalId = String(instance?._id ?? "default");

      const result = await authService.completeMfaLogin({
        hospitalId,
        userId: payload.sub,
        totpCode: code,
        ipAddress: req.context.ipAddress,
        userAgent: req.context.userAgent,
        traceId: req.context.traceId,
      });

      sendSuccess(res, result, 200, undefined, req.context.traceId);
    } catch (err) {
      next(err);
    }
  });

  // POST /auth/mfa/setup — generate secret & URI (requires auth)
  router.post("/mfa/setup", authenticate, async (req, res, next) => {
    try {
      const result = await authService.setupMfa(req.context.userId!);
      sendSuccess(res, result, 200, undefined, req.context.traceId);
    } catch (err) {
      next(err);
    }
  });

  // POST /auth/mfa/verify — confirm setup with first TOTP code (requires auth)
  router.post("/mfa/verify", authenticate, async (req, res, next) => {
    try {
      const { code } = totpCodeSchema.parse(req.body);
      await authService.verifyMfaSetup(req.context.userId!, code);
      sendSuccess(res, { message: "MFA enabled successfully" }, 200, undefined, req.context.traceId);
    } catch (err) {
      next(err);
    }
  });

  // POST /auth/mfa/disable — disable MFA (requires auth + current TOTP code)
  router.post("/mfa/disable", authenticate, async (req, res, next) => {
    try {
      const { code } = totpCodeSchema.parse(req.body);
      await authService.disableMfa(req.context.userId!, code);
      sendSuccess(res, { message: "MFA disabled" }, 200, undefined, req.context.traceId);
    } catch (err) {
      next(err);
    }
  });

  // POST /revoke-all — revoke all sessions for the authenticated user (security incident response)
  router.post("/revoke-all", authenticate, async (req, res, next) => {
    try {
      const { SessionStore } = await import("@hospital-cms/auth");
      const sessionStore = new SessionStore(db);
      const count = await sessionStore.revokeAllUserSessions(
        req.context.userId!,
      );
      sendSuccess(
        res,
        {
          message: `All ${count} session(s) revoked. You will need to log in again.`,
        },
        200,
        undefined,
        req.context.traceId,
      );
    } catch (err) {
      next(err);
    }
  });

  return router;
}
