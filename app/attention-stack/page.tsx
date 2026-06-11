"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppHeader } from "@/app/components/AppHeader";

interface AttentionEntry {
  id: string;
  task: string;
  pausedFor?: string;
  startedAt: number;
  pausedAt?: number;
}

interface AttentionState {
  current: AttentionEntry | null;
  stack: AttentionEntry[];
  completed: AttentionEntry[];
}

type VoiceState = "idle" | "recording" | "transcribing" | "saving";

const EMPTY_STATE: AttentionState = { current: null, stack: [], completed: [] };

function interpretCommand(transcript: string, hasCurrent: boolean): { action: "set" | "pause" | "resume" | "status"; task?: string } {
  const text = transcript.trim().replace(/[.!?]+$/, "");
  const lower = text.toLowerCase();
  if (/\b(where was i|what was i doing|done|finished|that'?s done|all done)\b/.test(lower)) return { action: "resume" };
  if (/\b(what am i doing|what'?s my current|current task|where am i)\b/.test(lower)) return { action: "status" };

  const pauseMatch = text.match(/^(?:okay[, ]*)?(?:i(?:'m| am) )?paus(?:e|ing)(?: this| that| what i(?:'m| am) doing)?(?: for| to do| because of)?\s+(.+)$/i);
  if (pauseMatch?.[1]) return { action: "pause", task: pauseMatch[1].trim() };

  const setMatch = text.match(/^(?:i(?:'m| am) )?(?:working on|doing|starting|focusing on|focus on)\s+(.+)$/i);
  if (setMatch?.[1]) return { action: "set", task: setMatch[1].trim() };

  return { action: hasCurrent ? "pause" : "set", task: text };
}

export default function AttentionStackPage() {
  const [state, setState] = useState<AttentionState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [manualTask, setManualTask] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const speak = useCallback((text: string) => {
    if (!("speechSynthesis" in window) || !text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.94;
    window.speechSynthesis.speak(utterance);
  }, []);

  const runAction = useCallback(async (action: string, task?: string, speakResult = true) => {
    setError("");
    setVoiceState("saving");
    try {
      const response = await fetch("/api/attention-stack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, task }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not update attention stack");
      setState(data.state ?? EMPTY_STATE);
      setMessage(data.message ?? "Saved");
      if (speakResult) speak(data.message ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update attention stack");
    } finally {
      setVoiceState("idle");
    }
  }, [speak]);

  useEffect(() => {
    fetch("/api/attention-stack")
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Unauthorized");
        setState(data.state ?? EMPTY_STATE);
      })
      .catch(cause => setError(cause instanceof Error ? cause.message : "Could not load attention stack"))
      .finally(() => setLoading(false));
  }, []);

  const processAudio = useCallback(async (blob: Blob) => {
    setVoiceState("transcribing");
    try {
      const form = new FormData();
      const ext = blob.type.includes("mp4") ? "m4a" : "webm";
      form.append("audio", blob, `attention-stack.${ext}`);
      const response = await fetch("/api/transcribe", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not transcribe");
      const transcript = typeof data.transcript === "string" ? data.transcript.trim() : "";
      if (!transcript) throw new Error("I did not hear anything");
      setMessage(`Heard: “${transcript}”`);
      const command = interpretCommand(transcript, !!state.current);
      await runAction(command.action, command.task);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not process recording");
      setVoiceState("idle");
    }
  }, [runAction, state]);

  const startRecording = async () => {
    setError("");
    setMessage("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeType = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32000 } : { audioBitsPerSecond: 32000 });
      recorderRef.current = recorder;
      recorder.ondataavailable = event => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || "audio/webm" });
        if (blob.size > 0) processAudio(blob);
        else { setError("Nothing was recorded"); setVoiceState("idle"); }
      };
      recorder.start(200);
      setVoiceState("recording");
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      setError(/denied|not allowed/i.test(detail) ? "Microphone access denied" : "Could not start the microphone");
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    recorderRef.current = null;
  };

  useEffect(() => () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    streamRef.current?.getTracks().forEach(track => track.stop());
    window.speechSynthesis?.cancel();
  }, []);

  const submitManual = (event: React.FormEvent) => {
    event.preventDefault();
    const task = manualTask.trim();
    if (!task) return;
    runAction(state.current ? "pause" : "set", task, false);
    setManualTask("");
  };

  if (loading) return <main className="min-h-screen flex items-center justify-center"><div className="h-7 w-7 animate-spin rounded-full border-2 border-white/15 border-t-white/60" /></main>;

  return (
    <main className="relative z-10 min-h-screen px-6" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <AppHeader title="Attention Stack" titleIcon={<StackIcon />} />
      <div className="mx-auto flex max-w-xl flex-col gap-5 pb-16">
        <section className="rounded-3xl border p-5" style={{ borderColor: "rgba(235,110,145,0.3)", background: "rgba(235,110,145,0.06)" }}>
          <p className="text-[10px] uppercase tracking-[0.28em] text-rose-300/65">Current focus</p>
          <h1 className="mt-3 text-2xl font-light leading-snug text-white" style={{ fontFamily: "var(--font-display)" }}>
            {state.current?.task ?? "Tell me what you are working on"}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-white/42">
            {state.stack.length ? `${state.stack.length} earlier ${state.stack.length === 1 ? "task" : "tasks"} safely remembered.` : "Interruptions can nest as deeply as they need to."}
          </p>
        </section>

        <button
          type="button"
          onClick={voiceState === "recording" ? stopRecording : startRecording}
          disabled={voiceState !== "idle" && voiceState !== "recording"}
          className="flex min-h-36 w-full flex-col items-center justify-center rounded-3xl border transition-transform touch-manipulation active:scale-[0.985] disabled:opacity-65"
          style={{ borderColor: voiceState === "recording" ? "rgba(248,113,113,0.6)" : "rgba(235,110,145,0.28)", background: voiceState === "recording" ? "rgba(248,113,113,0.1)" : "rgba(255,255,255,0.025)" }}
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full border text-rose-300" style={{ borderColor: "rgba(235,110,145,0.42)", background: "rgba(235,110,145,0.12)" }}><MicIcon recording={voiceState === "recording"} /></span>
          <span className="mt-3 text-base font-medium text-white/78">{voiceState === "recording" ? "Listening - tap when done" : voiceState === "transcribing" ? "Understanding..." : voiceState === "saving" ? "Remembering..." : "Speak to your attention stack"}</span>
          {voiceState === "idle" && <span className="mt-1 text-xs text-white/38">“Pausing this for…” or “Done, where was I?”</span>}
        </button>

        {message && <p className="rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3 text-sm leading-relaxed text-white/58">{message}</p>}
        {error && <p role="alert" className="rounded-2xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm text-red-300/75">{error}</p>}

        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => runAction("status")} disabled={!state.current || voiceState !== "idle"} className="rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-4 text-sm text-white/62 disabled:opacity-30">What am I doing?</button>
          <button type="button" onClick={() => runAction("resume")} disabled={!state.current || voiceState !== "idle"} className="rounded-2xl border px-4 py-4 text-sm font-medium disabled:opacity-30" style={{ borderColor: "rgba(235,110,145,0.32)", background: "rgba(235,110,145,0.08)", color: "rgba(251,182,206,0.9)" }}>Done - take me back</button>
        </div>

        <form onSubmit={submitManual} className="flex gap-2">
          <input value={manualTask} onChange={event => setManualTask(event.target.value)} placeholder={state.current ? "Pause this for..." : "I am working on..."} className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-3 text-sm text-white outline-none placeholder:text-white/25" />
          <button type="submit" disabled={!manualTask.trim() || voiceState !== "idle"} className="rounded-2xl border border-white/12 px-4 text-sm text-white/65 disabled:opacity-30">Save</button>
        </form>

        {state.stack.length > 0 && (
          <section>
            <p className="mb-3 text-[10px] uppercase tracking-[0.28em] text-white/38">The way back</p>
            <div className="flex flex-col gap-2">
              {[...state.stack].reverse().map((entry, index) => (
                <div key={entry.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.018] px-4 py-3">
                  <p className="text-[10px] uppercase tracking-widest text-white/28">{index === 0 ? "Next" : `${index + 1} levels back`}</p>
                  <p className="mt-1 text-sm leading-relaxed text-white/62">{entry.task}</p>
                  {entry.pausedFor && <p className="mt-1 text-xs text-white/30">Paused for: {entry.pausedFor}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        {(state.current || state.stack.length > 0) && <button
          type="button"
          onClick={() => {
            if (!confirmClear) { setConfirmClear(true); return; }
            setConfirmClear(false);
            runAction("clear", undefined, false);
          }}
          className="self-start text-xs text-white/32 underline underline-offset-4"
        >
          {confirmClear ? "Tap again to confirm clear" : "Clear the entire stack"}
        </button>}
      </div>
    </main>
  );
}

function StackIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M5 7h14M7 12h10M9 17h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
}

function MicIcon({ recording }: { recording: boolean }) {
  if (recording) return <span className="h-4 w-4 rounded bg-red-300" />;
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
}
