import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createClient } from "redis";
import { TEST_DRIVE_CODE, testDriveLibrary } from "@/app/lib/testDriveLibrary";
import type { SavedRhythm } from "@/app/api/library/route";

// Derive a stable, cross-device UID from the invite code.
// All devices logging in with the same code share one library namespace.
function codeToUid(code: string): string {
  return createHash("sha256")
    .update(`rthmic-lib-v1:${code}`)
    .digest("hex")
    .slice(0, 32);
}

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

async function seedTestDriveLibrary(uid: string): Promise<void> {
  if (!process.env.REDIS_URL) return;
  const client = createClient({ url: process.env.REDIS_URL });
  try {
    await client.connect();
    const key = `lib:${uid}`;
    const samples = testDriveLibrary();
    const sampleIds = new Set(samples.map((r) => r.id));
    const existing = await client.get(key);
    const current: SavedRhythm[] = existing ? JSON.parse(existing) : [];
    const userCreated = current.filter((r) => !sampleIds.has(r.id));
    await client.set(key, JSON.stringify([...samples, ...userCreated]));
  } catch (err) {
    console.warn("[auth] Failed to seed test drive library:", err);
  } finally {
    await client.disconnect().catch(() => {});
  }
}

export async function POST(request: NextRequest) {
  const { password } = await request.json();

  // RTHMIC_CODES is a comma-separated list of valid invite codes.
  // Any matching code grants access. Remove a code to revoke.
  const validCodes = (process.env.RTHMIC_CODES ?? "")
    .split(",")
    .map(c => c.trim())
    .filter(Boolean);

  // Accept env-var codes OR Redis-stored beta codes
  const isEnvCode   = validCodes.includes(password);
  const isTestDrive = password.trim().toLowerCase() === TEST_DRIVE_CODE;
  const isBeta      = isEnvCode || isTestDrive ? false : await isBetaCode(password);

  if (!isEnvCode && !isBeta && !isTestDrive) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const uid = codeToUid(isTestDrive ? TEST_DRIVE_CODE : password);
  if (isTestDrive) await seedTestDriveLibrary(uid);

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
  response.cookies.set("rthmic_uid", uid, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  // Display cookie — readable by the client to show who is logged in.
  // Not httpOnly so JS can access it. Not sensitive — user already knows their code.
  response.cookies.set("rthmic_code", isTestDrive ? TEST_DRIVE_CODE : password, {
    httpOnly: false,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}
