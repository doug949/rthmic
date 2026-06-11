import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/access";
import { requireUserId } from "@/app/lib/auth";
import { REDIS_AVAILABLE, withRedis } from "@/app/lib/redis";

export async function POST(request: NextRequest) {
  if (!requireAdmin(request)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const uid = requireUserId(request);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (REDIS_AVAILABLE) {
    await withRedis(async (client) => {
      const pipe = client.multi();
      pipe.set(`onboarding:required:${uid}`, "1");
      pipe.del(`onboarding:complete:${uid}`);
      await pipe.exec();
    });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("rthmic_onboarding", "required", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
