"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { RevealBlock } from "@/app/components/RevealBlock";
import type { SavedRhythm } from "@/app/api/library/route";

const LYRIC_SYNC_LEAD_SECONDS = 0.35;

type PageState = "loading" | "ready" | "notfound" | "error";
type AccessState = "idle" | "form" | "submitting" | "sent" | "err";

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/** Read rthmic_code from document.cookie — works because it's not httpOnly. */
function getSignedInCode(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)rthmic_code=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export default function SharePage() {
  const { token } = useParams<{ token: string }>();

  const [state, setState] = useState<PageState>("loading");
  const [rhythm, setRhythm] = useState<SavedRhythm | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);

  // Beta access form
  const [accessState, setAccessState] = useState<AccessState>("idle");
  const [email, setEmail] = useState("");
  const [accessErr, setAccessErr] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);

  // Playback
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const rafRef = useRef<number | null>(null);

  // ── Detect sign-in ────────────────────────────────────────────────────────
  useEffect(() => {
    setIsSignedIn(!!getSignedInCode());
  }, []);

  // ── Fetch the shared Rthm ─────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/share?token=${encodeURIComponent(token)}`)
      .then((res) => {
        if (res.status === 404) { setState("notfound"); return null; }
        if (!res.ok) throw new Error("fetch failed");
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        setRhythm(data.rhythm);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [token]);

  // ── Audio wiring ──────────────────────────────────────────────────────────
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !rhythm?.audioUrl) return;
    el.src = rhythm.audioUrl;

    const onMeta  = () => setDuration(el.duration);
    const onEnded = () => { setIsPlaying(false); setCurrentTime(0); if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; } };
    const onPlay  = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("ended", onEnded);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    return () => {
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
    };
  }, [rhythm]);

  // ── rAF loop for smooth currentTime ──────────────────────────────────────
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      return;
    }
    const tick = () => {
      if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; } };
  }, [isPlaying]);

  // Auto-focus email input when form opens
  useEffect(() => {
    if (accessState === "form") {
      setTimeout(() => emailRef.current?.focus(), 80);
    }
  }, [accessState]);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (isPlaying) { el.pause(); setIsPlaying(false); }
    else           { el.play().catch(() => {}); setIsPlaying(true); }
  };

  // ── Beta access request ───────────────────────────────────────────────────
  const handleAccessRequest = async () => {
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setAccessErr("Please enter a valid email address.");
      return;
    }

    setAccessState("submitting");
    setAccessErr("");

    try {
      const res = await fetch("/api/request-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Request failed");
      }

      setAccessState("sent");
    } catch (err) {
      setAccessErr(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setAccessState("form");
    }
  };

  // ── Lyrics helper ─────────────────────────────────────────────────────────
  const lyricsLines = rhythm?.lyrics
    ? rhythm.lyrics.split("\n").map((l) => l.trim()).filter((l) => l && !l.match(/^\[.*\]$/))
    : [];

  // Build per-line timing from timedLyrics if available, else equal-division fallback
  const lineTimings: Array<{ startS: number; endS: number } | null> = (() => {
    const tw = rhythm?.timedLyrics;
    if (!tw || tw.length === 0) return [];
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const lineWords: typeof tw[] = Array.from({ length: lyricsLines.length }, () => []);
    let wi = 0;
    for (let li = 0; li < lyricsLines.length && wi < tw.length; li++) {
      const chars = norm(lyricsLines[li]).length;
      let consumed = 0;
      while (wi < tw.length && consumed < chars) {
        lineWords[li].push(tw[wi]);
        consumed += Math.max(1, norm(tw[wi].word).length);
        wi++;
      }
    }
    return lineWords.map((words) =>
      words.length > 0 ? { startS: words[0].startS, endS: words[words.length - 1].endS } : null
    );
  })();

  let currentIdx = -1;
  const lyricClock = currentTime + LYRIC_SYNC_LEAD_SECONDS;
  if (lineTimings.length > 0) {
    let last = -1;
    for (let i = 0; i < lineTimings.length; i++) {
      const t = lineTimings[i];
      if (!t) continue;
      if (lyricClock >= t.startS) last = i;
      if (lyricClock >= t.startS && lyricClock <= t.endS) { last = i; break; }
    }
    currentIdx = last;
  } else {
    const introGap  = duration > 0 ? Math.min(10, duration * 0.07) : 0;
    const lyricSpan = Math.max(0, duration - introGap);
    const lineTime  = lyricsLines.length > 1 ? lyricSpan / lyricsLines.length : lyricSpan;
    if (isPlaying && duration > 0 && lyricClock >= introGap) {
      currentIdx = Math.min(Math.floor((lyricClock - introGap) / lineTime), lyricsLines.length - 1);
    }
  }

  // ── Render: loading ───────────────────────────────────────────────────────
  if (state === "loading") {
    return (
      <main className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6">
        <div className="w-7 h-7 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
      </main>
    );
  }

  if (state === "notfound") {
    return (
      <main className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 gap-6 text-center"
        style={{ animation: "page-enter 380ms ease forwards" }}>
        <p className="text-5xl">◎</p>
        <h1 className="text-xl font-light text-white" style={{ fontFamily: "var(--font-display)" }}>
          This Rthm has expired
        </h1>
        <p className="text-sm text-white/50 leading-relaxed max-w-xs">
          Share links last 90 days. Ask the person who sent this for a fresh one.
        </p>
        <a href="/login" className="mt-4 text-sm text-white/40 hover:text-white/70 transition-colors">
          Open RTHMIC →
        </a>
      </main>
    );
  }

  if (state === "error") {
    return (
      <main className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 gap-4 text-center"
        style={{ animation: "page-enter 380ms ease forwards" }}>
        <p className="text-white/50 text-sm">Something went wrong. Try again.</p>
      </main>
    );
  }

  const canPlay = !!rhythm?.audioUrl;
  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <main className="relative z-10 min-h-screen flex flex-col px-6 pt-safe pb-16"
      style={{ animation: "page-enter 380ms ease forwards" }}>

      <audio ref={audioRef} preload="metadata" />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <RevealBlock delay={0}>
        <header className="pt-14 pb-10">
          <p className="text-xs tracking-[0.4em] uppercase mb-1"
            style={{ color: "#c9a55a", opacity: 0.6, fontFamily: "var(--font-display)" }}>
            RTHMIC
          </p>
          <p className="text-xs text-white/40 tracking-widest uppercase">
            Someone shared a Rthm with you
          </p>
        </header>
      </RevealBlock>

      {/* ── Player card ─────────────────────────────────────────────────────── */}
      <RevealBlock delay={60}>
        <div className="rounded-2xl border overflow-hidden"
          style={{ background: "rgba(201,165,90,0.05)", borderColor: "rgba(201,165,90,0.2)" }}>

          {/* Play / info row */}
          <button
            onClick={togglePlay}
            disabled={!canPlay}
            className="w-full flex items-center gap-5 px-6 py-6 text-left touch-manipulation active:scale-[0.99] transition-transform disabled:opacity-40"
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center border flex-shrink-0 transition-all"
              style={{
                background: isPlaying ? "rgba(201,165,90,0.2)" : "rgba(201,165,90,0.08)",
                borderColor: isPlaying ? "rgba(201,165,90,0.5)" : "rgba(201,165,90,0.25)",
              }}
            >
              {isPlaying ? <PauseIcon /> : <PlayIcon />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold leading-snug truncate text-white">{rhythm?.title}</p>
              <p className="text-xs mt-0.5 uppercase tracking-widest" style={{ color: "rgba(201,165,90,0.7)" }}>
                {rhythm?.pillar}
              </p>
            </div>
          </button>

          {/* Progress bar */}
          {canPlay && (
            <div className="px-6 pb-4">
              <div className="h-[3px] rounded-full" style={{ background: "rgba(201,165,90,0.12)" }}>
                <div
                  className="h-full rounded-full transition-none"
                  style={{ width: `${progress * 100}%`, background: "rgba(201,165,90,0.5)" }}
                />
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="text-[10px] text-white/40 tabular-nums">{fmt(currentTime)}</span>
                <span className="text-[10px] text-white/40 tabular-nums">{duration > 0 ? fmt(duration) : "--:--"}</span>
              </div>
            </div>
          )}

          {/* Lyrics */}
          {lyricsLines.length > 0 && (
            <div className="px-6 pb-5 pt-1 flex flex-col items-center gap-1.5 text-center border-t"
              style={{ borderColor: "rgba(201,165,90,0.1)" }}>
              {currentIdx > 0 && (
                <p className="text-[11px] text-white/30 leading-snug">{lyricsLines[currentIdx - 1]}</p>
              )}
              {currentIdx >= 0 ? (
                <p className="text-sm text-white font-medium leading-snug">{lyricsLines[currentIdx]}</p>
              ) : (
                <p className="text-[11px] text-white/30 leading-snug italic">{lyricsLines[0]}</p>
              )}
              {currentIdx >= 0 && currentIdx < lyricsLines.length - 1 && (
                <p className="text-[11px] text-white/30 leading-snug">{lyricsLines[currentIdx + 1]}</p>
              )}
            </div>
          )}
        </div>
      </RevealBlock>

      {/* ── CTAs ────────────────────────────────────────────────────────────── */}
      <RevealBlock delay={140}>
        <div className="mt-6 flex flex-col gap-3">

          {isSignedIn ? (
            /* ── Signed-in CTAs ─────────────────────────────────────────── */
            <>
              <a
                href="/speak"
                className="w-full py-5 rounded-2xl text-sm font-semibold tracking-wide text-center active:scale-[0.98] transition-all touch-manipulation"
                style={{ background: "rgba(201,165,90,0.1)", border: "1px solid rgba(201,165,90,0.4)", color: "#c9a55a" }}
              >
                Make a Rthm of Your Own →
              </a>
              <a
                href={`/speak?bridge=1&replyTo=${encodeURIComponent(token)}`}
                className="w-full py-4 rounded-2xl text-sm font-medium tracking-wide text-center active:scale-[0.98] transition-all touch-manipulation"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}
              >
                Respond With a Rthm
              </a>
            </>
          ) : (
            /* ── Not signed in — show access request flow ─────────────── */
            <>
              {/* Make your own — always visible */}
              <a
                href="/login"
                className="w-full py-5 rounded-2xl text-sm font-semibold tracking-wide text-center active:scale-[0.98] transition-all touch-manipulation"
                style={{ background: "rgba(201,165,90,0.1)", border: "1px solid rgba(201,165,90,0.4)", color: "#c9a55a" }}
              >
                Make a Rthm of Your Own →
              </a>

              {/* Beta access — idle → form → sent */}
              {accessState === "sent" ? (
                <div
                  className="w-full rounded-2xl px-6 py-5 text-center"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  <p className="text-sm font-medium text-white/80 leading-snug">Code sent ✓</p>
                  <p className="text-xs text-white/45 mt-1.5 leading-relaxed">
                    You should receive an access code within the next several minutes. Please check your email.
                  </p>
                </div>
              ) : accessState === "form" || accessState === "submitting" ? (
                <div
                  className="w-full rounded-2xl overflow-hidden"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}
                >
                  <div className="px-5 pt-5 pb-2">
                    <p className="text-xs text-white/45 uppercase tracking-widest mb-3">Enter your email</p>
                    <input
                      ref={emailRef}
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setAccessErr(""); }}
                      onKeyDown={(e) => e.key === "Enter" && handleAccessRequest()}
                      placeholder="you@example.com"
                      disabled={accessState === "submitting"}
                      className="w-full bg-transparent text-white/90 text-sm placeholder:text-white/25 outline-none border-b pb-2 mb-1 disabled:opacity-50"
                      style={{ borderColor: "rgba(255,255,255,0.15)" }}
                    />
                    {accessErr && (
                      <p className="text-xs text-red-400/80 mt-1">{accessErr}</p>
                    )}
                  </div>
                  <div className="flex gap-0 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                    <button
                      onClick={() => { setAccessState("idle"); setEmail(""); setAccessErr(""); }}
                      disabled={accessState === "submitting"}
                      className="flex-1 py-4 text-sm text-white/40 hover:text-white/60 transition-colors disabled:opacity-40 touch-manipulation"
                    >
                      Cancel
                    </button>
                    <div style={{ width: "1px", background: "rgba(255,255,255,0.08)" }} />
                    <button
                      onClick={handleAccessRequest}
                      disabled={accessState === "submitting" || !email.trim()}
                      className="flex-1 py-4 text-sm font-semibold transition-all touch-manipulation disabled:opacity-40"
                      style={{ color: "#c9a55a" }}
                    >
                      {accessState === "submitting" ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-3.5 h-3.5 rounded-full border border-amber-400/30 border-t-amber-400/80 animate-spin inline-block" />
                          Sending…
                        </span>
                      ) : "Request Access"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAccessState("form")}
                  className="w-full py-4 rounded-2xl text-sm font-medium tracking-wide text-center active:scale-[0.98] transition-all touch-manipulation"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}
                >
                  Request RTHMIC Beta Access
                </button>
              )}
            </>
          )}
        </div>
      </RevealBlock>

      {/* ── What is RTHMIC — expandable ─────────────────────────────────────── */}
      <RevealBlock delay={200}>
        <div className="mt-6 rounded-2xl overflow-hidden"
          style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}>

          <button
            onClick={() => setAboutOpen((o) => !o)}
            className="w-full flex items-center justify-between px-6 py-5 touch-manipulation text-left"
          >
            <span className="text-sm font-medium text-white/70 tracking-wide">What is RTHMIC?</span>
            <span className="text-white/35 text-lg leading-none transition-transform duration-200"
              style={{ transform: aboutOpen ? "rotate(45deg)" : "rotate(0deg)" }}>
              +
            </span>
          </button>

          {aboutOpen && (
            <div className="px-6 pb-6 flex flex-col gap-4 border-t border-white/[0.06]">

              <div className="pt-4 flex flex-col gap-1.5">
                <p className="text-[10px] text-white/40 uppercase tracking-[0.3em]">What</p>
                <p className="text-sm text-white/70 leading-relaxed">
                  RTHMIC generates complete songs — built specifically for your immediate challenge in the moment.
                  Each song is called a Rthm. Not background music. A tool.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <p className="text-[10px] text-white/40 uppercase tracking-[0.3em]">When</p>
                <p className="text-sm text-white/70 leading-relaxed">
                  Use it when you&apos;re stuck, overwhelmed, procrastinating, or frozen before a task.
                  The moment you notice resistance — that&apos;s when RTHMIC works.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <p className="text-[10px] text-white/40 uppercase tracking-[0.3em]">How</p>
                <p className="text-sm text-white/70 leading-relaxed">
                  You speak your state. RTHMIC generates a Rthm built for exactly what you&apos;re facing.
                  Over time you build a personal library — a toolkit of tracks that work specifically for you.
                </p>
              </div>

              {!isSignedIn && (
                <button
                  onClick={() => { setAboutOpen(false); setAccessState("form"); setTimeout(() => window.scrollTo({ top: 9999, behavior: "smooth" }), 100); }}
                  className="mt-1 w-full py-4 rounded-xl text-sm font-semibold tracking-wide text-center active:scale-[0.98] transition-all touch-manipulation"
                  style={{ background: "rgba(201,165,90,0.1)", border: "1px solid rgba(201,165,90,0.35)", color: "#c9a55a" }}
                >
                  Request Beta Access →
                </button>
              )}
            </div>
          )}
        </div>
      </RevealBlock>

    </main>
  );
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M4 2.5L13 8L4 13.5V2.5Z" fill="rgba(201,165,90,0.9)" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="2.5" width="3.5" height="11" rx="1" fill="rgba(201,165,90,0.9)" />
      <rect x="9.5" y="2.5" width="3.5" height="11" rx="1" fill="rgba(201,165,90,0.9)" />
    </svg>
  );
}
