"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { TransitionLink } from "@/app/components/TransitionLink";
import { RevealBlock } from "@/app/components/RevealBlock";
import type { SavedRhythm } from "@/app/api/library/route";

type PageState = "loading" | "ready" | "notfound" | "saving" | "saved" | "error";

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function SharePage() {
  const { token } = useParams<{ token: string }>();

  const [state, setState] = useState<PageState>("loading");
  const [rhythm, setRhythm] = useState<SavedRhythm | null>(null);

  // Playback
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Save feedback
  const [saveMsg, setSaveMsg] = useState("");

  // ── Fetch the shared Rthm ──────────────────────────────────────────────────
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

  // ── Audio wiring ───────────────────────────────────────────────────────────
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !rhythm?.audioUrl) return;
    el.src = rhythm.audioUrl;

    const onTime  = () => setCurrentTime(el.currentTime);
    const onMeta  = () => setDuration(el.duration);
    const onEnded = () => { setIsPlaying(false); setCurrentTime(0); };

    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("ended", onEnded);
    };
  }, [rhythm]);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (isPlaying) { el.pause(); setIsPlaying(false); }
    else           { el.play().catch(() => {}); setIsPlaying(true); }
  };

  // ── Save to library ────────────────────────────────────────────────────────
  const saveToLibrary = async () => {
    if (!rhythm) return;
    setState("saving");
    try {
      const res = await fetch("/api/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", rhythm }),
      });
      if (!res.ok) throw new Error("save failed");
      setState("saved");
      setSaveMsg("Saved to your library");
    } catch {
      setState("ready");
      setSaveMsg("Couldn't save — are you logged in?");
    }
  };

  // ── Lyrics helper ──────────────────────────────────────────────────────────
  const lyricsLines = rhythm?.lyrics
    ? rhythm.lyrics.split("\n").map((l) => l.trim()).filter((l) => l && !l.match(/^\[.*\]$/))
    : [];

  const introGap  = duration > 0 ? Math.min(10, duration * 0.07) : 0;
  const lyricSpan = Math.max(0, duration - introGap);
  const lineTime  = lyricsLines.length > 1 ? lyricSpan / lyricsLines.length : lyricSpan;
  const currentIdx = (isPlaying && duration > 0 && currentTime >= introGap)
    ? Math.min(Math.floor((currentTime - introGap) / lineTime), lyricsLines.length - 1)
    : -1;

  // ── Render ─────────────────────────────────────────────────────────────────
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
        <TransitionLink href="/" className="mt-4 text-sm text-white/40 hover:text-white/70 transition-colors">
          Open RTHMIC →
        </TransitionLink>
      </main>
    );
  }

  if (state === "error") {
    return (
      <main className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 gap-4 text-center"
        style={{ animation: "page-enter 380ms ease forwards" }}>
        <p className="text-white/50 text-sm">Something went wrong. Try again.</p>
        <TransitionLink href="/" className="text-sm text-white/40 hover:text-white/70 transition-colors">
          Open RTHMIC →
        </TransitionLink>
      </main>
    );
  }

  const canPlay = !!rhythm?.audioUrl;
  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <main className="relative z-10 min-h-screen flex flex-col px-6 pt-safe"
      style={{ animation: "page-enter 380ms ease forwards" }}>

      <audio ref={audioRef} preload="metadata" />

      {/* Header */}
      <RevealBlock delay={0}>
        <header className="pt-14 pb-10">
          <p className="text-xs tracking-[0.4em] uppercase mb-1" style={{ color: "#c9a55a", opacity: 0.6, fontFamily: "var(--font-display)" }}>
            RTHMIC
          </p>
          <p className="text-xs text-white/40 tracking-widest uppercase">Someone shared a Rthm with you</p>
        </header>
      </RevealBlock>

      {/* Player card */}
      <RevealBlock delay={60}>
        <div className="rounded-2xl border overflow-hidden"
          style={{ background: "rgba(201,165,90,0.05)", borderColor: "rgba(201,165,90,0.2)" }}>

          {/* Play button + info */}
          <button
            onClick={togglePlay}
            disabled={!canPlay}
            className="w-full flex items-center gap-5 px-6 py-6 text-left touch-manipulation active:scale-[0.99] transition-transform disabled:opacity-40"
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center border flex-shrink-0"
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

          {/* Lyrics — show when playing */}
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

      {/* Save / CTA */}
      <RevealBlock delay={120}>
        <div className="mt-6 flex flex-col gap-3">
          {state === "saved" ? (
            <div className="w-full py-5 rounded-2xl text-center text-sm font-medium"
              style={{ background: "rgba(201,165,90,0.06)", border: "1px solid rgba(201,165,90,0.2)", color: "rgba(201,165,90,0.8)" }}>
              ✓ {saveMsg}
            </div>
          ) : (
            <button
              onClick={saveToLibrary}
              disabled={state === "saving"}
              className="w-full py-5 rounded-2xl text-sm font-semibold tracking-wide active:scale-[0.98] transition-all touch-manipulation disabled:opacity-50"
              style={{ background: "rgba(201,165,90,0.1)", border: "1px solid rgba(201,165,90,0.4)", color: "#c9a55a" }}
            >
              {state === "saving" ? "Saving…" : "Save to my library →"}
            </button>
          )}
          {saveMsg && state !== "saved" && (
            <p className="text-center text-xs text-white/45">{saveMsg}</p>
          )}
          <TransitionLink
            href="/"
            className="w-full py-4 text-center text-sm text-white/40 hover:text-white/65 transition-colors touch-manipulation tracking-wide"
          >
            Open RTHMIC
          </TransitionLink>
        </div>
      </RevealBlock>

      {/* About blurb — only shown to people who might not know RTHMIC */}
      <RevealBlock delay={200}>
        <div className="mt-10 pb-16 border-t border-white/[0.06] pt-8 flex flex-col gap-2">
          <p className="text-[10px] text-white/35 uppercase tracking-[0.3em]">What is RTHMIC?</p>
          <p className="text-sm text-white/50 leading-relaxed">
            RTHMIC generates songs built for your exact moment — when you&apos;re stuck, overwhelmed, or need momentum.
            Speak your state. Get a Rthm.
          </p>
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
