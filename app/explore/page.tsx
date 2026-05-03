"use client";

import Link from "next/link";
import { useState } from "react";
import { useAudio } from "@/app/contexts/AudioContext";
import { tracks } from "@/app/data/tracks";

const CATEGORIES = [
  { id: "all",     label: "All" },
  { id: "morning", label: "Morning" },
  { id: "start",   label: "Starting Up" },
  { id: "focus",   label: "Focus" },
  { id: "shows",   label: "Shows" },
  { id: "other",   label: "Other" },
] as const;

type CatId = typeof CATEGORIES[number]["id"];

function getCat(title: string): Exclude<CatId, "all"> {
  const t = title.toLowerCase();
  if (t.includes("morning menu") || t.includes("menues before bed") || t.includes("afternoon menu") || t.includes("hold the night")) return "morning";
  if (t.includes("early motion") || t.includes("get set") || t.includes("cage drop") || t.includes("danger chords")) return "start";
  if (t.includes("don't think about") || t.includes("the minimum") || t.includes("the vacuum") ||
      t.includes("i understand") || t.includes("you already know") || t.includes("outcome candidates")) return "focus";
  if (t.includes("introducing rthmic") || t.includes("you're don't know it yet")) return "shows";
  return "other";
}

export default function ExplorePage() {
  const { currentTrackId, isPlaying, loadingId, handlePlay } = useAudio();
  const [filter, setFilter] = useState<CatId>("all");

  const visible = tracks.filter(t => filter === "all" || getCat(t.title) === filter);

  return (
    <main className="min-h-screen bg-[#0d1628] flex flex-col px-6 pt-safe">
      <header className="flex items-center gap-4 pt-12 pb-6">
        <Link href="/library" className="text-white/30 hover:text-white/60 transition-colors text-sm tracking-widest uppercase">
          ← Back
        </Link>
        <span className="text-white/15 text-sm uppercase tracking-widest ml-auto">{tracks.length} tracks</span>
      </header>

      {/* Category chips */}
      <div className="flex gap-2 overflow-x-auto pb-4 -mx-6 px-6" style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setFilter(cat.id)}
            className="flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-medium tracking-wide border transition-all duration-150 touch-manipulation"
            style={{
              background: filter === cat.id ? "rgba(201,165,90,0.12)" : "rgba(255,255,255,0.03)",
              borderColor: filter === cat.id ? "rgba(201,165,90,0.45)" : "rgba(255,255,255,0.1)",
              color: filter === cat.id ? "#c9a55a" : "rgba(255,255,255,0.38)",
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Track list */}
      <section className="flex flex-col gap-2 pb-16">
        {visible.map(track => {
          const active = currentTrackId === track.id;
          const playing = active && isPlaying;
          const loading = loadingId === track.id;

          return (
            <button
              key={track.id}
              onClick={() => handlePlay(track.id, track.audioKey)}
              className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl border text-left touch-manipulation active:scale-[0.99] transition-all duration-150"
              style={{
                background: active ? "rgba(201,165,90,0.08)" : "rgba(255,255,255,0.03)",
                borderColor: active ? "rgba(201,165,90,0.35)" : "rgba(255,255,255,0.08)",
              }}
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 border"
                style={{
                  background: active ? "rgba(201,165,90,0.15)" : "rgba(255,255,255,0.06)",
                  borderColor: active ? "rgba(201,165,90,0.4)" : "rgba(255,255,255,0.1)",
                }}
              >
                {loading ? <SpinIcon /> : playing ? <WaveIcon /> : <PlayIcon active={active} />}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-snug truncate" style={{ color: active ? "#c9a55a" : "rgba(255,255,255,0.75)" }}>
                  {track.title}
                </p>
                <p className="text-[10px] uppercase tracking-widest mt-0.5" style={{ color: "rgba(255,255,255,0.2)" }}>
                  {getCat(track.title)}
                </p>
              </div>
            </button>
          );
        })}
      </section>
    </main>
  );
}

function PlayIcon({ active }: { active: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ marginLeft: 2 }}>
      <path d="M4 2.5L13 8L4 13.5V2.5Z" fill={active ? "#c9a55a" : "rgba(255,255,255,0.5)"} />
    </svg>
  );
}

function WaveIcon() {
  return (
    <div className="flex items-end gap-[2px] h-3">
      {[1, 2, 3].map(i => (
        <span key={i} className="w-[2px] rounded-full animate-wave" style={{ background: "#c9a55a", animationDelay: `${i * 0.15}s` }} />
      ))}
    </div>
  );
}

function SpinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="animate-spin" style={{ color: "rgba(255,255,255,0.4)" }}>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="20 18" />
    </svg>
  );
}
