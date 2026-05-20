"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type NoteState = "idle" | "recording" | "saving" | "saved" | "error";

export default function QuickCodexNote() {
  const pathname = usePathname();
  const router = useRouter();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState<NoteState>("idle");
  const [message, setMessage] = useState("");

  useEffect(() => setMounted(true), []);
  if (!mounted || pathname === "/login") return null;

  const start = async () => {
    try {
      setMessage("");
      chunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
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

      const noteRes = await fetch("/api/codex-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "voice", text }),
      });
      if (!noteRes.ok) throw new Error("note save failed");

      setMessage("Saved for Codex");
      setState("saved");
      setTimeout(() => { setState("idle"); setMessage(""); }, 2500);
    } catch (err) {
      console.error("[quick-note] save failed:", err);
      setMessage("Could not save note");
      setState("error");
    }
  };

  return (
    <div
      className="fixed right-4 z-[45] flex items-end gap-2"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 96px)" }}
    >
      {message && (
        <button
          onClick={() => router.push("/codex-notes")}
          className="rounded-full border px-3 py-2 text-[11px] tracking-wide touch-manipulation"
          style={{ background: "rgba(10,16,32,0.92)", borderColor: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.62)", backdropFilter: "blur(14px)" }}
        >
          {message}
        </button>
      )}
      {state === "recording" ? (
        <button
          onClick={stop}
          className="w-12 h-12 rounded-full border flex items-center justify-center touch-manipulation active:scale-95 transition-transform"
          style={{ background: "rgba(220,60,60,0.24)", borderColor: "rgba(220,60,60,0.48)", color: "rgba(255,180,180,0.95)", boxShadow: "0 8px 28px rgba(0,0,0,0.35)" }}
          aria-label="Stop Codex note recording"
        >
          ■
        </button>
      ) : (
        <button
          onClick={state === "saving" ? undefined : start}
          disabled={state === "saving"}
          className="w-12 h-12 rounded-full border flex items-center justify-center touch-manipulation active:scale-95 transition-transform disabled:opacity-45"
          style={{ background: "rgba(201,165,90,0.18)", borderColor: "rgba(201,165,90,0.38)", color: "rgba(201,165,90,0.95)", boxShadow: "0 8px 28px rgba(0,0,0,0.35)" }}
          aria-label="Record Codex note"
        >
          {state === "saving" ? "…" : "✎"}
        </button>
      )}
    </div>
  );
}
