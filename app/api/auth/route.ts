import { NextRequest, NextResponse } from "next/server";
import { createClient } from "redis";
import { codeToUid, roleForCode } from "@/app/lib/access";

/** Check Redis for a beta-issued code (from /api/request-access). */
async function isBetaCode(code: string): Promise<boolean> {
  if (!process.env.REDIS_URL) return false;
  const client = createClient({ url: process.env.REDIS_URL });
  try {
    await client.connect();
    const entry = await client.get(`beta-code:${code}`);
    return entry !== null;
  } catch {
    return false;
  } finally {
    await client.disconnect().catch(() => {});
  }
}

export async function POST(request: NextRequest) {
  const { password: rawPassword } = await request.json();
  const password = typeof rawPassword === "string" ? rawPassword.trim() : "";

  // RTHMIC_CODES is a comma-separated list of valid invite codes.
  // Any matching code grants access. Remove a code to revoke.
  const validCodes = (process.env.RTHMIC_CODES ?? "")
    .split(",")
    .map(c => c.trim())
    .filter(Boolean);
  const adminCodes = (process.env.RTHMIC_ADMIN_CODES ?? process.env.ADMIN_CODES ?? "doug2026")
    .split(",")
    .map(c => c.trim())
    .filter(Boolean);

  // Accept env-var codes OR Redis-stored beta codes
  const isEnvCode   = validCodes.includes(password) || adminCodes.includes(password);
  const isBeta      = isEnvCode ? false : await isBetaCode(password);

  if (!isEnvCode && !isBeta) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const uid = codeToUid(password);
  const access = roleForCode(password);

  const response = NextResponse.json({ ok: true, role: access });

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
  response.cookies.set("rthmic_uid", uid, {
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
  response.cookies.set("rthmic_role", access, {
    httpOnly: false,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}
