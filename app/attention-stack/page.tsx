"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
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

type AttentionCommand = {
  action: "set" | "pause" | "transition" | "resume" | "status";
  task?: string;
  pausedTask?: string;
};

function cleanSpokenTask(value: string): string {
  return value
    .trim()
    .replace(/^[,;:\s]+|[,;:.!?\s]+$/g, "")
    .replace(/^(?:okay|ok|right|so|well|basically|actually)[,\s]+/i, "")
    .replace(/^(?:working on|doing|the task of|trying to|needing to)\s+/i, "")
    .replace(/\s+(?:right now|at the moment)$/i, "")
    .replace(/\s+/g, " ");
}

function interpretCommand(transcript: string, hasCurrent: boolean): AttentionCommand {
  const text = transcript.trim().replace(/[.!?]+$/, "");
  const lower = text.toLowerCase();
  if (/\b(where was i|what was i doing|done|finished|that'?s done|all done)\b/.test(lower)) return { action: "resume" };
  if (/\b(what am i doing|what'?s my current|current task|where am i)\b/.test(lower)) return { action: "status" };

  const transitionMatch = text.match(/^(?:okay[, ]*)?(?:i(?:'m| am) )?pausing\s+(.+?)\s+(?:and|then)\s+moving\s+(?:on\s+)?to\s+(.+)$/i);
  if (transitionMatch?.[1] && transitionMatch[2]) {
    return {
      action: "transition",
      pausedTask: cleanSpokenTask(transitionMatch[1]),
      task: cleanSpokenTask(transitionMatch[2]),
    };
  }

  const pauseMatch = text.match(/^(?:okay[, ]*)?(?:i(?:'m| am) )?paus(?:e|ing)(?: this| that| what i(?:'m| am) doing)?(?: for| to do| because of)?\s+(.+)$/i);
  if (pauseMatch?.[1]) return { action: "pause", task: cleanSpokenTask(pauseMatch[1]) };

  const setMatch = text.match(/^(?:i(?:'m| am) )?(?:working on|doing|starting|focusing on|focus on)\s+(.+)$/i);
  if (setMatch?.[1]) return { action: "set", task: cleanSpokenTask(setMatch[1]) };

  return { action: hasCurrent ? "pause" : "set", task: cleanSpokenTask(text) };
}

export default function AttentionStackPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#0d1628]" />}>
      <AttentionStackContent />
    </Suspense>
  );
}

function AttentionStackContent() {
  const searchParams = useSearchParams();
  const embedded = searchParams.get("embedded") === "1";
  const [state, setState] = useState<AttentionState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const runAction = useCallback(async (action: string, task?: string, pausedTask?: string, extra?: Record<string, string>) => {
    setError("");
    setVoiceState("saving");
    try {
      const response = await fetch("/api/attention-stack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, task, pausedTask, ...extra }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not update attention stack");
      setState(data.state ?? EMPTY_STATE);
      setMessage(data.message ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update attention stack");
    } finally {
      setVoiceState("idle");
    }
  }, []);

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
      const command = interpretCommand(transcript, !!state.current);
      await runAction(command.action, command.task, command.pausedTask);
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
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      audioContextRef.current = audioContext;
      const levels = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        analyser.getByteFrequencyData(levels);
        const average = levels.reduce((sum, value) => sum + value, 0) / levels.length;
        setAudioLevel(Math.min(1, average / 72));
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
      chunksRef.current = [];
      const mimeType = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32000 } : { audioBitsPerSecond: 32000 });
      recorderRef.current = recorder;
      recorder.ondataavailable = event => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
        audioContextRef.current?.close();
        audioContextRef.current = null;
        setAudioLevel(0);
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
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    audioContextRef.current?.close();
  }, []);

  if (loading) return <main className="min-h-screen flex items-center justify-center bg-[#0d1628]"><div className="h-7 w-7 animate-spin rounded-full border-2 border-white/15 border-t-white/60" /></main>;

  return (
    <main
      className={`relative z-10 min-h-screen bg-[#0d1628] px-6 ${embedded ? "pt-5" : ""}`}
      style={embedded ? undefined : { paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      {embedded && (
        <button
          type="button"
          onClick={() => window.parent.postMessage({ type: "rthmic:close-attention-stack" }, window.location.origin)}
          className="fixed right-4 top-4 z-50 flex h-11 w-11 items-center justify-center rounded-full border border-white/12 bg-[#111d32] text-2xl leading-none text-white/65 shadow-lg touch-manipulation"
          aria-label="Close Attention Stack"
        >
          ×
        </button>
      )}
      {!embedded && <AppHeader title="Attention Stack" titleIcon={<StackIcon />} />}
      <div className="mx-auto flex max-w-xl flex-col gap-5 pb-16">
        <section className="rounded-3xl border p-5" style={{ borderColor: "rgba(74,222,128,0.34)", background: "rgba(34,197,94,0.075)" }}>
          <p className="text-[10px] uppercase tracking-[0.28em] text-green-300/70">Current focus</p>
          <h1 className="mt-3 text-2xl font-light leading-snug text-white" style={{ fontFamily: "var(--font-display)" }}>
            {state.current?.task ?? "Tell me what you are working on"}
          </h1>
          {state.current && state.stack.length > 0 && (
            <button type="button" onClick={() => runAction("resume")} disabled={voiceState !== "idle"} className="mt-5 flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm font-medium text-green-100/85 disabled:opacity-40" style={{ borderColor: "rgba(74,222,128,0.25)", background: "rgba(34,197,94,0.08)" }}>
              <span>Done - take me back</span><ReturnIcon />
            </button>
          )}
        </section>

        <button
          type="button"
          onClick={voiceState === "recording" ? stopRecording : startRecording}
          disabled={voiceState !== "idle" && voiceState !== "recording"}
          className="flex min-h-36 w-full flex-col items-center justify-center rounded-3xl border transition-transform touch-manipulation active:scale-[0.985] disabled:opacity-65"
          style={{ borderColor: voiceState === "recording" ? "rgba(248,113,113,0.6)" : "rgba(235,110,145,0.28)", background: voiceState === "recording" ? "rgba(248,113,113,0.1)" : "rgba(255,255,255,0.025)" }}
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full border text-rose-300" style={{ borderColor: "rgba(235,110,145,0.42)", background: "rgba(235,110,145,0.12)" }}><MicIcon recording={voiceState === "recording"} level={audioLevel} /></span>
          <span className="mt-3 text-base font-medium text-white/78">{voiceState === "recording" ? "Listening - tap when done" : voiceState === "transcribing" || voiceState === "saving" ? "Saving..." : "What are you switching your focus to?"}</span>
          {voiceState === "idle" && <span className="mt-1 text-xs text-white/38">Interruptions can nest as deeply as they need to.</span>}
        </button>

        {message && <p className="rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3 text-sm leading-relaxed text-white/58">{message}</p>}
        {error && <p role="alert" className="rounded-2xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm text-red-300/75">{error}</p>}

        {state.stack.length > 0 && (
          <section>
            <p className="mb-3 text-[10px] uppercase tracking-[0.28em] text-white/38">The way back</p>
            <div className="flex flex-col gap-2">
              {[...state.stack].reverse().map((entry, index, displayedStack) => (
                <div key={entry.id} className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.018] px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-widest text-white/28">{index === 0 ? "Next" : `${index + 1} levels back`}</p>
                    <p className="mt-1 text-sm leading-relaxed text-white/62">{entry.task}</p>
                    {entry.pausedFor && <p className="mt-1 text-xs text-white/30">Paused for: {entry.pausedFor}</p>}
                  </div>
                  <div className="flex items-center gap-1 text-white/38">
                    <button type="button" aria-label={`Move ${entry.task} toward current focus`} disabled={index === 0 || voiceState !== "idle"} onClick={() => runAction("move", undefined, undefined, { entryId: entry.id, direction: "toward-current" })} className="rounded-lg p-2 disabled:opacity-15"><ArrowIcon direction="up" /></button>
                    <button type="button" aria-label={`Move ${entry.task} further back`} disabled={index === displayedStack.length - 1 || voiceState !== "idle"} onClick={() => runAction("move", undefined, undefined, { entryId: entry.id, direction: "back" })} className="rounded-lg p-2 disabled:opacity-15"><ArrowIcon direction="down" /></button>
                    <button type="button" aria-label={`Delete ${entry.task}`} disabled={voiceState !== "idle"} onClick={() => runAction("delete", undefined, undefined, { entryId: entry.id })} className="rounded-lg border border-red-400/20 bg-red-400/[0.08] p-2 text-red-300 disabled:opacity-20"><TrashIcon /></button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {state.stack.length > 0 && (confirmClear ? (
          <div className="rounded-2xl border border-red-400/20 bg-red-400/[0.05] p-4">
            <p className="text-sm font-medium text-red-200/85">Clear the saved attention stack?</p>
            <p className="mt-1 text-xs text-white/38">Your current focus will stay in place.</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setConfirmClear(false)} className="rounded-xl border border-white/10 px-4 py-3 text-sm text-white/62">Cancel</button>
              <button type="button" onClick={() => { setConfirmClear(false); runAction("clear"); }} className="flex items-center justify-center gap-2 rounded-xl border border-red-400/35 bg-red-400/15 px-4 py-3 text-sm font-medium text-red-200"><TrashIcon /> Clear stack</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmClear(true)} className="flex items-center gap-2 self-start rounded-xl border border-red-400/20 bg-red-400/[0.06] px-3 py-2 text-xs text-red-300/85">
            <TrashIcon /> Clear the stack
          </button>
        ))}
        {state.current && state.stack.length === 0 && (
          <p className="flex items-center gap-2 self-start px-2 py-2 text-xs text-white/28">
            <CheckIcon /> Nothing to clear
          </p>
        )}
      </div>
    </main>
  );
}

function StackIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M5 7h14M7 12h10M9 17h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
}

function MicIcon({ recording, level }: { recording: boolean; level: number }) {
  if (recording) return <span className="flex h-7 items-center gap-[3px]" aria-hidden="true">{[0.55, 1, 0.75, 0.9, 0.5].map((weight, index) => <span key={index} className="w-[3px] rounded-full bg-red-300 transition-[height] duration-75" style={{ height: `${6 + Math.max(0.12, level * weight) * 21}px` }} />)}</span>;
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
}

function ReturnIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="m9 7-5 5 5 5M4 12h10a6 6 0 0 1 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ArrowIcon({ direction }: { direction: "up" | "down" }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ transform: direction === "down" ? "rotate(180deg)" : undefined }}><path d="m6 15 6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function TrashIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function CheckIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 4 4 10-10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
