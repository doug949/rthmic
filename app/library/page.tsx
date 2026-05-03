"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import type { SavedRhythm } from "@/app/api/library/route";

type LoadState = "loading" | "ready" | "error";

export default function LibraryPage() {
  const [rhythms, setRhythms] = useState<SavedRhythm[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioElRef = useRef<HTMLAudioElement>(null);

  const fetchLibrary = useCallback(async () => {
    try {
      const res = await fetch("/api/library");
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setRhythms(data.rhythms ?? []);
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

  const mutate = useCallback(async (body: Record<string, unknown>) => {
    await fetch("/api/library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    fetchLibrary(); // re-fetch to stay in sync with server
  }, [fetchLibrary]);

  const handleRemove = (id: string) => mutate({ action: "remove", id });

  const handleToggleArchive = (rhythm: SavedRhythm) =>
    mutate({
      action: "update",
      id: rhythm.id,
      status: rhythm.status === "archived" ? "active" : "archived",
    });

  const togglePlay = useCallback((rhythm: SavedRhythm) => {
    const el = audioElRef.current;
    if (!el || !rhythm.audioUrl) return;

    if (playingId === rhythm.id) {
      if (isPlaying) {
        el.pause();
        setIsPlaying(false);
      } else {
        el.play().catch(console.error);
        setIsPlaying(true);
      }
      return;
    }

    el.pause();
    el.src = rhythm.audioUrl;
    el.load();
    el.play().catch(() => setIsPlaying(false));
    setPlayingId(rhythm.id);
    setIsPlaying(true);
  }, [playingId, isPlaying]);

  const active = rhythms.filter((r) => r.status === "active");
  const archived = rhythms.filter((r) => r.status === "archived");

  return (
    <main className="min-h-screen bg-[#0d1628] flex flex-col px-6 pt-safe">
      <audio
        ref={audioElRef}
        onEnded={() => setIsPlaying(false)}
        onError={() => setIsPlaying(false)}
        preload="none"
      />

      <header className="flex items-center gap-4 pt-12 pb-8">
        <Link
          href="/"
          className="text-white/30 hover:text-white/60 transition-colors text-sm tracking-widest uppercase"
        >
          ← Back
        </Link>
        <span className="text-white/15 text-sm uppercase tracking-widest ml-auto">Library</span>
      </header>

      <section className="flex-1 flex flex-col gap-8 pb-16">

        {/* My Rhythms */}
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline gap-2">
            <h2 className="text-lg font-light tracking-wide text-white" style={{ fontFamily: "var(--font-display)" }}>My Rhythms</h2>
            {active.length > 0 && (
              <span className="text-[10px] text-white/25 tabular-nums">{active.length}</span>
            )}
          </div>

          {loadState === "loading" && (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 rounded-full border-2 border-white/15 border-t-white/40 animate-spin" />
            </div>
          )}

          {loadState === "error" && (
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-6 text-center">
              <p className="text-sm text-white/25">Couldn't load library. Check your connection.</p>
            </div>
          )}

          {loadState === "ready" && active.length === 0 && (
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-8 flex flex-col items-center gap-3">
              <p className="text-sm text-white/25 text-center leading-relaxed">
                Rhythms you generate will appear here.
              </p>
              <Link
                href="/speak"
                className="text-xs text-white/30 underline underline-offset-4 hover:text-white/50 transition-colors"
              >
                Speak your state →
              </Link>
            </div>
          )}

          {loadState === "ready" && active.length > 0 && (
            <div className="flex flex-col gap-2">
              {active.map((rhythm) => (
                <RhythmRow
                  key={rhythm.id}
                  rhythm={rhythm}
                  playing={playingId === rhythm.id && isPlaying}
                  onPlay={() => togglePlay(rhythm)}
                  onArchive={() => handleToggleArchive(rhythm)}
                  onRemove={() => handleRemove(rhythm.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Curated Library */}
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-light tracking-wide text-white" style={{ fontFamily: "var(--font-display)" }}>Curated Library</h2>
          <Link
            href="/explore"
            className="flex items-center gap-5 px-6 py-6 rounded-2xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] active:scale-[0.98] transition-all touch-manipulation"
          >
            <span className="text-2xl flex-shrink-0 text-white/30" aria-hidden>◎</span>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-white/80 tracking-wide">Explore</p>
              <p className="text-sm text-white/35 mt-0.5">20 hand-selected rhythms</p>
            </div>
            <span className="text-white/20 text-lg flex-shrink-0">›</span>
          </Link>
        </div>

        {/* Archived */}
        {archived.length > 0 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-light tracking-widest text-white/25 uppercase">Archived</h2>
            <div className="flex flex-col gap-2">
              {archived.map((rhythm) => (
                <RhythmRow
                  key={rhythm.id}
                  rhythm={rhythm}
                  playing={playingId === rhythm.id && isPlaying}
                  onPlay={() => togglePlay(rhythm)}
                  onArchive={() => handleToggleArchive(rhythm)}
                  onRemove={() => handleRemove(rhythm.id)}
                  dimmed
                />
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function RhythmRow({
  rhythm,
  playing,
  onPlay,
  onArchive,
  onRemove,
  dimmed,
}: {
  rhythm: SavedRhythm;
  playing: boolean;
  onPlay: () => void;
  onArchive: () => void;
  onRemove: () => void;
  dimmed?: boolean;
}) {
  const canPlay = !!rhythm.audioUrl;
  // Suno audio URLs expire after ~24–48h; warn on entries older than 20h
  const mayBeExpired = Date.now() - rhythm.savedAt > 20 * 60 * 60 * 1000;

  return (
    <div
      className={`rounded-2xl border transition-all duration-200
        ${playing ? "bg-white/[0.08] border-white/20" : "bg-white/[0.03] border-white/[0.08]"}
        ${dimmed ? "opacity-50" : ""}`}
    >
      <button
        onClick={onPlay}
        disabled={!canPlay}
        className="w-full flex items-center gap-4 px-5 py-4 text-left touch-manipulation active:scale-[0.99] transition-transform disabled:opacity-40"
      >
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center border flex-shrink-0
            ${playing ? "bg-white/15 border-white/30" : "bg-white/[0.06] border-white/[0.10]"}`}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold leading-snug truncate ${playing ? "text-white" : "text-white/75"}`}>
            {rhythm.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[9px] text-white/20 uppercase tracking-widest">{rhythm.pillar}</span>
            {mayBeExpired && !playing && canPlay && (
              <span className="text-[9px] text-white/12 uppercase tracking-widest">· may have expired</span>
            )}
          </div>
        </div>
      </button>

      <div className="flex border-t border-white/[0.06]">
        <SmallBtn
          onClick={onArchive}
          label={rhythm.status === "archived" ? "Restore" : "Archive"}
          icon="⊙"
        />
        <SmallBtn onClick={onRemove} label="Remove" icon="×" danger />
      </div>
    </div>
  );
}

// ─── Micro components ─────────────────────────────────────────────────────────

function SmallBtn({ onClick, label, icon, danger }: {
  onClick: () => void; label: string; icon: string; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center gap-1 py-2.5 touch-manipulation transition-colors
        ${danger ? "text-white/20 hover:text-red-400/50" : "text-white/20 hover:text-white/40"}`}
    >
      <span className="text-sm leading-none">{icon}</span>
      <span className="uppercase tracking-widest text-[9px]">{label}</span>
    </button>
  );
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-white ml-0.5">
      <path d="M4 2.5L13 8L4 13.5V2.5Z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-white">
      <rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
      <rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
    </svg>
  );
}
