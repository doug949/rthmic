import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow login page, API auth route, and public share pages through
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/r/") ||              // shared Rthm pages
    pathname.startsWith("/api/share") ||       // share token lookup (POST is auth-gated at handler level)
    pathname.startsWith("/api/request-access") || // beta access request — public
    pathname.startsWith("/api/suno-webhook") || // Suno calls this — no session cookie
    pathname.startsWith("/api/process-queue") || // Vercel cron — auth via CRON_SECRET header
    pathname.startsWith("/api/poll-generation") || // polled by cron self-call and frontend
    pathname.startsWith("/api/proxy-audio") || // handler enforces auth for library ids; share tokens are public
    pathname.startsWith("/images/") ||
    pathname === "/login-vinyl.mp4" ||
    pathname === "/vinyl.jpg" ||
    pathname === "/bg.jpg" ||
    pathname === "/apple-touch-icon.png"
  ) {
    return NextResponse.next();
  }

  const session = request.cookies.get("rthmic_session");
  if (session?.value === process.env.RTHMIC_SESSION_TOKEN) {
    const onboardingRequired = request.cookies.get("rthmic_onboarding")?.value === "required";
    if (request.method === "GET" && onboardingRequired && !pathname.startsWith("/api/")) {
      const isWelcome = pathname === "/understand" && request.nextUrl.searchParams.get("welcome") === "1";
      const isFirstRthm =
        pathname === "/speak" &&
        request.nextUrl.searchParams.get("onboarding") === "1" &&
        request.nextUrl.searchParams.get("pillar") === "explain";
      if (!isWelcome && !isFirstRthm) {
        return NextResponse.redirect(new URL("/understand?welcome=1", request.url));
      }
    }

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
  matcher: ["/((?!_next/static|_next/image|icons|images|manifest.json|sw.js|favicon.ico|apple-touch-icon\\.png|bg\\.jpg).*)"],
};
