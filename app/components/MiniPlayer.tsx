"use client";

import { useState } from "react";
import { useAudio } from "@/app/contexts/AudioContext";

export default function MiniPlayer() {
  const {
    currentTrackId, currentTitle, isPlaying, loadingId,
    currentTime, duration, playerOpen, openPlayer, stop, togglePlayPause,
  } = useAudio();
  const [tucked, setTucked] = useState(false);

  // Don't show if nothing is playing, or the full-screen player is already open
  if (!currentTrackId || playerOpen) return null;

  const displayTitle = currentTitle ?? "Playing…";
  const isLoading    = loadingId === currentTrackId;
  const progress     = duration > 0 ? currentTime / duration : 0;

  if (tucked) {
    return (
      <div
        className="fixed bottom-0 right-0 z-40 pb-safe"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 10px)" }}
      >
        <div
          className="mr-3 mb-3 flex items-center gap-1 rounded-full border px-1.5 py-1.5"
          style={{
            background: "rgba(13,22,40,0.9)",
            borderColor: "rgba(255,255,255,0.12)",
            backdropFilter: "blur(16px)",
            boxShadow: "0 4px 22px rgba(0,0,0,0.38)",
          }}
        >
          <button
            onClick={togglePlayPause}
            disabled={isLoading}
            className="w-9 h-9 flex items-center justify-center rounded-full touch-manipulation active:bg-white/10 disabled:opacity-40 transition-colors"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isLoading ? <Spinner /> : isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button
            onClick={() => setTucked(false)}
            className="w-9 h-9 flex items-center justify-center rounded-full touch-manipulation active:bg-white/10 transition-colors"
            aria-label="Show mini player"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-white/45">
              <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 pb-safe"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 8px)" }}
    >
      <div
        className="mx-4 mb-3 rounded-2xl overflow-hidden w-[calc(100%-32px)] text-left transition-transform"
        style={{ background: "rgba(13,22,40,0.94)", border: "1px solid rgba(255,255,255,0.14)", backdropFilter: "blur(16px)", boxShadow: "0 4px 24px rgba(0,0,0,0.42)" }}
      >
        {/* Progress line */}
        <div className="h-[2px]" style={{ background: "rgba(255,255,255,0.08)" }}>
          <div className="h-full transition-none" style={{ width: `${progress * 100}%`, background: "rgba(255,255,255,0.45)" }} />
        </div>

        {/* Row */}
        <div className="flex items-center gap-2 px-3 py-3">
          <button
            onClick={togglePlayPause}
            disabled={isLoading}
            className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full touch-manipulation active:bg-white/10 disabled:opacity-40 transition-colors"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isLoading ? <Spinner /> : isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>

          <button
            onClick={openPlayer}
            className="flex-1 min-w-0 flex items-center gap-3 rounded-xl px-1 py-1 text-left touch-manipulation active:opacity-70 transition-opacity"
            aria-label="Open player"
          >
            <PlayingIndicator isPlaying={isPlaying} isLoading={isLoading} />
            <p className="flex-1 text-sm font-medium text-white/80 truncate">
              {displayTitle}
            </p>
          </button>

          <button
            onClick={() => setTucked(true)}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full touch-manipulation active:bg-white/10 transition-colors"
            aria-label="Slide player out of the way"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="text-white/35">
              <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Dismiss */}
          <button
            onClick={stop}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full touch-manipulation active:bg-white/10 transition-colors"
            aria-label="Dismiss player"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-white/35">
              <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function PlayingIndicator({ isPlaying, isLoading }: { isPlaying: boolean; isLoading: boolean }) {
  if (isLoading) return <Spinner small />;
  if (isPlaying) {
    return (
      <div className="flex-shrink-0 flex items-end gap-[2px] h-4">
        {[1, 2, 3].map((i) => (
          <span key={i} className="w-[3px] bg-white/50 rounded-full animate-wave" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    );
  }
  return (
    <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="text-white/50 ml-0.5">
        <path d="M2 1.5L10 6L2 10.5V1.5Z" fill="currentColor" />
      </svg>
    </div>
  );
}

function Spinner({ small }: { small?: boolean }) {
  const size = small ? "w-4 h-4" : "w-5 h-5";
  return <div className={`${size} rounded-full border-2 border-white/20 border-t-white/60 animate-spin`} />;
}

function PlayIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="text-white/68 ml-0.5">
      <path d="M4 2.5L13 8L4 13.5V2.5Z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="text-white/68">
      <rect x="3" y="2.5" width="3.5" height="11" rx="1" fill="currentColor" />
      <rect x="9.5" y="2.5" width="3.5" height="11" rx="1" fill="currentColor" />
    </svg>
  );
}
