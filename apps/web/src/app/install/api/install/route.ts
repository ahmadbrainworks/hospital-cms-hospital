import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAppError } from "@hospital-cms/errors";
import {
  DEFAULT_LOCK_FILE,
  DEFAULT_PRIVATE_KEY_PATH,
  DEFAULT_PUBLIC_KEY_PATH,
  VENDOR_CP_API_URL,
} from "@hospital-cms/config";
import { InstallerService } from "../../../../installer-backend/installer.service";

const MONGO_URI =
  process.env["MONGODB_URI"] ?? "mongodb://localhost:27017/hospital_cms";
const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6379";

const schema = z.object({
  registrationToken: z.string().min(8),
  hospitalName: z.string().min(1),
  hospitalSlug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/),
  address: z.object({
    line1: z.string().min(1),
    city: z.string().min(1),
    state: z.string().optional().default(""),
    country: z.string().min(1),
    postalCode: z.string().optional().default(""),
  }),
  contact: z.object({
    email: z.string().email(),
    phone: z.string().min(7),
  }),
  settings: z.object({
    timezone: z.string().min(1),
    currency: z.string().length(3),
    dateFormat: z.string(),
    defaultLanguage: z.string(),
  }),
  adminUser: z
    .object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email(),
      username: z
        .string()
        .min(3)
        .regex(/^[a-zA-Z0-9_.-]+$/),
      password: z.string().min(8),
      confirmPassword: z.string(),
    })
    .refine((d) => d.password === d.confirmPassword, {
      message: "Passwords do not match",
      path: ["confirmPassword"],
    }),
});

const LOCK_FILE =
  process.env["INSTALLER_LOCK_FILE"] ?? DEFAULT_LOCK_FILE;
const PRIVATE_KEY_PATH =
  process.env["INSTANCE_PRIVATE_KEY_PATH"] ?? DEFAULT_PRIVATE_KEY_PATH;
const PUBLIC_KEY_PATH =
  process.env["INSTANCE_PUBLIC_KEY_PATH"] ?? DEFAULT_PUBLIC_KEY_PATH;

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json());
    const service = new InstallerService();

    const result = await service.runInstallation({
      mongoUri: MONGO_URI,
      redisUrl: REDIS_URL,
      controlPanelUrl: VENDOR_CP_API_URL,
      registrationToken: body.registrationToken,
      hospitalName: body.hospitalName,
      hospitalSlug: body.hospitalSlug,
      address: body.address,
      contact: body.contact,
      settings: body.settings,
      adminUser: {
        firstName: body.adminUser.firstName,
        lastName: body.adminUser.lastName,
        email: body.adminUser.email,
        username: body.adminUser.username,
        password: body.adminUser.password,
      },
      privateKeyPath: PRIVATE_KEY_PATH,
      publicKeyPath: PUBLIC_KEY_PATH,
      lockFilePath: LOCK_FILE,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    const isZod = err instanceof Error && err.name === "ZodError";
    const status = isZod
      ? 400
      : isAppError(err)
        ? err.statusCode
        : 500;
    const code = isZod
      ? "VALIDATION_ERROR"
      : isAppError(err)
        ? err.code
        : "INSTALL_ERROR";
    return NextResponse.json(
      {
        success: false,
        error: {
          code,
          message: err instanceof Error ? err.message : "Installation failed",
        },
      },
      { status },
    );
  }
}
