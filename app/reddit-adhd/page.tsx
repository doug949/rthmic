"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/app/components/AppHeader";
import { RevealBlock } from "@/app/components/RevealBlock";
import { BrainIcon } from "@/app/components/HomeTileIcons";

const ADMIN_CODE = "doug2026";

type Phase = "idle" | "recording" | "transcribing" | "understanding" | "queueing" | "queued";

interface UnderstandResult {
  title: string;
  lyrics: string;
  style: "A" | "B";
  pillar: string;
  stateSummary?: { intent?: string };
}

function buildBrief(thread: string, response: string): string {
  return `Create a RTHMIC Bridge track as a direct response to a person asking for help in a Reddit ADHD thread.

Reddit thread pasted by Doug:
${thread}

Doug's spoken response, which is the source of truth:
${response}

Write the Rthm as if speaking kindly and directly to the original poster. Preserve Doug's point of view and practical advice. Do not mention Reddit usernames. Do not diagnose them. Do not claim to be a doctor, therapist, or medical professional. Do not tell them to start, stop, or change medication. If medical care comes up, frame it as talking to a qualified professional. The song should feel like a clear, grounded answer to the person's question, not generic ADHD content.`;
}

export default function RedditAdhdPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [checked, setChecked] = useState(false);
  const [thread, setThread] = useState("");
  const [spokenResponse, setSpokenResponse] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [queuedTitle, setQueuedTitle] = useState("");
  const [queuedJobId, setQueuedJobId] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef("");
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)rthmic_code=([^;]+)/);
    const code = match ? decodeURIComponent(match[1]) : "";
    setAllowed(code === ADMIN_CODE);
    setChecked(true);
  }, []);

  const startRecording = async () => {
    if (phase !== "idle") return;
    setError("");
    setQueuedTitle("");
    setQueuedJobId("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const preferredTypes = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
      let recorder: MediaRecorder | null = null;
      let chosenMime = "";
      for (const type of preferredTypes) {
        if (!MediaRecorder.isTypeSupported(type)) continue;
        try {
          recorder = new MediaRecorder(stream, { mimeType: type, audioBitsPerSecond: 32000 });
          chosenMime = type;
          break;
        } catch { /* try next */ }
      }
      if (!recorder) {
        recorder = new MediaRecorder(stream, { audioBitsPerSecond: 32000 });
        chosenMime = recorder.mimeType || "audio/webm";
      }

      mimeTypeRef.current = chosenMime;
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current || "audio/webm" });
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        transcribeResponse(blob).catch((err) => {
          setError(err instanceof Error ? err.message : "Could not transcribe response");
          setPhase("idle");
        });
      };

      recorder.start(250);
      setPhase("recording");
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      setError(/denied|not allowed/i.test(raw) ? "Microphone access denied. Please allow microphone access and try again." : "Could not start recording. Please try again.");
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === "recording") {
      setPhase("transcribing");
      recorderRef.current.stop();
    }
  };

  const transcribeResponse = async (audio: Blob) => {
    setPhase("transcribing");
    const mimeType = audio.type || "audio/webm";
    const ext = mimeType.includes("mp4") ? "m4a" : "webm";
    const form = new FormData();
    form.append("audio", audio, `reddit-adhd-response.${ext}`);
    const res = await fetch("/api/transcribe", { method: "POST", body: form });
    if (!res.ok) throw new Error("Could not transcribe response");
    const data = await res.json();
    const transcript = typeof data.transcript === "string" ? data.transcript.trim() : "";
    if (!transcript) throw new Error("No response heard. Please try again.");
    setSpokenResponse(transcript);
    setPhase("idle");
  };

  const buildRthm = async () => {
    const cleanThread = thread.trim();
    const cleanResponse = spokenResponse.trim();
    if (!cleanThread || !cleanResponse || phase !== "idle") return;

    setError("");
    setQueuedTitle("");
    setQueuedJobId("");
    try {
      setPhase("understanding");
      const understand = await fetch("/api/understand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pillar: "bridge",
          transcript: buildBrief(cleanThread, cleanResponse),
        }),
      });
      const data: UnderstandResult & { error?: string } = await understand.json();
      if (!understand.ok) throw new Error(data.error ?? "Could not build response");

      setPhase("queueing");
      const title = data.title.length > 80 ? data.title.slice(0, 77) + "..." : data.title;
      const queue = await fetch("/api/queue-generation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lyrics: data.lyrics,
          style: data.style,
          title,
          pillar: "Bridge",
          genre: "Warm indie folk electronic, intimate spoken-sung vocal, acoustic guitar, soft pads, compassionate, clear, grounded, no hype",
          note: "ADHD Reddit response. Based on pasted thread and Doug's spoken response.",
        }),
      });
      const queueData = await queue.json();
      if (!queue.ok) throw new Error(queueData.error ?? "Could not queue Rthm");

      setQueuedTitle(title);
      setQueuedJobId(typeof queueData.jobId === "string" ? queueData.jobId : "");
      setPhase("queued");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not queue Rthm");
      setPhase("idle");
    }
  };

  if (!checked) {
    return (
      <main className="relative z-10 min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-white/15 border-t-white/50 animate-spin" />
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="relative z-10 min-h-screen flex flex-col px-6 pt-safe" style={{ animation: "page-enter 380ms ease forwards" }}>
        <RevealBlock delay={0}>
          <AppHeader title="ADHD Reddit" titleIcon={<BrainIcon />} />
        </RevealBlock>
        <section className="flex-1 flex flex-col items-center justify-center text-center pb-28">
          <p className="text-sm text-white/45">This builder is private.</p>
          <button onClick={() => router.push("/")} className="mt-5 text-xs uppercase tracking-widest text-white/35">Return Home</button>
        </section>
      </main>
    );
  }

  const busy = phase !== "idle" && phase !== "queued";

  return (
    <main className="relative z-10 min-h-screen flex flex-col px-6 pt-safe" style={{ animation: "page-enter 380ms ease forwards" }}>
      <RevealBlock delay={0}>
        <AppHeader title="ADHD Reddit" titleIcon={<BrainIcon />} />
      </RevealBlock>

      <section className="flex-1 flex flex-col gap-4 pb-28">
        <div className="rounded-2xl border px-5 py-5" style={{ background: "rgba(255,255,255,0.035)", borderColor: "rgba(255,255,255,0.09)" }}>
          <p className="text-[10px] uppercase tracking-[0.3em] mb-2" style={{ color: "rgba(248,160,185,0.9)" }}>Private response builder</p>
          <h1 className="text-2xl font-light text-white/90 leading-tight" style={{ fontFamily: "var(--font-display)" }}>
            Turn a pasted ADHD question into a direct Rthm response.
          </h1>
          <p className="text-sm text-white/45 leading-relaxed mt-3">
            Paste the thread, speak your response, then queue a Rthm that answers the person.
          </p>
        </div>

        <textarea
          value={thread}
          onChange={(event) => setThread(event.target.value)}
          placeholder="Paste the Reddit post or thread here"
          className="w-full min-h-44 rounded-2xl border bg-black/20 px-4 py-4 text-sm text-white/86 placeholder:text-white/25 outline-none resize-none"
          style={{ borderColor: "rgba(255,255,255,0.10)" }}
        />

        <button
          onClick={phase === "recording" ? stopRecording : startRecording}
          disabled={busy && phase !== "recording"}
          className="w-full min-h-32 rounded-2xl border flex flex-col items-center justify-center gap-3 touch-manipulation active:scale-[0.99] transition disabled:opacity-50 disabled:active:scale-100"
          style={{
            background: phase === "recording" ? "rgba(239,68,68,0.10)" : "rgba(255,255,255,0.035)",
            borderColor: phase === "recording" ? "rgba(252,165,165,0.30)" : "rgba(255,255,255,0.10)",
            color: "rgba(255,245,250,0.92)",
          }}
        >
          <span className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: phase === "recording" ? "rgba(239,68,68,0.18)" : "rgba(255,255,255,0.07)" }}>
            {phase === "recording" ? <StopIcon /> : <MicIcon />}
          </span>
          <span className="text-sm font-medium text-white/82">
            {phase === "recording" ? "Tap to finish" : phase === "transcribing" ? "Transcribing..." : "Speak your response"}
          </span>
        </button>

        <textarea
          value={spokenResponse}
          onChange={(event) => setSpokenResponse(event.target.value)}
          placeholder="Your transcribed response will appear here. You can edit it before building."
          className="w-full min-h-32 rounded-2xl border bg-black/20 px-4 py-4 text-sm text-white/86 placeholder:text-white/25 outline-none resize-none"
          style={{ borderColor: "rgba(255,255,255,0.10)" }}
        />

        <button
          onClick={buildRthm}
          disabled={phase !== "idle" || !thread.trim() || !spokenResponse.trim()}
          className="rounded-full border px-4 py-3 text-[11px] uppercase tracking-widest touch-manipulation active:scale-[0.98] transition disabled:opacity-40 disabled:active:scale-100"
          style={{ background: "rgba(255,255,255,0.055)", borderColor: "rgba(248,160,185,0.24)", color: "rgba(255,232,240,0.9)" }}
        >
          {phase === "understanding" ? "Shaping response..." : phase === "queueing" ? "Queueing Rthm..." : phase === "queued" ? "Queued" : "Build response Rthm"}
        </button>

        {queuedTitle && (
          <div className="rounded-2xl border px-5 py-4 flex flex-col gap-3" style={{ background: "rgba(255,255,255,0.045)", borderColor: "rgba(255,255,255,0.10)" }}>
            <p className="text-sm text-white/72">{queuedTitle}</p>
            <p className="text-xs text-white/35">
              Queued{queuedJobId ? ` as ${queuedJobId.slice(0, 8)}` : ""}. It will appear under RTHMIC Bridge while generating.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => router.push("/library/my-rthms?collection=bridge")}
                className="rounded-full border px-3 py-2 text-[10px] uppercase tracking-widest"
                style={{ background: "rgba(255,255,255,0.055)", borderColor: "rgba(248,160,185,0.22)", color: "rgba(255,232,240,0.86)" }}
              >
                Open Bridge
              </button>
              <button
                onClick={() => {
                  setThread("");
                  setSpokenResponse("");
                  setQueuedTitle("");
                  setQueuedJobId("");
                  setPhase("idle");
                }}
                className="rounded-full border px-3 py-2 text-[10px] uppercase tracking-widest"
                style={{ background: "rgba(255,255,255,0.045)", borderColor: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.55)" }}
              >
                New response
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-red-200/75 leading-relaxed">{error}</p>}
      </section>
    </main>
  );
}

function MicIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 14.5c1.8 0 3-1.35 3-3.15V6.65c0-1.8-1.2-3.15-3-3.15S9 4.85 9 6.65v4.7c0 1.8 1.2 3.15 3 3.15Z" stroke="currentColor" strokeWidth="1.7" />
      <path d="M6.5 10.8c0 3.35 2.25 5.7 5.5 5.7s5.5-2.35 5.5-5.7M12 16.5v3.7M9 20.2h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
    </svg>
  );
}
