import { NextResponse } from "next/server";
import { InstallerService } from "../../../../installer-backend/installer.service";

const MONGO_URI =
  process.env["MONGODB_URI"] ?? "mongodb://localhost:27017/hospital_cms";
const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6379";

export async function POST() {
  try {
    const service = new InstallerService();
    const result = await service.testConnectivity(MONGO_URI, REDIS_URL);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "CONNECTIVITY_ERROR",
          message: err instanceof Error ? err.message : "Test failed",
        },
      },
      { status: 400 },
    );
  }
}
