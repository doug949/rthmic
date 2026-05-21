"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type NoteState = "idle" | "recording" | "saving" | "saved" | "error";

export default function QuickCodexNote() {
  const pathname = usePathname();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState<NoteState>("idle");
  const [message, setMessage] = useState("");
  const [level, setLevel] = useState(0);

  useEffect(() => setMounted(true), []);
  if (!mounted || pathname === "/login") return null;

  const stopMeter = () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    setLevel(0);
  };

  const startMeter = (stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const context = new AudioCtx();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      audioContextRef.current = context;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const value of data) {
          const centered = value - 128;
          sum += centered * centered;
        }
        const rms = Math.sqrt(sum / data.length) / 42;
        setLevel(Math.max(0, Math.min(1, rms)));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // Feedback still records if visual metering is unavailable.
    }
  };

  const start = async () => {
    try {
      setMessage("");
      chunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      startMeter(stream);
      const mimeType = MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stopMeter();
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        save();
      };
      recorder.start();
      setState("recording");
    } catch (err) {
      console.error("[quick-note] record start failed:", err);
      setMessage("Microphone unavailable");
      setState("error");
    }
  };

  const stop = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setState("saving");
  };

  const save = async () => {
    try {
      setState("saving");
      const blob = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || "audio/webm" });
      const form = new FormData();
      form.append("audio", blob, "codex-note.webm");
      const transcribeRes = await fetch("/api/transcribe", { method: "POST", body: form });
      if (!transcribeRes.ok) throw new Error("transcription failed");
      const { transcript } = await transcribeRes.json();
      const text = typeof transcript === "string" ? transcript.trim() : "";
      if (!text) throw new Error("empty transcription");

      const feedbackRes = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });
      if (!feedbackRes.ok) throw new Error("feedback save failed");

      setMessage("Thanks - feedback sent");
      setState("saved");
      setTimeout(() => { setState("idle"); setMessage(""); }, 3200);
    } catch (err) {
      console.error("[quick-feedback] save failed:", err);
      setMessage("Could not send feedback");
      setState("error");
    }
  };

  return (
    <div
      className="fixed right-4 z-[45] flex flex-col items-end gap-2"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 76px)" }}
    >
      {message && (
        <div
          className="rounded-full border px-3 py-2 text-[11px] tracking-wide touch-manipulation"
          style={{ background: "rgba(10,16,32,0.92)", borderColor: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.62)", backdropFilter: "blur(14px)" }}
        >
          {message}
        </div>
      )}
      {state === "recording" ? (
        <button
          onClick={stop}
          className="h-12 rounded-full border flex items-center gap-3 px-4 touch-manipulation active:scale-[0.98] transition-transform overflow-hidden"
          style={{
            background: "rgba(10,16,32,0.78)",
            borderColor: "rgba(220,60,60,0.42)",
            color: "rgba(255,205,205,0.92)",
            boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.03), 0 0 ${10 + level * 28}px rgba(220,60,60,${0.16 + level * 0.34})`,
            backdropFilter: "blur(14px)",
          }}
          aria-label="Stop instant feedback recording"
        >
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: "rgba(220,60,60,0.95)", transform: `scale(${1 + level * 1.4})` }} />
          <span className="text-[11px] uppercase tracking-widest whitespace-nowrap">Recording feedback</span>
        </button>
      ) : (
        <button
          onClick={state === "saving" ? undefined : start}
          disabled={state === "saving"}
          className="min-h-12 rounded-full border flex items-center gap-3 px-4 py-2 touch-manipulation active:scale-[0.98] transition-transform disabled:opacity-45 text-left"
          style={{
            background: "rgba(10,16,32,0.70)",
            borderColor: "rgba(255,255,255,0.10)",
            color: "rgba(255,255,255,0.62)",
            boxShadow: "inset 0 1px 8px rgba(0,0,0,0.42), 0 6px 18px rgba(0,0,0,0.22)",
            backdropFilter: "blur(14px)",
          }}
          aria-label="Record instant feedback for the developer"
        >
          <span className="w-7 h-7 rounded-full border flex items-center justify-center flex-shrink-0 text-[12px]" style={{ borderColor: "rgba(255,255,255,0.10)", color: "rgba(201,165,90,0.76)", background: "rgba(255,255,255,0.035)" }}>
            {state === "saving" ? "…" : "!"}
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-[11px] font-medium tracking-wide">{state === "saving" ? "Transcribing and sending" : "Give instant feedback"}</span>
            <span className="text-[9px] uppercase tracking-widest text-white/28">Record instant feedback for the developer</span>
          </span>
        </button>
      )}
    </div>
  );
}
