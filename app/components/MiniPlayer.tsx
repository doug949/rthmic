"use client";

import { useAudio } from "@/app/contexts/AudioContext";

export default function MiniPlayer() {
  const {
    currentTrackId, currentTitle, isPlaying, loadingId,
    currentTime, duration, playerOpen, openPlayer, stop,
  } = useAudio();

  // Don't show if nothing is playing, or the full-screen player is already open
  if (!currentTrackId || playerOpen) return null;

  const displayTitle = currentTitle ?? "Playing…";
  const isLoading    = loadingId === currentTrackId;
  const progress     = duration > 0 ? currentTime / duration : 0;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 pb-safe"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 8px)" }}
    >
      <button
        onClick={openPlayer}
        className="mx-4 mb-3 rounded-2xl overflow-hidden w-[calc(100%-32px)] text-left touch-manipulation active:scale-[0.98] transition-transform block"
        style={{ background: "rgba(20,30,55,0.92)", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(16px)", boxShadow: "0 4px 24px rgba(0,0,0,0.4)" }}
        aria-label="Open player"
      >
        {/* Progress line */}
        <div className="h-[2px]" style={{ background: "rgba(255,255,255,0.08)" }}>
          <div className="h-full transition-none" style={{ width: `${progress * 100}%`, background: "rgba(255,255,255,0.45)" }} />
        </div>

        {/* Row */}
        <div className="flex items-center gap-3 px-4 py-3">
          {/* Playing indicator */}
          <div className="flex-shrink-0">
            {isLoading ? (
              <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
            ) : isPlaying ? (
              <div className="flex items-end gap-[2px] h-4">
                {[1, 2, 3].map((i) => (
                  <span key={i} className="w-[3px] bg-white/50 rounded-full animate-wave" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            ) : (
              <div className="w-4 h-4 flex items-center justify-center">
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="text-white/50 ml-0.5">
                  <path d="M2 1.5L10 6L2 10.5V1.5Z" fill="currentColor" />
                </svg>
              </div>
            )}
          </div>

          {/* Title */}
          <p className="flex-1 text-sm font-medium text-white/80 truncate">
            {displayTitle}
          </p>

          {/* Dismiss */}
          <button
            onClick={(e) => { e.stopPropagation(); stop(); }}
            className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full touch-manipulation active:bg-white/10 transition-colors"
            aria-label="Dismiss player"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-white/35">
              <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </button>
    </div>
  );
}
