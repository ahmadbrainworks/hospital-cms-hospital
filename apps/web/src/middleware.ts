import { NextRequest, NextResponse } from "next/server";

const API_BASE =
  process.env["API_INTERNAL_URL"]
  ?? process.env["NEXT_PUBLIC_API_URL"]
  ?? "http://localhost:4000";

const STATIC_BYPASS_PATHS = ["/_next", "/favicon"];
const INSTALL_PATH = "/install";
const INSTALL_API_PATH = "/install/api/";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (STATIC_BYPASS_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const isInstallRoute = pathname === INSTALL_PATH
    || pathname.startsWith("/install/");
  const isInstallApiRoute = pathname.startsWith(INSTALL_API_PATH);

  let isInstalled = true;
  try {
    const res = await fetch(`${API_BASE}/health`, {
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (res.ok) {
      const json = await res.json().catch(() => ({}));
      isInstalled = json.isInstalled !== false;
    }
  } catch {
    // API unreachable — let request through; the app will show errors naturally
  }

  if (!isInstalled) {
    if (isInstallRoute || isInstallApiRoute) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL(INSTALL_PATH, req.url));
  }

  if (isInstallApiRoute) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INSTALLER_LOCKED",
          message: "Installer is locked.",
        },
      },
      { status: 403 },
    );
  }

  if (isInstallRoute) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except static files and Next.js internals.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
