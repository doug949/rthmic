import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const build =
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
    process.env.NEXT_PUBLIC_RTHMIC_BUILD ??
    "dev";

  const deployment =
    process.env.VERCEL_DEPLOYMENT_ID ??
    process.env.NETLIFY_DEPLOY_ID ??
    process.env.NEXT_PUBLIC_RTHMIC_DEPLOYMENT ??
    build;

  return NextResponse.json(
    { build, deployment },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
