import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MongoClient, Db } from "mongodb";
import request from "supertest";
import type { Application } from "express";
import { signAccessToken } from "@hospital-cms/auth";
import { UserRole } from "@hospital-cms/shared-types";
import { createApp } from "../app";

vi.mock("../middleware/install-guard.js", () => ({
  installGuard: () => (_req: unknown, _res: unknown, next: () => void) =>
    next(),
  markAsInstalled: () => {},
}));

let db: Db;
let client: MongoClient;
let app: Application;
let token: string;

beforeAll(async () => {
  const uri =
    process.env["MONGODB_URI_TEST"] ??
    "mongodb://localhost:27017/hospital_cms_test";
  client = new MongoClient(uri);
  await client.connect();
  db = client.db("hospital_cms_test_license_enforcement");

  await db.collection("hospital_instance").insertOne({
    instanceId: "hosp-license-test",
    isInstalled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  app = createApp(db);
  token = signAccessToken({
    sub: "doctor-id",
    username: "doctor",
    role: UserRole.DOCTOR,
    permissions: [],
    hospitalId: "hosp-license-test",
    sessionId: "session-1",
  });
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

describe("API license enforcement", () => {
  it("allows auth routes without an active lease", async () => {
    const res = await request(app).post("/api/v1/auth/refresh").send({
      refreshToken: "invalid.token",
    });

    expect(res.status).not.toBe(403);
    expect(res.body.error?.code).not.toBe("LICENSE_EXPIRED");
  });

  it("blocks business routes without an active lease", async () => {
    const res = await request(app)
      .get("/api/v1/patients")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("LICENSE_EXPIRED");
  });
});
