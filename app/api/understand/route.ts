// /api/understand — step 1 of the split pipeline
// Transcribes audio and interprets the user's state.
// Fast (<15s). Does NOT generate music.
// Audio blobs are NOT stored — they are processed in memory and discarded after transcription.

import { NextRequest, NextResponse } from "next/server";
import { transcribe } from "@/app/services/transcriptionService";
import { interpretBrief } from "@/app/services/llmService";
import { normalisePillar } from "@/app/types/pipeline";
import type { PillarType } from "@/app/types/pipeline";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    let audio: Blob | undefined;
    let textInput: string | undefined;
    let previousContext: string | undefined;
    let selectedPillarSlug: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("audio");
      if (file instanceof Blob) audio = file;
      const text = form.get("transcript");
      if (typeof text === "string" && text.trim()) textInput = text;
      const ctx = form.get("previousContext");
      if (typeof ctx === "string" && ctx.trim()) previousContext = ctx.trim();
      const p = form.get("pillar");
      if (typeof p === "string" && p.trim()) selectedPillarSlug = p.trim();
    } else {
      const body = await req.json();
      if (typeof body.transcript === "string") textInput = body.transcript;
      if (typeof body.previousContext === "string") previousContext = body.previousContext;
      if (typeof body.pillar === "string") selectedPillarSlug = body.pillar;
    }

    if (!audio && !textInput) {
      return NextResponse.json({ error: "audio or transcript required" }, { status: 400 });
    }

    const newTranscript = textInput?.trim() || (await transcribe(audio!));
    // audio blob is not stored — transcription result only

    const fullTranscript = previousContext
      ? `${previousContext} ${newTranscript}`
      : newTranscript;

    // User's explicit pillar choice overrides auto-detection
    const overridePillar: PillarType | undefined = selectedPillarSlug
      ? normalisePillar(selectedPillarSlug)
      : undefined;

    const result = await interpretBrief(fullTranscript, overridePillar);

    // Hard-pin: if the user explicitly chose a pillar, it cannot be overridden
    // by anything the LLM returns — enforce at the API boundary as a final guarantee.
    const finalPillar = overridePillar ?? result.pillar;

    return NextResponse.json({
      transcript: newTranscript,
      pillar: finalPillar,
      stateSummary: result.stateSummary,
      title: result.title,
      lyrics: "",
      style: result.style,
    });
  } catch (err) {
    console.error("Understand error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Understanding failed" },
      { status: 500 }
    );
  }
}
