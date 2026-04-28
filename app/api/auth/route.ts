import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { password } = await request.json();
  const from = request.nextUrl.searchParams.get("from") || "/";

  if (password !== process.env.RTHMIC_PASSWORD) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("rthmic_session", process.env.RTHMIC_SESSION_TOKEN!, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return response;
}
