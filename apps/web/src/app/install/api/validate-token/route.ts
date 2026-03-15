import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/** Fixed vendor CP API — not user-configurable */
const VENDOR_CP_API_URL = "https://cp-api.hospitalcms.com";

const schema = z.object({
  registrationToken: z.string().min(8),
});

/**
 * Validates a registration token against the control panel.
 * The control panel's /api/registration-tokens/validate endpoint
 * returns 200 with { valid: true } on success.
 */
export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json());

    const url = `${VENDOR_CP_API_URL}/api/registration-tokens/validate`;

    let cpRes: Response;
    try {
      cpRes = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: body.registrationToken }),
        signal: AbortSignal.timeout(8000),
      });
    } catch (err) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "CONTROL_PANEL_UNREACHABLE",
            message: `Cannot reach control panel: ${err instanceof Error ? err.message : "Network error"}`,
          },
        },
        { status: 502 },
      );
    }

    if (!cpRes.ok) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_TOKEN",
            message: "Registration token is invalid or has already been used.",
          },
        },
        { status: 400 },
      );
    }

    const cpJson = await cpRes.json().catch(() => ({}));

    return NextResponse.json({ success: true, data: cpJson });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: err instanceof Error ? err.message : "Invalid request",
        },
      },
      { status: 400 },
    );
  }
}
