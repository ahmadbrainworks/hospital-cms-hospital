/**
 * Staff authentication routes.
 *
 * POST /login          — email + password → token pair
 * POST /refresh        — refresh token → rotated token pair
 * POST /logout         — revoke current session
 * POST /logout-all     — revoke all sessions for the authenticated staff
 * GET  /me             — current staff profile
 * POST /change-password — change own password (requires current password)
 */
import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { ValidationError } from "@hospital-cms/errors";
import { StaffAuthService } from "../services/staff-auth.service";
import { StaffService } from "../services/staff.service";
import { requireStaffAuth } from "../middleware/staff-auth";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export function createStaffAuthRouter(
  authService: StaffAuthService,
  staffService: StaffService,
): Router {
  const router = Router();

  // Strict rate limit on login attempts
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 15,
    message: {
      success: false,
      error: { code: "RATE_LIMITED", message: "Too many login attempts. Try again later." },
    },
  });

  // POST /login
  router.post(
    "/login",
    loginLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = LoginSchema.parse(req.body);
        const result = await authService.login({
          email: body.email,
          password: body.password,
          ipAddress: req.ip ?? "unknown",
          userAgent: req.headers["user-agent"] ?? "unknown",
        });
        res.json({ success: true, data: result });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /refresh
  router.post(
    "/refresh",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = RefreshSchema.parse(req.body);
        const tokens = await authService.refresh({
          refreshToken: body.refreshToken,
          ipAddress: req.ip ?? "unknown",
        });
        res.json({ success: true, data: tokens });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /logout (requires auth)
  router.post(
    "/logout",
    requireStaffAuth,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const ctx = req.staffContext!;
        await authService.logout({
          sessionId: ctx.sessionId,
          staffId: ctx.staffId,
          ipAddress: req.ip ?? "unknown",
        });
        res.json({ success: true, data: { message: "Logged out" } });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /logout-all (requires auth)
  router.post(
    "/logout-all",
    requireStaffAuth,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const ctx = req.staffContext!;
        const count = await authService.logoutAll({
          staffId: ctx.staffId,
          ipAddress: req.ip ?? "unknown",
        });
        res.json({ success: true, data: { revokedSessions: count } });
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /me (requires auth)
  router.get(
    "/me",
    requireStaffAuth,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const ctx = req.staffContext!;
        const profile = await authService.getStaffProfile(ctx.staffId);
        // Include permissions from the JWT so the frontend can do role-aware rendering
        res.json({ success: true, data: { ...profile, permissions: ctx.permissions } });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /change-password (requires auth)
  router.post(
    "/change-password",
    requireStaffAuth,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const ctx = req.staffContext!;
        const body = ChangePasswordSchema.parse(req.body);

        // Verify current password
        const staffDoc = await staffService._getStaffByEmail(ctx.email);
        if (!staffDoc) {
          throw new ValidationError("Staff account not found");
        }

        const valid = await staffService.verifyPassword(
          staffDoc.passwordHash,
          body.currentPassword,
        );
        if (!valid) {
          throw new ValidationError("Current password is incorrect");
        }

        await staffService.resetPassword(
          ctx.staffId,
          body.newPassword,
          ctx.staffId,
          req.ip ?? "unknown",
        );

        // Revoke all other sessions (force re-login everywhere else)
        await authService.logoutAll({
          staffId: ctx.staffId,
          ipAddress: req.ip ?? "unknown",
        });

        res.json({
          success: true,
          data: { message: "Password changed. All other sessions revoked." },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
