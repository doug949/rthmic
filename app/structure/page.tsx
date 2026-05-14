"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/app/components/AppHeader";
import { RevealBlock } from "@/app/components/RevealBlock";
import { useGeneration } from "@/app/contexts/GenerationContext";
import { useAudio } from "@/app/contexts/AudioContext";
import type { SavedRhythm } from "@/app/api/library/route";

const TEAL = {
  text:   "rgba(120,210,180,0.92)",
  dim:    "rgba(100,195,165,0.65)",
  bg:     "rgba(100,195,165,0.06)",
  border: "rgba(100,195,165,0.22)",
  hover:  "rgba(100,195,165,0.12)",
};

const TIME_MENUS = [
  { slug: "morning",       label: "Morning Menu",  menuTitle: "The Morning Menu",  description: "Start the day with intention",                      seed: "My morning routine — the things I want to do as I start the day" },
  { slug: "start-the-day", label: "Start the Day", menuTitle: "Start the Day",     description: "Lay out everything you need to get through today",   seed: "Everything I need to get through today — tasks, priorities, intentions" },
  { slug: "afternoon",     label: "Afternoon",      menuTitle: "Afternoon",         description: "Check in and finish strong",                         seed: "My afternoon — what I still need to do and how I want to finish the day" },
  { slug: "end-of-day",    label: "End of Day",     menuTitle: "End of Day",        description: "Close out what happened and what carries over",      seed: "Wrapping up the day — what happened, what's done, what carries over" },
  { slug: "before-bed",    label: "Before Bed",     menuTitle: "Before Bed",        description: "Let go and wind down",                               seed: "My evening wind-down — what I want to let go of and how I want to rest" },
];

type MenuSlots = Record<string, SavedRhythm[]>;

export default function StructurePage() {
  const router = useRouter();
  const { genPhase, startGeneration } = useGeneration();
  const { handlePlayUrl, stop: stopAudio, currentTrackId, isPlaying } = useAudio();
  const [menus, setMenus] = useState<MenuSlots>({});
  const [loading, setLoading] = useState(true);
  const [newStyleSlug, setNewStyleSlug] = useState<string | null>(null);
  const [genreInput, setGenreInput] = useState("");
  const prevGenPhase = useRef<string>("idle");

  const fetchMenus = async () => {
    const entries = await Promise.all(
      TIME_MENUS.map(async (tm) => {
        try {
          const res = await fetch(`/api/menu?slug=${tm.slug}`);
          if (!res.ok) return [tm.slug, []] as [string, SavedRhythm[]];
          const data = await res.json() as { songs: SavedRhythm[] };
          return [tm.slug, data.songs ?? []] as [string, SavedRhythm[]];
        } catch {
          return [tm.slug, []] as [string, SavedRhythm[]];
        }
      })
    );
    setMenus(Object.fromEntries(entries));
    setLoading(false);
  };

  useEffect(() => { fetchMenus(); }, []);

  useEffect(() => {
    if (prevGenPhase.current === "generating" && genPhase === "ready") {
      fetchMenus();
    }
    prevGenPhase.current = genPhase;
  }, [genPhase]);

  const goRecord = (tm: typeof TIME_MENUS[0]) => {
    const params = new URLSearchParams({
      pillar: "Menus",
      seed: tm.seed,
      menuSlug: tm.slug,
      menuTitle: tm.menuTitle,
    });
    router.push(`/speak?${params.toString()}`);
  };

  const triggerNewStyle = (tm: typeof TIME_MENUS[0]) => {
    const songs = menus[tm.slug] ?? [];
    if (!songs.length) return;
    const lyrics = songs[0].lyrics ?? "";
    const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    const title = `${tm.menuTitle} — ${today}`;
    startGeneration({
      lyrics,
      style: "B",
      title,
      pillar: "Menus",
      genre: genreInput.trim() || "Indie Electronic",
      menuSlug: tm.slug,
    });
    setNewStyleSlug(null);
    setGenreInput("");
  };

  const togglePlay = (song: SavedRhythm) => {
    if (currentTrackId === song.id && isPlaying) {
      stopAudio();
    } else if (song.audioUrl) {
      handlePlayUrl(song.id, song.audioUrl, song.title);
    }
  };

  return (
    <main
      className="relative z-10 min-h-screen flex flex-col px-6"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)", animation: "page-enter 380ms ease forwards" }}
    >
      <AppHeader title="Rthmic Menus" />

      <section className="flex-1 flex flex-col pb-10">
        <RevealBlock delay={0}>
          <div className="flex flex-col gap-1 pb-6">
            <div className="flex items-center gap-2.5 mb-1">
              <span style={{ color: TEAL.dim }}><StructureIcon /></span>
              <p className="text-[10px] uppercase tracking-[0.3em]" style={{ color: TEAL.dim }}>
                Structure: Rthmic Menus
              </p>
            </div>
            <p className="text-xl font-light text-white/70 leading-snug" style={{ fontFamily: "var(--font-display)" }}>
              Imagine future you. Build your list.
            </p>
          </div>
        </RevealBlock>

        <div className="flex flex-col gap-3">
          {TIME_MENUS.map((tm, i) => {
            const songs = menus[tm.slug] ?? [];
            const hasSongs = songs.length > 0;
            const firstSong = songs[0];

            return (
              <RevealBlock key={tm.slug} delay={i * 50}>
                <div
                  className="w-full rounded-2xl border"
                  style={{ background: TEAL.bg, borderColor: TEAL.border }}
                >
                  {hasSongs ? (
                    /* ── Active menu card ── */
                    <div className="px-5 py-4">
                      {/* Title row */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs uppercase tracking-widest mb-0.5" style={{ color: TEAL.dim }}>{tm.label}</p>
                          <p className="text-sm font-medium leading-snug" style={{ color: TEAL.text }}>{firstSong.title}</p>
                        </div>
                        {/* Play button */}
                        <button
                          onClick={() => togglePlay(firstSong)}
                          className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center touch-manipulation active:scale-95 transition-transform"
                          style={{ background: TEAL.hover, border: `1px solid ${TEAL.border}` }}
                        >
                          {currentTrackId === firstSong.id && isPlaying
                            ? <PauseIcon color={TEAL.text} />
                            : <PlayIcon color={TEAL.text} />}
                        </button>
                      </div>

                      {/* Action row */}
                      {newStyleSlug === tm.slug ? (
                        <div className="flex gap-2 mt-2">
                          <input
                            autoFocus
                            value={genreInput}
                            onChange={(e) => setGenreInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") triggerNewStyle(tm); if (e.key === "Escape") setNewStyleSlug(null); }}
                            placeholder="e.g. Ambient Lo-fi, Drum & Bass"
                            className="flex-1 bg-transparent text-sm text-white/80 placeholder-white/25 outline-none border-b py-1"
                            style={{ borderColor: TEAL.border }}
                          />
                          <button
                            onClick={() => triggerNewStyle(tm)}
                            className="text-sm px-3 py-1 rounded-lg touch-manipulation"
                            style={{ background: TEAL.hover, color: TEAL.text }}
                          >
                            Go
                          </button>
                          <button
                            onClick={() => setNewStyleSlug(null)}
                            className="text-sm px-2 py-1 text-white/30 touch-manipulation"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2 mt-1">
                          <button
                            onClick={() => goRecord(tm)}
                            className="flex-1 text-xs py-2 rounded-xl touch-manipulation active:scale-[0.98] transition-transform"
                            style={{ background: "rgba(100,195,165,0.08)", color: TEAL.dim, border: `1px solid ${TEAL.border}` }}
                          >
                            Record New
                          </button>
                          <button
                            onClick={() => { setNewStyleSlug(tm.slug); setGenreInput(""); }}
                            className="flex-1 text-xs py-2 rounded-xl touch-manipulation active:scale-[0.98] transition-transform"
                            style={{ background: "rgba(100,195,165,0.08)", color: TEAL.dim, border: `1px solid ${TEAL.border}` }}
                          >
                            New Style
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* ── Empty — create card ── */
                    <button
                      onClick={() => goRecord(tm)}
                      className="w-full flex items-center gap-4 px-6 py-5 text-left touch-manipulation active:scale-[0.98] transition-all"
                    >
                      <span className="flex-shrink-0" style={{ color: TEAL.dim }}>
                        <StructureIcon />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-semibold tracking-wide" style={{ color: TEAL.text }}>{tm.label}</p>
                        <p className="text-xs text-white/45 mt-0.5">{tm.description}</p>
                      </div>
                      <span className="text-lg flex-shrink-0" style={{ color: TEAL.border }}>+</span>
                    </button>
                  )}
                </div>
              </RevealBlock>
            );
          })}
        </div>

        {loading && (
          <p className="text-center text-white/20 text-xs mt-8 tracking-widest uppercase">Loading menus…</p>
        )}
      </section>
    </main>
  );
}

function PlayIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M3 2L12 7L3 12V2Z" fill={color} />
    </svg>
  );
}

function PauseIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="2" y="2" width="4" height="10" rx="1" fill={color} />
      <rect x="8" y="2" width="4" height="10" rx="1" fill={color} />
    </svg>
  );
}

function StructureIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <line x1="2" y1="16" x2="22" y2="16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M5 16 A7 7 0 0 1 19 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" fill="none" />
      <circle cx="12" cy="9" r="2.2" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <line x1="12" y1="4.5" x2="12" y2="5.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="16.8" y1="6" x2="15.9" y2="6.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="7.2" y1="6" x2="8.1" y2="6.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
