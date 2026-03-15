import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { InstallerService } from "../../../../installer-backend/installer.service";

const schema = z.object({
  mongoUri: z.string().min(1),
  redisUrl: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json());
    const service = new InstallerService();
    const result = await service.testConnectivity(body.mongoUri, body.redisUrl);
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
