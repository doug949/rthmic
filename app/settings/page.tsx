"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSwipeNavigation } from "@/app/hooks/useSwipeBack";
import { transitionTo } from "@/app/lib/pageTransition";
import { AppHeader } from "@/app/components/AppHeader";

const SLOTS = [
  {
    label: "Power",
    question: "What music makes you feel powerful and inspired?",
    hint: "Think of tracks that make you feel unstoppable — before a big moment, a workout, a challenge.",
  },
  {
    label: "Focus",
    question: "What music puts you in a deep focus state?",
    hint: "The music you reach for when you need to think clearly and work without distraction.",
  },
  {
    label: "Energy",
    question: "What music instantly lifts your energy or mood?",
    hint: "Tracks that shift your state the moment they come on — pure joy or momentum.",
  },
  {
    label: "Soul",
    question: "What music do you always come back to — your soul music?",
    hint: "The artists that feel like home. The ones you've returned to across years of your life.",
  },
];

interface SlotState {
  transcript: string;
  style: string;
  committed: boolean;
  interpreting: boolean;
  suggestedArtists: string[];
  selectedArtists: string[];
}

const emptySlot = (): SlotState => ({
  transcript: "",
  style: "",
  committed: false,
  interpreting: false,
  suggestedArtists: [],
  selectedArtists: [],
});

// idle → recording → transcribing → interpreting → idle
type VoicePhase = "idle" | "recording" | "transcribing" | "interpreting";

function toSentenceCase(s: string) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function SettingsPage() {
  const router = useRouter();
  const [currentSlot, setCurrentSlot] = useState(0);
  const [slotGeneration, setSlotGeneration] = useState(0);
  const [slots, setSlots] = useState<SlotState[]>([emptySlot(), emptySlot(), emptySlot(), emptySlot()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [interpretError, setInterpretError] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Voice state
  const [voicePhase, setVoicePhase] = useState<VoicePhase>("idle");
  const [voiceError, setVoiceError] = useState("");

  // MediaRecorder refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("");

  // Web Audio refs for mic button visualization
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number>(0);
  const micBtnRef = useRef<HTMLDivElement>(null);

  // Load existing styles on mount
  useEffect(() => {
    fetch("/api/genres")
      .then((r) => r.json())
      .then((d) => {
        if (d.genres) {
          setSlots((prev) =>
            prev.map((s, i) => ({
              ...s,
              style: d.genres[i] ?? "",
              committed: !!(d.genres[i]),
            }))
          );
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Stop recording + cleanup when changing slots
  useEffect(() => {
    stopVoiceRecording();
    cleanupWebAudio();
    setVoiceError("");
    setInterpretError("");
    setShowAdvanced(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSlot]);

  const updateSlot = (i: number, patch: Partial<SlotState>) => {
    setSlots((prev) => prev.map((s, j) => j === i ? { ...s, ...patch } : s));
  };

  const toggleArtist = (i: number, artist: string) => {
    const current = slots[i].selectedArtists;
    const next = current.includes(artist)
      ? current.filter((a) => a !== artist)
      : [...current, artist];
    updateSlot(i, { selectedArtists: next });
  };

  // ─── Web Audio visualization ─────────────────────────────────────────────────

  const cleanupWebAudio = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    analyserRef.current = null;
    try { audioCtxRef.current?.close(); } catch { /* ignore */ }
    audioCtxRef.current = null;
    // Reset button appearance
    const el = micBtnRef.current;
    if (el) {
      el.style.transform = "";
      el.style.boxShadow = "";
    }
  }, []);

  const startAudioVisualization = useCallback((stream: MediaStream) => {
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
      const bufLen = analyser.frequencyBinCount;
      const data = new Uint8Array(bufLen);

      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < bufLen; i++) sum += data[i];
        const norm = Math.min(sum / (bufLen * 90), 1);
        const scale = 1 + norm * 0.35;
        const glow = Math.round(norm * 28);
        const glowAlpha = (0.15 + norm * 0.45).toFixed(3);
        const el = micBtnRef.current;
        if (el) {
          el.style.transform = `scale(${scale.toFixed(3)})`;
          el.style.boxShadow = `0 0 ${glow}px ${Math.round(glow * 0.4)}px rgba(239,68,68,${glowAlpha})`;
        }
        animFrameRef.current = requestAnimationFrame(tick);
      };
      animFrameRef.current = requestAnimationFrame(tick);
    } catch (e) {
      console.warn("Web Audio unavailable:", e);
    }
  }, []);

  // ─── Voice recording ─────────────────────────────────────────────────────────

  const stopVoiceRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const startVoiceRecording = useCallback(async (slotIndex: number) => {
    setVoiceError("");
    setInterpretError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      let recorder: MediaRecorder | null = null;
      let chosenMime = "";
      const LOW_BITRATE = 32768;
      const typesToTry = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

      for (const type of typesToTry) {
        if (!MediaRecorder.isTypeSupported(type)) continue;
        try {
          recorder = new MediaRecorder(stream, { mimeType: type, audioBitsPerSecond: LOW_BITRATE });
          chosenMime = type;
          break;
        } catch {
          try {
            recorder = new MediaRecorder(stream, { mimeType: type });
            chosenMime = type;
            break;
          } catch { continue; }
        }
      }
      if (!recorder) {
        try { recorder = new MediaRecorder(stream, { audioBitsPerSecond: LOW_BITRATE }); }
        catch { recorder = new MediaRecorder(stream); }
        chosenMime = recorder.mimeType || "audio/mp4";
      }

      mimeTypeRef.current = chosenMime;
      chunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        cleanupWebAudio();

        const actualMime = (mediaRecorderRef.current?.mimeType || mimeTypeRef.current || "audio/mp4").trim() || "audio/mp4";
        const blob = new Blob(chunksRef.current, { type: actualMime });

        if (blob.size === 0) {
          setVoiceError("Nothing captured — please try again.");
          setVoicePhase("idle");
          return;
        }

        // ── Step 1: Transcribe ──
        setVoicePhase("transcribing");
        let transcript = "";
        try {
          const ext = actualMime.includes("mp4") ? "m4a" : "webm";
          const form = new FormData();
          form.append("audio", blob, `recording.${ext}`);
          const res = await fetch("/api/transcribe", { method: "POST", body: form });
          const data = await res.json();
          if (data.transcript) {
            transcript = data.transcript;
            setSlots((prev) => prev.map((s, j) =>
              j === slotIndex ? { ...s, transcript, committed: false } : s
            ));
          } else {
            setVoiceError("Couldn't transcribe — please try again.");
            setVoicePhase("idle");
            return;
          }
        } catch {
          setVoiceError("Transcription failed — please try again.");
          setVoicePhase("idle");
          return;
        }

        // ── Step 2: Auto-interpret ──
        setVoicePhase("interpreting");
        setSlots((prev) => prev.map((s, j) =>
          j === slotIndex ? { ...s, interpreting: true } : s
        ));
        try {
          const res = await fetch("/api/interpret-genre", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              question: SLOTS[slotIndex].question,
              description: transcript,
            }),
          });
          const data = await res.json();
          const style = data.style || data.genre;
          const artists: string[] = Array.isArray(data.artists) ? data.artists : [];
          if (style) {
            setSlots((prev) => prev.map((s, j) =>
              j === slotIndex ? {
                ...s,
                style: toSentenceCase(style),
                interpreting: false,
                committed: false,
                suggestedArtists: artists,
                selectedArtists: [],
              } : s
            ));
          } else {
            setSlots((prev) => prev.map((s, j) =>
              j === slotIndex ? { ...s, interpreting: false } : s
            ));
            setInterpretError("Couldn't interpret — please try speaking with more detail.");
          }
        } catch {
          setSlots((prev) => prev.map((s, j) =>
            j === slotIndex ? { ...s, interpreting: false } : s
          ));
          setInterpretError("Interpretation failed — please try again.");
        } finally {
          setVoicePhase("idle");
        }
      };

      recorder.start(250);
      startAudioVisualization(stream);
      setVoicePhase("recording");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setVoiceError(/denied|permission/i.test(msg)
        ? "Microphone access denied — please allow it in your browser settings."
        : "Could not start recording — please try again.");
      setVoicePhase("idle");
    }
  }, [cleanupWebAudio, startAudioVisualization]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleVoiceTap = () => {
    if (voicePhase === "recording") {
      stopVoiceRecording();
      setVoicePhase("transcribing");
    } else if (voicePhase === "idle") {
      startVoiceRecording(currentSlot);
    }
  };

  // ─── Refine with artists ─────────────────────────────────────────────────────

  const refineWithArtists = async (i: number) => {
    const s = slots[i];
    if (!s.selectedArtists.length && !s.transcript.trim()) return;
    setInterpretError("");
    updateSlot(i, { interpreting: true });
    try {
      const res = await fetch("/api/interpret-genre", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: SLOTS[i].question,
          selectedArtists: s.selectedArtists.length > 0 ? s.selectedArtists : undefined,
          description: s.transcript || undefined,
        }),
      });
      const data = await res.json();
      const style = data.style || data.genre;
      const artists: string[] = Array.isArray(data.artists) ? data.artists : [];
      if (style) {
        updateSlot(i, {
          style: toSentenceCase(style),
          interpreting: false,
          committed: false,
          suggestedArtists: artists,
          selectedArtists: [],
        });
      } else {
        updateSlot(i, { interpreting: false });
        setInterpretError("Couldn't refine — please try again.");
      }
    } catch {
      updateSlot(i, { interpreting: false });
      setInterpretError("Refinement failed — please try again.");
    }
  };

  // ─── Commit (save to backend) ─────────────────────────────────────────────────

  const commitSlot = async (i: number) => {
    const s = slots[i];
    if (!s.style.trim()) return;
    setSaveError("");
    setSaving(true);
    try {
      // Only include artists the user explicitly selected — never auto-add suggestions.
      const sunoStyle = s.selectedArtists.length > 0
        ? `${s.style.trim()}, ${s.selectedArtists.join(", ")}`
        : s.style.trim();
      const styles = slots.map((sl, j) => j === i ? sunoStyle : sl.style.trim());
      const res = await fetch("/api/genres", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ genres: styles }),
      });
      if (!res.ok) throw new Error();
      updateSlot(i, { committed: true });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch {
      setSaveError("Could not save — please try again.");
    } finally {
      setSaving(false);
    }
  };

  // ─── Navigation ──────────────────────────────────────────────────────────────

  const SLOT_FADE = 160;

  const goToSlot = useCallback((index: number) => {
    if (index === currentSlot) return;
    setSaveError("");
    setCurrentSlot(index);
    setSlotGeneration((g) => g + 1);
  }, [currentSlot]);

  const goBack = () => {
    setSaveError("");
    if (currentSlot > 0) goToSlot(currentSlot - 1);
    else transitionTo("/", router);
  };

  const goNext = () => {
    goToSlot(currentSlot + 1);
  };

  const onSwipeLeft = useCallback(() => {
    if (currentSlot < SLOTS.length - 1) goToSlot(currentSlot + 1);
  }, [currentSlot, goToSlot]);
  const onSwipeRight = useCallback(() => {
    if (currentSlot > 0) goToSlot(currentSlot - 1);
    else transitionTo("/", router);
  }, [currentSlot, goToSlot, router]);
  useSwipeNavigation(onSwipeLeft, onSwipeRight);

  const slot = SLOTS[currentSlot];
  const s = slots[currentSlot];
  const isLastSlot = currentSlot === 3;
  const hasStyle = s.style.trim().length > 0;
  const isBusy = voicePhase !== "idle" || s.interpreting;

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0d1628] flex items-center justify-center">
        <div className="w-7 h-7 rounded-full border-2 border-white/15 border-t-white/55 animate-spin" />
      </main>
    );
  }

  return (
    <main className="relative z-10 h-screen flex flex-col px-6 pt-safe overflow-hidden" style={{ animation: "page-enter 380ms ease forwards" }}>

      {/* Swipe edge indicators */}
      {currentSlot > 0 && (
        <div className="fixed left-0 top-1/2 -translate-y-1/2 pointer-events-none" style={{ zIndex: 20 }}>
          <div style={{ background: "linear-gradient(to right, rgba(13,22,40,0.55) 0%, transparent 100%)", padding: "28px 20px 28px 8px" }}>
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "1.4rem" }}>‹</span>
          </div>
        </div>
      )}
      {currentSlot < SLOTS.length - 1 && (
        <div className="fixed right-0 top-1/2 -translate-y-1/2 pointer-events-none" style={{ zIndex: 20 }}>
          <div style={{ background: "linear-gradient(to left, rgba(13,22,40,0.55) 0%, transparent 100%)", padding: "28px 8px 28px 20px" }}>
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "1.4rem" }}>›</span>
          </div>
        </div>
      )}

      {/* Header */}
      <AppHeader title="RTHMIC Styles" onBack={goBack} />

      {/* Progress dots */}
      <div className="flex items-center gap-2 mb-8">
        {SLOTS.map((_, i) => (
          <button
            key={i}
            onClick={() => goToSlot(i)}
            className="touch-manipulation"
            aria-label={`Go to style ${i + 1}`}
          >
            <div
              className="rounded-full transition-all duration-200"
              style={{
                width: i === currentSlot ? 20 : 6,
                height: 6,
                background: i === currentSlot
                  ? "rgba(201,165,90,0.9)"
                  : slots[i].committed
                  ? "rgba(201,165,90,0.45)"
                  : slots[i].style
                  ? "rgba(255,255,255,0.18)"
                  : "rgba(255,255,255,0.10)",
              }}
            />
          </button>
        ))}
        <span className="text-[10px] text-white/50 uppercase tracking-widest ml-auto">
          {currentSlot + 1} of 4
        </span>
      </div>

      {/* Scrollable content — key forces remount so panel-enter animation fires */}
      <div
        key={slotGeneration}
        className="flex-1 flex flex-col gap-6 overflow-y-auto pb-4"
        style={{ animation: "panel-enter 220ms ease both" }}
      >

        {/* Slot label */}
        <span
          className="self-start text-[10px] px-2.5 py-0.5 rounded-full border uppercase tracking-widest font-medium"
          style={{
            background: "rgba(201,165,90,0.08)",
            color: "rgba(201,165,90,0.55)",
            borderColor: "rgba(201,165,90,0.2)",
          }}
        >
          {slot.label}
        </span>

        {/* Question + hint */}
        <div>
          <h2
            className="text-2xl font-light text-white leading-snug"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {slot.question}
          </h2>
          <p className="text-sm text-white/45 mt-2 leading-relaxed">{slot.hint}</p>
        </div>

        {/* ── PRIMARY: Voice input ── */}
        <div
          className="rounded-2xl border overflow-hidden"
          style={
            voicePhase === "recording"
              ? { borderColor: "rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.04)" }
              : voicePhase === "transcribing" || voicePhase === "interpreting"
              ? { borderColor: "rgba(201,165,90,0.25)", background: "rgba(201,165,90,0.03)" }
              : { borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }
          }
        >
          <button
            onClick={handleVoiceTap}
            disabled={voicePhase === "transcribing" || voicePhase === "interpreting"}
            className="w-full flex items-center gap-5 px-5 py-5 touch-manipulation active:scale-[0.99] transition-transform disabled:opacity-70"
          >
            {/* Mic button with audio visualization */}
            <div
              ref={micBtnRef}
              className="flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center border"
              style={
                voicePhase === "recording"
                  ? {
                      background: "rgba(239,68,68,0.2)",
                      borderColor: "rgba(239,68,68,0.6)",
                      willChange: "transform, box-shadow",
                      transition: "none",
                    }
                  : voicePhase === "transcribing" || voicePhase === "interpreting"
                  ? { background: "rgba(201,165,90,0.1)", borderColor: "rgba(201,165,90,0.3)", transition: "all 0.2s" }
                  : { background: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.14)", transition: "all 0.2s" }
              }
            >
              {voicePhase === "transcribing" || voicePhase === "interpreting" ? (
                <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
              ) : voicePhase === "recording" ? (
                <div className="w-4 h-4 rounded bg-red-400/90" />
              ) : (
                <MicIcon />
              )}
            </div>

            <div className="flex-1 text-left">
              {voicePhase === "recording" && (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                    <p className="text-base text-white/80 font-medium">Listening…</p>
                  </div>
                  <p className="text-xs text-white/45">Tap to stop</p>
                </>
              )}
              {voicePhase === "transcribing" && (
                <p className="text-base text-white/50">Transcribing…</p>
              )}
              {voicePhase === "interpreting" && (
                <p className="text-base text-white/50">Interpreting your style…</p>
              )}
              {voicePhase === "idle" && (
                <>
                  <p className="text-base font-medium" style={{ color: s.transcript ? "rgba(255,255,255,0.75)" : "#c9a55a" }}>
                    {s.transcript ? "Tap to re-record" : "Your Rthm style – tap to speak"}
                  </p>
                  <p className="text-xs text-white/50 mt-0.5">
                    {s.transcript ? "Your words will be replaced" : "Describe the feel, energy, what it does to you"}
                  </p>
                </>
              )}
            </div>
          </button>

          {/* Transcript preview */}
          {s.transcript && voicePhase === "idle" && (
            <div className="px-5 pb-4 border-t border-white/[0.05] pt-3">
              <p className="text-[10px] text-white/45 uppercase tracking-widest mb-1.5">What you said</p>
              <p className="text-sm text-white/50 leading-relaxed italic">&ldquo;{s.transcript}&rdquo;</p>
            </div>
          )}
        </div>

        {voiceError && (
          <p className="text-xs text-red-400/60 -mt-3 leading-relaxed">{voiceError}</p>
        )}

        {/* ── RESULT: Interpreted Rthm style ── */}
        {hasStyle && !isBusy && (
          <div
            className="rounded-2xl border px-5 py-5"
            style={{ borderColor: "rgba(201,165,90,0.2)", background: "rgba(201,165,90,0.04)" }}
          >
            <p className="text-[10px] text-white/50 uppercase tracking-widest mb-2">
              Your Current Rthm Style
            </p>
            <textarea
              value={s.style}
              onChange={(e) => updateSlot(currentSlot, { style: e.target.value, committed: false })}
              rows={3}
              className="w-full bg-transparent text-base font-light leading-relaxed outline-none resize-none"
              style={{ color: "#c9a55a", fontFamily: "var(--font-display)" }}
              placeholder="Style description"
            />
            <p className="text-[10px] text-white/45 mt-1 leading-relaxed">
              Adjust or redefine · this is what feeds the music engine
            </p>
          </div>
        )}

        {/* ── ADVANCED: Dynamic artist chips ── */}
        {hasStyle && !isBusy && s.suggestedArtists.length > 0 && (
          <div>
            <button
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-2 text-[10px] text-white/45 uppercase tracking-widest touch-manipulation hover:text-white/60 transition-colors"
            >
              <span>{showAdvanced ? "▾" : "▸"}</span>
              <span>Refine with artists</span>
            </button>

            {showAdvanced && (
              <div className="mt-3">
                <p className="text-xs text-white/50 mb-3 leading-relaxed">
                  These artists match your style. Select any, then tap &ldquo;Refine&rdquo; below to sharpen the result.
                </p>
                <div className="flex flex-wrap gap-2">
                  {s.suggestedArtists.map((artist) => {
                    const isSelected = s.selectedArtists.includes(artist);
                    return (
                      <button
                        key={artist}
                        onClick={() => toggleArtist(currentSlot, artist)}
                        className="text-[11px] rounded-full px-3 py-1.5 border transition-all duration-150 touch-manipulation active:scale-95"
                        style={
                          isSelected
                            ? { color: "#c9a55a", background: "rgba(201,165,90,0.12)", borderColor: "rgba(201,165,90,0.45)" }
                            : { color: "rgba(255,255,255,0.35)", background: "transparent", borderColor: "rgba(255,255,255,0.08)" }
                        }
                      >
                        {isSelected && <span className="mr-1 text-[10px]">✓</span>}
                        {artist}
                      </button>
                    );
                  })}
                </div>
                {s.selectedArtists.length > 0 && (
                  <button
                    onClick={() => updateSlot(currentSlot, { selectedArtists: [] })}
                    className="mt-2 text-[10px] text-white/45 hover:text-white/60 transition-colors touch-manipulation"
                  >
                    Clear selection
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {interpretError && !isBusy && (
          <p className="text-xs text-red-400/60 leading-relaxed">{interpretError}</p>
        )}

        {/* ── Primary action: Refine or Commit ── */}
        {hasStyle && !isBusy && (
          <button
            onClick={() => {
              if (s.selectedArtists.length > 0) {
                refineWithArtists(currentSlot);
              } else {
                commitSlot(currentSlot);
              }
            }}
            disabled={saving || (s.selectedArtists.length === 0 && s.committed)}
            className="w-full py-4 rounded-2xl text-sm font-semibold tracking-wide transition-all touch-manipulation active:scale-[0.98] disabled:opacity-50"
            style={
              s.selectedArtists.length > 0
                ? { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.6)" }
                : s.committed
                ? { background: "rgba(138,223,154,0.08)", border: "1px solid rgba(138,223,154,0.3)", color: "rgba(138,223,154,0.8)" }
                : { background: "rgba(201,165,90,0.12)", border: "1px solid rgba(201,165,90,0.5)", color: "#c9a55a" }
            }
          >
            {saving
              ? "Saving…"
              : s.selectedArtists.length > 0
              ? "Refine with selected artists →"
              : s.committed
              ? "✓ Rthm Style committed"
              : "Commit Rthm Style"}
          </button>
        )}

        {saveError && (
          <p className="text-xs text-red-400/60 text-center">{saveError}</p>
        )}
        {saveSuccess && (
          <p className="text-xs text-center" style={{ color: "rgba(138,223,154,0.7)" }}>Rthm Style saved ✓</p>
        )}

        {/* Pro plan messaging on last page */}
        {isLastSlot && (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-4 flex items-center gap-3">
            <span style={{ color: "rgba(201,165,90,0.4)", fontSize: 16 }}>✦</span>
            <div>
              <p className="text-sm font-medium" style={{ color: "rgba(201,165,90,0.6)" }}>
                You&apos;re on the Pro plan
              </p>
              <p className="text-xs text-white/50 mt-0.5">Unlimited Rthm Styles — create as many as you need</p>
            </div>
          </div>
        )}

      </div>

      {/* Bottom navigation */}
      <div className="flex gap-3 pb-8 pt-4 border-t border-white/[0.05] flex-shrink-0">
        {isLastSlot ? (
          <button
            onClick={() => transitionTo("/", router)}
            className="flex-1 py-4 rounded-2xl text-sm font-semibold tracking-wide active:scale-[0.98] transition-all touch-manipulation"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.5)",
            }}
          >
            Done — back to home
          </button>
        ) : (
          <button
            onClick={goNext}
            className="flex-1 py-4 rounded-2xl text-sm font-semibold tracking-wide active:scale-[0.98] transition-all touch-manipulation"
            style={{
              background: s.committed ? "rgba(201,165,90,0.1)" : "rgba(255,255,255,0.04)",
              border: s.committed ? "1px solid rgba(201,165,90,0.45)" : "1px solid rgba(255,255,255,0.08)",
              color: s.committed ? "#c9a55a" : "rgba(255,255,255,0.5)",
            }}
          >
            Next — {SLOTS[currentSlot + 1].label} →
          </button>
        )}
      </div>

    </main>
  );
}

function MicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ color: "rgba(255,255,255,0.45)" }}>
      <rect x="9" y="2" width="6" height="11" rx="3" fill="currentColor" />
      <path d="M5 11a7 7 0 0 0 14 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="12" y1="18" x2="12" y2="22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="9" y1="22" x2="15" y2="22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
