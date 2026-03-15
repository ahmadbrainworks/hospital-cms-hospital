import { describe, it, expect } from "vitest";
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  UnauthorizedError,
  InternalError,
  isAppError,
  isOperationalError,
  LicenseExpiredError,
  PluginSignatureError,
  CommandReplayError,
} from "../index";

describe("AppError hierarchy", () => {
  it("ValidationError has correct statusCode and code", () => {
    const err = new ValidationError("name is required", { field: "name" });
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.message).toBe("name is required");
    expect(err.details).toEqual({ field: "name" });
    expect(err.isOperational).toBe(true);
  });

  it("NotFoundError formats message with resource and id", () => {
    const err = new NotFoundError("Patient", "abc123");
    expect(err.statusCode).toBe(404);
    expect(err.message).toContain("abc123");
    expect(err.message).toContain("Patient");
  });

  it("NotFoundError formats message without id", () => {
    const err = new NotFoundError("Patient");
    expect(err.message).toBe("Patient not found");
  });

  it("ForbiddenError defaults to generic message", () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe("FORBIDDEN");
  });

  it("UnauthorizedError is operational", () => {
    const err = new UnauthorizedError();
    expect(err.isOperational).toBe(true);
    expect(err.statusCode).toBe(401);
  });

  it("InternalError is NOT operational", () => {
    const err = new InternalError("db failed");
    expect(err.isOperational).toBe(false);
    expect(err.statusCode).toBe(500);
  });

  it("isAppError identifies AppError subclasses", () => {
    expect(isAppError(new ValidationError("x"))).toBe(true);
    expect(isAppError(new Error("plain"))).toBe(false);
    expect(isAppError("string")).toBe(false);
    expect(isAppError(null)).toBe(false);
  });

  it("isOperationalError returns false for InternalError", () => {
    expect(isOperationalError(new InternalError())).toBe(false);
    expect(isOperationalError(new ValidationError("x"))).toBe(true);
  });

  it("LicenseExpiredError has correct code", () => {
    const err = new LicenseExpiredError();
    expect(err.code).toBe("LICENSE_EXPIRED");
    expect(err.statusCode).toBe(403);
  });

  it("PluginSignatureError includes pluginId in message", () => {
    const err = new PluginSignatureError("radiology-v1");
    expect(err.message).toContain("radiology-v1");
    expect(err.code).toBe("PLUGIN_SIGNATURE_INVALID");
  });

  it("CommandReplayError has correct code", () => {
    const err = new CommandReplayError();
    expect(err.code).toBe("COMMAND_REPLAY_DETECTED");
    expect(err.statusCode).toBe(422);
  });

  it("toJSON returns all relevant fields", () => {
    const err = new ValidationError("bad input", { field: "email" });
    const json = err.toJSON();
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(json.statusCode).toBe(400);
    expect(json.message).toBe("bad input");
    expect(json.details).toEqual({ field: "email" });
  });

  it("captures stack trace", () => {
    const err = new NotFoundError("User");
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain("NotFoundError");
  });
});
