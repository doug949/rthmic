import { NextRequest, NextResponse } from "next/server";
import { runPipeline } from "@/app/services/pipelineController";

// Allow up to 90s — Suno generation takes 30-80s
export const maxDuration = 90;

// Accepts either:
//   - FormData with "audio" (Blob) — from MediaRecorder
//   - JSON with "transcript" (string) — from text fallback
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    let audio: Blob | undefined;
    let textInput: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("audio");
      if (file instanceof Blob) audio = file;
      const text = form.get("transcript");
      if (typeof text === "string") textInput = text;
    } else {
      const body = await req.json();
      if (typeof body.transcript === "string") textInput = body.transcript;
    }

    if (!audio && !textInput) {
      return NextResponse.json({ error: "audio or transcript required" }, { status: 400 });
    }

    const result = await runPipeline({ audio, textInput });
    return NextResponse.json(result);
  } catch (err) {
    console.error("Pipeline error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Pipeline failed" },
      { status: 500 }
    );
  }
}
