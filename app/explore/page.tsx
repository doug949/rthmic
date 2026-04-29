"use client";

import Link from "next/link";
import { useAudio } from "@/app/contexts/AudioContext";
import { tracks } from "@/app/data/tracks";

// Deterministic pseudo-random from seed — no library needed
function seededRand(seed: number) {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

// Bubble size: 3 tiers
const SIZES = [56, 68, 82] as const;

// Muted palette — calm, spatial
const COLORS = [
  "rgba(120,100,255,0.18)",
  "rgba(80,180,200,0.18)",
  "rgba(200,120,180,0.15)",
  "rgba(100,200,160,0.15)",
  "rgba(220,160,80,0.13)",
] as const;

// Field dimensions
const FIELD_WIDTH = 420; // max mobile width
const FIELD_HEIGHT = 3200;

interface Bubble {
  id: string;
  title: string;
  audioKey: string;
  x: number;
  y: number;
  size: number;
  color: string;
  animDelay: number;
}

function generateBubbles(): Bubble[] {
  const bubbles: Bubble[] = [];
  const total = tracks.length;

  for (let i = 0; i < total; i++) {
    const track = tracks[i];
    const seed = i * 7;

    const size = SIZES[i % 3];
    const color = COLORS[i % COLORS.length];

    // Distribute vertically with some randomness, horizontal keeps bubbles on screen
    const baseY = (i / total) * (FIELD_HEIGHT - 100) + 40;
    const offsetY = (seededRand(seed + 3) - 0.5) * 160;
    const y = Math.max(size / 2 + 10, Math.min(FIELD_HEIGHT - size / 2 - 10, baseY + offsetY));

    const margin = size / 2 + 10;
    const x = margin + seededRand(seed + 5) * (FIELD_WIDTH - margin * 2);

    bubbles.push({
      id: track.id,
      title: track.title,
      audioKey: track.audioKey,
      x,
      y,
      size,
      color,
      animDelay: seededRand(seed + 9) * 4,
    });
  }

  return bubbles;
}

const BUBBLES = generateBubbles();

export default function ExplorePage() {
  const { currentTrackId, isPlaying, loadingId, handlePlay } = useAudio();

  return (
    <main className="min-h-screen bg-[#0a0a0a] flex flex-col pt-safe">
      {/* Fixed header */}
      <header className="flex items-center gap-4 px-6 pt-12 pb-4 flex-shrink-0">
        <Link
          href="/"
          className="text-white/30 hover:text-white/60 transition-colors text-sm tracking-widest uppercase"
        >
          ← Back
        </Link>
        <span className="text-white/15 text-sm uppercase tracking-widest ml-auto">
          {tracks.length} RTHMs
        </span>
      </header>

      <p className="px-6 pb-6 text-xs text-white/25 tracking-wide flex-shrink-0">
        Scroll to explore · Tap to play
      </p>

      {/* Scrollable scape */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden pb-28" style={{ WebkitOverflowScrolling: "touch" }}>
        <div
          className="relative mx-auto"
          style={{ width: "100%", maxWidth: FIELD_WIDTH, height: FIELD_HEIGHT }}
        >
          {BUBBLES.map((bubble) => {
            const isActive = currentTrackId === bubble.id;
            const isCurrentlyPlaying = isActive && isPlaying;
            const isLoading = loadingId === bubble.id;

            return (
              <button
                key={bubble.id}
                onClick={() => handlePlay(bubble.id, bubble.audioKey)}
                className="absolute touch-manipulation transition-transform duration-150 active:scale-95 focus:outline-none"
                style={{
                  left: bubble.x,
                  top: bubble.y,
                  width: bubble.size,
                  height: bubble.size,
                  transform: "translate(-50%, -50%)",
                  animationDelay: `${bubble.animDelay}s`,
                }}
                aria-label={`Play ${bubble.title}`}
              >
                {/* Bubble */}
                <div
                  className={`
                    w-full h-full rounded-full flex items-center justify-center
                    border transition-all duration-200
                    animate-float
                    ${isActive ? "border-white/40 scale-110" : "border-white/[0.12]"}
                  `}
                  style={{
                    background: isActive
                      ? `rgba(255,255,255,0.15)`
                      : bubble.color,
                    animationDelay: `${bubble.animDelay}s`,
                  }}
                >
                  {isLoading ? (
                    <LoadingDot />
                  ) : isCurrentlyPlaying ? (
                    <WaveIndicator />
                  ) : null}
                </div>

                {/* Label — shown below bubble */}
                <p
                  className={`
                    absolute top-full mt-1.5 left-1/2 -translate-x-1/2
                    text-[10px] leading-tight text-center whitespace-nowrap
                    max-w-[120px] overflow-hidden text-ellipsis
                    pointer-events-none
                    ${isActive ? "text-white/80" : "text-white/30"}
                  `}
                  style={{ maxWidth: Math.max(bubble.size + 20, 90) }}
                >
                  {bubble.title}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </main>
  );
}

function WaveIndicator() {
  return (
    <div className="flex items-end gap-[2px] h-3">
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className="w-[2px] bg-white/70 rounded-full animate-wave"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

function LoadingDot() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="text-white/60 animate-spin">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="20 18" />
    </svg>
  );
}
