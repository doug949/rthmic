import { NextRequest, NextResponse } from "next/server";
import { createClient } from "redis";
import { codeToUid, roleForCode } from "@/app/lib/access";

interface BetaCodeEntry {
  email?: string;
  firstName?: string;
}

/** Check Redis for a beta-issued code (from /api/request-access). */
async function getBetaCodeEntry(code: string): Promise<BetaCodeEntry | null> {
  if (!process.env.REDIS_URL) return null;
  const client = createClient({ url: process.env.REDIS_URL });
  try {
    await client.connect();
    const entry = await client.get(`beta-code:${code}`);
    if (!entry) return null;
    try {
      return JSON.parse(entry) as BetaCodeEntry;
    } catch {
      return {};
    }
  } catch {
    return null;
  } finally {
    await client.disconnect().catch(() => {});
  }
}

async function seedNameFromBetaCode(uid: string, firstName: string) {
  if (!process.env.REDIS_URL || !firstName.trim()) return;
  const client = createClient({ url: process.env.REDIS_URL });
  try {
    await client.connect();
    const key = `settings:${uid}`;
    const raw = await client.get(key);
    const current = raw ? JSON.parse(raw) : {};
    if (typeof current.name === "string" && current.name.trim()) return;
    await client.set(key, JSON.stringify({ ...current, name: firstName.trim().slice(0, 80) }));
  } catch {
    // Settings seeding is helpful, not required for login.
  } finally {
    await client.disconnect().catch(() => {});
  }
}

/** Establish onboarding state without forcing established beta users through a new gate. */
async function getOnboardingState(uid: string): Promise<{ firstLogin: boolean; required: boolean }> {
  if (!process.env.REDIS_URL) return { firstLogin: true, required: true };
  const client = createClient({ url: process.env.REDIS_URL });
  try {
    await client.connect();
    const created = await client.set(`onboarding:logged-in:${uid}`, new Date().toISOString(), { NX: true });
    const firstLogin = created === "OK";
    if (firstLogin) {
      await client.set(`onboarding:required:${uid}`, "1");
    }
    const [required, complete] = await Promise.all([
      client.get(`onboarding:required:${uid}`),
      client.get(`onboarding:complete:${uid}`),
    ]);
    return { firstLogin, required: required === "1" && !complete };
  } catch {
    // Prefer showing About once too often over skipping it for a genuinely new user.
    return { firstLogin: true, required: true };
  } finally {
    await client.disconnect().catch(() => {});
  }
}

export async function POST(request: NextRequest) {
  const { password: rawPassword, betaAgreementAccepted } = await request.json();
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
  const betaEntry   = isEnvCode ? null : await getBetaCodeEntry(password);
  const isBeta      = !!betaEntry;

  if (!isEnvCode && !isBeta) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const access = roleForCode(password);
  if (access !== "admin" && betaAgreementAccepted !== true) {
    return NextResponse.json({ error: "Private beta agreement required" }, { status: 412 });
  }

  const uid = codeToUid(password);
  if (isBeta && betaEntry?.firstName) {
    await seedNameFromBetaCode(uid, betaEntry.firstName);
  }
  const onboarding = access === "admin"
    ? { firstLogin: false, required: false }
    : await getOnboardingState(uid);

  const response = NextResponse.json({ ok: true, role: access, firstLogin: onboarding.firstLogin, onboardingRequired: onboarding.required });

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
  response.cookies.set("rthmic_onboarding", onboarding.required ? "required" : "complete", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  return response;
}
