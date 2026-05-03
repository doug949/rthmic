// pipelineController — orchestrates the full voice-to-song pipeline.
// Designed to be swappable with n8n or any other workflow engine later.
// Each step is isolated: swap any service without touching the others.

import { transcribe } from "./transcriptionService";
import { interpret } from "./llmService";
import { generateSongs } from "./musicService";
import type { PipelineResult } from "@/app/types/pipeline";

export interface PipelineInput {
  audio?: Blob;         // from MediaRecorder
  textInput?: string;   // fallback text input
}

export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  if (!input.audio && !input.textInput) {
    throw new Error("Pipeline requires audio or textInput");
  }

  // Step 1: Transcription
  // n8n replacement: HTTP Request node → Whisper endpoint → extract text
  const transcript = input.textInput?.trim() || (await transcribe(input.audio!));

  // Step 2: LLM interpretation
  // n8n replacement: HTTP Request node → OpenAI Chat Completions → parse JSON
  const { pillar, stateSummary, lyrics } = await interpret(transcript);

  // Step 3: Music generation
  // n8n replacement: HTTP Request node → Suno API → extract audio URLs
  const songs = await generateSongs(lyrics, pillar);

  return {
    transcript,
    pillar,
    stateSummary,
    lyrics,
    songs,
  };
}
