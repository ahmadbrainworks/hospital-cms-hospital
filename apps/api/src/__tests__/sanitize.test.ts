import { describe, it, expect, vi } from "vitest";
import { Request, Response, NextFunction } from "express";
import { sanitizeBody, sanitizeQuery } from "../middleware/sanitize";
import { ValidationError } from "@hospital-cms/errors";

function makeReq(
  body: unknown = {},
  query: Record<string, string> = {},
): Request {
  return { body, query, context: {} } as unknown as Request;
}

const res = {} as Response;

function expectError(next: NextFunction, message?: string): void {
  expect(next).toHaveBeenCalledOnce();
  const err = (next as ReturnType<typeof vi.fn>).mock.calls[0]![0];
  expect(err).toBeInstanceOf(ValidationError);
  if (message) expect(err.message).toContain(message);
}

function expectPass(next: NextFunction): void {
  expect(next).toHaveBeenCalledOnce();
  expect((next as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBeUndefined();
}

//  sanitizeBody

describe("sanitizeBody", () => {
  it("passes a clean flat body", () => {
    const next = vi.fn();
    sanitizeBody(makeReq({ username: "alice", password: "secret" }), res, next);
    expectPass(next);
  });

  it("passes nested clean body", () => {
    const next = vi.fn();
    sanitizeBody(
      makeReq({ address: { street: "123 Main St", city: "Springfield" } }),
      res,
      next,
    );
    expectPass(next);
  });

  it("rejects body with $ key (MongoDB operator)", () => {
    const next = vi.fn();
    sanitizeBody(makeReq({ $where: "1==1" }), res, next);
    expectError(next, "Disallowed key");
  });

  it("rejects nested $ key", () => {
    const next = vi.fn();
    sanitizeBody(makeReq({ user: { $gt: "" } }), res, next);
    expectError(next, "Disallowed key");
  });

  it("rejects null byte in string value", () => {
    const next = vi.fn();
    sanitizeBody(makeReq({ name: "bad\0value" }), res, next);
    expectError(next, "Null byte");
  });

  it("rejects excessively long string", () => {
    const next = vi.fn();
    sanitizeBody(makeReq({ data: "x".repeat(70_000) }), res, next);
    expectError(next, "exceeds maximum length");
  });

  it("rejects deeply nested object", () => {
    const next = vi.fn();
    // Build object 12 levels deep — exceeds MAX_DEPTH of 10
    let deep: Record<string, unknown> = { leaf: "value" };
    for (let i = 0; i < 12; i++) deep = { child: deep };
    sanitizeBody(makeReq(deep), res, next);
    expectError(next, "too deeply nested");
  });

  it("handles arrays correctly", () => {
    const next = vi.fn();
    sanitizeBody(makeReq({ tags: ["a", "b", "c"] }), res, next);
    expectPass(next);
  });

  it("rejects $ key inside array element", () => {
    const next = vi.fn();
    sanitizeBody(makeReq({ items: [{ $set: { x: 1 } }] }), res, next);
    expectError(next, "Disallowed key");
  });

  it("passes when body is undefined", () => {
    const next = vi.fn();
    sanitizeBody(makeReq(undefined), res, next);
    expectPass(next);
  });
});

//  sanitizeQuery

describe("sanitizeQuery", () => {
  it("passes clean query params", () => {
    const next = vi.fn();
    sanitizeQuery(makeReq({}, { q: "alice", page: "1" }), res, next);
    expectPass(next);
  });

  it("rejects $ key in query param name", () => {
    const next = vi.fn();
    sanitizeQuery(makeReq({}, { $where: "1==1" }), res, next);
    expectError(next, "Disallowed query parameter");
  });

  it("rejects null byte in query param value", () => {
    const next = vi.fn();
    sanitizeQuery(makeReq({}, { q: "bad\0value" }), res, next);
    expectError(next, "Null byte");
  });
});
