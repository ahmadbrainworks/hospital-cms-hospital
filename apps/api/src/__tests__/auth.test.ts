import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { MongoClient, Db } from "mongodb";
import { createApp } from "../app";
import type { Application } from "express";
import request from "supertest";
import { hashPassword } from "@hospital-cms/auth";

// AUTH INTEGRATION TESTS
// Uses an in-memory-style test MongoDB instance.

let db: Db;
let client: MongoClient;
let app: Application;

// Mock install guard to always pass
vi.mock("../middleware/install-guard.js", () => ({
  installGuard: () => (_req: unknown, _res: unknown, next: () => void) =>
    next(),
  markAsInstalled: () => {},
}));

beforeAll(async () => {
  const uri =
    process.env["MONGODB_URI_TEST"] ??
    "mongodb://localhost:27017/hospital_cms_test";
  client = new MongoClient(uri);
  await client.connect();
  db = client.db("hospital_cms_test_auth");
  app = createApp(db);

  // Create a test hospital instance
  await db.collection("hospital_instance").insertOne({
    instanceId: "test-instance",
    isInstalled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Create a test user
  const passwordHash = await hashPassword("Test@1234!");
  await db.collection("users").insertOne({
    hospitalId: "test-instance",
    username: "testdoctor",
    email: "doctor@test.com",
    passwordHash,
    role: "DOCTOR",
    permissions: [],
    isActive: true,
    isLocked: false,
    failedLoginAttempts: 0,
    mfaEnabled: false,
    passwordChangedAt: new Date(),
    mustChangePassword: false,
    profile: { firstName: "Test", lastName: "Doctor" },
    createdAt: new Date(),
    updatedAt: new Date(),
  });
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

describe("POST /api/v1/auth/login", () => {
  it("returns 400 when body missing", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("returns 401 for wrong credentials", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      identifier: "testdoctor",
      password: "WrongPassword@1",
    });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("returns access token for correct credentials", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      identifier: "testdoctor",
      password: "Test@1234!",
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
    expect(res.body.data.user.username).toBe("testdoctor");
    // Never return passwordHash
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });
});

describe("GET /api/v1/auth/me", () => {
  it("returns 401 without token", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns user info with valid token", async () => {
    const loginRes = await request(app).post("/api/v1/auth/login").send({
      identifier: "testdoctor",
      password: "Test@1234!",
    });
    const token = loginRes.body.data.accessToken;

    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.username).toBe("testdoctor");
  });
});

describe("POST /api/v1/auth/refresh", () => {
  it("returns new tokens with valid refresh token", async () => {
    const loginRes = await request(app).post("/api/v1/auth/login").send({
      identifier: "testdoctor",
      password: "Test@1234!",
    });
    const { refreshToken } = loginRes.body.data;

    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
  });

  it("returns 401 with invalid refresh token", async () => {
    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: "invalid.token.here" });
    expect(res.status).toBe(401);
  });
});
