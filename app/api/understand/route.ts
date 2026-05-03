// /api/understand — step 1 of the split pipeline
// Transcribes audio and interprets the user's state.
// Fast (<15s). Does NOT generate music.
// Audio blobs are NOT stored — they are processed in memory and discarded after transcription.

import { NextRequest, NextResponse } from "next/server";
import { transcribe } from "@/app/services/transcriptionService";
import { interpret } from "@/app/services/llmService";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    let audio: Blob | undefined;
    let textInput: string | undefined;
    let previousContext: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("audio");
      if (file instanceof Blob) audio = file;
      const text = form.get("transcript");
      if (typeof text === "string" && text.trim()) textInput = text;
      const ctx = form.get("previousContext");
      if (typeof ctx === "string" && ctx.trim()) previousContext = ctx.trim();
    } else {
      const body = await req.json();
      if (typeof body.transcript === "string") textInput = body.transcript;
      if (typeof body.previousContext === "string") previousContext = body.previousContext;
    }

    if (!audio && !textInput) {
      return NextResponse.json({ error: "audio or transcript required" }, { status: 400 });
    }

    const newTranscript = textInput?.trim() || (await transcribe(audio!));
    // audio blob is not stored — transcription result only

    // Combine with previous context for "Add more" flow
    const fullTranscript = previousContext
      ? `${previousContext} ${newTranscript}`
      : newTranscript;

    const { pillar, stateSummary, titleA, titleB, lyricsA, lyricsB } = await interpret(fullTranscript);

    return NextResponse.json({ transcript: newTranscript, pillar, stateSummary, titleA, titleB, lyricsA, lyricsB });
  } catch (err) {
    console.error("Understand error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Understanding failed" },
      { status: 500 }
    );
  }
}
