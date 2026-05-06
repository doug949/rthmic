"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { useAudio } from "@/app/contexts/AudioContext";
import { useGeneration } from "@/app/contexts/GenerationContext";
import type { PillarType, StateSummary, Song, SongStatus, SongStatusMap } from "@/app/types/pipeline";
import type { StyleChoice } from "@/app/services/llmService";
import CustomStyleInput from "@/app/components/CustomStyleInput";

type Phase = "module" | "priming" | "idle" | "recording" | "understanding" | "confirming" | "genre";

interface PillarDefinition {
  slug: string;
  label: string;
  tagline: string;       // one-line shown on the tile
  detail: string;        // fuller "what this is" shown in Learn More
  guidance: string;      // how to speak, shown in priming
}

interface UnderstandResult {
  transcript: string;
  pillar: PillarType;
  stateSummary: StateSummary;
  title: string;
  lyrics: string;
  style: StyleChoice;
}

export default function SpeakPage() {
  const [phase, setPhase] = useState<Phase>("module");
  const [selectedPillar, setSelectedPillar] = useState<string | null>(null);
  const [understandResult, setUnderstandResult] = useState<UnderstandResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [songStatus, setSongStatus] = useState<SongStatusMap>({});

  const {
    genPhase,
    genSongs,
    genPillar,
    genLyrics,
    genError,
    startGeneration,
    clearGeneration,
  } = useGeneration();

  const allTranscriptsRef = useRef<string[]>([]);
  const [wasAutoStopped, setWasAutoStopped] = useState(false);

  // MediaRecorder
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("");
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Recording timer
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const MAX_RECORDING_SECONDS = 300;

  // Web Audio API — orb animation
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number>(0);
  const orbRef = useRef<HTMLDivElement>(null);

  // Song playback
  const audioElRef = useRef<HTMLAudioElement>(null);
  const [realPlayingId, setRealPlayingId] = useState<string | null>(null);
  const [realIsPlaying, setRealIsPlaying] = useState(false);
  const [realCurrentTime, setRealCurrentTime] = useState(0);
  const [realDuration, setRealDuration] = useState(0);

  const { handlePlay: handleMockPlay, currentTrackId, isPlaying: mockIsPlaying, loadingId } = useAudio();

  const setStatus = (id: string, status: SongStatus) => {
    setSongStatus((prev) => ({ ...prev, [id]: status }));

    // Sync to server library
    if (status === "archived") {
      fetch("/api/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id, status: "archived" }),
      }).catch(console.error);
    } else if (status === null) {
      // Restoring from archived → mark active
      fetch("/api/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id, status: "active" }),
      }).catch(console.error);
    } else if (status === "deleted") {
      fetch("/api/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", id }),
      }).catch(console.error);
    }
  };

  // ─── Web Audio cleanup ────────────────────────────────────────────────────

  const cleanupWebAudio = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    analyserRef.current = null;
    try { audioCtxRef.current?.close(); } catch { /* ignore */ }
    audioCtxRef.current = null;
  }, []);

  // ─── Orb animation ────────────────────────────────────────────────────────

  const startOrbAnimation = useCallback((stream: MediaStream) => {
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

        const scale = 1 + norm * 0.5;
        const glow = norm * 45;
        const glowAlpha = (0.08 + norm * 0.35).toFixed(3);
        const bgAlpha = (0.08 + norm * 0.18).toFixed(3);

        const el = orbRef.current;
        if (el) {
          el.style.transform = `scale(${scale.toFixed(3)})`;
          el.style.boxShadow = `0 0 ${glow.toFixed(1)}px ${(glow * 0.4).toFixed(1)}px rgba(201,165,90,${glowAlpha})`;
          el.style.backgroundColor = `rgba(201,165,90,${bgAlpha})`;
        }

        animFrameRef.current = requestAnimationFrame(tick);
      };

      animFrameRef.current = requestAnimationFrame(tick);
    } catch (e) {
      console.warn("Web Audio API unavailable:", e);
    }
  }, []);

  // ─── Recording ────────────────────────────────────────────────────────────

  const clearRecordingTimers = useCallback(() => {
    if (autoStopTimerRef.current) { clearTimeout(autoStopTimerRef.current); autoStopTimerRef.current = null; }
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
    setRecordingSeconds(0);
  }, []);

  const startRecording = useCallback(async () => {
    setErrorMsg("");
    setWasAutoStopped(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // iOS-safe MediaRecorder creation.
      // Use a low bitrate (32 kbps) so a 5-min recording stays well under 1.5 MB,
      // avoiding Vercel's 4.5 MB body limit and iOS fetch quirks with large blobs.
      let recorder: MediaRecorder | null = null;
      let chosenMime = "";
      const LOW_BITRATE = 32768; // 32 kbps — clear for voice, small files
      const typesToTry = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

      for (const type of typesToTry) {
        if (!MediaRecorder.isTypeSupported(type)) continue;
        try {
          recorder = new MediaRecorder(stream, { mimeType: type, audioBitsPerSecond: LOW_BITRATE });
          chosenMime = type;
          break;
        } catch {
          // Some browsers claim support but reject certain option combos — try without bitrate
          try {
            recorder = new MediaRecorder(stream, { mimeType: type });
            chosenMime = type;
            break;
          } catch { continue; }
        }
      }
      if (!recorder) {
        // Browser default (iOS picks audio/mp4 with AAC)
        try {
          recorder = new MediaRecorder(stream, { audioBitsPerSecond: LOW_BITRATE });
        } catch {
          try {
            recorder = new MediaRecorder(stream);
          } catch {
            throw new Error("Recording not supported on this device");
          }
        }
        chosenMime = recorder.mimeType || "audio/mp4";
      }

      mimeTypeRef.current = chosenMime;
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        clearRecordingTimers();
        stream.getTracks().forEach((t) => t.stop());
        cleanupWebAudio();

        // Use the recorder's actual mimeType at stop-time in case iOS updated it after start()
        const actualMime = (mediaRecorderRef.current?.mimeType || mimeTypeRef.current || "audio/mp4").trim() || "audio/mp4";
        const blob = new Blob(chunksRef.current, { type: actualMime });

        if (blob.size === 0) {
          setErrorMsg("No audio captured — please try again.");
          setPhase("idle");
          return;
        }

        // Safety net: if the blob is somehow still too large, warn the user
        const MAX_SAFE_BYTES = 8 * 1024 * 1024; // 8 MB
        if (blob.size > MAX_SAFE_BYTES) {
          setErrorMsg("Your recording is too large to process. Please keep it under 4 minutes and try again.");
          setPhase("idle");
          return;
        }

        await runUnderstand(blob, actualMime);
      };

      stream.getTracks().forEach((track) => {
        track.onended = () => {
          if (mediaRecorderRef.current?.state === "recording") {
            mediaRecorderRef.current.stop();
          }
        };
      });

      recorder.start(250); // timeslice required for iOS
      startOrbAnimation(stream);
      setPhase("recording");
      setRecordingSeconds(0);

      // Tick the recording timer every second
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);

      // Auto-stop at MAX_RECORDING_SECONDS and flag as interrupted
      autoStopTimerRef.current = setTimeout(() => {
        setWasAutoStopped(true);
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
        }
        setPhase("understanding");
      }, MAX_RECORDING_SECONDS * 1000);

    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const friendly = /not supported|not allowed|denied|permission/i.test(raw)
        ? "Microphone access denied — please allow microphone access and try again."
        : raw || "Could not start recording — please try again.";
      setErrorMsg(friendly);
      setPhase("idle");
    }
  }, [cleanupWebAudio, startOrbAnimation, clearRecordingTimers]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopRecording = useCallback(() => {
    clearRecordingTimers();
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setPhase("understanding");
  }, [clearRecordingTimers]);

  // ─── Understand step ──────────────────────────────────────────────────────

  const runUnderstand = async (audio: Blob, mimeOverride?: string) => {
    setPhase("understanding");
    setErrorMsg("");
    try {
      const mime = mimeOverride || mimeTypeRef.current || "audio/mp4";
      const ext = mime.includes("mp4") ? "mp4" : "webm";
      const form = new FormData();
      form.append("audio", audio, `recording.${ext}`);

      if (allTranscriptsRef.current.length > 0) {
        form.append("previousContext", allTranscriptsRef.current.join(" "));
      }

      if (selectedPillar) {
        form.append("pillar", selectedPillar);
      }

      const res = await fetch("/api/understand", { method: "POST", body: form });
      if (!res.ok) {
        let errMsg = "Understanding failed";
        try { const err = await res.json(); errMsg = err.error || errMsg; } catch { /* non-JSON body */ }
        if (res.status === 413) errMsg = "Your recording is too large to process. Please keep it under 3 minutes and try again.";
        throw new Error(errMsg);
      }

      const data: UnderstandResult = await res.json();
      allTranscriptsRef.current.push(data.transcript);
      setUnderstandResult(data);
      setPhase("confirming");
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      // Replace raw WebKit / browser errors with friendly messages
      const friendly = /string did not match|expected pattern/i.test(raw)
        ? "Something went wrong sending your recording. Try again — if it keeps happening, keep it under 3 minutes."
        : raw || "Something went wrong";
      setErrorMsg(friendly);
      setPhase("idle");
    }
  };

  // ─── Generate step ────────────────────────────────────────────────────────

  const runGenerate = (genre = "Indie Electronic") => {
    if (!understandResult) return;
    setErrorMsg("");
    startGeneration({
      lyrics: understandResult.lyrics,
      style: understandResult.style,
      title: understandResult.title,
      pillar: understandResult.pillar,
      genre,
    });
  };

  // ─── Add more ─────────────────────────────────────────────────────────────

  const addMore = useCallback(() => {
    startRecording();
  }, [startRecording]);

  // ─── Song playback ────────────────────────────────────────────────────────

  const togglePlay = useCallback((song: Song) => {
    if (song.audioUrl) {
      const el = audioElRef.current;
      if (!el) return;

      if (realPlayingId === song.id) {
        if (realIsPlaying) {
          el.pause();
          setRealIsPlaying(false);
        } else {
          el.play().catch(console.error);
          setRealIsPlaying(true);
        }
        return;
      }

      el.pause();
      el.src = song.audioUrl;
      setRealPlayingId(song.id); // set ID first so player opens immediately
      setRealIsPlaying(false);   // wait for play() to confirm
      el.play()
        .then(() => setRealIsPlaying(true))
        .catch((err) => {
          console.warn("Play failed:", err.message);
          setRealIsPlaying(false);
        });
      return;
    }
    if (song.trackId && song.trackAudioKey) {
      handleMockPlay(song.trackId, song.trackAudioKey);
    }
  }, [realPlayingId, realIsPlaying, handleMockPlay]);

  const isSongPlaying = (song: Song): boolean => {
    if (song.audioUrl) return realPlayingId === song.id && realIsPlaying;
    if (song.trackId) return currentTrackId === song.trackId && mockIsPlaying;
    return false;
  };

  const isSongLoading = (song: Song): boolean => {
    if (song.trackId) return loadingId === song.trackId;
    return false;
  };

  // ─── Recreate in another genre ───────────────────────────────────────────

  const handleRecreateGenre = useCallback(() => {
    clearGeneration(); // returns genPhase → "idle", keeps understandResult in local state
    setPhase("genre");
  }, [clearGeneration]);

  // ─── Reset ────────────────────────────────────────────────────────────────

  const reset = () => {
    clearRecordingTimers();
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.src = "";
    }
    clearGeneration();
    setPhase("module");
    setSelectedPillar(null);
    setUnderstandResult(null);
    setErrorMsg("");
    setWasAutoStopped(false);
    setSongStatus({});
    setRealPlayingId(null);
    setRealIsPlaying(false);
    allTranscriptsRef.current = [];
  };

  // Always start fresh when entering the Speak page — context persists across navigation
  useEffect(() => {
    clearGeneration();
    setPhase("module");
    setSelectedPillar(null);
    setUnderstandResult(null);
    setErrorMsg("");
    setSongStatus({});
    allTranscriptsRef.current = [];
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      clearRecordingTimers();
      cleanupWebAudio();
      audioElRef.current?.pause();
    };
  }, [cleanupWebAudio, clearRecordingTimers]);

  const visibleSongs = genSongs.filter((s) => songStatus[s.id] !== "deleted");

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-[#0d1628] flex flex-col px-6 pt-safe">
      <audio
        ref={audioElRef}
        onEnded={() => { setRealIsPlaying(false); setRealCurrentTime(0); }}
        onError={() => setRealIsPlaying(false)}
        onTimeUpdate={(e) => setRealCurrentTime(e.currentTarget.currentTime)}
        onDurationChange={(e) => setRealDuration(isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
        onLoadedMetadata={(e) => setRealDuration(isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
        preload="metadata"
      />

      <header className="flex items-center gap-4 pt-12 pb-8">
        <Link
          href="/"
          className="text-white/30 hover:text-white/60 transition-colors text-sm tracking-widest uppercase"
        >
          ← Back
        </Link>
        <span className="text-white/15 text-sm uppercase tracking-widest ml-auto">Speak</span>
      </header>

      {/* Generation-context phases take priority */}
      {genPhase === "generating" && (
        <GeneratingView onCancel={reset} />
      )}

      {genPhase === "ready" && (
        <ResultsView
          songs={visibleSongs}
          songStatus={songStatus}
          setStatus={setStatus}
          onReset={reset}
          onTogglePlay={togglePlay}
          isSongPlaying={isSongPlaying}
          isSongLoading={isSongLoading}
          pillar={genPillar ?? undefined}
          lyrics={genLyrics}
          debugMsg={errorMsg}
          audioEl={audioElRef}
          playingId={realPlayingId}
          currentTime={realCurrentTime}
          duration={realDuration}
          onRecreateGenre={understandResult ? handleRecreateGenre : undefined}
        />
      )}

      {/* Failed: allow retry if we still have the understand result */}
      {genPhase === "failed" && understandResult && (
        <ConfirmingView
          result={understandResult}
          onAddMore={addMore}
          onProceed={runGenerate}
          onDiscard={reset}
          errorMsg={genError}
        />
      )}

      {/* Local phases — only shown when no active generation */}
      {genPhase === "idle" && (
        <>
          {phase === "module" && (
            <PillarView
              onSelect={(slug) => {
                setSelectedPillar(slug);
                setPhase("priming");
              }}
            />
          )}
          {phase === "priming" && (
            <PrimingView pillar={selectedPillar} onReady={() => setPhase("idle")} />
          )}
          {phase === "idle" && (
            <IdleView onRecord={startRecording} errorMsg={errorMsg} />
          )}
          {phase === "recording" && (
            <RecordingView orbRef={orbRef} onStop={stopRecording} seconds={recordingSeconds} maxSeconds={MAX_RECORDING_SECONDS} />
          )}
          {phase === "understanding" && <UnderstandingView />}
          {phase === "confirming" && understandResult && (
            <ConfirmingView
              result={understandResult}
              onAddMore={addMore}
              onProceed={() => setPhase("genre")}
              onDiscard={reset}
              errorMsg={errorMsg}
              wasAutoStopped={wasAutoStopped}
            />
          )}
          {phase === "genre" && understandResult && (
            <GenreView
              understandResult={understandResult}
              onGenerate={runGenerate}
              onDiscard={reset}
            />
          )}
        </>
      )}
    </main>
  );
}

// ─── Pillar selection ─────────────────────────────────────────────────────────

const PILLARS: PillarDefinition[] = [
  {
    slug: "memory",
    label: "Memory",
    tagline: "Imprint through association",
    detail: "Use this when you need to memorise something — a speech, a script, a sequence, a list of names, or any content you need to recall under real conditions. Rthmic encodes the information into a song using linked images, scenes, and sensory anchors so retrieval feels natural rather than effortful.",
    guidance: "Describe what you're trying to remember and where it's slipping. Name the specific items if you can — the more concrete, the better the Rthm.",
  },
  {
    slug: "menus",
    label: "Menus",
    tagline: "Ambient selection of actions",
    detail: "Use this when you have a list of tasks and need to move through them without pressure. Rthmic turns your to-do list into a gentle, ambient field of options — no obligation, no fixed order. You hear the possibilities and choose what calls to you. Works for morning routines, afternoon catch-ups, and winding down at night.",
    guidance: "Tell Rthmic your list of tasks or actions — as many as you like. Describe what you need to get through today, this morning, or tonight.",
  },
  {
    slug: "mindset",
    label: "Mindset",
    tagline: "Preparation before events",
    detail: "Use this before something important — a presentation, a difficult conversation, a performance, a meeting, or any moment that requires you to show up at your best. Rthmic builds a calm upward trajectory that moves you from unsettled to ready, grounded rather than hyped.",
    guidance: "Describe what's coming and how you're feeling about it. Be specific about the moment you're preparing for — the more detail, the better.",
  },
  {
    slug: "mode",
    label: "Mode",
    tagline: "In-the-moment rescue",
    detail: "Use this when you're already inside a difficult state — overwhelm, freeze, anxiety, spiral, anger, or shutdown. Rthmic interrupts the pattern quickly, acknowledges exactly where you are, and guides you back to steady ground. It doesn't argue with how you feel. It meets you there.",
    guidance: "Describe exactly what you're feeling right now. Don't soften it — the more honestly you name the state, the better the song can meet you there.",
  },
  {
    slug: "movement",
    label: "Movement",
    tagline: "Cut-through via rhythmic repetition",
    detail: "Use this when you're stuck — not in emotional crisis, but in friction. The work isn't moving. You keep not starting, or you start and stall. Rthmic uses a steady rhythmic loop to carry you through the resistance. The groove does the work that willpower can't.",
    guidance: "Describe what you're trying to do and what's blocking you. Name the specific task or work — what keeps not starting, or where you keep stalling.",
  },
  {
    slug: "understanding",
    label: "Understanding",
    tagline: "Onramps to clarity",
    detail: "Use this when you're trying to grasp something — a concept, a system, a skill, an idea — and it keeps slipping. Rthmic builds a simple mental model in song form, breaking the concept into its key parts with concrete examples. By the end you should be able to explain it simply.",
    guidance: "Describe the thing you're trying to understand. Tell Rthmic where it gets confusing or what feels just out of reach.",
  },
];

function PillarView({ onSelect }: { onSelect: (slug: string) => void }) {
  const [openInfo, setOpenInfo] = useState<string | null>(null);

  return (
    <section className="flex-1 flex flex-col pb-6 overflow-y-auto">
      <div className="flex flex-col gap-1.5 pt-2 pb-5">
        <p className="text-[10px] text-white/25 uppercase tracking-[0.3em]">Select a Pillar</p>
        <p className="text-xl font-light text-white/70 leading-snug" style={{ fontFamily: "var(--font-display)" }}>
          What do you want to work on?
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {PILLARS.map((p) => {
          const isOpen = openInfo === p.slug;
          return (
            <div
              key={p.slug}
              className="rounded-2xl border border-white/[0.08] bg-white/[0.03] overflow-hidden"
            >
              {/* Main row — split: left selects, right toggles info */}
              <div className="flex items-stretch">
                {/* Primary tap target — selects pillar */}
                <button
                  onClick={() => onSelect(p.slug)}
                  className="flex-1 flex items-center gap-3 pl-5 pr-3 py-4 text-left touch-manipulation active:bg-white/[0.05] transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-white/80 tracking-wide">{p.label}</p>
                    <p className="text-xs text-white/35 mt-0.5">{p.tagline}</p>
                  </div>
                </button>

                {/* Divider */}
                <div className="w-px self-stretch my-3 bg-white/[0.06]" />

                {/* Info toggle — does NOT select */}
                <button
                  onClick={() => setOpenInfo(isOpen ? null : p.slug)}
                  className="flex items-center justify-center w-14 touch-manipulation active:bg-white/[0.04] transition-colors"
                  aria-label={isOpen ? "Close info" : "Learn more"}
                >
                  <span
                    className="text-xs font-medium transition-colors"
                    style={{ color: isOpen ? "rgba(201,165,90,0.7)" : "rgba(255,255,255,0.2)" }}
                  >
                    {isOpen ? "✕" : "?"}
                  </span>
                </button>
              </div>

              {/* Learn More panel */}
              {isOpen && (
                <div className="border-t border-white/[0.06] px-5 pt-4 pb-5 flex flex-col gap-4">
                  <p className="text-sm text-white/50 leading-relaxed">{p.detail}</p>

                  <div
                    className="rounded-lg px-3.5 py-3"
                    style={{ background: "rgba(201,165,90,0.06)", border: "1px solid rgba(201,165,90,0.12)" }}
                  >
                    <p className="text-[10px] text-white/30 uppercase tracking-[0.2em] mb-1">How to speak</p>
                    <p className="text-xs text-white/45 leading-relaxed">{p.guidance}</p>
                  </div>

                  <button
                    onClick={() => onSelect(p.slug)}
                    className="w-full py-3.5 rounded-xl text-sm font-semibold tracking-wide touch-manipulation active:scale-[0.98] transition-all"
                    style={{
                      background: "rgba(201,165,90,0.12)",
                      border: "1px solid rgba(201,165,90,0.35)",
                      color: "#c9a55a",
                    }}
                  >
                    Select {p.label} →
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── Priming ──────────────────────────────────────────────────────────────────

function PrimingView({ pillar, onReady }: { pillar: string | null; onReady: () => void }) {
  const pillarDef = PILLARS.find((p) => p.slug === pillar) ?? null;

  return (
    <section className="flex-1 flex flex-col justify-between pb-10">
      <div className="flex-1 flex flex-col justify-center gap-7 py-8 overflow-y-auto">

        {/* Pillar badge */}
        {pillarDef && (
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] px-2.5 py-1 rounded-full uppercase tracking-widest font-medium"
              style={{ background: "rgba(201,165,90,0.12)", color: "#c9a55a", border: "1px solid rgba(201,165,90,0.25)" }}
            >
              {pillarDef.label}
            </span>
          </div>
        )}

        <div className="flex flex-col gap-5">
          <p className="text-[10px] text-white/25 uppercase tracking-[0.3em]">Before you speak</p>

          <h2 className="text-2xl font-light text-white leading-snug" style={{ fontFamily: "var(--font-display)" }}>
            Be completely open.
          </h2>

          <p className="text-base text-white/40 leading-relaxed">
            No-one will ever hear this.
          </p>

          {/* Pillar-specific guidance */}
          {pillarDef && (
            <div
              className="rounded-xl px-4 py-3.5"
              style={{ background: "rgba(201,165,90,0.06)", border: "1px solid rgba(201,165,90,0.15)" }}
            >
              <p className="text-[10px] text-white/30 uppercase tracking-[0.2em] mb-1.5">How to speak</p>
              <p className="text-sm text-white/55 leading-relaxed">{pillarDef.guidance}</p>
            </div>
          )}

          <div className="h-px bg-white/[0.06]" />

          <div className="flex flex-col gap-4 text-sm text-white/40 leading-relaxed">
            <p>
              Take your time. Speak as you would to a friend, a therapist or a counsellor. You don&apos;t need to know what you&apos;re going to say to begin.
            </p>
            <p className="text-white/25">
              Specificity and openness are the key to an effective Rthm.
            </p>
            <p className="text-white/20 text-xs leading-relaxed border-t border-white/[0.06] pt-4">
              Most people speak for 1–3 minutes. Sometimes it takes longer. There is no need to rush. After 5 minutes Rthmic will capture what you&apos;ve said — you&apos;ll have the option to add more if it feels right.
            </p>
          </div>
        </div>
      </div>

      <button
        onClick={onReady}
        className="w-full py-5 rounded-2xl text-sm font-semibold tracking-wide active:scale-[0.98] transition-all touch-manipulation flex-shrink-0"
        style={{ background: "rgba(201,165,90,0.1)", border: "1px solid rgba(201,165,90,0.45)", color: "#c9a55a" }}
      >
        Talk to Rthmic
      </button>
    </section>
  );
}

// ─── Idle ─────────────────────────────────────────────────────────────────────

function IdleView({ onRecord, errorMsg }: { onRecord: () => void; errorMsg: string }) {
  return (
    <section className="flex-1 flex flex-col items-center justify-center pb-24 gap-10">
      <div className="text-center">
        <h2 className="text-2xl font-light tracking-wide text-white leading-snug" style={{ fontFamily: "var(--font-display)" }}>Speak your state</h2>
        <p className="text-sm text-white/35 mt-2">Two Rthms will be built for you.</p>
      </div>

      <button
        onClick={onRecord}
        className="w-28 h-28 rounded-full bg-white/[0.07] border border-white/[0.12] flex items-center justify-center active:scale-[0.96] transition-all touch-manipulation hover:bg-white/[0.12]"
        aria-label="Start recording"
      >
        <MicIcon />
      </button>

      {errorMsg && (
        <p className="text-xs text-white/35 text-center max-w-xs">{errorMsg}</p>
      )}
    </section>
  );
}

// ─── Recording ────────────────────────────────────────────────────────────────

function RecordingView({
  orbRef,
  onStop,
}: {
  orbRef: React.RefObject<HTMLDivElement | null>;
  onStop: () => void;
  seconds: number;
  maxSeconds: number;
}) {
  return (
    <section
      className="flex-1 flex flex-col items-center justify-center pb-24 gap-10"
      onClick={onStop}
    >
      <div className="text-center pointer-events-none">
        <h2 className="text-2xl font-light tracking-wide text-white" style={{ fontFamily: "var(--font-display)" }}>Speak your state</h2>
        <p className="text-sm text-white/35 mt-2">Tap to stop</p>
      </div>

      <div className="relative flex items-center justify-center pointer-events-none">
        <span
          className="absolute w-48 h-48 rounded-full animate-ping"
          style={{ animationDuration: "2.4s", border: "1px solid rgba(201,165,90,0.12)" }}
        />
        <span
          className="absolute w-38 h-38 rounded-full animate-ping"
          style={{ animationDuration: "2.4s", animationDelay: "0.6s", border: "1px solid rgba(201,165,90,0.18)" }}
        />
        <div
          ref={orbRef}
          className="w-28 h-28 rounded-full flex items-center justify-center"
          style={{
            backgroundColor: "rgba(201,165,90,0.08)",
            border: "1px solid rgba(201,165,90,0.3)",
            willChange: "transform, box-shadow, background-color",
            transition: "none",
          }}
        >
          <MicIcon active />
        </div>
      </div>
    </section>
  );
}

// ─── Understanding ────────────────────────────────────────────────────────────

function UnderstandingView() {
  return (
    <section className="flex-1 flex flex-col items-center justify-center pb-24 gap-8">
      <div className="text-center">
        <h2 className="text-xl font-light tracking-wide text-white" style={{ fontFamily: "var(--font-display)" }}>Understanding you</h2>
        <p className="text-sm text-white/30 mt-2">Reading your state…</p>
      </div>
      <div className="w-7 h-7 rounded-full border-2 border-white/15 border-t-white/55 animate-spin" />
    </section>
  );
}

// ─── Confirming ───────────────────────────────────────────────────────────────

function ConfirmingView({
  result,
  onAddMore,
  onProceed,
  onDiscard,
  errorMsg,
  wasAutoStopped,
}: {
  result: UnderstandResult;
  onAddMore: () => void;
  onProceed: () => void;
  onDiscard: () => void;
  errorMsg: string;
  wasAutoStopped?: boolean;
}) {
  const styleLabel = result.style === "A" ? "Energy" : "Focus";

  // ── Word-by-word animation ──────────────────────────────────────────────────
  // Split each section into words; stagger reveal across all three sequentially.
  const stateWords  = result.stateSummary.state.split(/\s+/).filter(Boolean);
  const intentWords = result.stateSummary.intent.split(/\s+/).filter(Boolean);
  const frictionWords = result.stateSummary.friction.split(/\s+/).filter(Boolean);

  // A small gap (in "ticks") creates a natural pause between sections
  const GAP = 3;
  const totalTicks =
    stateWords.length + GAP +
    intentWords.length + GAP +
    frictionWords.length;

  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (tick >= totalTicks) return;
    const TOTAL_MS = 3400;
    const delay = Math.max(40, TOTAL_MS / totalTicks);
    const id = setTimeout(() => setTick((t) => t + 1), delay);
    return () => clearTimeout(id);
  }, [tick, totalTicks]);

  // Map ticks to per-section visible word counts
  const stateVisible    = Math.min(stateWords.length, tick);
  const intentOffset    = stateWords.length + GAP;
  const intentVisible   = Math.max(0, Math.min(intentWords.length, tick - intentOffset));
  const frictionOffset  = intentOffset + intentWords.length + GAP;
  const frictionVisible = Math.max(0, Math.min(frictionWords.length, tick - frictionOffset));

  return (
    <section className="flex-1 flex flex-col overflow-hidden">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-5 pb-4">
        {wasAutoStopped && (
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.05] px-4 py-3 flex gap-3 items-start">
            <span className="text-amber-400/60 text-sm flex-shrink-0 mt-0.5">⏱</span>
            <div>
              <p className="text-sm text-amber-400/70 leading-snug">Recording captured at 5 minutes</p>
              <p className="text-xs text-amber-400/40 mt-1 leading-relaxed">We captured everything you said. If there&apos;s more you want to add, tap <strong>Add more</strong> below.</p>
            </div>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-light tracking-wide text-white" style={{ fontFamily: "var(--font-display)" }}>Is this right?</h2>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-white/20 border border-white/[0.08] rounded-full px-2.5 py-0.5 uppercase tracking-widest">
              {result.pillar}
            </span>
            <span className="text-[10px] text-white/20 border border-white/[0.08] rounded-full px-2.5 py-0.5 uppercase tracking-widest">
              {styleLabel}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.09] bg-white/[0.03] px-5 py-5 flex flex-col gap-4">
          <AnimatedConfirmRow label="State"    words={stateWords}    visibleCount={stateVisible} />
          <AnimatedConfirmRow label="Intent"   words={intentWords}   visibleCount={intentVisible} />
          <AnimatedConfirmRow label="Friction" words={frictionWords} visibleCount={frictionVisible} />
        </div>

        {errorMsg && (
          <p className="text-xs text-red-400/50 text-center">{errorMsg}</p>
        )}
      </div>

      {/* Always-visible action buttons */}
      <div className="flex flex-col gap-3 pt-4 pb-10 border-t border-white/[0.05] flex-shrink-0">
        <button
          onClick={onProceed}
          className="w-full py-5 rounded-2xl text-sm font-semibold tracking-wide active:scale-[0.98] transition-all touch-manipulation"
          style={{ background: "rgba(201,165,90,0.1)", border: "1px solid rgba(201,165,90,0.45)", color: "#c9a55a" }}
        >
          Yes — build my Rthms
        </button>
        <button
          onClick={onAddMore}
          className="w-full py-4 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-white/45 text-sm font-medium tracking-wide active:scale-[0.98] transition-transform touch-manipulation"
        >
          Add more
        </button>
        <button
          onClick={onDiscard}
          className="w-full py-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] text-white/25 text-sm font-medium tracking-wide active:scale-[0.98] transition-transform touch-manipulation"
        >
          Discard and start afresh
        </button>
      </div>
    </section>
  );
}

// Each section animates its words in from left, fading up with a ~2-word spread
function AnimatedConfirmRow({ label, words, visibleCount }: {
  label: string;
  words: string[];
  visibleCount: number;
}) {
  return (
    <div>
      <p className="text-[10px] text-white/25 uppercase tracking-[0.2em] mb-0.5">{label}</p>
      <p className="text-sm text-white/60 leading-relaxed">
        {words.map((word, i) => (
          <span
            key={i}
            style={{
              opacity: i < visibleCount ? 1 : 0,
              transition: "opacity 380ms ease",
              display: "inline",
            }}
          >
            {word}
            {i < words.length - 1 ? " " : ""}
          </span>
        ))}
      </p>
    </div>
  );
}

// ─── Genre picker ────────────────────────────────────────────────────────────

function GenreView({
  understandResult,
  onGenerate,
  onDiscard,
}: {
  understandResult: UnderstandResult;
  onGenerate: (genre: string) => void;
  onDiscard: () => void;
}) {
  const [genres, setGenres] = useState<string[]>([]);
  const [recommendedIndex, setRecommendedIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [loadingGenres, setLoadingGenres] = useState(true);
  const [loadingRec, setLoadingRec] = useState(false);

  // Custom style
  const [customStyle, setCustomStyle] = useState("");
  const [customSelected, setCustomSelected] = useState(false);

  const selectPreset = (i: number) => {
    setSelectedIndex(i);
    setCustomSelected(false);
  };

  const selectCustom = () => {
    if (!customStyle) return;
    setCustomSelected(true);
    setSelectedIndex(null);
  };

  useEffect(() => {
    fetch("/api/genres")
      .then((r) => r.json())
      .then((d) => {
        if (d.genres) {
          setGenres(d.genres);
          setLoadingGenres(false);
          setLoadingRec(true);
          fetch("/api/recommend-genre", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              stateSummary: understandResult.stateSummary,
              style: understandResult.style,
              genres: d.genres,
            }),
          })
            .then((r) => r.json())
            .then((rd) => {
              if (typeof rd.recommendedIndex === "number") {
                setRecommendedIndex(rd.recommendedIndex);
                setSelectedIndex(rd.recommendedIndex);
              }
            })
            .catch(() => { setRecommendedIndex(0); setSelectedIndex(0); })
            .finally(() => setLoadingRec(false));
        }
      })
      .catch(() => setLoadingGenres(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedGenre = customSelected && customStyle
    ? customStyle
    : selectedIndex !== null ? genres[selectedIndex] ?? "" : "";
  const canProceed = selectedGenre.length > 0;

  const buildLabel = selectedGenre
    ? `Build with ${selectedGenre.split(",")[0].slice(0, 32)}${selectedGenre.length > 32 ? "…" : ""}`
    : "Select a style";

  return (
    <section className="flex-1 flex flex-col pb-10 gap-5 overflow-y-auto">
      <div className="flex-shrink-0">
        <h2 className="text-2xl font-light text-white leading-snug" style={{ fontFamily: "var(--font-display)" }}>
          Choose your genre
        </h2>
        <p className="text-sm text-white/35 mt-2 leading-relaxed">
          {loadingRec ? "Finding the best match for your state…" : recommendedIndex !== null ? "We've suggested one based on your state. You can override it." : "Select the genre for your Rthm."}
        </p>
      </div>

      {loadingGenres ? (
        <div className="flex justify-center py-10">
          <div className="w-7 h-7 rounded-full border-2 border-white/15 border-t-white/55 animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {genres.map((genre, i) => {
            const isSelected = !customSelected && selectedIndex === i;
            const isRecommended = recommendedIndex === i;
            // Short label: text before the first comma (or first 40 chars)
            const commaIdx = genre.indexOf(",");
            const shortLabel = commaIdx > 0 ? genre.slice(0, commaIdx) : genre.slice(0, 42);
            return (
              <button
                key={i}
                onClick={() => selectPreset(i)}
                className={`w-full text-left px-5 py-4 rounded-2xl border transition-all duration-150 active:scale-[0.98] touch-manipulation ${
                  isSelected
                    ? "border-[rgba(201,165,90,0.5)] bg-[rgba(201,165,90,0.08)]"
                    : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className={`text-sm font-medium leading-snug ${isSelected ? "text-[#c9a55a]" : "text-white/70"}`}>
                    {shortLabel}
                  </span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isRecommended && (
                      <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full"
                        style={{ background: "rgba(201,165,90,0.12)", color: "rgba(201,165,90,0.7)", border: "1px solid rgba(201,165,90,0.25)" }}>
                        {loadingRec ? "…" : "Suggested"}
                      </span>
                    )}
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${
                      isSelected ? "border-[rgba(201,165,90,0.7)] bg-[rgba(201,165,90,0.3)]" : "border-white/20"
                    }`}>
                      {isSelected && <div className="w-2 h-2 rounded-full bg-[#c9a55a]" />}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}

          {/* Custom style */}
          <CustomStyleInput
            onStyleChange={(s) => { setCustomStyle(s); setCustomSelected(true); setSelectedIndex(null); }}
            selected={customSelected}
            onSelect={selectCustom}
          />
        </div>
      )}

      <div className="flex flex-col gap-3 mt-auto flex-shrink-0">
        <button
          onClick={() => canProceed && onGenerate(selectedGenre)}
          disabled={!canProceed}
          className="w-full py-5 rounded-2xl text-sm font-semibold tracking-wide active:scale-[0.98] transition-all touch-manipulation disabled:opacity-30"
          style={{ background: "rgba(201,165,90,0.1)", border: "1px solid rgba(201,165,90,0.45)", color: "#c9a55a" }}
        >
          {buildLabel}
        </button>
        <button
          onClick={onDiscard}
          className="w-full py-3 text-white/20 hover:text-white/40 text-sm tracking-wide transition-colors touch-manipulation"
        >
          Discard and start afresh
        </button>
      </div>
    </section>
  );
}

// ─── Generating ───────────────────────────────────────────────────────────────

function GeneratingView({ onCancel }: { onCancel: () => void }) {
  return (
    <section className="flex-1 flex flex-col items-center justify-center pb-24 gap-8">
      <div className="text-center max-w-xs">
        <h2 className="text-xl font-light tracking-wide text-white" style={{ fontFamily: "var(--font-display)" }}>Building your Rthms</h2>
        <p className="text-sm text-white/30 mt-2 leading-relaxed">
          This takes 1–2 minutes. You can navigate away — a notification will appear when they&apos;re ready.
        </p>
      </div>
      <div className="w-7 h-7 rounded-full border-2 border-white/15 border-t-white/55 animate-spin" />
      <button
        onClick={onCancel}
        className="text-xs text-white/15 hover:text-white/30 transition-colors touch-manipulation uppercase tracking-widest"
      >
        Cancel
      </button>
    </section>
  );
}

// ─── Results ─────────────────────────────────────────────────────────────────

function ResultsView({
  songs,
  songStatus,
  setStatus,
  onReset,
  onTogglePlay,
  isSongPlaying,
  isSongLoading,
  pillar,
  lyrics,
  debugMsg,
  audioEl,
  playingId,
  currentTime,
  duration,
  onRecreateGenre,
}: {
  songs: Song[];
  songStatus: SongStatusMap;
  setStatus: (id: string, s: SongStatus) => void;
  onReset: () => void;
  onTogglePlay: (song: Song) => void;
  isSongPlaying: (song: Song) => boolean;
  isSongLoading: (song: Song) => boolean;
  pillar?: PillarType;
  lyrics?: string;
  debugMsg?: string;
  audioEl: React.RefObject<HTMLAudioElement | null>;
  playingId: string | null;
  currentTime: number;
  duration: number;
  onRecreateGenre?: () => void;
}) {
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [showPlayer, setShowPlayer] = useState(false);

  // Auto-open full-screen player when a real audio track starts
  useEffect(() => {
    if (playingId !== null) setShowPlayer(true);
  }, [playingId]);

  const handleRemove = (id: string) => {
    if (confirmRemoveId === id) {
      setStatus(id, "deleted");
      setConfirmRemoveId(null);
    } else {
      setConfirmRemoveId(id);
      setTimeout(() => setConfirmRemoveId((c) => (c === id ? null : c)), 3000);
    }
  };

  // Find by ID so player opens the moment a song is tapped, before play() resolves
  const playingSong = songs.find((s) => s.id === playingId && !!s.audioUrl) ?? null;

  return (
    <section className="flex-1 flex flex-col gap-5 pb-32">
      {/* Saved notice */}
      <Link
        href="/library"
        className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] transition-colors touch-manipulation"
      >
        <span className="text-xs text-white/40">✓</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-white/50 leading-snug">Saved to your library — tap to manage</p>
        </div>
        <span className="text-white/20 text-sm flex-shrink-0">›</span>
      </Link>

      <div className="flex items-center gap-3">
        <p className="text-[10px] text-white/25 uppercase tracking-[0.2em]">Generated for you</p>
        {pillar && (
          <span className="text-[10px] text-white/20 border border-white/[0.08] rounded-full px-2.5 py-0.5 uppercase tracking-widest">
            {pillar}
          </span>
        )}
      </div>

      {debugMsg && <p className="text-[10px] text-red-400/60 break-all">{debugMsg}</p>}

      {songs.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 py-16">
          <p className="text-sm text-white/25 text-center">All Rthms removed.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {songs.map((song) => {
            const status = songStatus[song.id] ?? null;
            const playing = isSongPlaying(song);
            const loading = isSongLoading(song);
            const canPlay = !!(song.audioUrl || (song.trackId && song.trackAudioKey));
            const progress =
              song.audioUrl && playingId === song.id && duration > 0
                ? currentTime / duration
                : 0;

            return (
              <div
                key={song.id}
                className={`rounded-2xl border transition-all duration-200
                  ${playing ? "bg-white/[0.08] border-white/20" : "bg-white/[0.03] border-white/[0.08]"}
                  ${status === "archived" ? "opacity-50" : ""}`}
              >
                {/* Tap row: play/pause + open player */}
                <button
                  onClick={() => {
                    onTogglePlay(song);
                    if (song.audioUrl && !playing) setShowPlayer(true);
                    else if (playing) setShowPlayer(true); // re-open player if tapping playing card
                  }}
                  disabled={!canPlay}
                  className="w-full flex items-center gap-4 px-5 py-5 text-left touch-manipulation active:scale-[0.99] transition-transform disabled:opacity-40"
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center border flex-shrink-0
                      ${playing ? "bg-white/15 border-white/30" : "bg-white/[0.06] border-white/[0.10]"}`}
                  >
                    {loading ? <LoadingIcon /> : playing ? <PauseIcon /> : <PlayIcon />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-base font-semibold leading-snug truncate ${playing ? "text-white" : "text-white/75"}`}>
                      {song.title}
                    </p>
                    {status === "archived" && (
                      <p className="text-[10px] text-white/25 mt-0.5 uppercase tracking-widest">Archived</p>
                    )}
                    {playing && (
                      <div className="flex items-end gap-[3px] h-3 mt-1.5">
                        {[1, 2, 3].map((j) => (
                          <span key={j} className="w-[3px] bg-white/40 rounded-full animate-wave" style={{ animationDelay: `${j * 0.15}s` }} />
                        ))}
                      </div>
                    )}
                  </div>
                  {playing && (
                    <span className="flex-shrink-0 text-[10px] text-white/25 uppercase tracking-widest">expand ›</span>
                  )}
                </button>

                {/* Thin progress strip on playing card */}
                {song.audioUrl && playingId === song.id && (
                  <div className="h-[2px] bg-white/[0.06] mx-5 rounded-full mb-3">
                    <div className="h-full bg-white/30 rounded-full transition-none" style={{ width: `${progress * 100}%` }} />
                  </div>
                )}

                <div className="flex border-t border-white/[0.06]">
                  <ActionBtn
                    active={status === "archived"}
                    onClick={() => setStatus(song.id, status === "archived" ? null : "archived")}
                    label={status === "archived" ? "Restore" : "Archive"}
                    sublabel={status === "archived" ? "Back to active" : "Keep but hide"}
                    icon="⊙"
                  />
                  <ActionBtn
                    onClick={() => handleRemove(song.id)}
                    label={confirmRemoveId === song.id ? "Confirm?" : "Remove"}
                    sublabel={confirmRemoveId === song.id ? "Tap again to delete" : "Delete from library"}
                    icon="×"
                    danger
                    confirming={confirmRemoveId === song.id}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom navigation */}
      <div className="flex flex-col gap-2 mt-2">
        <button
          onClick={onReset}
          className="w-full py-4 rounded-2xl bg-white/[0.05] border border-white/[0.08] text-white/50 text-sm font-medium tracking-wide active:scale-[0.98] transition-transform touch-manipulation"
        >
          Speak again
        </button>
        <div className="flex gap-2">
          <Link
            href="/library"
            className="flex-1 py-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-white/35 text-sm text-center font-medium tracking-wide active:scale-[0.98] transition-transform touch-manipulation"
          >
            Library
          </Link>
          <Link
            href="/"
            className="flex-1 py-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-white/35 text-sm text-center font-medium tracking-wide active:scale-[0.98] transition-transform touch-manipulation"
          >
            Home
          </Link>
        </div>
      </div>

      {/* Full-screen player */}
      {showPlayer && playingSong && (
        <FullScreenPlayer
          song={playingSong}
          currentTime={currentTime}
          duration={duration}
          isPlaying={isSongPlaying(playingSong)}
          lyrics={lyrics}
          audioEl={audioEl}
          onTogglePlay={() => onTogglePlay(playingSong)}
          onClose={() => setShowPlayer(false)}
          onRecreateGenre={onRecreateGenre ? () => { setShowPlayer(false); onRecreateGenre!(); } : undefined}
        />
      )}
    </section>
  );
}

// ─── Full-screen player ───────────────────────────────────────────────────────

function FullScreenPlayer({
  song,
  currentTime,
  duration,
  isPlaying,
  lyrics,
  audioEl,
  onTogglePlay,
  onClose,
  onRecreateGenre,
}: {
  song: Song;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  lyrics?: string;
  audioEl: React.RefObject<HTMLAudioElement | null>;
  onTogglePlay: () => void;
  onClose: () => void;
  onRecreateGenre?: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState(0);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  // Sync loop state to audio element
  useEffect(() => {
    const el = audioEl.current;
    if (el) el.loop = loopEnabled;
  }, [loopEnabled, audioEl]);

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const getRatioFromPointer = (clientX: number): number => {
    if (!barRef.current) return 0;
    const rect = barRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    setDragProgress(getRatioFromPointer(e.clientX));
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragProgress(getRatioFromPointer(e.clientX));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const ratio = getRatioFromPointer(e.clientX);
    setDragging(false);
    if (audioEl.current && duration > 0) audioEl.current.currentTime = ratio * duration;
  };

  const handleRestart = () => {
    const el = audioEl.current;
    if (!el) return;
    el.currentTime = 0;
    el.play().catch(console.error);
  };

  const handleSkip10 = () => {
    const el = audioEl.current;
    if (!el) return;
    el.currentTime = Math.min(duration, (el.currentTime || 0) + 10);
  };

  const progress = duration > 0 ? (dragging ? dragProgress : currentTime / duration) : 0;

  // Parse lyrics for display
  const lyricLines = lyrics
    ? lyrics.split("\n").map((l) => l.trim()).filter((l) => l.length > 0)
    : [];

  return (
    <div className="fixed inset-0 z-[60] bg-[#060d1a] flex flex-col pt-safe pb-safe">

      {/* Header */}
      <div className="flex items-center px-6 pt-4 pb-3 flex-shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-white/35 hover:text-white/60 transition-colors touch-manipulation py-1"
          aria-label="Back to list"
        >
          <svg width="8" height="13" viewBox="0 0 8 13" fill="none">
            <path d="M7 1L1 6.5L7 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-sm">Back</span>
        </button>
      </div>

      {/* Title */}
      <div className="px-8 pb-5 flex-shrink-0">
        <h2 className="text-xl font-semibold text-white leading-snug">{song.title}</h2>
      </div>

      {/* Drag-to-seek bar */}
      <div className="px-8 flex-shrink-0">
        <div
          ref={barRef}
          className="relative h-8 flex items-center cursor-pointer touch-manipulation select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 bg-white/10 rounded-full">
            <div className="h-full bg-white/60 rounded-full transition-none" style={{ width: `${progress * 100}%` }} />
          </div>
          <div
            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white shadow-md"
            style={{ left: `calc(${progress * 100}% - 8px)` }}
          />
        </div>
        <div className="flex justify-between -mt-1 mb-6">
          <span className="text-[11px] text-white/25 tabular-nums">{fmt(currentTime)}</span>
          <span className="text-[11px] text-white/25 tabular-nums">{fmt(duration)}</span>
        </div>
      </div>

      {/* Playback controls */}
      <div className="flex items-center justify-center gap-6 px-8 mb-3 flex-shrink-0">
        {/* Restart */}
        <button
          onClick={handleRestart}
          className="flex flex-col items-center gap-1 text-white/30 hover:text-white/60 active:scale-90 transition-all touch-manipulation"
          aria-label="Restart"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.36 2.64L3 4v5h5L6.34 7.34A7 7 0 1 1 5 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[9px] uppercase tracking-wider">Start</span>
        </button>

        {/* Play / Pause */}
        <button
          onClick={onTogglePlay}
          className="w-16 h-16 rounded-full bg-white flex items-center justify-center active:scale-95 transition-transform touch-manipulation shadow-lg"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <rect x="3" y="2" width="3.5" height="12" rx="1" fill="#0d1628" />
              <rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="#0d1628" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" className="ml-0.5">
              <path d="M4 2.5L13 8L4 13.5V2.5Z" fill="#0d1628" />
            </svg>
          )}
        </button>

        {/* Skip +10s */}
        <button
          onClick={handleSkip10}
          className="flex flex-col items-center gap-1 text-white/30 hover:text-white/60 active:scale-90 transition-all touch-manipulation"
          aria-label="Skip forward 10 seconds"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M13 4a8 8 0 1 1-7.39 4.93" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M13 4V1l4 3.5-4 3V4Z" fill="currentColor" />
          </svg>
          <span className="text-[9px] uppercase tracking-wider">+10s</span>
        </button>

        {/* Loop toggle */}
        <button
          onClick={() => setLoopEnabled((v) => !v)}
          className="flex flex-col items-center gap-1 active:scale-90 transition-all touch-manipulation"
          style={{ color: loopEnabled ? "#c9a55a" : "rgba(255,255,255,0.3)" }}
          aria-label={loopEnabled ? "Disable loop" : "Enable loop"}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M17 2l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 11V9a4 4 0 0 1 4-4h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M7 22l-4-4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M21 13v2a4 4 0 0 1-4 4H3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span className="text-[9px] uppercase tracking-wider">Loop</span>
        </button>
      </div>

      {/* Recreate in another genre */}
      {onRecreateGenre && (
        <div className="flex justify-center px-8 mb-5 flex-shrink-0">
          <button
            onClick={onRecreateGenre}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-xs tracking-widest uppercase transition-all touch-manipulation active:scale-95"
            style={{
              color: "rgba(201,165,90,0.7)",
              background: "rgba(201,165,90,0.06)",
              border: "1px solid rgba(201,165,90,0.2)",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 6.36 2.64L21 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M21 3v4h-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-6.36-2.64L3 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M3 21v-4h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Recreate in another genre
          </button>
        </div>
      )}

      {/* Lyrics — scrollable, always visible */}
      {lyricLines.length > 0 && (
        <>
          <div className="mx-8 h-px bg-white/[0.06] flex-shrink-0" />
          <div className="flex-1 overflow-y-auto px-8 pt-5 pb-10 min-h-0">
            {lyricLines.map((line, i) => {
              const isHeader = /^\[.*\]$/.test(line);
              return isHeader ? (
                <p key={i} className="text-[10px] text-white/20 uppercase tracking-widest mt-6 mb-2 first:mt-0">
                  {line.replace(/^\[|\]$/g, "")}
                </p>
              ) : (
                <p key={i} className="text-sm text-white/55 leading-relaxed mb-1">
                  {line}
                </p>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function ActionBtn({
  onClick,
  label,
  sublabel,
  icon,
  active,
  danger,
  confirming,
}: {
  onClick: () => void;
  label: string;
  sublabel?: string;
  icon: string;
  active?: boolean;
  danger?: boolean;
  confirming?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center gap-0.5 py-3 text-xs tracking-wide touch-manipulation transition-colors
        ${confirming ? "text-red-400/80"
          : danger ? "text-white/20 hover:text-red-400/50 active:text-red-400/70"
          : active ? "text-white/60"
          : "text-white/20 hover:text-white/40"}`}
    >
      <span className="text-base leading-none">{icon}</span>
      <span className="uppercase tracking-widest text-[9px]">{label}</span>
      {sublabel && <span className="text-[8px] opacity-60 normal-case tracking-normal">{sublabel}</span>}
    </button>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function MicIcon({ active }: { active?: boolean }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ color: active ? "#c9a55a" : "rgba(255,255,255,0.55)" }}>
      <rect x="9" y="2" width="6" height="11" rx="3" fill="currentColor" />
      <path d="M5 11a7 7 0 0 0 14 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="12" y1="18" x2="12" y2="22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="9" y1="22" x2="15" y2="22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-white ml-0.5">
      <path d="M4 2.5L13 8L4 13.5V2.5Z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-white">
      <rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
      <rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
    </svg>
  );
}

function LoadingIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-white/60 animate-spin">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="20 18" />
    </svg>
  );
}
