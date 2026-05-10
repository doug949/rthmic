"use client";

import { useAudio } from "@/app/contexts/AudioContext";
import { tracks } from "@/app/data/tracks";
import { useState, useRef, useEffect, CSSProperties } from "react";

const PLAYER_WIDTH = 300; // px — fixed width of the floating card

export default function MiniPlayer() {
  const { currentTrackId, currentTitle, isPlaying, loadingId, currentTime, duration, handlePlay, restart, seek } = useAudio();

  // pos: null = use CSS default (bottom-center); set after first mount or drag
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    startX: number; startY: number;
    origX: number; origY: number;
    moved: boolean;
  } | null>(null);

  // Initialise position once the card is measurable
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const h = el.getBoundingClientRect().height || 80;
    setPos({
      x: Math.max(8, (window.innerWidth - PLAYER_WIDTH) / 2),
      y: window.innerHeight - h - 16,
    });
  }, []); // only on first mount

  if (!currentTrackId) return null;

  // Library track (mock) — look up by id; Suno song — use currentTitle
  const track = tracks.find((t) => t.id === currentTrackId);
  const displayTitle = track?.title ?? currentTitle ?? "Playing…";
  const isLoading = loadingId === currentTrackId;
  const progress = duration > 0 ? currentTime / duration : 0;

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    seek(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration);
  };

  // ── Drag handlers (pointer events — works for touch + mouse) ──────────────
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only handle drags from the grip handle
    if (!(e.target as HTMLElement).closest("[data-drag-handle]")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const current = pos ?? {
      x: Math.max(8, (window.innerWidth - PLAYER_WIDTH) / 2),
      y: window.innerHeight - 96,
    };
    dragState.current = {
      startX: e.clientX, startY: e.clientY,
      origX: current.x, origY: current.y,
      moved: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    if (Math.abs(dx) + Math.abs(dy) > 3) dragState.current.moved = true;

    const el = containerRef.current;
    const h = el?.getBoundingClientRect().height ?? 80;
    setPos({
      x: Math.max(8, Math.min(window.innerWidth - PLAYER_WIDTH - 8, dragState.current.origX + dx)),
      y: Math.max(8, Math.min(window.innerHeight - h - 8, dragState.current.origY + dy)),
    });
  };

  const onPointerUp = () => { dragState.current = null; };

  // ── Position style ─────────────────────────────────────────────────────────
  const posStyle: CSSProperties = pos
    ? { left: pos.x, top: pos.y, bottom: "auto" }
    : { left: "50%", bottom: 16, transform: "translateX(-50%)" };

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="fixed z-40 select-none"
      style={{ width: PLAYER_WIDTH, ...posStyle }}
    >
      <div className="rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 overflow-hidden shadow-xl">

        {/* Drag handle */}
        <div
          data-drag-handle
          className="flex items-center justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing touch-none"
          aria-label="Drag to move player"
        >
          <DragGripIcon />
        </div>

        {/* Progress bar */}
        <div
          className="h-[3px] bg-white/10 cursor-pointer relative mx-3 rounded-full overflow-hidden"
          onClick={handleScrub}
        >
          <div
            className="h-full bg-white/50 transition-none rounded-full"
            style={{ width: `${progress * 100}%` }}
          />
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-3 px-4 py-3">

          {/* Restart */}
          <button
            onClick={restart}
            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white/70 active:scale-90 transition-all touch-manipulation"
            aria-label="Restart"
          >
            <RestartIcon />
          </button>

          {/* Play / Pause */}
          <button
            onClick={() => track ? handlePlay(track.id, track.audioKey) : undefined}
            className="flex-shrink-0 w-10 h-10 rounded-full bg-white/15 flex items-center justify-center active:scale-95 transition-transform touch-manipulation"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isLoading ? <LoadingIcon /> : isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>

          {/* Title + time */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate tracking-wide">
              {displayTitle}
            </p>
            {duration > 0 && (
              <p className="text-[10px] text-white/30 mt-0.5 tabular-nums">
                {fmt(currentTime)} / {fmt(duration)}
              </p>
            )}
          </div>

          {/* Wave animation */}
          {isPlaying && !isLoading && (
            <div className="flex-shrink-0 flex items-end gap-[3px] h-4">
              {[1, 2, 3].map((i) => (
                <span
                  key={i}
                  className="w-[3px] bg-white/40 rounded-full animate-wave"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DragGripIcon() {
  return (
    <svg width="24" height="8" viewBox="0 0 24 8" fill="none" aria-hidden="true">
      <circle cx="6"  cy="2" r="1.5" fill="white" fillOpacity="0.25" />
      <circle cx="12" cy="2" r="1.5" fill="white" fillOpacity="0.25" />
      <circle cx="18" cy="2" r="1.5" fill="white" fillOpacity="0.25" />
      <circle cx="6"  cy="6" r="1.5" fill="white" fillOpacity="0.25" />
      <circle cx="12" cy="6" r="1.5" fill="white" fillOpacity="0.25" />
      <circle cx="18" cy="6" r="1.5" fill="white" fillOpacity="0.25" />
    </svg>
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

function RestartIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="text-current">
      <path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.36 2.64L3 4v5h5L6.34 7.34A7 7 0 1 1 5 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function LoadingIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-white/70 animate-spin">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="20 18" />
    </svg>
  );
}
