// transcriptionService
// This is the Whisper integration point.
// Real Whisper is used when OPENAI_API_KEY is present; mock otherwise.
//
// PRIVACY: Voice recordings are sent to Whisper for transcription and then discarded.
// Audio blobs are never stored to disk, database, or any third-party service beyond Whisper.
// The only artifact retained is the plain-text transcript.

import OpenAI from "openai";

const USE_MOCK = !process.env.OPENAI_API_KEY;

const MOCK_TRANSCRIPTS = [
  "I've been trying to start this project for three days and I keep avoiding it. I sit down, open my laptop, and then just... do something else.",
  "I have too many things on my to-do list and I can't decide what to work on first. Everything feels equally important and I'm just spinning.",
  "I need to remember all the names of the people on the new team — there are like eight of them and I keep blanking.",
  "I'm in a good place right now but I need to get into deep focus for the next two hours. I have a presentation to finish.",
  "I'm feeling really anxious about the meeting tomorrow. I know what I need to say but I can't stop catastrophising.",
  "I need to send like fifteen emails but I don't know where to start so I've been avoiding my inbox for two days.",
];

function delay(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

export async function transcribe(audio: Blob): Promise<string> {
  if (USE_MOCK) {
    await delay(800 + Math.random() * 400);
    return MOCK_TRANSCRIPTS[Math.floor(Math.random() * MOCK_TRANSCRIPTS.length)];
  }

  // Real Whisper via OpenAI SDK
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const mimeType = audio.type || "audio/webm";
  const ext = mimeType.includes("mp4") ? "mp4" : "webm";
  const file = new File([audio], `recording.${ext}`, { type: mimeType });
  const result = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    language: "en",
  });
  return result.text;
}
