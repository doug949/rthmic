import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const build =
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
    process.env.NEXT_PUBLIC_RTHMIC_BUILD ??
    "dev";

  return NextResponse.json(
    { build },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
