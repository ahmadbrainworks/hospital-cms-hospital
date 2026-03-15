import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { MongoClient, Db } from "mongodb";
import request from "supertest";
import { createApp } from "../app";
import type { Application } from "express";
import { hashPassword, signAccessToken } from "@hospital-cms/auth";
import { UserRole, Permission, Gender } from "@hospital-cms/shared-types";

vi.mock("../middleware/install-guard.js", () => ({
  installGuard: () => (_req: unknown, _res: unknown, next: () => void) =>
    next(),
  markAsInstalled: () => {},
}));

let db: Db;
let client: MongoClient;
let app: Application;
let doctorToken: string;
let receptionistToken: string;

function makeToken(
  userId: string,
  role: UserRole,
  hospitalId: string,
  permissions: Permission[] = [],
): string {
  return signAccessToken({
    sub: userId,
    username: "testuser",
    role,
    permissions,
    hospitalId,
    sessionId: "sess-001",
  });
}

beforeAll(async () => {
  const uri =
    process.env["MONGODB_URI_TEST"] ??
    "mongodb://localhost:27017/hospital_cms_test";
  client = new MongoClient(uri);
  await client.connect();
  db = client.db("hospital_cms_test_patient");

  // Counter sequences
  await db.collection("counter_sequences").deleteMany({});
  await db.collection("hospital_instance").insertOne({
    instanceId: "hosp-001",
    isInstalled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await db.collection("license_leases").insertOne({
    instanceId: "hosp-001",
    tier: "professional",
    features: ["patients"],
    maxBeds: 500,
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    refreshedAt: new Date().toISOString(),
    vendorSignature: "test-signature",
    status: "active",
  });

  app = createApp(db);

  doctorToken = makeToken("doctor-id", UserRole.DOCTOR, "hosp-001");
  receptionistToken = makeToken("recep-id", UserRole.RECEPTIONIST, "hosp-001");
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

describe("POST /api/v1/patients", () => {
  const validPatient = {
    profile: {
      firstName: "John",
      lastName: "Doe",
      dateOfBirth: "1985-06-15",
      gender: Gender.MALE,
    },
    contactInfo: {
      phone: "+1234567890",
      address: {
        line1: "123 Main St",
        city: "Springfield",
        state: "IL",
        country: "US",
      },
    },
  };

  it("returns 401 without token", async () => {
    const res = await request(app).post("/api/v1/patients").send(validPatient);
    expect(res.status).toBe(401);
  });

  it("returns 403 for DOCTOR role (no PATIENT_CREATE)", async () => {
    const res = await request(app)
      .post("/api/v1/patients")
      .set("Authorization", `Bearer ${doctorToken}`)
      .send(validPatient);
    expect(res.status).toBe(403);
  });

  it("creates patient successfully for RECEPTIONIST", async () => {
    const res = await request(app)
      .post("/api/v1/patients")
      .set("Authorization", `Bearer ${receptionistToken}`)
      .send(validPatient);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.patientNumber).toMatch(/^P\d{7}$/);
    expect(res.body.data.mrn).toMatch(/^MRN-/);
    expect(res.body.data.status).toBe("ACTIVE");
  });

  it("returns 400 for missing required fields", async () => {
    const res = await request(app)
      .post("/api/v1/patients")
      .set("Authorization", `Bearer ${receptionistToken}`)
      .send({ profile: { firstName: "Only" } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /api/v1/patients", () => {
  it("returns patient list for authorized user", async () => {
    const res = await request(app)
      .get("/api/v1/patients")
      .set("Authorization", `Bearer ${receptionistToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toBeDefined();
    expect(typeof res.body.meta.total).toBe("number");
  });
});
