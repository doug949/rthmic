"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { TransitionLink } from "@/app/components/TransitionLink";
import { transitionTo as navigateTo } from "@/app/lib/pageTransition";
import { AppHeader } from "@/app/components/AppHeader";
import { useAudio } from "@/app/contexts/AudioContext";
import { useGeneration } from "@/app/contexts/GenerationContext";
import { usePillarTheme } from "@/app/contexts/PillarThemeContext";
import type { PillarType, StateSummary, Song, SongStatus, SongStatusMap } from "@/app/types/pipeline";
import { normalisePillar } from "@/app/types/pipeline";
import type { StyleChoice } from "@/app/services/llmService";
import CustomStyleInput, { WaveDots } from "@/app/components/CustomStyleInput";
import { RevealBlock } from "@/app/components/RevealBlock";
import { QueuePill } from "@/app/components/QueuePill";
import { useQueueStatus } from "@/app/hooks/useQueueStatus";

type Phase = "module" | "priming" | "idle" | "recording" | "understanding" | "confirming" | "genre" | "queued";

interface PillarPriming {
  headline: string;
  subheadline: string;
  instructions: string[];
  footnote: string;
}

interface PillarDefinition {
  slug: string;
  label: string;
  tagline: string;       // one-line shown on the tile
  detail: string;        // fuller "what this is" shown in Learn More
  guidance: string;      // how to speak, shown in Learn More panel
  priming: PillarPriming; // full copy shown on Before You Speak screen
  icon?: React.ReactNode; // small SVG icon shown on the tile
  comingSoon?: boolean;   // show as dim / non-selectable
  adhdOnly?: boolean;    // hidden unless ADHD mode is enabled in settings
  advanced?: boolean;    // hidden when simpleMode is enabled in settings
}

// ─── Suggestion chips for explain + booksummary ───────────────────────────────

async function fetchSuggestions(pillar: string): Promise<string[]> {
  const res = await fetch(`/api/suggestions?pillar=${pillar}`, { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  return data.suggestions ?? [];
}

function fmtDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m === 0) return `${s}s`;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

// ─── Pillar-aware recording prompts ──────────────────────────────────────────

const PILLAR_PROMPT: Record<string, string> = {
  memory:      "Speak what you need to remember",
  menus:       "Speak your list",
  mindset:     "Speak what's ahead",
  mode:        "Speak your state",
  movement:    "Speak what's stuck",
  journal:     "Speak your day",
  epiphany:    "Speak the idea",
  explain:     "Speak what you want to make sense of",
  booksummary: "Name the book",
  bridge:      "Speak for them",
  invite:      "Speak about them",
};

const PILLAR_SUBTITLE: Record<string, string> = {
  memory:      "Rthmic will lock it in.",
  menus:       "Rthmic will carry your list.",
  mindset:     "Rthmic will prepare you.",
  mode:        "Rthmic will meet you there.",
  movement:    "Rthmic will get it moving.",
  journal:     "Rthmic will hold the day.",
  epiphany:    "Rthmic will hold the idea.",
  explain:     "Rthmic will make it click.",
  booksummary: "Rthmic will carry the idea.",
  bridge:      "Rthmic will reach them.",
  invite:      "Rthmic will bring them in.",
};

interface UnderstandResult {
  transcript: string;
  pillar: PillarType;
  stateSummary: StateSummary;
  title: string;
  lyrics: string;
  style: StyleChoice;
}

export default function SpeakPage() {
  const router = useRouter();
  const { setActivePillar } = usePillarTheme();
  const [phase, setPhase] = useState<Phase>("module");
  const [selectedPillar, _setSelectedPillar] = useState<string | null>(null);
  const [understandResult, setUnderstandResult] = useState<UnderstandResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [songStatus, setSongStatus] = useState<SongStatusMap>({});
  const [transitioning, setTransitioning] = useState(false);
  const [isDedication, setIsDedication] = useState(false);

  const {
    genPhase,
    genSongs,
    genPillar,
    genLyrics,
    genError,
    startGeneration,
    clearGeneration,
  } = useGeneration();

  const { refresh: refreshQueueStatus } = useQueueStatus();

  const allTranscriptsRef = useRef<string[]>([]);
  const seedRef = useRef<string | null>(null);
  const menuSlugRef = useRef<string | null>(null);
  const menuTitleRef = useRef<string | null>(null);

  // Track how long generation took so ResultsView can display "Generated in X"
  const genStartedAtRef = useRef<number | null>(null);
  const [genDurationMs, setGenDurationMs] = useState<number | null>(null);
  const [wasAutoStopped, setWasAutoStopped] = useState(false);

  // Ref mirror of selectedPillar — updated synchronously so stale closures
  // (recorder.onstop, memoised callbacks) always read the live value.
  // useEffect is NOT used here — it runs after the render and can still be
  // stale if something reads the ref before the effect fires.
  const selectedPillarRef = useRef<string | null>(null);
  const setSelectedPillar = (pillar: string | null) => {
    selectedPillarRef.current = pillar;      // sync — immediately visible everywhere
    _setSelectedPillar(pillar);              // async — triggers re-render
    setActivePillar(pillar);                 // drives ambient background texture
  };

  // Clear ambient background when speak page unmounts
  useEffect(() => () => setActivePillar(null), []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const {
    handlePlay: handleMockPlay,
    handlePlayUrl,
    stop: stopAudio,
    currentTrackId,
    isPlaying,
    currentTime,
    duration,
    loadingId,
    seek,
    skip,
    restart: restartAudio,
    setLoop,
  } = useAudio();

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

      const priorContext = allTranscriptsRef.current.join(" ").trim();
      const seed = seedRef.current;
      seedRef.current = null;
      const combinedContext = [seed, priorContext].filter(Boolean).join(" ");
      if (combinedContext) {
        form.append("previousContext", combinedContext);
      }

      // Use the ref — not the state variable — so we always get the current pillar
      // even if this function was captured in a stale closure by recorder.onstop
      const pillarAtRecordTime = selectedPillarRef.current;
      if (pillarAtRecordTime) {
        form.append("pillar", pillarAtRecordTime);
      }

      const res = await fetch("/api/understand", { method: "POST", body: form });
      if (!res.ok) {
        let errMsg = "Understanding failed";
        try { const err = await res.json(); errMsg = err.error || errMsg; } catch { /* non-JSON body */ }
        if (res.status === 413) errMsg = "Your recording is too large to process. Please keep it under 3 minutes and try again.";
        throw new Error(errMsg);
      }

      const data: UnderstandResult = await res.json();
      // Hard-pin: enforce the pillar the user selected, never let the LLM override it
      if (pillarAtRecordTime) {
        data.pillar = normalisePillar(pillarAtRecordTime);
      }
      allTranscriptsRef.current.push(data.transcript);
      setUnderstandResult(data);
      // booksummary + explain skip the confirmation screen — go straight to genre
      const skipConfirm = ["booksummary", "explain"].includes(
        (pillarAtRecordTime ?? "").toLowerCase()
      );
      setPhase(skipConfirm ? "genre" : "confirming");
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

  const runWithText = async (text: string) => {
    setPhase("understanding");
    setErrorMsg("");
    try {
      const form = new FormData();
      form.append("transcript", text);
      const pillar = selectedPillarRef.current;
      if (pillar) form.append("pillar", pillar);

      const res = await fetch("/api/understand", { method: "POST", body: form });
      if (!res.ok) {
        let errMsg = "Understanding failed";
        try { const err = await res.json(); errMsg = err.error || errMsg; } catch { /* non-JSON body */ }
        throw new Error(errMsg);
      }

      const data: UnderstandResult = await res.json();
      if (pillar) data.pillar = normalisePillar(pillar);
      setUnderstandResult(data);
      const skipConfirmText = ["booksummary", "explain"].includes((pillar ?? "").toLowerCase());
      setPhase(skipConfirmText ? "genre" : "confirming");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Something went wrong");
      setPhase("idle");
    }
  };

  // ─── Generate step — queues job in background ────────────────────────────

  const runGenerate = async (genre = "Indie Electronic") => {
    if (!understandResult) return;
    setErrorMsg("");

    const finalPillar = (selectedPillarRef.current ?? selectedPillar)
      ? normalisePillar((selectedPillarRef.current ?? selectedPillar)!)
      : understandResult.pillar;
    const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    const rawTitle = menuTitleRef.current
      ? `${menuTitleRef.current} — ${today}`
      : understandResult.title;
    const title = rawTitle.length > 80 ? rawTitle.slice(0, 77) + "…" : rawTitle;
    const rawNote = understandResult.stateSummary.state?.trim();
    const note = rawNote
      ? (rawNote.length > 120 ? rawNote.slice(0, 117) + "…" : rawNote)
      : undefined;

    try {
      const res = await fetch("/api/queue-generation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lyrics: understandResult.lyrics,
          style: understandResult.style,
          title,
          pillar: finalPillar,
          genre,
          menuSlug: menuSlugRef.current ?? undefined,
          note,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to queue generation");
      }
      // Job queued — navigate to library so user sees the generating section
      refreshQueueStatus();
      setPhase("queued");
      setUnderstandResult(null);
      allTranscriptsRef.current = [];
      setTimeout(() => navigateTo("/library", router), 1200);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to queue generation");
    }
  };

  // ─── Add more ─────────────────────────────────────────────────────────────

  const addMore = useCallback(() => {
    startRecording();
  }, [startRecording]);

  // ─── Re-analyse — re-run understand with stored transcripts after gen failure ─

  const reanalyse = useCallback(() => {
    const combined = allTranscriptsRef.current.join(" ").trim();
    if (!combined) return;
    clearGeneration();
    runWithText(combined);
  }, [clearGeneration]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Song playback ────────────────────────────────────────────────────────

  const togglePlay = useCallback((song: Song) => {
    if (song.audioUrl) {
      handlePlayUrl(song.id, song.audioUrl, song.title);
      return;
    }
    if (song.trackId && song.trackAudioKey) {
      handleMockPlay(song.trackId, song.trackAudioKey);
    }
  }, [handlePlayUrl, handleMockPlay]);

  const isSongPlaying = (song: Song): boolean => {
    const id = song.audioUrl ? song.id : song.trackId ?? null;
    return currentTrackId === id && isPlaying;
  };

  const isSongLoading = (song: Song): boolean => {
    const id = song.audioUrl ? song.id : song.trackId ?? null;
    return loadingId === id;
  };

  // ─── Phase transition (fade to dark, swap phase, fade back) ──────────────
  //
  // Named goToPhase to distinguish from navigateTo() which changes the URL.

  const goToPhase = useCallback((newPhase: Phase) => {
    setTransitioning(true);
    setTimeout(() => {
      setPhase(newPhase);
      setTimeout(() => setTransitioning(false), 50);
    }, 200);
  }, []);

  // ─── Reset ────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    clearRecordingTimers();
    stopAudio();
    clearGeneration();
    setPhase("module");
    setSelectedPillar(null);
    setUnderstandResult(null);
    setErrorMsg("");
    setWasAutoStopped(false);
    setSongStatus({});
    setIsDedication(false);
    allTranscriptsRef.current = [];
  }, [clearRecordingTimers, stopAudio, clearGeneration]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Back navigation ──────────────────────────────────────────────────────
  //
  // Context-aware: always goes exactly one step back in the flow.
  // Never jumps straight to Home from mid-flow.

  const handleBack = useCallback(() => {
    // During transcription — block back (async in flight, can't cancel)
    if (phase === "understanding") return;

    // During active music generation — block back
    if (genPhase === "generating") return;

    // From results or failed — return to speak-start so user can retry
    if (genPhase === "ready" || genPhase === "failed") {
      reset();
      return;
    }

    // Local phase stack
    switch (phase) {
      case "module":
        navigateTo("/", router);
        break;
      case "priming":
        goToPhase("module");
        break;
      case "idle":
        goToPhase("priming");
        break;
      case "recording": {
        // Discard the in-progress recording without processing it
        clearRecordingTimers();
        const rec = mediaRecorderRef.current;
        if (rec && rec.state === "recording") {
          rec.ondataavailable = null;
          rec.onstop = () => {};
          rec.stop();
        }
        cleanupWebAudio();
        setPhase("idle");
        break;
      }
      case "confirming":
        goToPhase("idle");
        break;
      case "genre":
        goToPhase("confirming");
        break;
    }
  }, [phase, genPhase, reset, goToPhase, clearRecordingTimers, cleanupWebAudio, router]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Paste lyrics bypass ──────────────────────────────────────────────────
  //
  // User has their own lyrics — skip transcription and interpretation entirely.
  // Synthesise a minimal UnderstandResult and jump straight to genre selection.

  const runWithPastedLyrics = useCallback((lyrics: string, title: string) => {
    const pillar = selectedPillar ? normalisePillar(selectedPillar) : ("Mindset" as const);
    setUnderstandResult({
      transcript: "Pasted lyrics",
      pillar,
      stateSummary: {
        state: "You have your own lyrics ready to set to music.",
        intent: "You want to create a Rthm from words you've already written.",
        friction: "",
      },
      title,
      lyrics,
      style: "A",
    });
    goToPhase("genre");
  }, [selectedPillar, goToPhase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Recreate in another genre ───────────────────────────────────────────

  const handleRecreateGenre = useCallback(() => {
    clearGeneration();
    goToPhase("genre");
  }, [clearGeneration, goToPhase]);

  // Track generation duration: stamp start, compute elapsed when ready.
  useEffect(() => {
    if (genPhase === "generating") {
      genStartedAtRef.current = Date.now();
      setGenDurationMs(null);
    } else if (genPhase === "ready" && genStartedAtRef.current !== null) {
      setGenDurationMs(Date.now() - genStartedAtRef.current);
      genStartedAtRef.current = null;
    }
  }, [genPhase]);

  // Start fresh when entering the Speak page — but don't wipe a completed generation
  // the user may be returning from navigation to see their results.
  useEffect(() => {
    if (genPhase === "ready" || genPhase === "generating") return;
    clearGeneration();
    setUnderstandResult(null);
    setErrorMsg("");
    setSongStatus({});
    allTranscriptsRef.current = [];

    // Read ?pillar=, ?seed=, ?menuSlug=, ?menuTitle= from URL (e.g. from the Structure page)
    const params = new URLSearchParams(window.location.search);
    const pillarParam = params.get("pillar");
    const seedParam = params.get("seed");
    const menuSlugParam = params.get("menuSlug");
    const menuTitleParam = params.get("menuTitle");
    menuSlugRef.current = menuSlugParam ?? null;
    menuTitleRef.current = menuTitleParam ?? null;
    if (pillarParam) {
      seedRef.current = seedParam ?? null;
      setSelectedPillar(pillarParam);
      setIsDedication(false);
      setPhase("priming");
    } else {
      setSelectedPillar(null);
      setPhase("module");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      clearRecordingTimers();
      cleanupWebAudio();
    };
  }, [cleanupWebAudio, clearRecordingTimers]);

  const visibleSongs = genSongs.filter((s) => songStatus[s.id] !== "deleted");

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <main className="relative z-10 min-h-screen flex flex-col px-6 pt-safe" style={{ animation: "page-enter 380ms ease forwards" }}>

      {/* Phase-change overlay — fades to dark between screens */}
      <div
        className="fixed inset-0 z-50 pointer-events-none"
        style={{
          background: "#0d1628",
          opacity: transitioning ? 1 : 0,
          transition: "opacity 200ms ease",
        }}
      />

      <AppHeader
        title="Create"
        onBack={
          phase === "understanding" || genPhase === "generating"
            ? null       // disabled during async operations
            : handleBack // context-aware for all other states
        }
      />

      {/* Queue indicator — shown whenever background jobs are running */}
      {genPhase === "idle" && phase !== "queued" && (
        <div className="flex justify-center mb-2">
          <QueuePill />
        </div>
      )}

      {/* Generation-context phases take priority */}
      {genPhase === "generating" && (
        <GeneratingView onCancel={reset} pillar={genPillar ?? selectedPillar} />
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
          playingId={currentTrackId}
          currentTime={currentTime}
          duration={duration}
          onSeek={seek}
          onSkip={skip}
          onRestart={restartAudio}
          onSetLoop={setLoop}
          onRecreateGenre={understandResult ? handleRecreateGenre : undefined}
          isDedication={isDedication}
          genDurationMs={genDurationMs ?? undefined}
        />
      )}

      {/* Failed: allow retry if we still have the understand result */}
      {genPhase === "failed" && understandResult && (
        <ConfirmingView
          result={understandResult}
          onAddMore={addMore}
          onProceed={() => runGenerate()}
          onDiscard={reset}
          onReanalyse={reanalyse}
          errorMsg={genError}
        />
      )}

      {/* Queued confirmation — brief, then auto-resets to idle */}
      {genPhase === "idle" && phase === "queued" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 pb-32">
          <span style={{ fontSize: 28, color: "rgba(201,165,90,0.8)" }}>✓</span>
          <p className="text-base font-medium" style={{ color: "rgba(201,165,90,0.9)" }}>Added to queue</p>
          <p className="text-sm text-white/40 text-center">Your Rthm is generating in the background</p>
          <QueuePill />
        </div>
      )}

      {/* Local phases — only shown when no active generation */}
      {genPhase === "idle" && phase !== "queued" && (
        <>
          {phase === "module" && (
            <PillarView
              onSelect={(slug, seed) => {
                seedRef.current = seed ?? null;
                if (slug === "auto") {
                  setSelectedPillar(null);
                  setIsDedication(false);
                  goToPhase("priming");
                } else {
                  setSelectedPillar(slug);
                  setIsDedication(slug === "bridge" || slug === "invite");
                  goToPhase("priming");
                }
              }}
            />
          )}
          {phase === "priming" && (
            <PrimingView pillar={selectedPillar} onReady={(seed, skipSpeak) => {
              if (skipSpeak && seed) {
                runWithText(seed);
              } else {
                seedRef.current = seed ?? null;
                goToPhase("idle");
              }
            }} />
          )}
          {phase === "idle" && (
            <IdleView onRecord={startRecording} errorMsg={errorMsg} selectedPillar={selectedPillar} />
          )}
          {phase === "recording" && (
            <RecordingView orbRef={orbRef} onStop={stopRecording} seconds={recordingSeconds} maxSeconds={MAX_RECORDING_SECONDS} selectedPillar={selectedPillar} />
          )}
          {phase === "understanding" && <UnderstandingView pillar={selectedPillar} />}
          {phase === "confirming" && understandResult && (
            <ConfirmingView
              result={understandResult}
              onAddMore={addMore}
              onProceed={() => goToPhase("genre")}
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
    icon: <MemoryIcon />,
    advanced: true,
    detail: "Use this when you need to memorise something — a speech, a script, a sequence, a list of names, or any content you need to recall under real conditions. Rthmic encodes the information into a song using linked images, scenes, and sensory anchors so retrieval feels natural rather than effortful.",
    guidance: "Describe what you're trying to remember and where it's slipping. Name the specific items if you can — the more concrete, the better the Rthm.",
    priming: {
      headline: "Be specific. Be thorough.",
      subheadline: "The more detail you give, the stronger the Rthm.",
      instructions: [
        "Name the items you need to remember — in order if there's an order. Say them out loud as if reciting to someone who has never heard them before.",
        "Include any associations, stories, or context you already have. Everything you give Rthmic is material it can work with.",
        "If something is slipping, say where — the item that won't stick, the part of the sequence you keep losing, the gap that opens up under pressure.",
      ],
      footnote: "Speak for as long as it takes to get through the material once. Rthmic captures everything — even a rough pass is enough to build from.",
    },
  },
  {
    slug: "menus",
    label: "Menus",
    tagline: "Ambient selection of actions",
    icon: <MenusIcon />,
    detail: "Use this when you have a list of tasks and need to move through them without pressure. Rthmic turns your to-do list into a gentle, ambient field of options — no obligation, no fixed order. You hear the possibilities and choose what calls to you. Works for morning routines, afternoon catch-ups, and winding down at night.",
    guidance: "Tell Rthmic your list of tasks or actions — as many as you like. Describe what you need to get through today, this morning, or tonight.",
    priming: {
      headline: "List everything.",
      subheadline: "Don't filter. Just say what's on your plate.",
      instructions: [
        "Go through your tasks, errands, ideas, or obligations — whatever is in front of you right now. Morning, afternoon, or night.",
        "No order needed. No priority ranking. Just say them as they come to mind. Rthmic will weave them into something you can move through easily.",
        "The more you give, the richer the menu. Long lists work well.",
      ],
      footnote: "Most people speak for 1–2 minutes. More is fine — Rthmic handles long lists well and nothing gets lost.",
    },
  },
  {
    slug: "mindset",
    label: "Mindset",
    tagline: "Preparation before events",
    icon: <MindsetIcon />,
    advanced: true,
    detail: "Use this before something important — a presentation, a difficult conversation, a performance, a meeting, or any moment that requires you to show up at your best. Rthmic builds a calm upward trajectory that moves you from unsettled to ready, grounded rather than hyped.",
    guidance: "Describe what's coming and how you're feeling about it. Be specific about the moment you're preparing for — the more detail, the better.",
    priming: {
      headline: "Tell Rthmic what's coming.",
      subheadline: "And honestly, how you're feeling about it.",
      instructions: [
        "Describe the event, conversation, or moment that's ahead — what it is, when it's happening, and what it will require of you.",
        "Be honest about where you are right now. Uncertain? Underprepared? Dreading it? Say that. The more clearly you name the gap, the better Rthmic can close it.",
        "You don't need to feel positive going in. Rthmic builds toward readiness — but it starts from wherever you actually are.",
      ],
      footnote: "Most people speak for 1–3 minutes. The event doesn't need to feel big for this to help — even small moments benefit from preparation.",
    },
  },
  {
    slug: "mode",
    label: "Mode",
    tagline: "In-the-moment rescue",
    icon: <ModeIcon />,
    detail: "Use this when you're already inside a difficult state — overwhelm, freeze, anxiety, spiral, anger, or shutdown. Rthmic interrupts the pattern quickly, acknowledges exactly where you are, and guides you back to steady ground. It doesn't argue with how you feel. It meets you there.",
    guidance: "Describe exactly what you're feeling right now. Don't soften it — the more honestly you name the state, the better the song can meet you there.",
    priming: {
      headline: "Say exactly what you're feeling.",
      subheadline: "Right now. Don't soften it.",
      instructions: [
        "Name the state you're in. Overwhelmed, frozen, spiralling, angry, ashamed, exhausted — say the word. Describe what it feels like in your body and your head.",
        "You don't need to explain it or justify it. You don't need to figure out why. Just describe what's happening, as honestly as you can.",
        "The more precisely you name the state, the more precisely Rthmic can interrupt it.",
      ],
      footnote: "This doesn't need to take long. Even 30 seconds of honest description is enough. Rthmic will meet you exactly where you are.",
    },
  },
  {
    slug: "movement",
    label: "Movement",
    tagline: "Cut-through via rhythmic repetition",
    icon: <MovementIcon />,
    detail: "Use this when you're stuck — not in emotional crisis, but in friction. The work isn't moving. You keep not starting, or you start and stall. Rthmic uses a steady rhythmic loop to carry you through the resistance. The groove does the work that willpower can't.",
    guidance: "Describe what you're trying to do and what's blocking you. Name the specific task or work — what keeps not starting, or where you keep stalling.",
    priming: {
      headline: "Name the thing you're not doing.",
      subheadline: "And what's getting in the way.",
      instructions: [
        "Describe the task, project, or piece of work that needs to move. Be specific — what exactly is it? What does actually doing it look like?",
        "Then describe the resistance. Is it the start? A particular part? The sheer weight of it? The anxiety underneath the avoidance?",
        "Rthmic works best when it knows exactly what it's helping you move through — the groove is built around your specific friction.",
      ],
      footnote: "Most people speak for 1–2 minutes. You don't need a therapist's insight — just a clear description of what's stuck and what doing it looks like.",
    },
  },
  {
    slug: "journal",
    label: "Journal",
    tagline: "Speak your day. Keep it as a Rthm.",
    icon: <JournalIcon />,
    detail: "Use this at the end of a day — or any time you want to capture a moment before it disappears. Speak what happened, how it felt, the small things you might forget. Rthmic turns it into a song you can keep. Play it back in six months and remember exactly what today felt like.",
    guidance: "Just talk. What happened today? Who did you speak to? What surprised you, frustrated you, made you laugh, or sat with you longer than expected? The mundane details are often the most valuable — those are what memory loses first.",
    priming: {
      headline: "Speak your day.",
      subheadline: "The small details are the ones worth keeping.",
      instructions: [
        "Talk through the day — events, conversations, moments. What happened? Who said something that stayed with you? What took longer than expected? What came out of nowhere?",
        "Say how it actually felt. Not the polished version. Tired, relieved, quietly proud, frustrated, anxious about tomorrow, unexpectedly good. Emotional contradictions are fine — you don't need to resolve them.",
        "Say the things you think you might forget. The small observation. The thing someone said at lunch. The moment you almost didn't notice. Those are exactly what this is for.",
      ],
      footnote: "No structure needed. Just talk until the day feels like it's somewhere safe. These details may seem small now — but they're what makes the song feel real when you come back to it later.",
    },
  },
  {
    slug: "epiphany",
    label: "Epiphany",
    tagline: "Capture the idea before it slips",
    icon: <EpiphanyIcon />,
    detail: "Use this when an idea, insight, or realisation just arrived and you don't want to lose it. Rthmic crystallises the thought in song form — the shape of it, what it changes, why it matters. The song becomes a container for the exact moment of understanding, so you can return to it with full fidelity.",
    guidance: "Describe the idea as clearly as you can — what you realised, what triggered it, what it changes. Say the version that surprised you, not the safe summary. The raw form of the thought is the most valuable input.",
    priming: {
      headline: "Say the idea before it softens.",
      subheadline: "The version that just arrived — not the tidied one.",
      instructions: [
        "Describe the realisation, insight, or idea as precisely as you can right now. What did you just understand? What clicked? What's the thing you're afraid will blur if you don't catch it?",
        "Say what it changes. What did you think before that you no longer think? What does this now make possible that wasn't possible before?",
        "Include what triggered it if you can — sometimes the context is part of the idea. And say it in your own language, not polished language. Rthmic works best with the raw version.",
      ],
      footnote: "Speak while the clarity is still sharp. Even 30 seconds is enough to lock in the essence. The song will hold the idea in the exact form it arrived — not the revised version.",
    },
  },
  {
    slug: "explain",
    label: "Explain",
    tagline: "Get a complex idea to finally click for you",
    icon: <ExplainIcon />,
    advanced: true,
    detail: "Use this when something isn't landing for you — a concept, a system, a principle, a framework. You've read about it, heard about it, maybe even tried to use it, but it hasn't fully clicked. RTHMIC builds a song structured around the idea itself: what it is, how it works, where it usually trips people up, and the moment it finally makes sense. You finish and think: I get it now.",
    guidance: "Describe the thing you want to understand. Say what you already know, where it stops making sense, and what would help it land. The more honestly you describe your current confusion, the better RTHMIC can target exactly where the gap is.",
    priming: {
      headline: "What do you want to finally understand?",
      subheadline: "Describe where it's not clicking yet.",
      instructions: [
        "Name the concept, idea, or thing you want explained. Say what you already understand about it — even if that's not much.",
        "Tell RTHMIC where it stops making sense. The exact point of confusion is the most useful thing you can give it. Don't skip past that part.",
        "If there's a specific angle you've tried before that didn't work — a book, a talk, someone's explanation — mention it. RTHMIC will come at it differently.",
      ],
      footnote: "You don't need to already understand it to describe it. That's the whole point. Just say what you know, what's fuzzy, and what you wish you got. RTHMIC builds the bridge from there.",
    },
  },
  {
    slug: "booksummary",
    label: "Book Summary",
    tagline: "The one big idea from a nonfiction book",
    icon: <BookSummaryIcon />,
    advanced: true,
    detail: "Use this when you want to understand — or share — the core concept from a popular nonfiction book. RTHMIC builds a song around the book's ONE big idea: the premise, how it works, what most people miss, and why it matters. Works for books you've read, books you want to understand, or ideas you want to pass on. Works best for 'one big idea' books — Atomic Habits, Sapiens, Thinking Fast and Slow, and their kind.",
    guidance: "Just name the book. RTHMIC knows the core idea. If you want the song to focus on a particular aspect — a chapter, a concept, how it applies to your life — say that too. The more specific you are, the more personal the song becomes.",
    priming: {
      headline: "Which book?",
      subheadline: "Name it. RTHMIC knows the idea.",
      instructions: [
        "Say the book title. That's the main thing. RTHMIC will identify the central concept and build the song around it.",
        "If you want it to focus on a specific part of the book — a particular concept, chapter, or framework — say that.",
        "If you want the song to connect the idea to something specific in your life or work, describe that too. It makes the song feel personal rather than generic.",
      ],
      footnote: "Works best with 'one big idea' nonfiction — the kind where the title becomes shorthand for a whole way of thinking. Atomic Habits, Sapiens, Deep Work, Thinking Fast and Slow, The Power of Habit, and anything like them.",
    },
  },
];

// ─── Subcategory groupings for "For you in the moment" ────────────────────────

const FOR_YOU_SUBCATEGORIES = [
  { label: "Rthms that Unlock • Mode • Movement • Explain",           slugs: ["mode", "movement", "explain"] },
  { label: "Rthms that Prime • Mindset",                              slugs: ["mindset"] },
  { label: "Rthms that Preserve • Journal • Epiphany",                slugs: ["journal", "epiphany"] },
  { label: "Rthms that Install • Memory • Book Summary",              slugs: ["memory", "booksummary"] },
];

// Menus pillar is accessible via /structure — excluded from the speak catalog
const FOR_YOU_PILLARS = PILLARS.filter((p) => p.slug !== "menus");

const CF_CUSTOMER = "customer-8nptfx7buiwn0mw3.cloudflarestream.com";

function cfThumb(id: string) { return `https://${CF_CUSTOMER}/${id}/thumbnails/thumbnail.jpg`; }
function cfHls(id: string)   { return `https://${CF_CUSTOMER}/${id}/manifest/video.m3u8`; }

const CF_IDS: Record<string, string> = {
  default:  "2e1d19d0dc33f42e7031bf59e9d1f586",
  movement: "ffa96f93e7048b669defa6cc27aba93a",
  mode:     "d56a1fa7c5f67801269d123a7c8655d5",
  mindset:  "74617a6612c0b3f71125e948496281bf",
};

const ALL_PILLAR_SLUGS = [...FOR_YOU_PILLARS.map((p) => p.slug), "auto"];

const PILLAR_IMAGES: Record<string, string> = Object.fromEntries(
  ALL_PILLAR_SLUGS.map((s) => [s, cfThumb(CF_IDS[s] ?? CF_IDS.default)])
);
const PILLAR_VIDEOS: Record<string, string> = Object.fromEntries(
  ALL_PILLAR_SLUGS.map((s) => [s, cfHls(CF_IDS[s] ?? CF_IDS.default)])
);

const PILLAR_GRID = [
  ...FOR_YOU_PILLARS.map((p) => ({
    slug: p.slug,
    label: p.label,
    icon: p.icon ?? null,
    image: PILLAR_IMAGES[p.slug] ?? null,
    video: PILLAR_VIDEOS[p.slug] ?? null,
  })),
  { slug: "auto", label: "Surprise me", icon: null, image: PILLAR_IMAGES["auto"] ?? null, video: PILLAR_VIDEOS["auto"] ?? null },
];

// ─── The Vault — coming-soon reflective pillars ───────────────────────────────

const VAULT_PILLARS: PillarDefinition[] = [
  {
    slug: "timecapsule",
    label: "Time Capsule",
    tagline: "A message to your future self",
    icon: <TimeCapsuleIcon />,
    detail: "Record something for the version of you that exists in a week, a month, or a year. What's true right now? What do you hope changes? What do you never want to forget? RTHMIC turns it into a song — a sealed moment you can open later.",
    guidance: "Speak to your future self. Say what's true right now, what you're hoping for, and what you want them to remember. Pick a timeframe if you know it.",
    comingSoon: true,
    priming: {
      headline: "What do you want your future self to know?",
      subheadline: "Speak to the version of you that's a week, a month, or a year away.",
      instructions: [],
      footnote: "",
    },
  },
  {
    slug: "whatmattered",
    label: "What Mattered",
    tagline: "The good things you noticed today",
    icon: <WhatMatteredIcon />,
    detail: "A daily practice of noticing — the small things that went right, the moments worth holding. Not forced positivity. Just honesty about what was actually good. RTHMIC turns it into a song you can return to.",
    guidance: "Speak the good things from today. They don't need to be big. The point is noticing them.",
    comingSoon: true,
    priming: {
      headline: "What was good today?",
      subheadline: "Even if today was hard — what was worth noticing?",
      instructions: [],
      footnote: "",
    },
  },
];

// ─── ADHD-specific pillars — hidden unless adhdMode is enabled ────────────────

const ADHD_PILLARS: PillarDefinition[] = [
  {
    slug: "rsd",
    label: "Rejection Spike",
    tagline: "When rejection hits harder than it should",
    icon: <RSDIcon />,
    adhdOnly: true,
    detail: "Rejection-sensitive dysphoria (RSD) is an intense emotional response to perceived rejection or failure — disproportionate to the trigger, fast to arrive, hard to reason away. This track meets you in the spike and walks you back down. It doesn't argue with the feeling. It anchors your body while your nervous system resets.",
    guidance: "Describe what happened and how it feels right now. Be specific — the moment that triggered it, the physical sensation, what your brain is telling you. The more honest you are about the spike, the better the track can meet you there.",
    priming: {
      headline: "Say exactly where the spike is.",
      subheadline: "Not what caused it — what it feels like right now.",
      instructions: [
        "Describe the moment that triggered it — what happened, what was said, what you read. Even if it seems small from the outside, say it.",
        "Describe what the feeling is doing to your body and your thoughts right now. The heaviness, the heat, the urgency, the shame. Don't soften it.",
        "You don't need to rationalise it or know it's disproportionate. Just say what is.",
      ],
      footnote: "This works best during or immediately after the spike — not once it has passed. Even 30 seconds of honest description is enough.",
    },
  },
  {
    slug: "timepanic",
    label: "Time Panic",
    tagline: "Already late, can't start, can't move",
    icon: <TimePanicIcon />,
    adhdOnly: true,
    detail: "Time blindness means the future doesn't feel real until it's already now — and then it floods in all at once. This is for the moment when you realise you're late, you're behind, you can't start, and your brain is stuck in a loop instead of moving. Rthmic interrupts the loop and gets you into motion.",
    guidance: "Say exactly where you are. Late for what? How long have you been stuck? What's the first thing that needs to happen? Say all of it, fast — don't curate.",
    priming: {
      headline: "Say it fast. What's happening right now?",
      subheadline: "Late for what? Stuck on what? What needs to happen first?",
      instructions: [
        "Name what you're late for or behind on. Be specific — the meeting, the email, the task, the person waiting.",
        "Say how long you've been frozen or avoiding. Even if it's been hours.",
        "Say the one first thing that would move you. Even if it feels impossible right now.",
      ],
      footnote: "Keep it under a minute. Rthmic will get you unstuck.",
    },
  },
  {
    slug: "launch",
    label: "Launch",
    tagline: "Leave the house. Start the thing. Go.",
    icon: <LaunchIcon />,
    adhdOnly: true,
    detail: "Task initiation — getting started on something you need to do — is one of the hardest things for an ADHD brain. Not because you don't want to. Because the gap between intending and starting can feel uncrossable. This track is a launch ramp. It builds momentum from nothing and carries you through the doorway.",
    guidance: "Say what you need to start or where you need to go. What's the first physical action? What's been stopping you? Say it honestly.",
    priming: {
      headline: "What do you need to start?",
      subheadline: "Or where do you need to go?",
      instructions: [
        "Name the thing — leave the house, open the document, make the call, start the task. Be specific.",
        "Say what the first physical action is. Not the whole task — just the first move.",
        "Say what's been stopping you, if you know. Overwhelm, avoidance, fear, inertia — just name it.",
      ],
      footnote: "This is short by design. The goal is motion, not reflection.",
    },
  },
];

// Bridge is a dedicated "for someone else" pillar — kept separate from the main list
// so it can be rendered with its own visual treatment.
const BRIDGE_PILLAR: PillarDefinition = {
  slug: "bridge",
  label: "Rthmic Bridge",
  tagline: "A Rthm to communicate and connect",
  detail: "Use this when you want to reach someone — to say something you find hard to say, to help them through something, to celebrate them, or simply to let them know they're on your mind. RTHMIC builds a complete song shaped around that person and what you want them to feel. You send the link; they can play it from anywhere.",
  guidance: "Tell RTHMIC who this is for and what you want them to feel or know. You don't need to be poetic — just honest. The more specific you are about the person and the moment, the more the song will feel like it was made for them.",
  priming: {
    headline: "Who is this for?",
    subheadline: "And what do you want them to feel?",
    instructions: [
      "Who is this for? Say their name, what they mean to you, and what's happening for them right now — or what you want to mark. It could be heavy: grief, distance, something you haven't been able to say. Or light: a birthday, a running joke, something that deserves its own song.",
      "Tell RTHMIC what you want them to feel when they press play. Seen? Celebrated? Held? Laughed at in a good way? The tone shapes everything — don't second-guess it.",
      "Specific details land better than general ones. The thing they always say, the trip you took, the phase they're going through, the joke only you two get — drop it all in. RTHMIC builds from exactly that.",
    ],
    footnote: "This doesn't need to be long. Even a minute of honest speaking gives RTHMIC everything it needs to build something real. You'll get a link to share directly with them.",
  },
};

// ─── Invite pillar ────────────────────────────────────────────────────────────
//
// Only visible to accounts in ADMIN_CODES. The code is read from the
// non-httpOnly rthmic_code cookie so no API call is needed on the client.
// This is visibility-only: the generation pipeline is gated server-side too.

const ADMIN_CODES = ["doug2026"]; // add more codes here as needed

function getSignedInCode(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)rthmic_code=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

const INVITE_PILLAR: PillarDefinition = {
  slug: "invite",
  label: "RTHMIC Invite",
  tagline: "A Rthm that IS the invitation",
  detail: "Use this to invite someone into RTHMIC. Describe who they are, how they work, and what you know about them — and RTHMIC will build a song that introduces itself through experience, not explanation. The song is the invite. Send them the link. They press play. They get it.",
  guidance: "Tell RTHMIC who you're inviting and why they'd love this. The more specific you are about the person — how they think, what they struggle with, what drives them — the more the song will feel like it was made specifically for them.",
  priming: {
    headline: "Who are you inviting?",
    subheadline: "Describe them. The song does the rest.",
    instructions: [
      "Start with who this person is — their name if you want, what they do, what they're like. How do they work? What do they struggle with? What drives them?",
      "Tell RTHMIC why you think RTHMIC would matter to them specifically. What gap in their life or work does it fill? What would change for them if they had this?",
      "Set the tone — is this a warm personal invitation from a friend? A professional nudge? Something playful? RTHMIC will match it.",
    ],
    footnote: "You don't need to explain what RTHMIC is — the song explains itself by being itself. Just give RTHMIC the person, and it will build the right door for them to walk through.",
  },
};

// ─── Pillar view ──────────────────────────────────────────────────────────────

function PillarView({ onSelect }: { onSelect: (slug: string, seed?: string) => void }) {
  const [openInfo, setOpenInfo] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [simpleMode, setSimpleMode] = useState(false);
  const [advancedPillars, setAdvancedPillars] = useState<string[]>(["memory", "booksummary", "explain", "mindset"]);
  const [forSomeoneElseOpen, setForSomeoneElseOpen] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [videoSlug, setVideoSlug] = useState<string | null>(null);
  const [videoVisible, setVideoVisible] = useState(false);

  const openVideo = (slug: string) => { setVideoSlug(slug); requestAnimationFrame(() => setVideoVisible(true)); };
  const closeVideo = () => { setVideoVisible(false); setTimeout(() => setVideoSlug(null), 260); };

  useEffect(() => {
    const code = getSignedInCode();
    setShowInvite(code !== null && ADMIN_CODES.includes(code));
    fetch("/api/settings").then(r => r.json()).then(s => {
      if (s.simpleMode) setSimpleMode(true);
      if (Array.isArray(s.advancedPillars)) setAdvancedPillars(s.advancedPillars);
    }).catch(() => {});
  }, []);

  const openModal = (slug: string) => { setOpenInfo(slug); requestAnimationFrame(() => setModalVisible(true)); };
  const closeModal = () => { setModalVisible(false); setTimeout(() => setOpenInfo(null), 220); };

  const allPillars = [...PILLARS, BRIDGE_PILLAR, INVITE_PILLAR, ...ADHD_PILLARS];
  const modalPillar = openInfo ? allPillars.find((p) => p.slug === openInfo) ?? null : null;

  return (
    <section className="flex-1 flex flex-col pb-6 overflow-y-auto">
      <RevealBlock delay={0}>
        <div className="flex flex-col gap-1.5 pt-2 pb-5">
          <p className="text-xl font-light text-white/70 leading-snug" style={{ fontFamily: "var(--font-display)" }}>
            What do you want to create?
          </p>
        </div>
      </RevealBlock>

      <div className="flex flex-col gap-2">
        {/* ── Pillar image grid — 3×3 ── */}
        <RevealBlock delay={0}>
          <div className="grid grid-cols-3 gap-1.5 pb-4">
            {PILLAR_GRID.map((p) => (
              <div
                key={p.slug}
                className="relative rounded-xl overflow-hidden"
                style={{ aspectRatio: "3/4", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
              >
                {/* Main tap area → create */}
                <button
                  onClick={() => onSelect(p.slug)}
                  className="absolute inset-0 touch-manipulation active:brightness-75 transition-all"
                  aria-label={`Create ${p.label}`}
                >
                  {p.image && (
                    <img src={p.image} alt={p.label} className="absolute inset-0 w-full h-full object-cover" />
                  )}
                  <div
                    className="absolute inset-0"
                    style={{ background: "linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.25) 55%, transparent 100%)" }}
                  />
                </button>

                {/* Icon + Label centered at bottom */}
                <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-1 pb-3 px-1 pointer-events-none">
                  {p.icon && <span className="text-white/70" style={{ transform: "scale(0.75)", transformOrigin: "center" }}>{p.icon}</span>}
                  {p.slug === "auto" && <span className="text-white/25 text-xl mb-0.5">?</span>}
                  <p className="text-[10px] font-semibold text-white/90 leading-tight tracking-wide text-center">{p.label}</p>
                </div>

              </div>
            ))}
          </div>
        </RevealBlock>

        {/* ── For Someone Else — collapsible, starts collapsed ── */}
        <RevealBlock delay={PILLARS.length * 28 + 10}>
          <button
            onClick={() => setForSomeoneElseOpen((v) => !v)}
            className="w-full flex items-center justify-between py-2.5 mt-2 touch-manipulation active:opacity-70 transition-opacity"
          >
            <div className="flex items-center gap-2.5">
              <span style={{ color: "rgba(120,160,255,0.65)" }}><ForSomeoneElseIcon /></span>
              <p className="text-sm font-medium tracking-wide" style={{ color: "rgba(140,175,255,0.92)" }}>For someone else</p>
            </div>
            <svg
              width="12" height="12" viewBox="0 0 12 12" fill="none"
              style={{
                color: "rgba(120,160,255,0.55)",
                transform: forSomeoneElseOpen ? "rotate(0deg)" : "rotate(-90deg)",
                transition: "transform 220ms ease",
                flexShrink: 0,
              }}
            >
              <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </RevealBlock>

        <div
          style={{
            display: "grid",
            gridTemplateRows: forSomeoneElseOpen ? "1fr" : "0fr",
            transition: "grid-template-rows 260ms ease",
          }}
        >
          <div style={{ overflow: "hidden" }}>
            <div className="flex flex-col gap-2 pb-1">
              {/* Bridge */}
              {(() => {
                const p = BRIDGE_PILLAR;
                return (
                  <div className="rounded-2xl overflow-hidden"
                    style={{ border: "1px solid rgba(201,165,90,0.18)", background: "rgba(201,165,90,0.03)" }}>
                    <div className="flex items-stretch">
                      <button
                        onClick={() => openModal(p.slug)}
                        className="flex-1 flex items-center gap-4 pl-5 pr-3 py-4 text-left touch-manipulation active:bg-white/[0.05] transition-colors"
                      >
                        <span className="flex-shrink-0" style={{ color: "rgba(201,165,90,0.65)" }} aria-hidden>
                          <BridgeIcon />
                        </span>
                        <div className="min-w-0">
                          <p className="text-base font-semibold tracking-wide" style={{ color: "rgba(201,165,90,0.85)" }}>{p.label}</p>
                          <p className="text-xs text-white/45 mt-0.5">{p.tagline}</p>
                        </div>
                      </button>
                      <div className="w-px self-stretch my-3" style={{ background: "rgba(201,165,90,0.12)" }} />
                      <button
                        onClick={() => openModal(p.slug)}
                        className="flex items-center justify-center w-14 touch-manipulation active:bg-white/[0.04] transition-colors"
                        aria-label="Learn more"
                      >
                        <InfoIcon gold />
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Invite — admin only */}
              {showInvite && (() => {
                const p = INVITE_PILLAR;
                return (
                  <div className="rounded-2xl overflow-hidden"
                    style={{ border: "1px solid rgba(120,160,255,0.22)", background: "rgba(120,160,255,0.03)" }}>
                    <div className="flex items-stretch">
                      <button
                        onClick={() => openModal(p.slug)}
                        className="flex-1 flex items-center gap-4 pl-5 pr-3 py-4 text-left touch-manipulation active:bg-white/[0.05] transition-colors"
                      >
                        <span className="flex-shrink-0" style={{ color: "rgba(120,160,255,0.7)" }} aria-hidden>
                          <InviteIcon />
                        </span>
                        <div className="min-w-0">
                          <p className="text-base font-semibold tracking-wide" style={{ color: "rgba(140,175,255,0.9)" }}>{p.label}</p>
                          <p className="text-xs text-white/45 mt-0.5">{p.tagline}</p>
                        </div>
                      </button>
                      <div className="w-px self-stretch my-3" style={{ background: "rgba(120,160,255,0.12)" }} />
                      <button
                        onClick={() => openModal(p.slug)}
                        className="flex items-center justify-center w-14 touch-manipulation active:bg-white/[0.04] transition-colors"
                        aria-label="Learn more"
                      >
                        <InfoIcon />
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>


        {/* Let RTHMIC decide */}
        <RevealBlock delay={PILLARS.length * 28 + 38}>
          <div className="mt-4">
            <button
              onClick={() => onSelect("auto")}
              className="w-full py-4 rounded-2xl text-sm font-medium tracking-wide text-center touch-manipulation active:scale-[0.98] transition-all"
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px dashed rgba(255,255,255,0.15)",
                color: "rgba(255,255,255,0.50)",
              }}
            >
              Let RTHMIC decide
            </button>
            <p className="text-center text-[10px] text-white/35 mt-2 tracking-widest uppercase">Beta</p>
          </div>
        </RevealBlock>

        {/* ── The Vault — coming soon ── */}
        <RevealBlock delay={PILLARS.length * 28 + 66}>
          <div className="mt-2 rounded-2xl border overflow-hidden opacity-50"
            style={{ borderColor: "rgba(160,130,220,0.18)", background: "rgba(160,130,220,0.04)" }}>
            <div className="px-5 pt-4 pb-3 flex items-center gap-2.5">
              <span style={{ color: "rgba(160,130,220,0.65)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="8" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.7" />
                  <path d="M7 8V6a5 5 0 0 1 10 0v2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  <circle cx="12" cy="14.5" r="1.5" fill="currentColor" />
                </svg>
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium tracking-wide" style={{ color: "rgba(180,150,240,0.85)" }}>The Vault</p>
                <p className="text-[11px] mt-0.5" style={{ color: "rgba(160,130,220,0.5)" }}>Rthms to return to — coming soon</p>
              </div>
              <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full flex-shrink-0"
                style={{ background: "rgba(160,130,220,0.08)", color: "rgba(160,130,220,0.5)", border: "1px solid rgba(160,130,220,0.15)" }}>
                Soon
              </span>
            </div>
            <div className="flex flex-col gap-1.5 px-5 pb-4">
              {VAULT_PILLARS.map((p) => (
                <div key={p.slug} className="flex items-center gap-3 py-2 border-t" style={{ borderColor: "rgba(160,130,220,0.08)" }}>
                  {p.icon && <span className="flex-shrink-0" style={{ color: "rgba(160,130,220,0.4)" }}>{p.icon}</span>}
                  <div className="min-w-0">
                    <p className="text-sm font-medium" style={{ color: "rgba(180,150,240,0.5)" }}>{p.label}</p>
                    <p className="text-[11px] text-white/25 mt-0.5">{p.tagline}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </RevealBlock>

      </div>

      {/* ── Pillar info modal ─────────────────────────────────────────────────── */}
      {openInfo && modalPillar && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-5"
          style={{
            background: `rgba(6,13,26,${modalVisible ? "0.85" : "0"})`,
            transition: "background 220ms ease",
          }}
          onClick={closeModal}
        >
          <div
            className="w-full max-w-sm rounded-2xl flex flex-col gap-4 p-6 relative"
            style={{
              background: "rgba(12,22,42,0.97)",
              border: modalPillar.slug === "bridge"
                ? "1px solid rgba(201,165,90,0.25)"
                : modalPillar.slug === "invite"
                ? "1px solid rgba(120,160,255,0.25)"
                : "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
              opacity: modalVisible ? 1 : 0,
              transform: modalVisible ? "translateY(0)" : "translateY(16px)",
              transition: "opacity 220ms ease, transform 220ms ease",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close */}
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-white/40 hover:text-white/70 transition-colors touch-manipulation"
              style={{ background: "rgba(255,255,255,0.06)" }}
            >
              ✕
            </button>

            {/* Header */}
            {(() => {
              const isGold  = modalPillar.slug === "bridge" || modalPillar.slug === "invite";
              const isBlue  = modalPillar.slug === "invite";
              const accent  = isBlue ? "rgba(140,175,255," : "rgba(201,165,90,";
              const sectionLabel =
                modalPillar.slug === "bridge" || modalPillar.slug === "invite"
                  ? "For someone else"
                  : "For You in the Moment";
              const ctaLabel =
                modalPillar.slug === "bridge" ? "Create a Bridge →"
                : modalPillar.slug === "invite" ? "Create an Invite →"
                : `Select ${modalPillar.label} →`;
              return (
                <>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.3em] mb-1"
                      style={{ color: isGold ? `${accent}0.6)` : "rgba(255,255,255,0.3)" }}>
                      {sectionLabel}
                    </p>
                    <p className="text-lg font-semibold"
                      style={{ color: isBlue ? "rgba(160,190,255,0.95)" : isGold ? "#c9a55a" : "white" }}>
                      {modalPillar.label}
                    </p>
                    <p className="text-xs text-white/40 mt-0.5">{modalPillar.tagline}</p>
                  </div>

                  {/* Detail */}
                  <p className="text-sm text-white/55 leading-relaxed">{modalPillar.detail}</p>

                  {/* How to speak */}
                  <div className="rounded-xl px-4 py-3"
                    style={{
                      background: isBlue ? "rgba(120,160,255,0.05)" : "rgba(201,165,90,0.05)",
                      border: isBlue ? "1px solid rgba(120,160,255,0.12)" : "1px solid rgba(201,165,90,0.12)",
                    }}>
                    <p className="text-[10px] text-white/40 uppercase tracking-[0.2em] mb-1.5">How to speak</p>
                    <p className="text-xs text-white/45 leading-relaxed">{modalPillar.guidance}</p>
                  </div>

                  {/* CTA */}
                  <button
                    onClick={() => { closeModal(); setTimeout(() => onSelect(modalPillar.slug), 230); }}
                    className="w-full py-4 rounded-xl text-sm font-semibold tracking-wide touch-manipulation active:scale-[0.98] transition-all"
                    style={isBlue
                      ? { background: "rgba(120,160,255,0.1)", border: "1px solid rgba(120,160,255,0.35)", color: "rgba(160,195,255,0.95)" }
                      : { background: "rgba(201,165,90,0.12)", border: "1px solid rgba(201,165,90,0.35)", color: "#c9a55a" }
                    }
                  >
                    {ctaLabel}
                  </button>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Priming ──────────────────────────────────────────────────────────────────

function HlsVideo({ src, className, style, controls = true, autoPlay = false, onEnded }: {
  src: string;
  className?: string;
  style?: React.CSSProperties;
  controls?: boolean;
  autoPlay?: boolean;
  onEnded?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      if (autoPlay) video.play().catch(() => {});
      return;
    }

    let hlsInstance: InstanceType<typeof import("hls.js").default> | null = null;
    import("hls.js").then(({ default: Hls }) => {
      if (!Hls.isSupported() || !videoRef.current) return;
      hlsInstance = new Hls();
      hlsInstance.loadSource(src);
      hlsInstance.attachMedia(videoRef.current);
      if (autoPlay) {
        hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
          videoRef.current?.play().catch(() => {});
        });
      }
    });

    return () => { hlsInstance?.destroy(); };
  }, [src, autoPlay]);

  return (
    <video
      ref={videoRef}
      playsInline
      autoPlay={autoPlay}
      controls={controls}
      onEnded={onEnded}
      className={className}
      style={style}
    />
  );
}

function PrimingView({ pillar, onReady }: { pillar: string | null; onReady: (seed?: string, skipSpeak?: boolean) => void }) {
  const pillarDef = PILLARS.find((p) => p.slug === pillar)
    ?? (pillar === "bridge" ? BRIDGE_PILLAR : null)
    ?? (pillar === "invite" ? INVITE_PILLAR : null);
  const p = pillarDef?.priming;
  const instructions = p?.instructions ?? [
    "Speak about your challenge — your hopes, what you think is stopping you, or what you want to learn.",
    "Take your time. You don't need to know what you're going to say to begin.",
  ];

  const hasSuggestions = pillar === "explain" || pillar === "booksummary";
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(hasSuggestions);
  const [shuffling, setShuffling] = useState(false);

  useEffect(() => {
    if (!hasSuggestions) return;
    let cancelled = false;
    fetchSuggestions(pillar!).then((s) => {
      if (!cancelled) { setSuggestions(s); setSuggestionsLoading(false); }
    });
    return () => { cancelled = true; };
  }, [pillar, hasSuggestions]);

  async function handleShuffle() {
    setShuffling(true);
    const s = await fetchSuggestions(pillar!);
    setSuggestions(s);
    setShuffling(false);
  }

  const videoSrc = pillar ? PILLAR_VIDEOS[pillar] ?? null : null;
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxVisible, setLightboxVisible] = useState(false);

  const openLightbox  = () => { setLightboxOpen(true);  requestAnimationFrame(() => setLightboxVisible(true)); };
  const closeLightbox = () => { setLightboxVisible(false); setTimeout(() => setLightboxOpen(false), 300); };

  return (
    <>
      {/* ── Video lightbox ── */}
      {lightboxOpen && videoSrc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-5"
          style={{
            background: `rgba(0,0,0,${lightboxVisible ? 0.88 : 0})`,
            transition: "background 300ms ease",
          }}
          onClick={closeLightbox}
        >
          <div
            className="w-full max-w-sm rounded-2xl overflow-hidden"
            style={{
              opacity: lightboxVisible ? 1 : 0,
              transform: lightboxVisible ? "scale(1) translateY(0)" : "scale(0.94) translateY(16px)",
              transition: "opacity 300ms ease, transform 300ms ease",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <HlsVideo
              src={videoSrc}
              controls={false}
              autoPlay
              onEnded={closeLightbox}
              className="w-full"
              style={{ display: "block", maxHeight: "70vh", objectFit: "cover" }}
            />
          </div>
        </div>
      )}

    <section className="flex-1 flex flex-col justify-between pb-6">
      <div className="flex-1 overflow-y-auto flex flex-col gap-4 pt-1 pb-4">

        {/* Pillar badge */}
        {pillarDef && (
          <RevealBlock delay={0}>
            <span
              className="text-[10px] px-2.5 py-1 rounded-full uppercase tracking-widest font-medium"
              style={{ background: "rgba(201,165,90,0.12)", color: "#c9a55a", border: "1px solid rgba(201,165,90,0.25)" }}
            >
              {pillarDef.label}
            </span>
          </RevealBlock>
        )}

        <div className="flex flex-col gap-3">
          <RevealBlock delay={30}>
            <p className="text-[10px] text-white/40 uppercase tracking-[0.3em]">Before you speak</p>
          </RevealBlock>
          <RevealBlock delay={60}>
            <h2 className="text-2xl font-light text-white leading-snug" style={{ fontFamily: "var(--font-display)" }}>
              {p?.headline ?? "Be completely open."}
            </h2>
          </RevealBlock>
          <RevealBlock delay={100}>
            <p className="text-base text-white/60 leading-relaxed">
              {p?.subheadline ?? "The more honest you are, the better the result."}
            </p>
          </RevealBlock>
        </div>

        {/* Full-width video thumbnail replacing instructions */}
        {videoSrc && pillar && PILLAR_IMAGES[pillar] && (
          <RevealBlock delay={145}>
            <button
              onClick={openLightbox}
              className="relative w-full rounded-2xl overflow-hidden touch-manipulation active:brightness-75 transition-all"
              style={{ aspectRatio: "4/3", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <img src={PILLAR_IMAGES[pillar]} alt="Preview" className="w-full h-full object-cover" style={{ objectPosition: "center 20%" }} />
              <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.3)" }}>
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.35)" }}
                >
                  <svg width="14" height="16" viewBox="0 0 14 16" fill="none">
                    <path d="M2 1.5L12.5 8L2 14.5V1.5Z" fill="white" />
                  </svg>
                </div>
              </div>
              {/* Info label — top center */}
              <div className="absolute top-3 inset-x-0 flex justify-center pointer-events-none">
                <span className="text-[10px] font-medium tracking-wide" style={{ color: "rgba(255,255,255,0.6)" }}>How to use</span>
              </div>
            </button>
          </RevealBlock>
        )}

        {hasSuggestions && (
          <RevealBlock delay={180 + instructions.length * 45}>
            <div className="flex flex-col gap-3 border-t border-white/[0.06] pt-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-white/35 uppercase tracking-[0.25em]">
                  {pillar === "booksummary" ? "Or try a book" : "Or try a concept"}
                </p>
                <button
                  onClick={handleShuffle}
                  disabled={shuffling || suggestionsLoading}
                  className="text-[10px] text-white/30 uppercase tracking-widest touch-manipulation active:text-white/60 transition-colors disabled:opacity-40"
                >
                  {shuffling ? "…" : "Shuffle"}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {suggestionsLoading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-7 rounded-full animate-pulse"
                        style={{ width: `${64 + (i % 3) * 24}px`, background: "rgba(255,255,255,0.06)" }}
                      />
                    ))
                  : suggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => onReady(s, true)}
                        className="text-xs px-3 py-1.5 rounded-full touch-manipulation transition-all active:scale-95"
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}
                      >
                        {s}
                      </button>
                    ))
                }
              </div>
            </div>
          </RevealBlock>
        )}

        <RevealBlock delay={180 + instructions.length * 45 + (hasSuggestions ? 45 : 0)}>
          <p className="text-xs text-white/40 leading-relaxed border-t border-white/[0.06] pt-4">
            {p?.footnote ?? "Most people speak for 1–3 minutes. After 5 minutes Rthmic will capture what you've said — you'll have the option to add more if it feels right."}
          </p>
        </RevealBlock>
      </div>

      <RevealBlock delay={180 + instructions.length * 45 + (hasSuggestions ? 95 : 50)} className="flex-shrink-0">
        <button
          onClick={() => onReady()}
          className="w-full py-5 rounded-2xl text-sm font-semibold tracking-wide active:scale-[0.98] transition-all touch-manipulation"
          style={{ background: "rgba(201,165,90,0.1)", border: "1px solid rgba(201,165,90,0.45)", color: "#c9a55a" }}
        >
          Talk to Rthmic
        </button>
      </RevealBlock>
    </section>
    </>
  );
}

// ─── Idle ─────────────────────────────────────────────────────────────────────

function IdleView({ onRecord, errorMsg, selectedPillar }: { onRecord: () => void; errorMsg: string; selectedPillar: string | null }) {
  const [micRequesting, setMicRequesting] = useState(false);

  const idleHeading  = (selectedPillar && PILLAR_PROMPT[selectedPillar])   ?? "Speak freely";
  const idleSubtitle = (selectedPillar && PILLAR_SUBTITLE[selectedPillar]) ?? "Two Rthms will be built for you.";

  return (
    <section className="flex-1 flex flex-col items-center justify-center pb-24 gap-10">
      <RevealBlock delay={0}>
        <div className="text-center">
          <h2 className="text-2xl font-light tracking-wide text-white leading-snug" style={{ fontFamily: "var(--font-display)" }}>{idleHeading}</h2>
          <p className="text-sm text-white/50 mt-2">{idleSubtitle}</p>
        </div>
      </RevealBlock>

      <RevealBlock delay={60}>
        <div className="relative flex items-center justify-center">
          <style>{`
            @keyframes rim-spin {
              from { transform: rotate(0deg); }
              to   { transform: rotate(360deg); }
            }
          `}</style>
          {!micRequesting && (
            <span
              className="absolute w-28 h-28 rounded-full pointer-events-none"
              style={{
                background: "conic-gradient(from 0deg, transparent 0%, transparent 74%, rgba(255,255,255,0.08) 78%, rgba(255,255,255,0.55) 83%, rgba(255,255,255,0.8) 86%, rgba(255,255,255,0.55) 89%, rgba(255,255,255,0.08) 93%, transparent 96%, transparent 100%)",
                WebkitMaskImage: "radial-gradient(circle, transparent 51px, black 53px)",
                maskImage: "radial-gradient(circle, transparent 51px, black 53px)",
                animation: "rim-spin 6s linear infinite",
              }}
            />
          )}
          <button
            onClick={() => { setMicRequesting(true); onRecord(); }}
            disabled={micRequesting}
            className="w-28 h-28 rounded-full flex items-center justify-center active:scale-[0.96] transition-all touch-manipulation relative z-10"
            style={{
              background: micRequesting ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.07)",
              border: micRequesting ? "1px solid rgba(201,165,90,0.35)" : "1px solid rgba(255,255,255,0.12)",
            }}
            aria-label="Start recording"
          >
            {micRequesting ? <MicRequestingIcon /> : <MicIcon />}
          </button>
        </div>
      </RevealBlock>

      {micRequesting && (
        <p className="text-xs text-white/35 tracking-wide animate-pulse">Requesting microphone…</p>
      )}

      {errorMsg && (
        <p className="text-xs text-white/50 text-center max-w-xs">{errorMsg}</p>
      )}
    </section>
  );
}

// ─── Recording ────────────────────────────────────────────────────────────────

function RecordingView({
  orbRef,
  onStop,
  selectedPillar,
}: {
  orbRef: React.RefObject<HTMLDivElement | null>;
  onStop: () => void;
  seconds: number;
  maxSeconds: number;
  selectedPillar?: string | null;
}) {
  const heading = (selectedPillar && PILLAR_PROMPT[selectedPillar]) ?? "Speak freely";
  return (
    <section
      className="flex-1 flex flex-col items-center justify-center pb-24 gap-10"
      onClick={onStop}
    >
      <div className="text-center pointer-events-none">
        <h2 className="text-2xl font-light tracking-wide text-white" style={{ fontFamily: "var(--font-display)" }}>{heading}</h2>
        <p className="text-sm text-white/50 mt-2">Tap to stop</p>
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

const UNDERSTANDING_COPY: Record<string, { heading: string; stages: string[] }> = {
  booksummary: {
    heading: "Absorbing the ideas",
    stages: ["Transcribing…", "Identifying the book…", "Extracting the core idea…", "Almost there…"],
  },
  explain: {
    heading: "Taking it in",
    stages: ["Transcribing…", "Unpacking the concept…", "Finding the best angle…", "Almost there…"],
  },
  memory: {
    heading: "Locking it in",
    stages: ["Transcribing…", "Taking in what to remember…", "Building the anchor…", "Almost there…"],
  },
  mindset: {
    heading: "Reading your mindset",
    stages: ["Transcribing…", "Reading your mindset…", "Shaping the shift…", "Almost there…"],
  },
  mode: {
    heading: "Reading where you're at",
    stages: ["Transcribing…", "Reading where you're at…", "Setting the tone…", "Almost there…"],
  },
  movement: {
    heading: "Reading your energy",
    stages: ["Transcribing…", "Reading your energy…", "Building the movement…", "Almost there…"],
  },
  journal: {
    heading: "Reading your moment",
    stages: ["Transcribing…", "Reading your moment…", "Capturing it in sound…", "Almost there…"],
  },
  epiphany: {
    heading: "Taking in your insight",
    stages: ["Transcribing…", "Taking in your insight…", "Crystallising it…", "Almost there…"],
  },
};

function UnderstandingView({ pillar }: { pillar?: string | null }) {
  const key = (pillar ?? "").toLowerCase();
  const copy = UNDERSTANDING_COPY[key] ?? {
    heading: "Understanding you",
    stages: ["Transcribing…", "Reading your state…", "Shaping your Rthm…", "Almost there…"],
  };
  const [stageIdx, setStageIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setStageIdx((i) => (i + 1) % copy.stages.length);
    }, 2800);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="flex-1 flex flex-col items-center justify-center pb-24 gap-8">
      <RevealBlock delay={0}>
        <div className="flex flex-col items-center gap-8 w-full">
          <SpectrumVisualiser />
          <div className="text-center flex flex-col items-center gap-3 max-w-xs">
            <h2 className="text-xl font-light tracking-wide text-white" style={{ fontFamily: "var(--font-display)" }}>{copy.heading}</h2>
            <p
              key={stageIdx}
              className="text-sm text-white/45"
              style={{ minHeight: "1.25rem", animation: "fade-up 0.4s cubic-bezier(0.16,1,0.3,1) forwards" }}
            >
              {copy.stages[stageIdx]}
            </p>
            <p className="text-xs text-white/25 mt-1">This usually takes 10–20 seconds.</p>
          </div>
          <p className="text-[11px] text-white/25 tracking-widest uppercase text-center">
            Next · Choose your style
          </p>
        </div>
      </RevealBlock>
    </section>
  );
}

// ─── Confirming ───────────────────────────────────────────────────────────────

function ConfirmingView({
  result,
  onAddMore,
  onProceed,
  onDiscard,
  onReanalyse,
  errorMsg,
  wasAutoStopped,
}: {
  result: UnderstandResult;
  onAddMore: () => void;
  onProceed: () => void;
  onDiscard: () => void;
  onReanalyse?: () => void;
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
    const TOTAL_MS = 1700;
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
          <RevealBlock delay={0}>
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.05] px-4 py-3 flex gap-3 items-start">
              <span className="text-amber-400/60 text-sm flex-shrink-0 mt-0.5">⏱</span>
              <div>
                <p className="text-sm text-amber-400/70 leading-snug">Recording captured at 5 minutes</p>
                <p className="text-xs text-amber-400/40 mt-1 leading-relaxed">We captured everything you said. If there&apos;s more you want to add, tap <strong>Add more</strong> below.</p>
              </div>
            </div>
          </RevealBlock>
        )}
        <RevealBlock delay={0}>
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-light tracking-wide text-white" style={{ fontFamily: "var(--font-display)" }}>Is this right?</h2>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-white/35 border border-white/[0.10] rounded-full px-2.5 py-0.5 uppercase tracking-widest">
                {result.pillar}
              </span>
              <span className="text-[10px] text-white/35 border border-white/[0.10] rounded-full px-2.5 py-0.5 uppercase tracking-widest">
                {styleLabel}
              </span>
            </div>
          </div>
        </RevealBlock>

        <RevealBlock delay={60}>
          <div className="rounded-2xl border border-white/[0.09] bg-white/[0.03] px-5 py-5 flex flex-col gap-4">
            <AnimatedConfirmRow label="State"    words={stateWords}    visibleCount={stateVisible} />
            <AnimatedConfirmRow label="Intent"   words={intentWords}   visibleCount={intentVisible} />
            <AnimatedConfirmRow label="Friction" words={frictionWords} visibleCount={frictionVisible} />
          </div>
        </RevealBlock>

        {errorMsg && (
          <div className="flex flex-col items-center gap-3">
            <p className="text-xs text-red-400/50 text-center">{errorMsg}</p>
            {onReanalyse && (
              <button
                onClick={onReanalyse}
                className="text-xs underline underline-offset-2 touch-manipulation active:opacity-60 transition-opacity"
                style={{ color: "rgba(201,165,90,0.6)" }}
              >
                Re-analyse my prompt
              </button>
            )}
          </div>
        )}
      </div>

      {/* Always-visible action buttons */}
      <RevealBlock delay={100} className="flex-shrink-0">
        <div className="flex flex-col gap-3 pt-4 pb-10 border-t border-white/[0.05]">
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
            className="w-full py-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] text-white/40 text-sm font-medium tracking-wide active:scale-[0.98] transition-transform touch-manipulation"
          >
            Discard and start afresh
          </button>
        </div>
      </RevealBlock>
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
      <p className="text-[10px] text-white/40 uppercase tracking-[0.2em] mb-0.5">{label}</p>
      <p className="text-sm text-white/60 leading-relaxed">
        {words.map((word, i) => (
          <span
            key={i}
            style={{
              opacity: i < visibleCount ? 1 : 0,
              transition: "opacity 190ms ease",
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

// Helpers shared by GenreView and genre tile rendering
function sunoPromptFor(g: string): string {
  const idx = g.indexOf("|");
  return idx > 0 ? g.slice(idx + 1) : g;
}
function displayNameFor(g: string): string {
  const idx = g.indexOf("|");
  if (idx > 0) return g.slice(0, idx);
  const comma = g.indexOf(",");
  return comma > 0 ? g.slice(0, comma) : g.slice(0, 42);
}

function GenreView({
  understandResult,
  onGenerate,
  onDiscard,
}: {
  understandResult: UnderstandResult;
  onGenerate: (genre: string) => void;
  onDiscard: () => void;
}) {
  const [builtInGenres, setBuiltInGenres] = useState<string[]>([]);
  const [userGenres, setUserGenres]       = useState<string[]>([]);
  const [loading, setLoading]             = useState(true);
  const [recommendedIndex, setRecommendedIndex] = useState<number | null>(null);
  const [loadingRec, setLoadingRec]       = useState(false);
  // selectedIndex indexes into the combined list: [...builtInGenres, ...userGenres]
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // Custom style
  const [customStyle, setCustomStyle]       = useState("");
  const [customSelected, setCustomSelected] = useState(false);

  const selectPreset = (i: number) => { setSelectedIndex(i); setCustomSelected(false); };
  const selectCustom = () => { if (customStyle) { setCustomSelected(true); setSelectedIndex(null); } };

  // Save a custom style to the user's genre list (no-op if duplicate)
  const persistCustomStyle = (style: string) => {
    const trimmed = style.trim();
    if (!trimmed) return;
    const isDuplicate = userGenres.some(
      (g) => g === trimmed || sunoPromptFor(g).toLowerCase() === trimmed.toLowerCase()
    );
    if (isDuplicate) return;
    const updated = [...userGenres, trimmed];
    setUserGenres(updated);
    fetch("/api/genres", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ genres: updated }),
    }).catch(() => {});
  };

  useEffect(() => {
    fetch("/api/genres")
      .then((r) => r.json())
      .then((d) => {
        const bIn: string[] = Array.isArray(d.builtIn) ? d.builtIn : [];
        const usr: string[] = Array.isArray(d.user)    ? d.user    : [];
        setBuiltInGenres(bIn);
        setUserGenres(usr);
        setLoading(false);

        const allGenres = [...bIn, ...usr];
        if (allGenres.length === 0) return;

        setLoadingRec(true);
        fetch("/api/recommend-genre", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stateSummary: understandResult.stateSummary,
            style: understandResult.style,
            genres: allGenres,
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
      })
      .catch(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const allGenres = [...builtInGenres, ...userGenres];

  const selectedGenre = customSelected && customStyle
    ? customStyle
    : selectedIndex !== null ? sunoPromptFor(allGenres[selectedIndex] ?? "") : "";
  const canProceed = selectedGenre.length > 0;

  const selectedDisplay = customSelected && customStyle
    ? customStyle.split(",")[0].slice(0, 32)
    : selectedIndex !== null ? displayNameFor(allGenres[selectedIndex] ?? "").slice(0, 32) : "";
  const buildLabel = selectedDisplay
    ? `Build with ${selectedDisplay}${selectedDisplay.length >= 32 ? "…" : ""}`
    : "Select a style";

  const renderTile = (genre: string, globalIndex: number, stagger: number) => {
    const isSelected   = !customSelected && selectedIndex === globalIndex;
    const isRecommended = recommendedIndex === globalIndex;
    const label = displayNameFor(genre);
    return (
      <RevealBlock key={globalIndex} delay={stagger}>
        <button
          onClick={() => selectPreset(globalIndex)}
          className={`w-full text-left px-5 py-4 rounded-2xl border transition-all duration-150 active:scale-[0.98] touch-manipulation ${
            isSelected
              ? "border-[rgba(201,165,90,0.5)] bg-[rgba(201,165,90,0.08)]"
              : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <span className={`text-sm font-medium leading-snug ${isSelected ? "text-[#c9a55a]" : "text-white/70"}`}>
              {label}
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
      </RevealBlock>
    );
  };

  return (
    <section className="flex-1 flex flex-col pb-10 gap-5 overflow-y-auto">
      <RevealBlock delay={0} className="flex-shrink-0">
        <h2 className="text-2xl font-light text-white leading-snug" style={{ fontFamily: "var(--font-display)" }}>
          Choose your style
        </h2>
        <p className="text-sm text-white/50 mt-2 leading-relaxed">
          {loadingRec
            ? "Finding the best match for your state…"
            : recommendedIndex !== null
              ? "We've suggested one based on your state. You can override it."
              : "Select the style for your Rthm."}
        </p>
      </RevealBlock>

      {loading ? (
        <RevealBlock delay={40}>
          <div className="flex justify-center py-10">
            <div className="w-7 h-7 rounded-full border-2 border-white/15 border-t-white/55 animate-spin" />
          </div>
        </RevealBlock>
      ) : (
        <div className="flex flex-col gap-5">

          {/* ── RTHMIC Styles (built-in, permanent) ── */}
          {builtInGenres.length > 0 && (
            <div className="flex flex-col gap-2">
              <RevealBlock delay={20}>
                <p className="text-[10px] text-white/40 uppercase tracking-[0.25em]">RTHMIC Styles</p>
              </RevealBlock>
              <div className="flex flex-col gap-2">
                {builtInGenres.map((genre, i) =>
                  renderTile(genre, i, 40 + i * 20)
                )}
              </div>
            </div>
          )}

          {/* ── Your Styles (user-configured) ── */}
          {userGenres.length > 0 && (
            <div className="flex flex-col gap-2">
              <RevealBlock delay={40 + builtInGenres.length * 20}>
                <p className="text-[10px] text-white/40 uppercase tracking-[0.25em]">Your Styles</p>
              </RevealBlock>
              <div className="flex flex-col gap-2">
                {userGenres.map((genre, i) =>
                  renderTile(genre, builtInGenres.length + i, 60 + (builtInGenres.length + i) * 20)
                )}
              </div>
            </div>
          )}

          {/* ── Custom one-off ── */}
          <RevealBlock delay={60 + allGenres.length * 20}>
            <CustomStyleInput
              onStyleChange={(s) => { setCustomStyle(s); setCustomSelected(true); setSelectedIndex(null); }}
              selected={customSelected}
              onSelect={selectCustom}
              onSave={persistCustomStyle}
            />
          </RevealBlock>
        </div>
      )}

      <RevealBlock delay={80} className="flex flex-col gap-3 mt-auto flex-shrink-0">
        <button
          onClick={() => {
            if (!canProceed) return;
            if (customSelected && customStyle) persistCustomStyle(customStyle);
            onGenerate(selectedGenre);
          }}
          disabled={!canProceed}
          className="w-full py-5 rounded-2xl text-sm font-semibold tracking-wide active:scale-[0.98] transition-all touch-manipulation disabled:opacity-30"
          style={{ background: "rgba(201,165,90,0.1)", border: "1px solid rgba(201,165,90,0.45)", color: "#c9a55a" }}
        >
          {buildLabel}
        </button>
        <button
          onClick={onDiscard}
          className="w-full py-3 text-white/35 hover:text-white/55 text-sm tracking-wide transition-colors touch-manipulation"
        >
          Discard and start afresh
        </button>
      </RevealBlock>
    </section>
  );
}

// ─── Generating ───────────────────────────────────────────────────────────────

const GENERATING_COPY: Record<string, { heading: string; stages: string[] }> = {
  booksummary: {
    heading: "Building your Book Rthm",
    stages: ["Distilling the core idea…", "Setting it to music…", "Laying down the track…", "Finishing up…"],
  },
  explain: {
    heading: "Building your Explanation Rthm",
    stages: ["Unpacking the concept…", "Setting it to music…", "Laying down the track…", "Finishing up…"],
  },
  memory: {
    heading: "Building your Memory Rthm",
    stages: ["Encoding the memory…", "Setting it to music…", "Laying down the track…", "Finishing up…"],
  },
  mindset: {
    heading: "Building your Mindset Rthm",
    stages: ["Composing the shift…", "Setting it to music…", "Laying down the track…", "Finishing up…"],
  },
  mode: {
    heading: "Setting your Mode",
    stages: ["Composing your Rthm…", "Setting the tone…", "Laying down the track…", "Finishing up…"],
  },
  movement: {
    heading: "Building your Movement Rthm",
    stages: ["Building the energy…", "Setting it to music…", "Laying down the track…", "Finishing up…"],
  },
  journal: {
    heading: "Capturing your moment",
    stages: ["Composing your Rthm…", "Setting it to music…", "Laying down the track…", "Finishing up…"],
  },
  epiphany: {
    heading: "Crystallising your insight",
    stages: ["Shaping the insight…", "Setting it to music…", "Laying down the track…", "Finishing up…"],
  },
};

function GeneratingView({ onCancel, pillar }: { onCancel: () => void; pillar?: string | null }) {
  const key = (pillar ?? "").toLowerCase();
  const copy = GENERATING_COPY[key] ?? {
    heading: "Building your Rthms",
    stages: ["Composing your Rthm…", "Setting it to music…", "Laying down the track…", "Finishing up…"],
  };
  const stages = copy.stages;
  const [stageIdx, setStageIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setStageIdx((i) => Math.min(i + 1, stages.length - 1));
    }, 22000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="flex-1 flex flex-col items-center justify-center pb-24 gap-10">
      <RevealBlock delay={0}>
        <div className="flex flex-col items-center gap-8 w-full">

          {/* ── Spectrum visualiser ───────────────────────────────────────── */}
          <SpectrumVisualiser />

          {/* ── Text block ───────────────────────────────────────────────── */}
          <div className="text-center flex flex-col items-center gap-3 max-w-xs">
            <h2
              className="text-xl font-light tracking-wide text-white"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {copy.heading}
            </h2>
            {/* key forces a fresh DOM node on each stage so the fade-in
                animation replays cleanly — no opacity transition race */}
            <p
              key={stageIdx}
              className="text-sm"
              style={{
                color: "rgba(201,165,90,0.65)",
                minHeight: "1.25rem",
                animation: "fade-up 0.5s cubic-bezier(0.16,1,0.3,1) forwards",
              }}
            >
              {stages[stageIdx]}
            </p>
            <p className="text-xs text-white/25 leading-relaxed">
              This takes 1–3 minutes. You can navigate away — a notification will appear when ready.
            </p>
          </div>
        </div>
      </RevealBlock>

      <RevealBlock delay={200}>
        <button
          onClick={onCancel}
          className="text-xs text-white/20 hover:text-white/40 transition-colors touch-manipulation uppercase tracking-widest"
        >
          Cancel
        </button>
      </RevealBlock>
    </section>
  );
}

// ─── Spectrum visualiser ──────────────────────────────────────────────────────

function SpectrumVisualiser() {
  const BAR_COUNT = 34;

  // Stable per-bar config — never changes between renders
  const bars = React.useMemo(() => Array.from({ length: BAR_COUNT }, (_, i) => {
    const pos    = i / (BAR_COUNT - 1);          // 0..1
    const dist   = Math.abs(pos - 0.5) * 2;      // 0 (centre) → 1 (edge)
    const maxH   = 18 + (1 - dist * dist * 0.75) * 82; // edges ~18px, centre ~100px
    const dur    = (0.55 + Math.random() * 0.9).toFixed(2);
    const delay  = (-Math.random() * 2.5).toFixed(2);
    const alpha  = (0.35 + (1 - dist) * 0.5).toFixed(2);
    return { maxH, dur, delay, alpha };
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="relative w-full"
      style={{ height: 108 }}
    >
      {/* Ambient glow behind bars */}
      <div
        className="absolute inset-x-0 bottom-0"
        style={{
          height: 60,
          background: "radial-gradient(ellipse 70% 100% at 50% 100%, rgba(201,165,90,0.12) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Bars */}
      <div
        className="absolute inset-0 flex items-end justify-center"
        style={{ gap: 3, paddingBottom: 1 }}
      >
        {bars.map(({ maxH, dur, delay, alpha }, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              maxWidth: 7,
              height: maxH,
              borderRadius: "3px 3px 1px 1px",
              background: `rgba(201,165,90,${alpha})`,
              transformOrigin: "bottom",
              animation: `spectrum-bar ${dur}s ease-in-out infinite ${delay}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Results ─────────────────────────────────────────────────────────────────

type ShareState = "idle" | "loading" | "done" | "copied";

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
  playingId,
  currentTime,
  duration,
  onSeek,
  onSkip,
  onRestart,
  onSetLoop,
  onRecreateGenre,
  isDedication,
  genDurationMs,
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
  playingId: string | null;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  onSkip: (seconds: number) => void;
  onRestart: () => void;
  onSetLoop: (enabled: boolean) => void;
  onRecreateGenre?: () => void;
  isDedication?: boolean;
  genDurationMs?: number;
}) {
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [showPlayer, setShowPlayer] = useState(false);
  const [shareState, setShareState] = useState<ShareState>("idle");
  const [sharingSongId, setSharingSongId] = useState<string | null>(null);

  const handleShare = async (song: Song) => {
    setSharingSongId(song.id);
    setShareState("loading");
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rhythmId: song.id }),
      });
      if (!res.ok) throw new Error("share failed");
      const { url } = await res.json();
      if (navigator.share) {
        await navigator.share({ title: song.title, text: `I made this Rthm for you`, url });
        setShareState("done");
      } else {
        await navigator.clipboard.writeText(url);
        setShareState("copied");
        setTimeout(() => { setShareState("idle"); setSharingSongId(null); }, 3000);
      }
    } catch {
      setShareState("idle");
      setSharingSongId(null);
    }
  };

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
      <RevealBlock delay={0}>
        <TransitionLink
          href="/library"
          className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] transition-colors touch-manipulation"
        >
          <span className="text-xs text-white/40">✓</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white/65 leading-snug">Saved to your library — tap to manage</p>
          </div>
          <span className="text-white/35 text-sm flex-shrink-0">›</span>
        </TransitionLink>
      </RevealBlock>

      <RevealBlock delay={40}>
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-[10px] text-white/40 uppercase tracking-[0.2em]">
            {isDedication ? "Your Bridge is ready" : "Generated for you"}
          </p>
          {genDurationMs != null && (
            <span className="text-[10px] text-white/25 uppercase tracking-wider">
              in {fmtDuration(genDurationMs)}
            </span>
          )}
          {pillar && (
            <span className="text-[10px] text-white/35 border border-white/[0.10] rounded-full px-2.5 py-0.5 uppercase tracking-widest">
              {pillar}
            </span>
          )}
        </div>
      </RevealBlock>

      {/* Bridge: prominent share CTA */}
      {isDedication && songs.length > 0 && !!songs[0].audioUrl && (
        <RevealBlock delay={60}>
          <button
            onClick={() => handleShare(songs[0])}
            disabled={shareState === "loading"}
            className="w-full py-5 rounded-2xl text-sm font-semibold tracking-wide text-center active:scale-[0.98] transition-all touch-manipulation disabled:opacity-60"
            style={{ background: "rgba(201,165,90,0.1)", border: "1px solid rgba(201,165,90,0.45)", color: "#c9a55a" }}
          >
            {shareState === "loading" && sharingSongId === songs[0].id ? "Creating link…"
              : shareState === "copied" && sharingSongId === songs[0].id ? "✓ Link copied — ready to send"
              : shareState === "done" && sharingSongId === songs[0].id ? "✓ Sent"
              : "Send this Rthm →"}
          </button>
        </RevealBlock>
      )}

      {debugMsg && <p className="text-[10px] text-red-400/60 break-all">{debugMsg}</p>}

      {songs.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 py-16">
          <p className="text-sm text-white/40 text-center">All Rthms removed.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {songs.map((song, songIndex) => {
            const status = songStatus[song.id] ?? null;
            const playing = isSongPlaying(song);
            const loading = isSongLoading(song);
            const canPlay = !!(song.audioUrl || (song.trackId && song.trackAudioKey));
            const progress =
              song.audioUrl && playingId === song.id && duration > 0
                ? currentTime / duration
                : 0;

            return (
              <RevealBlock key={song.id} delay={80 + songIndex * 40}>
              <div
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
                      <p className="text-[10px] text-white/40 mt-0.5 uppercase tracking-widest">Archived</p>
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
                    <span className="flex-shrink-0 text-[10px] text-white/40 uppercase tracking-widest">expand ›</span>
                  )}
                </button>

                {/* Thin progress strip on playing card */}
                {song.audioUrl && playingId === song.id && (
                  <div className="h-[2px] bg-white/[0.06] mx-5 rounded-full mb-3">
                    <div className="h-full bg-white/30 rounded-full transition-none" style={{ width: `${progress * 100}%` }} />
                  </div>
                )}

                <div className="flex border-t border-white/[0.06]">
                  {isDedication && !!song.audioUrl && (
                    <ActionBtn
                      onClick={() => handleShare(song)}
                      label={shareState === "copied" && sharingSongId === song.id ? "Copied!" : shareState === "done" && sharingSongId === song.id ? "Sent!" : "Send"}
                      sublabel="Share with them"
                      icon="↗"
                      active={sharingSongId === song.id && (shareState === "copied" || shareState === "done")}
                    />
                  )}
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
              </RevealBlock>
            );
          })}
        </div>
      )}

      {/* Bottom navigation */}
      <RevealBlock delay={160}>
        <div className="flex flex-col gap-2 mt-2">
          <button
            onClick={onReset}
            className="w-full py-4 rounded-2xl bg-white/[0.05] border border-white/[0.08] text-white/50 text-sm font-medium tracking-wide active:scale-[0.98] transition-transform touch-manipulation"
          >
            Speak again
          </button>
          <div className="flex gap-2">
            <TransitionLink
              href="/library"
              className="flex-1 py-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-white/50 text-sm text-center font-medium tracking-wide active:scale-[0.98] transition-transform touch-manipulation"
            >
              Library
            </TransitionLink>
            <TransitionLink
              href="/"
              className="flex-1 py-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-white/50 text-sm text-center font-medium tracking-wide active:scale-[0.98] transition-transform touch-manipulation"
            >
              Home
            </TransitionLink>
          </div>
        </div>
      </RevealBlock>

      {/* Full-screen player */}
      {showPlayer && playingSong && (
        <FullScreenPlayer
          song={playingSong}
          currentTime={currentTime}
          duration={duration}
          isPlaying={isSongPlaying(playingSong)}
          lyrics={lyrics}
          onSeek={onSeek}
          onSkip={onSkip}
          onRestart={onRestart}
          onSetLoop={onSetLoop}
          onTogglePlay={() => onTogglePlay(playingSong)}
          onClose={() => setShowPlayer(false)}
          onRecreateGenre={onRecreateGenre ? () => { setShowPlayer(false); onRecreateGenre!(); } : undefined}
          onShare={isDedication && !!playingSong.audioUrl ? () => handleShare(playingSong) : undefined}
          shareState={sharingSongId === playingSong.id ? shareState : "idle"}
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
  onSeek,
  onSkip,
  onRestart,
  onSetLoop,
  onTogglePlay,
  onClose,
  onRecreateGenre,
  onShare,
  shareState,
}: {
  song: Song;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  lyrics?: string;
  onSeek: (time: number) => void;
  onSkip: (seconds: number) => void;
  onRestart: () => void;
  onSetLoop: (enabled: boolean) => void;
  onTogglePlay: () => void;
  onClose: () => void;
  onRecreateGenre?: () => void;
  onShare?: () => void;
  shareState?: ShareState;
}) {
  const [dragging, setDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState(0);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  // Sync loop state to audio element via context
  useEffect(() => {
    onSetLoop(loopEnabled);
  }, [loopEnabled, onSetLoop]);

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
    if (duration > 0) onSeek(ratio * duration);
  };

  const handleRestart = () => { onRestart(); };
  const handleSkip10 = () => { onSkip(10); };

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
          className="flex items-center gap-2 text-white/50 hover:text-white/70 transition-colors touch-manipulation py-1"
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
          <span className="text-[11px] text-white/40 tabular-nums">{fmt(currentTime)}</span>
          <span className="text-[11px] text-white/40 tabular-nums">{fmt(duration)}</span>
        </div>
      </div>

      {/* Playback controls */}
      <div className="flex items-center justify-center gap-6 px-8 mb-3 flex-shrink-0">
        {/* Restart */}
        <button
          onClick={handleRestart}
          className="flex flex-col items-center gap-1 text-white/45 hover:text-white/70 active:scale-90 transition-all touch-manipulation"
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
          className="flex flex-col items-center gap-1 text-white/45 hover:text-white/70 active:scale-90 transition-all touch-manipulation"
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

      {/* Share (Bridge) / Recreate */}
      <div className="flex flex-col items-center gap-2 px-8 mb-5 flex-shrink-0">
        {onShare && (
          <button
            onClick={onShare}
            disabled={shareState === "loading"}
            className="w-full py-4 rounded-2xl text-sm font-semibold tracking-wide text-center active:scale-[0.98] transition-all touch-manipulation disabled:opacity-60"
            style={{ background: "rgba(201,165,90,0.1)", border: "1px solid rgba(201,165,90,0.45)", color: "#c9a55a" }}
          >
            {shareState === "loading" ? "Creating link…"
              : shareState === "copied" ? "✓ Link copied — ready to send"
              : shareState === "done" ? "✓ Sent"
              : "Send this Rthm →"}
          </button>
        )}
        {onRecreateGenre && (
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
        )}
      </div>

      {/* Lyrics — scrollable, always visible */}
      {lyricLines.length > 0 && (
        <>
          <div className="mx-8 h-px bg-white/[0.06] flex-shrink-0" />
          <div className="flex-1 overflow-y-auto px-8 pt-5 pb-10 min-h-0">
            {lyricLines.map((line, i) => {
              const isHeader = /^\[.*\]$/.test(line);
              return isHeader ? (
                <p key={i} className="text-[10px] text-white/30 uppercase tracking-widest mt-6 mb-2 first:mt-0">
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
          : danger ? "text-white/30 hover:text-red-400/60 active:text-red-400/80"
          : active ? "text-white/75"
          : "text-white/35 hover:text-white/55"}`}
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

// Spinning ring shown while getUserMedia is resolving (before recording actually starts)
function MicRequestingIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="animate-spin" style={{ color: "rgba(201,165,90,0.6)" }}>
      <circle cx="14" cy="14" r="11" stroke="currentColor" strokeWidth="2" strokeDasharray="44 24" strokeLinecap="round" />
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

function InfoIcon({ gold }: { gold?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none"
      style={{ color: gold ? "rgba(201,165,90,0.6)" : "rgba(255,255,255,0.55)" }}>
      <circle cx="10" cy="10" r="8.5" stroke="currentColor" strokeWidth="1.4" />
      <line x1="10" y1="9" x2="10" y2="14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="10" cy="6.5" r="0.9" fill="currentColor" />
    </svg>
  );
}

// ─── Section header icons ─────────────────────────────────────────────────────

function ForYouIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      {/* Person silhouette */}
      <circle cx="12" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5 20c0-3.87 3.13-7 7-7s7 3.13 7 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ForSomeoneElseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      {/* Two people */}
      <circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M2 20c0-3.31 3.13-6 7-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="17" cy="7" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M15 14c3.87 0 7 2.69 7 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// ─── Pillar tile icons ────────────────────────────────────────────────────────

function MemoryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      {/* Concentric rings — memory imprint */}
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

function MenusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      {/* Dot-and-line list */}
      <circle cx="5" cy="7" r="1.3" fill="currentColor" />
      <line x1="9" y1="7" x2="19" y2="7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="5" cy="12" r="1.3" fill="currentColor" />
      <line x1="9" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="5" cy="17" r="1.3" fill="currentColor" />
      <line x1="9" y1="17" x2="15" y2="17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function MindsetIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      {/* Mountain peak — preparation, upward */}
      <path d="M3 19L9 8L13.5 14L17 10L21 19" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ModeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      {/* Lightning bolt — interrupt and rescue */}
      <path d="M13 2L4 14h8l-1 8 9-12h-8l1-8z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function MovementIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      {/* Double forward chevron — unstuck, momentum */}
      <path d="M5 8L11 12L5 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 8L19 12L13 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UnderstandingIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      {/* Magnifying glass — finding clarity */}
      <circle cx="10.5" cy="10.5" r="6" stroke="currentColor" strokeWidth="1.7" />
      <line x1="15.5" y1="15.5" x2="20" y2="20" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function JournalIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      {/* Open book */}
      <path d="M12 20V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M4 5C4 5 8 6 12 6C16 6 20 5 20 5V19C20 19 16 18 12 18C8 18 4 19 4 19V5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function EpiphanyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      {/* Spark — sudden insight */}
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ExplainIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      {/* Speech bubble with text lines */}
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" fill="none" />
      <line x1="8" y1="9" x2="16" y2="9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="8" y1="13" x2="13" y2="13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function BookSummaryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      {/* Closed book spine + pages */}
      <rect x="4" y="3" width="14" height="18" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <line x1="8" y1="3" x2="8" y2="21" stroke="currentColor" strokeWidth="1.4" />
      {/* Small spark top-right — the big idea inside */}
      <line x1="17" y1="5" x2="17" y2="8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="15.5" y1="6.5" x2="18.5" y2="6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function BridgeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      {/* Deck */}
      <line x1="2" y1="17" x2="22" y2="17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {/* Arch cable */}
      <path d="M4 17 Q12 5 20 17" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      {/* Vertical suspenders */}
      <line x1="9"  y1="11" x2="9"  y2="17" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="12" y1="8"  x2="12" y2="17" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="15" y1="11" x2="15" y2="17" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      {/* Piers */}
      <line x1="4"  y1="17" x2="4"  y2="21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="20" y1="17" x2="20" y2="21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function InviteIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      {/* Envelope body */}
      <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.7" />
      {/* Chevron fold */}
      <path d="M2 7l10 7 10-7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      {/* Small star / spark — top right corner of envelope */}
      <circle cx="19" cy="5" r="3" fill="rgba(120,160,255,0.35)" stroke="currentColor" strokeWidth="1.2" />
      <line x1="19" y1="3.5" x2="19" y2="6.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <line x1="17.5" y1="5" x2="20.5" y2="5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

function TimeCapsuleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      {/* Hourglass body */}
      <path d="M6 2h12M6 22h12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M7 2 Q7 10 12 12 Q17 14 17 22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M17 2 Q17 10 12 12 Q7 14 7 22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      {/* Sand dot at bottom */}
      <circle cx="12" cy="18" r="1.2" fill="currentColor" />
    </svg>
  );
}

function WhatMatteredIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
      <line x1="12" y1="3" x2="12" y2="5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12" y1="18.5" x2="12" y2="21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="3" y1="12" x2="5.5" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="18.5" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="5.6" y1="5.6" x2="7.4" y2="7.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="16.6" y1="16.6" x2="18.4" y2="18.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="18.4" y1="5.6" x2="16.6" y2="7.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="7.4" y1="16.6" x2="5.6" y2="18.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function BrainIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M9.5 2a4.5 4.5 0 0 0-4.5 4.5c0 .6.1 1.2.3 1.7A4 4 0 0 0 3 12a4 4 0 0 0 2.3 3.6A4.5 4.5 0 0 0 9.5 22h5a4.5 4.5 0 0 0 4.2-6.4A4 4 0 0 0 21 12a4 4 0 0 0-2.3-3.8c.2-.5.3-1.1.3-1.7A4.5 4.5 0 0 0 14.5 2h-5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <line x1="12" y1="6" x2="12" y2="18" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M9 9c0 1.7 1.3 3 3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M15 15c0-1.7-1.3-3-3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function RSDIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 2L14.5 9H22L16 13.5L18.5 20.5L12 16L5.5 20.5L8 13.5L2 9H9.5L12 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function TimePanicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <line x1="12" y1="7" x2="12" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="12" y1="12" x2="15" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    </svg>
  );
}

function LaunchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 2C12 2 19 8 19 14a7 7 0 0 1-14 0C5 8 12 2 12 2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="12" cy="14" r="2.5" fill="currentColor" />
      <line x1="9" y1="22" x2="15" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12" y1="19" x2="12" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
