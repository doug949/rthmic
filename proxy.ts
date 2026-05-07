import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow login page, API auth route, and public share pages through
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/r/") ||         // shared Rthm pages
    pathname.startsWith("/api/share")     // share token lookup (POST is auth-gated at handler level)
  ) {
    return NextResponse.next();
  }

  const session = request.cookies.get("rthmic_session");
  if (session?.value === process.env.RTHMIC_SESSION_TOKEN) {
    // Backfill rthmic_uid for sessions created before uid generation was added
    if (!request.cookies.get("rthmic_uid")?.value) {
      const response = NextResponse.next();
      response.cookies.set("rthmic_uid", crypto.randomUUID(), {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
      return response;
    }
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icons|manifest.json|sw.js|favicon.ico|splash\\.mp4).*)"],
};
