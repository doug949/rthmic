"use client";

import Link from "next/link";
import { useAudio } from "@/app/contexts/AudioContext";
import { tracks } from "@/app/data/tracks";

// Curated starter RTHMs — good for "I'm stuck, help me now"
const STARTER_IDS = ["22", "76", "7"] as const; // Early Motion 1 / The Starting Song 11 / Collapse the Fog 1

const starterTracks = STARTER_IDS.map(
  (id) => tracks.find((t) => t.id === id)!
).filter(Boolean);

export default function UnlockPage() {
  const { currentTrackId, isPlaying, loadingId, handlePlay } = useAudio();

  return (
    <main className="min-h-screen bg-[#0a0a0a] flex flex-col px-6 pt-safe">
      {/* Nav */}
      <header className="flex items-center gap-4 pt-12 pb-8">
        <Link
          href="/"
          className="text-white/30 hover:text-white/60 transition-colors text-sm tracking-widest uppercase"
        >
          ← Back
        </Link>
        <span className="text-white/15 text-sm uppercase tracking-widest ml-auto">
          Unlock
        </span>
      </header>

      {/* Hero */}
      <section className="mb-10">
        <h2 className="text-3xl font-semibold text-white leading-tight">
          Stuck?
        </h2>
        <p className="text-base text-white/40 mt-2 leading-relaxed">
          Pick one. Press play. Move.
        </p>
      </section>

      {/* Starter tracks */}
      <section className="flex flex-col gap-4">
        {starterTracks.map((track, i) => {
          const isActive = currentTrackId === track.id;
          const isCurrentlyPlaying = isActive && isPlaying;
          const isLoading = loadingId === track.id;

          return (
            <button
              key={track.id}
              onClick={() => handlePlay(track.id, track.audioKey)}
              className={`
                w-full flex items-center gap-5 px-6 py-6 rounded-2xl border
                transition-all duration-150 text-left touch-manipulation
                active:scale-[0.98]
                ${
                  isActive
                    ? "bg-white/12 border-white/25"
                    : "bg-white/[0.04] border-white/[0.09] hover:bg-white/[0.08]"
                }
              `}
              aria-label={`Play ${track.title}`}
            >
              {/* Big play button circle */}
              <div
                className={`
                  flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center
                  border transition-all duration-200
                  ${isActive ? "bg-white/20 border-white/30" : "bg-white/[0.07] border-white/[0.12]"}
                `}
              >
                {isLoading ? (
                  <LoadingIcon />
                ) : isCurrentlyPlaying ? (
                  <PauseIcon />
                ) : (
                  <PlayIcon />
                )}
              </div>

              {/* Track info */}
              <div className="flex-1 min-w-0">
                <p
                  className={`text-base font-semibold leading-snug ${
                    isActive ? "text-white" : "text-white/75"
                  }`}
                >
                  {track.title}
                </p>
                {isCurrentlyPlaying && (
                  <div className="flex items-end gap-[3px] h-3 mt-2">
                    {[1, 2, 3].map((j) => (
                      <span
                        key={j}
                        className="w-[3px] bg-white/50 rounded-full animate-wave"
                        style={{ animationDelay: `${j * 0.15}s` }}
                      />
                    ))}
                  </div>
                )}
                {!isCurrentlyPlaying && (
                  <p className="text-xs text-white/25 mt-1 uppercase tracking-widest">
                    RTHM {String(i + 1).padStart(2, "0")}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </section>

      {/* Explore link */}
      <footer className="mt-auto pb-32 pt-10">
        <Link
          href="/explore"
          className="block w-full py-4 rounded-2xl border border-white/[0.08] text-center text-sm text-white/30 tracking-wide hover:text-white/50 transition-colors touch-manipulation"
        >
          Browse all RTHMs →
        </Link>
      </footer>
    </main>
  );
}

function PlayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" className="text-white ml-0.5">
      <path d="M4 2.5L13 8L4 13.5V2.5Z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" className="text-white">
      <rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
      <rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
    </svg>
  );
}

function LoadingIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" className="text-white/60 animate-spin">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="20 18" />
    </svg>
  );
}
