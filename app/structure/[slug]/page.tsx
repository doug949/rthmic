"use client";

import { useEffect, useState, useRef, use } from "react";
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
  { slug: "morning",       label: "Morning Menu",  menuTitle: "The Morning Menu",  seed: "My morning routine — the things I want to do as I start the day" },
  { slug: "start-the-day", label: "Start the Day", menuTitle: "Start the Day",     seed: "Everything I need to get through today — tasks, priorities, intentions" },
  { slug: "afternoon",     label: "Afternoon",      menuTitle: "Afternoon",         seed: "My afternoon — what I still need to do and how I want to finish the day" },
  { slug: "end-of-day",    label: "End of Day",     menuTitle: "End of Day",        seed: "Wrapping up the day — what happened, what's done, what carries over" },
  { slug: "before-bed",    label: "Before Bed",     menuTitle: "Before Bed",        seed: "My evening wind-down — what I want to let go of and how I want to rest" },
];

function groupIntoBatches(songs: SavedRhythm[]): SavedRhythm[][] {
  if (!songs.length) return [];
  const batches: SavedRhythm[][] = [];
  let currentBatch: SavedRhythm[] = [songs[0]];
  for (let i = 1; i < songs.length; i++) {
    if (Math.abs(songs[i].savedAt - songs[i - 1].savedAt) < 30000) {
      currentBatch.push(songs[i]);
    } else {
      batches.push(currentBatch);
      currentBatch = [songs[i]];
    }
  }
  batches.push(currentBatch);
  return batches;
}

export default function MenuDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const tm = TIME_MENUS.find((m) => m.slug === slug);
  const { genPhase, startGeneration } = useGeneration();
  const { handlePlayUrl, stop: stopAudio, currentTrackId, isPlaying } = useAudio();

  const [songs, setSongs] = useState<SavedRhythm[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewStyle, setShowNewStyle] = useState(false);
  const [genreInput, setGenreInput] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const prevGenPhase = useRef<string>("idle");

  const fetchSongs = async () => {
    try {
      const res = await fetch(`/api/menu?slug=${slug}`);
      if (!res.ok) return;
      const data = await res.json() as { songs: SavedRhythm[] };
      setSongs(data.songs ?? []);
    } catch { /* silent */ }
    setLoading(false);
  };

  useEffect(() => { fetchSongs(); }, [slug]);

  useEffect(() => {
    if (prevGenPhase.current === "generating" && genPhase === "ready") {
      fetchSongs();
      setShowNewStyle(false);
      setGenreInput("");
    }
    prevGenPhase.current = genPhase;
  }, [genPhase]);

  const goRecord = () => {
    if (!tm) return;
    const p = new URLSearchParams({ pillar: "Menus", seed: tm.seed, menuSlug: tm.slug, menuTitle: tm.menuTitle });
    router.push(`/speak?${p.toString()}`);
  };

  const triggerNewStyle = () => {
    if (!tm || !songs.length) return;
    const lyrics = songs[0].lyrics ?? "";
    const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    startGeneration({
      lyrics,
      style: "B",
      title: `${tm.menuTitle} — ${today}`,
      pillar: "Menus",
      genre: genreInput.trim() || "Indie Electronic",
      menuSlug: tm.slug,
    });
    setShowNewStyle(false);
    setGenreInput("");
  };

  const togglePlay = (song: SavedRhythm) => {
    if (currentTrackId === song.id && isPlaying) {
      stopAudio();
    } else if (song.audioUrl) {
      handlePlayUrl(song.id, song.audioUrl, song.title);
    }
  };

  const batches = groupIntoBatches(songs);
  const currentBatch = batches[0] ?? [];
  const historyBatches = batches.slice(1);

  if (loading) {
    return (
      <main className="relative z-10 min-h-screen flex flex-col px-6" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <AppHeader title={tm?.label ?? "Menu"} />
        <p className="text-center text-white/20 text-xs mt-16 tracking-widest uppercase">Loading…</p>
      </main>
    );
  }

  if (!songs.length) {
    return (
      <main className="relative z-10 min-h-screen flex flex-col px-6" style={{ paddingTop: "env(safe-area-inset-top, 0px)", animation: "page-enter 380ms ease forwards" }}>
        <AppHeader title={tm?.label ?? "Menu"} />
        <div className="flex flex-col items-center justify-center flex-1 gap-6 pb-20">
          <p className="text-white/40 text-sm text-center leading-relaxed">No Rthm recorded yet for this menu.</p>
          <button
            onClick={goRecord}
            className="px-8 py-4 rounded-2xl text-base font-semibold touch-manipulation active:scale-[0.98] transition-transform border"
            style={{ background: TEAL.bg, borderColor: TEAL.border, color: TEAL.text }}
          >
            Record your list
          </button>
        </div>
      </main>
    );
  }

  return (
    <main
      className="relative z-10 min-h-screen flex flex-col px-6"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)", animation: "page-enter 380ms ease forwards" }}
    >
      <AppHeader title={tm?.label ?? "Menu"} />

      <section className="flex-1 flex flex-col pb-10 gap-6">

        {/* ── Current Rthm ── */}
        <RevealBlock delay={0}>
          <div className="flex flex-col gap-2">
            <p className="text-[10px] uppercase tracking-[0.3em]" style={{ color: TEAL.dim }}>Current</p>
            {currentBatch.map((song, idx) => (
              <div
                key={song.id}
                className="flex items-center gap-4 px-5 py-4 rounded-2xl border"
                style={{ background: TEAL.bg, borderColor: TEAL.border }}
              >
                <button
                  onClick={() => togglePlay(song)}
                  className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center touch-manipulation active:scale-95 transition-transform"
                  style={{ background: TEAL.hover, border: `1px solid ${TEAL.border}` }}
                >
                  {currentTrackId === song.id && isPlaying
                    ? <PauseIcon color={TEAL.text} />
                    : <PlayIcon color={TEAL.text} />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-snug truncate" style={{ color: TEAL.text }}>{song.title}</p>
                  <p className="text-[11px] text-white/35 mt-0.5">Version {idx + 1}</p>
                </div>
              </div>
            ))}
          </div>
        </RevealBlock>

        {/* ── Actions ── */}
        <RevealBlock delay={60}>
          {showNewStyle ? (
            <div
              className="flex flex-col gap-3 px-5 py-4 rounded-2xl border"
              style={{ background: TEAL.bg, borderColor: TEAL.border }}
            >
              <p className="text-xs text-white/50">What style should the new version be in?</p>
              <input
                autoFocus
                value={genreInput}
                onChange={(e) => setGenreInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") triggerNewStyle();
                  if (e.key === "Escape") setShowNewStyle(false);
                }}
                placeholder="e.g. Ambient Lo-fi, Drum & Bass, Acoustic…"
                className="bg-transparent text-sm text-white/80 placeholder-white/25 outline-none border-b pb-1"
                style={{ borderColor: TEAL.border }}
              />
              <div className="flex gap-2">
                <button
                  onClick={triggerNewStyle}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium touch-manipulation active:scale-[0.98]"
                  style={{ background: TEAL.hover, color: TEAL.text }}
                >
                  Generate New Style
                </button>
                <button
                  onClick={() => setShowNewStyle(false)}
                  className="px-4 py-2.5 rounded-xl text-sm text-white/30 touch-manipulation"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={() => setShowNewStyle(true)}
                className="flex-1 py-3.5 rounded-2xl text-sm font-medium touch-manipulation active:scale-[0.98] transition-transform border"
                style={{ background: TEAL.bg, borderColor: TEAL.border, color: TEAL.text }}
              >
                New Style
              </button>
              <button
                onClick={goRecord}
                className="flex-1 py-3.5 rounded-2xl text-sm font-medium touch-manipulation active:scale-[0.98] transition-transform border"
                style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.55)" }}
              >
                Record New
              </button>
            </div>
          )}
        </RevealBlock>

        {/* ── History ── */}
        {historyBatches.length > 0 && (
          <RevealBlock delay={120}>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setHistoryOpen((v) => !v)}
                className="flex items-center justify-between py-1 touch-manipulation active:opacity-70"
              >
                <p className="text-[10px] uppercase tracking-[0.3em]" style={{ color: "rgba(255,255,255,0.25)" }}>
                  Older versions ({historyBatches.reduce((n, b) => n + b.length, 0)})
                </p>
                <svg
                  width="10" height="10" viewBox="0 0 12 12" fill="none"
                  style={{ color: "rgba(255,255,255,0.2)", transform: historyOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 200ms ease" }}
                >
                  <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <div style={{ display: "grid", gridTemplateRows: historyOpen ? "1fr" : "0fr", transition: "grid-template-rows 240ms ease" }}>
                <div style={{ overflow: "hidden" }}>
                  <div className="flex flex-col gap-2 pb-1">
                    {historyBatches.map((batch) =>
                      batch.map((song) => (
                        <div
                          key={song.id}
                          className="flex items-center gap-3 px-4 py-3 rounded-xl border"
                          style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}
                        >
                          <button
                            onClick={() => togglePlay(song)}
                            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center touch-manipulation"
                            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                          >
                            {currentTrackId === song.id && isPlaying
                              ? <PauseIcon color="rgba(255,255,255,0.5)" />
                              : <PlayIcon color="rgba(255,255,255,0.5)" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-white/45 truncate">{song.title}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </RevealBlock>
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
