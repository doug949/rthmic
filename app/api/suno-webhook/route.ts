// sunoapi.org requires a non-empty callBackUrl.
// We use polling rather than webhooks, so this endpoint just acknowledges the callback.
// Future: could write completion events to a KV store for faster result delivery.

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("Suno webhook received:", JSON.stringify(body).slice(0, 500));
  } catch {
    // ignore parse errors
  }
  return NextResponse.json({ ok: true });
}
