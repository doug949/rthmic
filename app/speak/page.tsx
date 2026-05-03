"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { useAudio } from "@/app/contexts/AudioContext";
import { saveRhythm } from "@/app/lib/personalLibrary";
import type { PillarType, StateSummary, Song, SongStatus, SongStatusMap } from "@/app/types/pipeline";
import type { StyleChoice } from "@/app/services/llmService";

type Phase = "idle" | "recording" | "understanding" | "confirming" | "generating" | "results";

interface UnderstandResult {
  transcript: string;
  pillar: PillarType;
  stateSummary: StateSummary;
  title: string;
  lyrics: string;
  style: StyleChoice;
}

export default function SpeakPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [understandResult, setUnderstandResult] = useState<UnderstandResult | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [songStatus, setSongStatus] = useState<SongStatusMap>({});

  const allTranscriptsRef = useRef<string[]>([]);

  // MediaRecorder
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("");

  // Web Audio API — orb animation
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number>(0);
  const orbRef = useRef<HTMLDivElement>(null);

  // Song playback
  const audioElRef = useRef<HTMLAudioElement>(null);
  const [realPlayingId, setRealPlayingId] = useState<string | null>(null);
  const [realIsPlaying, setRealIsPlaying] = useState(false);

  const { handlePlay: handleMockPlay, currentTrackId, isPlaying: mockIsPlaying, loadingId } = useAudio();

  const setStatus = (id: string, status: SongStatus) =>
    setSongStatus((prev) => ({ ...prev, [id]: status }));

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
          el.style.boxShadow = `0 0 ${glow.toFixed(1)}px ${(glow * 0.4).toFixed(1)}px rgba(255,255,255,${glowAlpha})`;
          el.style.backgroundColor = `rgba(255,255,255,${bgAlpha})`;
        }

        animFrameRef.current = requestAnimationFrame(tick);
      };

      animFrameRef.current = requestAnimationFrame(tick);
    } catch (e) {
      console.warn("Web Audio API unavailable:", e);
    }
  }, []);

  // ─── Recording ────────────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    setErrorMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";

      mimeTypeRef.current = mimeType;
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        cleanupWebAudio();
        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
        if (blob.size === 0) {
          setErrorMsg("No audio captured — please try again.");
          setPhase("idle");
          return;
        }
        // Warn if the recording is unusually large (>8MB) — Whisper limit is 25MB
        // but Vercel's request body limit may be lower on some plans
        if (blob.size > 8 * 1024 * 1024) {
          console.warn(`Large recording: ${(blob.size / 1024 / 1024).toFixed(1)}MB`);
        }
        await runUnderstand(blob);
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
    } catch {
      setErrorMsg("Microphone access denied.");
      setPhase("idle");
    }
  }, [cleanupWebAudio, startOrbAnimation]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setPhase("understanding");
  }, []);

  // ─── Understand step ──────────────────────────────────────────────────────

  const runUnderstand = async (audio: Blob) => {
    setPhase("understanding");
    setErrorMsg("");
    try {
      const ext = mimeTypeRef.current.includes("mp4") ? "mp4" : "webm";
      const form = new FormData();
      form.append("audio", audio, `recording.${ext}`);

      if (allTranscriptsRef.current.length > 0) {
        form.append("previousContext", allTranscriptsRef.current.join(" "));
      }

      const res = await fetch("/api/understand", { method: "POST", body: form });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Understanding failed");
      }

      const data: UnderstandResult = await res.json();
      allTranscriptsRef.current.push(data.transcript);
      setUnderstandResult(data);
      setPhase("confirming");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Something went wrong");
      setPhase("idle");
    }
  };

  // ─── Generate step ────────────────────────────────────────────────────────

  const runGenerate = async () => {
    if (!understandResult) return;
    setPhase("generating");
    setErrorMsg("");

    try {
      // Step 1 — start the Suno job
      const startRes = await fetch("/api/start-generation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lyrics: understandResult.lyrics,
          style: understandResult.style,
          title: understandResult.title,
        }),
      });
      if (!startRes.ok) {
        const err = await startRes.json();
        throw new Error(err.error || "Failed to start generation");
      }
      const { taskId } = await startRes.json();

      // Step 2 — poll every 5s for up to 4 minutes
      const MAX_POLLS = 48;
      for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise((r) => setTimeout(r, 5000));

        const pollRes = await fetch(
          `/api/poll-generation?taskId=${encodeURIComponent(taskId)}&t=${Date.now()}`,
          { cache: "no-store" }
        );
        if (!pollRes.ok) continue;

        const poll = await pollRes.json();

        if (poll.status === "ready" && poll.songs) {
          const readySongs = poll.songs as Song[];
          setSongs(readySongs);
          setPhase("results");

          // Auto-save to personal library
          readySongs.forEach((song) => {
            saveRhythm({
              id: song.id,
              title: song.title,
              pillar: understandResult.pillar,
              audioUrl: song.audioUrl,
            });
          });
          return;
        }
        if (poll.status === "failed") {
          throw new Error(poll.error || "Music generation failed");
        }
      }

      throw new Error("Rhythms took too long to generate — please try again");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Music generation failed");
      setPhase("confirming");
    }
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
      el.load();
      el.play().catch((err) => {
        setErrorMsg(`Play error: ${err.message}`);
        setRealIsPlaying(false);
      });
      setRealPlayingId(song.id);
      setRealIsPlaying(true);
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

  // ─── Reset ────────────────────────────────────────────────────────────────

  const reset = () => {
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.src = "";
    }
    setPhase("idle");
    setUnderstandResult(null);
    setSongs([]);
    setErrorMsg("");
    setSongStatus({});
    setRealPlayingId(null);
    setRealIsPlaying(false);
    allTranscriptsRef.current = [];
  };

  useEffect(() => {
    return () => {
      cleanupWebAudio();
      audioElRef.current?.pause();
    };
  }, [cleanupWebAudio]);

  const visibleSongs = songs.filter((s) => songStatus[s.id] !== "deleted");

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-[#0d1628] flex flex-col px-6 pt-safe">
      <audio
        ref={audioElRef}
        onEnded={() => setRealIsPlaying(false)}
        onError={() => setRealIsPlaying(false)}
        preload="none"
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

      {phase === "idle" && (
        <IdleView onRecord={startRecording} errorMsg={errorMsg} />
      )}

      {phase === "recording" && (
        <RecordingView orbRef={orbRef} onStop={stopRecording} />
      )}

      {phase === "understanding" && <UnderstandingView />}

      {phase === "confirming" && understandResult && (
        <ConfirmingView
          result={understandResult}
          onAddMore={addMore}
          onProceed={runGenerate}
          errorMsg={errorMsg}
        />
      )}

      {phase === "generating" && <GeneratingView />}

      {phase === "results" && (
        <ResultsView
          songs={visibleSongs}
          songStatus={songStatus}
          setStatus={setStatus}
          onReset={reset}
          onTogglePlay={togglePlay}
          isSongPlaying={isSongPlaying}
          isSongLoading={isSongLoading}
          pillar={understandResult?.pillar}
          debugMsg={errorMsg}
        />
      )}
    </main>
  );
}

// ─── Idle ─────────────────────────────────────────────────────────────────────

function IdleView({ onRecord, errorMsg }: { onRecord: () => void; errorMsg: string }) {
  return (
    <section className="flex-1 flex flex-col items-center justify-center pb-24 gap-10">
      <div className="text-center">
        <h2 className="text-2xl font-light tracking-wide text-white leading-snug" style={{ fontFamily: "var(--font-display)" }}>Speak your state</h2>
        <p className="text-sm text-white/35 mt-2">Two rhythms will be built for you.</p>
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
          className="absolute w-48 h-48 rounded-full border border-white/[0.05] animate-ping"
          style={{ animationDuration: "2.4s" }}
        />
        <span
          className="absolute w-38 h-38 rounded-full border border-white/[0.08] animate-ping"
          style={{ animationDuration: "2.4s", animationDelay: "0.6s" }}
        />
        <div
          ref={orbRef}
          className="w-28 h-28 rounded-full border border-white/25 flex items-center justify-center"
          style={{
            backgroundColor: "rgba(255,255,255,0.08)",
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
  errorMsg,
}: {
  result: UnderstandResult;
  onAddMore: () => void;
  onProceed: () => void;
  errorMsg: string;
}) {
  const styleLabel = result.style === "A" ? "Energy" : "Focus";

  return (
    <section className="flex-1 flex flex-col pb-12 gap-6">
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
        <ConfirmRow label="State" value={result.stateSummary.state} />
        <ConfirmRow label="Intent" value={result.stateSummary.intent} />
        <ConfirmRow label="Friction" value={result.stateSummary.friction} />
      </div>

      {errorMsg && (
        <p className="text-xs text-red-400/50 text-center">{errorMsg}</p>
      )}

      <div className="flex flex-col gap-3 mt-auto">
        <button
          onClick={onProceed}
          className="w-full py-5 rounded-2xl text-sm font-semibold tracking-wide active:scale-[0.98] transition-all touch-manipulation"
          style={{ background: "rgba(201,165,90,0.1)", border: "1px solid rgba(201,165,90,0.45)", color: "#c9a55a" }}
        >
          Yes — build my rhythms
        </button>
        <button
          onClick={onAddMore}
          className="w-full py-4 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-white/45 text-sm font-medium tracking-wide active:scale-[0.98] transition-transform touch-manipulation"
        >
          Add more
        </button>
      </div>
    </section>
  );
}

function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-white/25 uppercase tracking-[0.2em] mb-0.5">{label}</p>
      <p className="text-sm text-white/60 leading-relaxed">{value}</p>
    </div>
  );
}

// ─── Generating ───────────────────────────────────────────────────────────────

function GeneratingView() {
  return (
    <section className="flex-1 flex flex-col items-center justify-center pb-24 gap-8">
      <div className="text-center max-w-xs">
        <h2 className="text-xl font-light tracking-wide text-white" style={{ fontFamily: "var(--font-display)" }}>Building your rhythms</h2>
        <p className="text-sm text-white/30 mt-2 leading-relaxed">This takes 1–2 minutes. RTHMIC will let you know when your tracks are ready.</p>
      </div>
      <div className="w-7 h-7 rounded-full border-2 border-white/15 border-t-white/55 animate-spin" />
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
  debugMsg,
}: {
  songs: Song[];
  songStatus: SongStatusMap;
  setStatus: (id: string, s: SongStatus) => void;
  onReset: () => void;
  onTogglePlay: (song: Song) => void;
  isSongPlaying: (song: Song) => boolean;
  isSongLoading: (song: Song) => boolean;
  pillar?: PillarType;
  debugMsg?: string;
}) {
  return (
    <section className="flex-1 flex flex-col gap-5 pb-32">
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
          <p className="text-sm text-white/25 text-center">All rhythms removed.</p>
          <button onClick={onReset} className="text-xs text-white/30 underline underline-offset-4">
            Speak again
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {songs.map((song) => {
            const status = songStatus[song.id] ?? null;
            const playing = isSongPlaying(song);
            const loading = isSongLoading(song);
            const canPlay = !!(song.audioUrl || (song.trackId && song.trackAudioKey));

            return (
              <div
                key={song.id}
                className={`rounded-2xl border transition-all duration-200
                  ${playing ? "bg-white/[0.08] border-white/20" : "bg-white/[0.03] border-white/[0.08]"}
                  ${status === "archived" ? "opacity-50" : ""}`}
              >
                <button
                  onClick={() => onTogglePlay(song)}
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
                    {status === "favorite" && (
                      <p className="text-[10px] text-white/30 mt-0.5 uppercase tracking-widest">Saved</p>
                    )}
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
                </button>

                <div className="flex border-t border-white/[0.06]">
                  <ActionBtn
                    active={status === "favorite"}
                    onClick={() => setStatus(song.id, status === "favorite" ? null : "favorite")}
                    label="Save"
                    icon={status === "favorite" ? "♥" : "♡"}
                  />
                  <ActionBtn
                    active={status === "archived"}
                    onClick={() => setStatus(song.id, status === "archived" ? null : "archived")}
                    label="Archive"
                    icon="⊙"
                  />
                  <ActionBtn
                    onClick={() => setStatus(song.id, "deleted")}
                    label="Remove"
                    icon="×"
                    danger
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-3 mt-2">
        <button
          onClick={onReset}
          className="w-full py-4 rounded-2xl bg-white/[0.05] border border-white/[0.08] text-white/50 text-sm font-medium tracking-wide active:scale-[0.98] transition-transform touch-manipulation"
        >
          Speak again
        </button>
      </div>
    </section>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function ActionBtn({
  onClick,
  label,
  icon,
  active,
  danger,
}: {
  onClick: () => void;
  label: string;
  icon: string;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs tracking-wide touch-manipulation transition-colors
        ${danger ? "text-white/20 hover:text-red-400/50 active:text-red-400/70"
          : active ? "text-white/60"
          : "text-white/20 hover:text-white/40"}`}
    >
      <span className="text-base leading-none">{icon}</span>
      <span className="uppercase tracking-widest text-[9px]">{label}</span>
    </button>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function MicIcon({ active }: { active?: boolean }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className={active ? "text-white" : "text-white/55"}>
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
