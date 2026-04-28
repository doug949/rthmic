"use client";

import { Track } from "@/app/data/tracks";

interface Props {
  track: Track;
  index: number;
  isPlaying: boolean;
  isActive: boolean;
  isLoading: boolean;
  onPlay: (trackId: string, audioKey: string) => void;
}

export default function TrackItem({
  track,
  index,
  isPlaying,
  isActive,
  isLoading,
  onPlay,
}: Props) {
  return (
    <button
      onClick={() => onPlay(track.id, track.audioKey)}
      className={`
        w-full flex items-center gap-4 px-5 py-4 rounded-xl
        transition-all duration-200 text-left
        min-h-[64px] touch-manipulation
        ${
          isActive
            ? "bg-white/10 border border-white/20"
            : "bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.07] active:bg-white/10"
        }
      `}
    >
      {/* Track number / play state */}
      <div className="flex-shrink-0 w-8 flex items-center justify-center">
        {isLoading ? (
          <LoadingIcon />
        ) : isPlaying ? (
          <PauseIcon />
        ) : isActive ? (
          <PlayIcon active />
        ) : (
          <span className="text-sm text-white/30 font-mono tabular-nums">
            {String(index).padStart(2, "0")}
          </span>
        )}
      </div>

      {/* Track info */}
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-medium truncate tracking-wide ${
            isActive ? "text-white" : "text-white/70"
          }`}
        >
          {track.title}
        </p>
      </div>

      {/* Waveform animation when playing */}
      {isPlaying && (
        <div className="flex-shrink-0 flex items-end gap-[3px] h-4">
          {[1, 2, 3].map((i) => (
            <span
              key={i}
              className="w-[3px] bg-white/60 rounded-full animate-wave"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      )}
    </button>
  );
}

function PlayIcon({ active }: { active?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={active ? "text-white" : "text-white/40"}>
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
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-white/50 animate-spin">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="20 18" />
    </svg>
  );
}
