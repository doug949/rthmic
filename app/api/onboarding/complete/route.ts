import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/app/lib/auth";
import { REDIS_AVAILABLE, withRedis } from "@/app/lib/redis";

export async function POST(request: NextRequest) {
  const uid = requireUserId(request);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (REDIS_AVAILABLE) {
    await withRedis(async (client) => {
      const pipe = client.multi();
      pipe.set(`onboarding:complete:${uid}`, new Date().toISOString());
      pipe.del(`onboarding:required:${uid}`);
      await pipe.exec();
    });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("rthmic_onboarding", "complete", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
