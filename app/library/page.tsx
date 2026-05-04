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

  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  const handleRemove = (id: string) => {
    if (confirmRemoveId === id) {
      mutate({ action: "remove", id });
      setConfirmRemoveId(null);
    } else {
      setConfirmRemoveId(id);
      setTimeout(() => setConfirmRemoveId(c => c === id ? null : c), 3000);
    }
  };

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

  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const active = rhythms.filter((r) => r.status === "active");
  const archived = rhythms.filter((r) => r.status === "archived");
  const recentlyDeleted = rhythms.filter(
    (r) => r.status === "deleted" && r.deletedAt !== undefined && now - r.deletedAt < THIRTY_DAYS
  );

  const handleRestore = (id: string) =>
    mutate({ action: "update", id, status: "active" });

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
                  confirmingRemove={confirmRemoveId === rhythm.id}
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
                  confirmingRemove={confirmRemoveId === rhythm.id}
                  dimmed
                />
              ))}
            </div>
          </div>
        )}

        {/* Recently Deleted */}
        {recentlyDeleted.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-light tracking-widest text-white/20 uppercase">Recently Deleted</h2>
              <span className="text-[9px] text-white/15">Recoverable for 30 days</span>
            </div>
            <div className="flex flex-col gap-2">
              {recentlyDeleted.map((rhythm) => {
                const daysLeft = Math.ceil((THIRTY_DAYS - (now - (rhythm.deletedAt ?? now))) / (24 * 60 * 60 * 1000));
                return (
                  <div key={rhythm.id} className="rounded-2xl border border-white/[0.05] bg-white/[0.02] opacity-40">
                    <div className="flex items-center gap-4 px-5 py-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white/50 truncate">{rhythm.title}</p>
                        <p className="text-[9px] text-white/20 uppercase tracking-widest mt-0.5">
                          {daysLeft} day{daysLeft !== 1 ? "s" : ""} left to restore
                        </p>
                      </div>
                      <button
                        onClick={() => handleRestore(rhythm.id)}
                        className="flex-shrink-0 text-[10px] uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors touch-manipulation px-3 py-1.5 rounded-lg border border-white/[0.08] hover:border-white/20"
                      >
                        Restore
                      </button>
                    </div>
                  </div>
                );
              })}
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
  confirmingRemove,
  dimmed,
}: {
  rhythm: SavedRhythm;
  playing: boolean;
  onPlay: () => void;
  onArchive: () => void;
  onRemove: () => void;
  confirmingRemove?: boolean;
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
          sublabel={rhythm.status === "archived" ? "Back to active" : "Keep but hide"}
          icon="⊙"
        />
        <SmallBtn
          onClick={onRemove}
          label={confirmingRemove ? "Confirm?" : "Remove"}
          sublabel={confirmingRemove ? "Tap again to delete" : "Delete from library"}
          icon="×"
          danger
          confirming={confirmingRemove}
        />
      </div>
    </div>
  );
}

// ─── Micro components ─────────────────────────────────────────────────────────

function SmallBtn({ onClick, label, sublabel, icon, danger, confirming }: {
  onClick: () => void; label: string; sublabel?: string; icon: string; danger?: boolean; confirming?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 touch-manipulation transition-colors
        ${confirming ? "text-red-400/80"
          : danger ? "text-white/20 hover:text-red-400/50"
          : "text-white/20 hover:text-white/40"}`}
    >
      <span className="text-sm leading-none">{icon}</span>
      <span className="uppercase tracking-widest text-[9px]">{label}</span>
      {sublabel && <span className="text-[8px] opacity-60 normal-case tracking-normal">{sublabel}</span>}
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
