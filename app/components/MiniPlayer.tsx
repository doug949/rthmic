"use client";

import { useAudio } from "@/app/contexts/AudioContext";
import { tracks } from "@/app/data/tracks";

export default function MiniPlayer() {
  const { currentTrackId, isPlaying, loadingId, handlePlay } = useAudio();

  if (!currentTrackId) return null;

  const track = tracks.find((t) => t.id === currentTrackId);
  if (!track) return null;

  const isLoading = loadingId === currentTrackId;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 pb-safe">
      <div className="mx-4 mb-4 flex items-center gap-4 px-5 py-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15">
        <button
          onClick={() => handlePlay(track.id, track.audioKey)}
          className="flex-shrink-0 w-10 h-10 rounded-full bg-white/15 flex items-center justify-center active:scale-95 transition-transform touch-manipulation"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isLoading ? (
            <LoadingIcon />
          ) : isPlaying ? (
            <PauseIcon />
          ) : (
            <PlayIcon />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate tracking-wide">
            {track.title}
          </p>
          <p className="text-xs text-white/40 mt-0.5 uppercase tracking-widest">
            {isLoading ? "Loading…" : isPlaying ? "Playing" : "Paused"}
          </p>
        </div>

        {isPlaying && (
          <div className="flex-shrink-0 flex items-end gap-[3px] h-4">
            {[1, 2, 3].map((i) => (
              <span
                key={i}
                className="w-[3px] bg-white/50 rounded-full animate-wave"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        )}
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

function LoadingIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-white/70 animate-spin">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="20 18" />
    </svg>
  );
}
