import { createHash } from "crypto";
import type { NextRequest } from "next/server";

export type UserRole = "admin" | "beta";

export interface AccessProfile {
  role: UserRole;
  isAdmin: boolean;
  capabilities: {
    developerStudio: boolean;
    adminExperiments: boolean;
    codexNotes: boolean;
    diagnostics: boolean;
    invite: boolean;
  };
}

function configuredAdminCodes(): string[] {
  const codes = (process.env.RTHMIC_ADMIN_CODES ?? process.env.ADMIN_CODES ?? "doug2026")
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean);
  return codes.length ? codes : ["doug2026"];
}

export function codeToUid(code: string): string {
  return createHash("sha256")
    .update(`rthmic-lib-v1:${code}`)
    .digest("hex")
    .slice(0, 32);
}

export function roleForCode(code: string): UserRole {
  return configuredAdminCodes().includes(code.trim()) ? "admin" : "beta";
}

export function roleForUid(uid: string | null | undefined): UserRole {
  if (!uid) return "beta";
  return configuredAdminCodes().some((code) => codeToUid(code) === uid) ? "admin" : "beta";
}

export function accessForRole(role: UserRole): AccessProfile {
  const isAdmin = role === "admin";
  return {
    role,
    isAdmin,
    capabilities: {
      developerStudio: isAdmin,
      adminExperiments: isAdmin,
      codexNotes: isAdmin,
      diagnostics: isAdmin,
      invite: isAdmin,
    },
  };
}

export function accessForRequest(request: NextRequest): AccessProfile {
  const uid = request.cookies.get("rthmic_uid")?.value ?? null;
  return accessForRole(roleForUid(uid));
}

export function requireAdmin(request: NextRequest): boolean {
  const session = request.cookies.get("rthmic_session");
  if (session?.value !== process.env.RTHMIC_SESSION_TOKEN) return false;
  return accessForRequest(request).isAdmin;
}
