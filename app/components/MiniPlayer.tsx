"use client";

import { useAudio } from "@/app/contexts/AudioContext";
import { usePathname } from "next/navigation";
import { tracks } from "@/app/data/tracks";

// Pages with their own inline playback UI — MiniPlayer is redundant there
const SUPPRESS_ON = ["/library", "/speak"];

export default function MiniPlayer() {
  const {
    currentTrackId, currentTitle, isPlaying, loadingId,
    currentTime, duration, handlePlay, restart, seek,
  } = useAudio();
  const pathname = usePathname();

  if (!currentTrackId) return null;
  if (SUPPRESS_ON.some((p) => pathname.startsWith(p))) return null;

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

  const handleToggle = () => {
    if (track) handlePlay(track.id, track.audioKey);
    // URL-based songs: toggle is handled internally by context (same id = pause/resume)
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 pb-safe">
      <div className="mx-4 mb-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 overflow-hidden shadow-lg">

        {/* Progress bar */}
        <div
          className="h-[3px] bg-white/10 cursor-pointer relative"
          onClick={handleScrub}
        >
          <div
            className="h-full bg-white/50 transition-none"
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
            onClick={handleToggle}
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
