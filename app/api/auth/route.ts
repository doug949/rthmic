import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

// Derive a stable, cross-device UID from the invite code.
// All devices logging in with the same code share one library namespace.
function codeToUid(code: string): string {
  return createHash("sha256")
    .update(`rthmic-lib-v1:${code}`)
    .digest("hex")
    .slice(0, 32);
}

export async function POST(request: NextRequest) {
  const { password } = await request.json();

  // RTHMIC_CODES is a comma-separated list of valid invite codes.
  // Any matching code grants access. Remove a code to revoke.
  const validCodes = (process.env.RTHMIC_CODES ?? "")
    .split(",")
    .map(c => c.trim())
    .filter(Boolean);

  if (!validCodes.includes(password)) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });

  // Session cookie — 30 day auth gate
  response.cookies.set("rthmic_session", process.env.RTHMIC_SESSION_TOKEN!, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  // User identity cookie — derived from invite code so all devices
  // using the same code share one library. Always written on login
  // so a device re-syncs if it previously had a stale random UID.
  response.cookies.set("rthmic_uid", codeToUid(password), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  // Display cookie — readable by the client to show who is logged in.
  // Not httpOnly so JS can access it. Not sensitive — user already knows their code.
  response.cookies.set("rthmic_code", password, {
    httpOnly: false,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}
