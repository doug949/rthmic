"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { TransitionLink } from "@/app/components/TransitionLink";
import { RevealBlock } from "@/app/components/RevealBlock";
import { useSwipeBack } from "@/app/hooks/useSwipeBack";
import { AppHeader } from "@/app/components/AppHeader";

type Phase = "idle" | "recording" | "processing" | "review" | "sending" | "done" | "error";

const MAX_SECONDS = 120;

export default function FeedbackPage() {
  useSwipeBack("/");
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [transcript, setTranscript] = useState("");
  const [editedTranscript, setEditedTranscript] = useState("");
  const [transitioning, setTransitioning] = useState(false);
  const [accessChecked, setAccessChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number>(0);
  const orbRef = useRef<HTMLDivElement>(null);

  const transitionTo = useCallback((next: Phase) => {
    setTransitioning(true);
    setTimeout(() => {
      setPhase(next);
      setTimeout(() => setTransitioning(false), 50);
    }, 200);
  }, []);

  const cleanupAudio = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    analyserRef.current = null;
    try { audioCtxRef.current?.close(); } catch { /* ignore */ }
    audioCtxRef.current = null;
  }, []);

  const startOrb = useCallback((stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.85;
      source.connect(analyser);
      analyserRef.current = analyser;
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        animFrameRef.current = requestAnimationFrame(tick);
        if (!analyserRef.current || !orbRef.current) return;
        analyserRef.current.getByteFrequencyData(buf);
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
        const scale = 1 + (avg / 255) * 0.4;
        orbRef.current.style.transform = `scale(${scale})`;
        orbRef.current.style.opacity = `${0.55 + (avg / 255) * 0.45}`;
      };
      tick();
    } catch { /* ignore */ }
  }, []);

  const startRecording = async () => {
    setErrorMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      startOrb(stream);
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]
        .find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      mimeTypeRef.current = mimeType;
      chunksRef.current = [];
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => { stream.getTracks().forEach((t) => t.stop()); cleanupAudio(); };
      mr.start(250);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      autoStopRef.current = setTimeout(() => stopRecording(), MAX_SECONDS * 1000);
      transitionTo("recording");
    } catch {
      setErrorMsg("Microphone access denied. Please allow microphone access and try again.");
    }
  };

  const stopRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoStopRef.current) clearTimeout(autoStopRef.current);
    mediaRecorderRef.current?.stop();
    transitionTo("processing");
    setTimeout(() => transcribeAudio(), 300);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const transcribeAudio = async () => {
    try {
      const blob = new Blob(chunksRef.current, {
        type: mimeTypeRef.current || "audio/webm",
      });
      const formData = new FormData();
      const ext = mimeTypeRef.current.includes("mp4") ? "m4a"
        : mimeTypeRef.current.includes("ogg") ? "ogg" : "webm";
      formData.append("audio", blob, `feedback.${ext}`);
      const res = await fetch("/api/transcribe", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Transcription failed");
      const { transcript: raw } = await res.json();
      if (!raw?.trim()) throw new Error("Nothing was captured — please try again");
      setTranscript(raw.trim());
      setEditedTranscript(raw.trim());
      transitionTo("review");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Something went wrong");
      transitionTo("error");
    }
  };

  const sendFeedback = async () => {
    transitionTo("sending");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: editedTranscript.trim() }),
      });
      if (!res.ok) throw new Error("Failed to save feedback");
      transitionTo("done");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Something went wrong");
      transitionTo("error");
    }
  };

  useEffect(() => () => {
    cleanupAudio();
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoStopRef.current) clearTimeout(autoStopRef.current);
  }, [cleanupAudio]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setIsAdmin(!!data.access?.isAdmin);
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      })
      .finally(() => {
        if (!cancelled) setAccessChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const progress = Math.min(seconds / MAX_SECONDS, 1);
  const wordCount = editedTranscript.trim().split(/\s+/).filter(Boolean).length;

  if (!accessChecked) {
    return (
      <main className="relative z-10 min-h-screen flex flex-col px-6 pt-safe" style={{ animation: "page-enter 380ms ease forwards" }}>
        <RevealBlock delay={0}>
          <AppHeader title="Feedback" />
        </RevealBlock>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="relative z-10 min-h-screen flex flex-col px-6 pt-safe" style={{ animation: "page-enter 380ms ease forwards" }}>
        <RevealBlock delay={0}>
          <AppHeader title="Feedback" />
        </RevealBlock>
        <section className="flex-1 flex items-center justify-center text-center">
          <div className="rounded-2xl border px-6 py-8 max-w-sm" style={{ background: "rgba(255,255,255,0.035)", borderColor: "rgba(255,255,255,0.08)" }}>
            <p className="text-sm text-white/50 leading-relaxed">Audio feedback recording is currently unavailable for tester accounts.</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="relative z-10 min-h-screen flex flex-col px-6 pt-safe" style={{ animation: "page-enter 380ms ease forwards" }}>
      {/* Phase transition overlay */}
      <div
        className="fixed inset-0 z-50 pointer-events-none"
        style={{ background: "#0d1628", opacity: transitioning ? 1 : 0, transition: "opacity 200ms ease" }}
      />

      <RevealBlock delay={0}>
        <AppHeader
          title="Feedback"
          onBack={
            phase === "processing" || phase === "sending"
              ? null  // can't go back during async
              : undefined // default: router.back()
          }
        />
      </RevealBlock>

      <div className="flex-1 flex flex-col">

        {/* Idle */}
        {phase === "idle" && (
          <section className="flex-1 flex flex-col justify-between pb-12">
            <div className="flex flex-col gap-6 pt-4">
              <RevealBlock delay={0}>
                <p className="text-[10px] tracking-widest uppercase text-white/50">Beta feedback</p>
              </RevealBlock>
              <RevealBlock delay={30}>
                <h1 className="text-2xl font-light text-white leading-snug" style={{ fontFamily: "var(--font-display)" }}>
                  Tell us what you think
                </h1>
              </RevealBlock>
              <RevealBlock delay={70}>
                <p className="text-sm text-white/55 leading-relaxed">
                  Speak freely — what worked, what didn't, what surprised you. Your voice note goes directly to the team.
                </p>
              </RevealBlock>
              {errorMsg && (
                <RevealBlock delay={0}>
                  <p className="text-sm text-red-400/60">{errorMsg}</p>
                </RevealBlock>
              )}
            </div>
            <RevealBlock delay={120}>
              <button
                onClick={startRecording}
                className="w-full py-6 rounded-2xl text-base font-semibold tracking-wide active:scale-[0.98] transition-all touch-manipulation"
                style={{ background: "rgba(201,165,90,0.08)", border: "1px solid rgba(201,165,90,0.35)", color: "#c9a55a" }}
              >
                ◉ Start speaking
              </button>
            </RevealBlock>
          </section>
        )}

        {/* Recording */}
        {phase === "recording" && (
          <section className="flex-1 flex flex-col items-center justify-between pb-12">
            <div className="flex-1 flex flex-col items-center justify-center gap-10">
              <div className="relative flex items-center justify-center w-32 h-32">
                <div
                  ref={orbRef}
                  className="w-24 h-24 rounded-full transition-none"
                  style={{ background: "radial-gradient(circle, rgba(201,165,90,0.35) 0%, rgba(201,165,90,0.08) 70%)", opacity: 0.55 }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-mono text-white/55">{fmtTime(seconds)}</span>
                </div>
              </div>
              <div className="w-48 h-0.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{ width: `${progress * 100}%`, background: "rgba(201,165,90,0.4)" }}
                />
              </div>
              <p className="text-sm text-white/45 tracking-wide">Speaking…</p>
            </div>
            <button
              onClick={stopRecording}
              className="w-full py-6 rounded-2xl text-base font-semibold tracking-wide active:scale-[0.98] transition-all touch-manipulation"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.5)" }}
            >
              Done — review my feedback
            </button>
          </section>
        )}

        {/* Processing */}
        {(phase === "processing" || phase === "sending") && (
          <section className="flex-1 flex flex-col items-center justify-center pb-24 gap-8">
            <RevealBlock delay={0}>
              <div className="text-center">
                <h2 className="text-xl font-light tracking-wide text-white" style={{ fontFamily: "var(--font-display)" }}>
                  {phase === "sending" ? "Sending your feedback" : "Transcribing…"}
                </h2>
                <p className="text-sm text-white/45 mt-2">
                  {phase === "sending" ? "Almost done" : "Reading what you said"}
                </p>
              </div>
            </RevealBlock>
            <RevealBlock delay={60}>
              <div className="w-7 h-7 rounded-full border-2 border-white/15 border-t-white/55 animate-spin" />
            </RevealBlock>
          </section>
        )}

        {/* Review — show transcript, allow edits, confirm send */}
        {phase === "review" && (
          <section className="flex-1 flex flex-col justify-between pb-12">
            <div className="flex flex-col gap-5 pt-4">
              <RevealBlock delay={0}>
                <p className="text-[10px] tracking-widest uppercase text-white/50">Review your feedback</p>
              </RevealBlock>
              <RevealBlock delay={30}>
                <h1 className="text-2xl font-light text-white leading-snug" style={{ fontFamily: "var(--font-display)" }}>
                  Does this look right?
                </h1>
              </RevealBlock>
              <RevealBlock delay={70}>
                <p className="text-sm text-white/50 leading-relaxed">
                  Edit anything before sending. This is exactly what the team will receive.
                </p>
              </RevealBlock>

              <RevealBlock delay={110}>
                <div
                  className="rounded-2xl px-5 py-5 flex flex-col gap-3"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <p className="text-[10px] text-white/45 tracking-widest uppercase">Transcription</p>
                  <textarea
                    value={editedTranscript}
                    onChange={(e) => setEditedTranscript(e.target.value)}
                    rows={6}
                    className="w-full bg-transparent text-sm text-white/75 leading-relaxed resize-none outline-none placeholder:text-white/20"
                    placeholder="Your transcribed feedback…"
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-white/45">{wordCount} {wordCount === 1 ? "word" : "words"}</p>
                    {editedTranscript !== transcript && (
                      <button
                        onClick={() => setEditedTranscript(transcript)}
                        className="text-[10px] text-white/45 hover:text-white/60 transition-colors tracking-wide"
                      >
                        Reset to original
                      </button>
                    )}
                  </div>
                </div>
              </RevealBlock>
            </div>

            <div className="flex flex-col gap-3 pt-6">
              <RevealBlock delay={150}>
                <button
                  onClick={sendFeedback}
                  disabled={!editedTranscript.trim()}
                  className="w-full py-6 rounded-2xl text-base font-semibold tracking-wide active:scale-[0.98] transition-all touch-manipulation disabled:opacity-30"
                  style={{ background: "rgba(201,165,90,0.08)", border: "1px solid rgba(201,165,90,0.35)", color: "#c9a55a" }}
                >
                  Send feedback →
                </button>
              </RevealBlock>
              <RevealBlock delay={180}>
                <button
                  onClick={() => { setTranscript(""); setEditedTranscript(""); transitionTo("idle"); }}
                  className="w-full py-3 text-white/50 text-sm tracking-wide touch-manipulation"
                >
                  Re-record instead
                </button>
              </RevealBlock>
            </div>
          </section>
        )}

        {/* Done */}
        {phase === "done" && (
          <section className="flex-1 flex flex-col justify-between pb-12">
            <div className="flex flex-col gap-6 pt-4">
              <RevealBlock delay={0}>
                <p className="text-[10px] tracking-widest uppercase text-white/50">Sent</p>
              </RevealBlock>
              <RevealBlock delay={30}>
                <h1 className="text-2xl font-light text-white leading-snug" style={{ fontFamily: "var(--font-display)" }}>
                  Thank you
                </h1>
              </RevealBlock>
              <RevealBlock delay={70}>
                <p className="text-sm text-white/55 leading-relaxed">
                  Your feedback has been received by the team. It helps shape RTHMIC for everyone.
                </p>
              </RevealBlock>
            </div>
            <div className="flex flex-col gap-3">
              <RevealBlock delay={120}>
                <button
                  onClick={() => { setSeconds(0); setTranscript(""); setEditedTranscript(""); transitionTo("idle"); }}
                  className="w-full py-5 rounded-2xl text-sm font-semibold tracking-wide active:scale-[0.98] transition-all touch-manipulation"
                  style={{ background: "rgba(201,165,90,0.08)", border: "1px solid rgba(201,165,90,0.35)", color: "#c9a55a" }}
                >
                  Send another
                </button>
              </RevealBlock>
              <RevealBlock delay={150}>
                <TransitionLink href="/" className="block w-full py-3 text-center text-white/50 text-sm tracking-wide touch-manipulation">
                  Back to RTHMIC
                </TransitionLink>
              </RevealBlock>
            </div>
          </section>
        )}

        {/* Error */}
        {phase === "error" && (
          <section className="flex-1 flex flex-col justify-between pb-12">
            <div className="flex flex-col gap-6 pt-4">
              <RevealBlock delay={0}>
                <p className="text-[10px] tracking-widest uppercase text-red-400/40">Error</p>
              </RevealBlock>
              <RevealBlock delay={30}>
                <h1 className="text-2xl font-light text-white leading-snug" style={{ fontFamily: "var(--font-display)" }}>
                  Something went wrong
                </h1>
              </RevealBlock>
              <RevealBlock delay={70}>
                <p className="text-sm text-red-400/50 leading-relaxed">{errorMsg}</p>
              </RevealBlock>
            </div>
            <RevealBlock delay={120}>
              <button
                onClick={() => { setErrorMsg(""); transitionTo("idle"); }}
                className="w-full py-6 rounded-2xl text-base font-semibold tracking-wide active:scale-[0.98] transition-all touch-manipulation"
                style={{ background: "rgba(201,165,90,0.08)", border: "1px solid rgba(201,165,90,0.35)", color: "#c9a55a" }}
              >
                Try again
              </button>
            </RevealBlock>
          </section>
        )}
      </div>
    </main>
  );
}
