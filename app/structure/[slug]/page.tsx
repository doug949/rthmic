"use client";

import { useEffect, useState, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/app/components/AppHeader";
import { RevealBlock } from "@/app/components/RevealBlock";
import { useGeneration } from "@/app/contexts/GenerationContext";
import { useAudio } from "@/app/contexts/AudioContext";
import { usePillarTheme } from "@/app/contexts/PillarThemeContext";
import type { SavedRhythm } from "@/app/types/library";
import { getMenuConfig } from "@/app/lib/menuConfigs";
import { sideLabelFor } from "@/app/lib/rhythmPairs";
import { formatTrackDate } from "@/app/lib/playerMetadata";

const TEAL = {
  text:   "rgba(120,210,180,0.92)",
  dim:    "rgba(100,195,165,0.65)",
  bg:     "rgba(100,195,165,0.06)",
  border: "rgba(100,195,165,0.22)",
  hover:  "rgba(100,195,165,0.12)",
  glow:   "rgba(100,195,165,0.08)",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupIntoBatches(songs: SavedRhythm[]): SavedRhythm[][] {
  if (!songs.length) return [];
  const batches: SavedRhythm[][] = [];
  let currentBatch: SavedRhythm[] = [songs[0]];
  for (let i = 1; i < songs.length; i++) {
    if (Math.abs(songs[i].savedAt - songs[i - 1].savedAt) < 30000) {
      currentBatch.push(songs[i]);
    } else {
      batches.push(orderMenuBatch(currentBatch));
      currentBatch = [songs[i]];
    }
  }
  batches.push(orderMenuBatch(currentBatch));
  return batches;
}

function orderMenuBatch(batch: SavedRhythm[]): SavedRhythm[] {
  const preferredSideId = batch.find((song) => song.preferredSideId)?.preferredSideId;
  return [...batch].sort((a, b) => {
    if (preferredSideId) {
      if (a.id === preferredSideId) return -1;
      if (b.id === preferredSideId) return 1;
    }
    const sideA = sideLabelFor(a) === "A" ? 0 : 1;
    const sideB = sideLabelFor(b) === "A" ? 0 : 1;
    return sideA - sideB || b.savedAt - a.savedAt;
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MenuDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const tm = getMenuConfig(slug);
  const { genPhase, startGeneration } = useGeneration();
  const { handlePlayUrl, stop: stopAudio, currentTrackId, isPlaying } = useAudio();
  const { setActivePillar } = usePillarTheme();

  const [songs, setSongs] = useState<SavedRhythm[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"idle" | "change-music" | "lyrics-open">("idle");
  const [genreInput, setGenreInput] = useState("");
  const [menuNotes, setMenuNotes] = useState("");
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
    try {
      setMenuNotes(localStorage.getItem(`rthmic-menu-notes:${slug}`) ?? "");
    } catch {
      setMenuNotes("");
    }
  }, [slug]);

  useEffect(() => {
    try {
      localStorage.setItem(`rthmic-menu-notes:${slug}`, menuNotes);
    } catch { /* local notes are best-effort */ }
  }, [slug, menuNotes]);

  useEffect(() => {
    setActivePillar("menus");
    return () => setActivePillar(null);
  }, [setActivePillar]);

  useEffect(() => {
    if (prevGenPhase.current === "generating" && genPhase === "ready") {
      fetchSongs();
      setMode("idle");
      setGenreInput("");
    }
    prevGenPhase.current = genPhase;
  }, [genPhase]);

  const goSpeak = (opts: { seed?: string } = {}) => {
    if (!tm) return;
    const p = new URLSearchParams({
      pillar: "Menus",
      seed: opts.seed ?? tm.seed,
      menuSlug: tm.slug,
      menuTitle: tm.menuTitle,
    });
    router.push(`/speak?${p.toString()}`);
  };

  // Pass the existing lyrics as context so the LLM can handle additions and removals naturally.
  const goUpdate = () => {
    const currentLyrics = songs[0]?.lyrics;
    const notes = menuNotes.trim();
    const seedParts = [
      currentLyrics
        ? `Current menu options: ${currentLyrics.slice(0, 400)}. Keep this as a menu of options, not a to-do list.`
        : "",
      notes
        ? `User notes for the next version: ${notes.slice(0, 700)}. Treat these as takeaways, additions, removals, or emphasis changes for the updated menu.`
        : "",
    ].filter(Boolean);
    const seedContext = seedParts.length ? seedParts.join(" ") : undefined;
    goSpeak({ seed: seedContext });
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
      genre: genreInput.trim() || "Ambient Electronic",
      menuSlug: tm.slug,
    });
    setMode("idle");
    setGenreInput("");
  };

  const togglePlay = (song: SavedRhythm) => {
    if (currentTrackId === song.id && isPlaying) {
      stopAudio();
    } else if (song.audioUrl || song.audioKey) {
      const url = song.audioKey ? `/api/proxy-audio?id=${encodeURIComponent(song.id)}` : song.audioUrl!;
      handlePlayUrl(song.id, url, song.title, {
        rhythmId: song.id,
        sunoTaskId: song.sunoTaskId,
        genre: song.genre,
        createdAt: song.savedAt,
      });
    }
  };

  const isGenerating = genPhase === "generating";
  const batches = groupIntoBatches(songs);
  const currentBatch = batches[0] ?? [];
  const historyBatches = batches.slice(1);

  // ── Loading ──
  if (loading) {
    return (
      <main className="relative z-10 min-h-screen flex flex-col px-6 pt-safe" style={{ animation: "page-enter 380ms ease forwards" }}>
        <AppHeader title={tm?.label ?? "Menu"} />
        <div className="flex justify-center py-20">
          <div className="w-6 h-6 rounded-full border-2 border-white/15 border-t-white/40 animate-spin" />
        </div>
      </main>
    );
  }

  // ── Empty state ──
  if (!songs.length) {
    return (
      <main className="relative z-10 min-h-screen flex flex-col px-6 pt-safe" style={{ animation: "page-enter 380ms ease forwards" }}>
        <AppHeader title={tm?.label ?? "Menu"} />

        <section className="flex-1 flex flex-col pb-16 gap-6">
          <RevealBlock delay={0}>
            {/* Headline */}
            <div className="flex flex-col gap-1 pb-2">
              <p className="text-xl font-light text-white/75 leading-snug" style={{ fontFamily: "var(--font-display)" }}>
                {tm?.emptyHeadline ?? "Build your menu"}
              </p>
              <p className="text-sm text-white/40 leading-relaxed">
                {tm?.emptyIntro}
              </p>
            </div>
          </RevealBlock>

          {/* Prompts */}
          <RevealBlock delay={60}>
            <div
              className="flex flex-col gap-0 rounded-2xl border overflow-hidden"
              style={{ background: TEAL.glow, borderColor: TEAL.border }}
            >
              {(tm?.emptyPrompts ?? []).map((prompt, i) => (
                <div
                  key={i}
                  className="px-5 py-4 flex gap-3 items-start"
                  style={{ borderBottom: i < (tm?.emptyPrompts.length ?? 0) - 1 ? `1px solid ${TEAL.border}` : undefined }}
                >
                  <span className="mt-0.5 flex-shrink-0 w-1.5 h-1.5 rounded-full mt-2" style={{ background: TEAL.dim }} />
                  <p className="text-sm text-white/65 leading-relaxed">{prompt}</p>
                </div>
              ))}
            </div>
          </RevealBlock>

          {/* CTA */}
          <RevealBlock delay={120}>
            <button
              onClick={() => goSpeak()}
              className="w-full py-4 rounded-2xl text-sm font-semibold tracking-wide touch-manipulation active:scale-[0.98] transition-transform border flex items-center justify-center gap-3"
              style={{ background: TEAL.bg, borderColor: TEAL.border, color: TEAL.text }}
            >
              <MicIcon color={TEAL.text} />
              {tm?.emptyCta ?? "Speak your list"}
            </button>
          </RevealBlock>

          {/* Soft hint */}
          <RevealBlock delay={160}>
            <p className="text-center text-[11px] text-white/25 leading-relaxed px-4">
              Speak naturally. Say the options you want kept in circulation.
              Rthmic will build a loop, not a checklist.
            </p>
          </RevealBlock>
        </section>
      </main>
    );
  }

  // ── Generating overlay ──
  if (isGenerating) {
    return (
      <main className="relative z-10 min-h-screen flex flex-col px-6 pt-safe" style={{ animation: "page-enter 380ms ease forwards" }}>
        <AppHeader title={tm?.label ?? "Menu"} onBack={null} />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 pb-20">
          <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: `${TEAL.border}`, borderTopColor: TEAL.text }} />
          <p className="text-sm tracking-wider" style={{ color: TEAL.dim }}>Building your new menu loop…</p>
        </div>
      </main>
    );
  }

  // ── Filled state ──
  return (
    <main
      className="relative z-10 min-h-screen flex flex-col px-6 pt-safe"
      style={{ animation: "page-enter 380ms ease forwards" }}
    >
      <AppHeader title={tm?.label ?? "Menu"} />

      <section className="flex-1 flex flex-col pb-10 gap-5">

        {/* ── Current menu player ── */}
        <RevealBlock delay={0}>
          <div className="flex flex-col gap-2">
            <p className="text-[10px] uppercase tracking-[0.3em]" style={{ color: TEAL.dim }}>Current Menu Loop</p>
            <p className="text-xs text-white/35 leading-relaxed pb-1">
              Play this on loop. Let options surface as you move, then stop when enough feels done.
            </p>
            {currentBatch.map((song) => {
              const playing = currentTrackId === song.id && isPlaying;
              return (
                <div
                  key={song.id}
                  className="rounded-2xl border overflow-hidden"
                  style={{ background: TEAL.bg, borderColor: TEAL.border }}
                >
                  <div className="flex items-center gap-4 px-5 py-4">
                    {/* Play button */}
                    <button
                      onClick={() => togglePlay(song)}
                      className="flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center touch-manipulation active:scale-95 transition-transform"
                      style={{ background: TEAL.hover, border: `1px solid ${TEAL.border}` }}
                    >
                      {playing ? <PauseIcon color={TEAL.text} /> : <PlayIcon color={TEAL.text} />}
                    </button>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-snug" style={{ color: TEAL.text }}>
                        {tm?.menuTitle ?? song.title}
                        {currentBatch.length > 1 && (
                          <span className="ml-2 text-[10px] text-white/30">
                            {sideLabelFor(song)}-side{song.preferredSideId === song.id ? " · current preferred" : ""}
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-white/35 mt-0.5">
                        Requested style: {song.genre || "Not recorded"} · Created: {formatTrackDate(song.savedAt)}
                      </p>
                    </div>

                    {/* Playing wave indicator */}
                    {playing && (
                      <div className="flex items-end gap-[3px] flex-shrink-0 h-5">
                        {[1, 2, 3, 4].map((b) => (
                          <div
                            key={b}
                            className="w-[3px] rounded-full"
                            style={{
                              background: TEAL.text,
                              animation: `wave 1s ease-in-out infinite`,
                              animationDelay: `${b * 0.12}s`,
                              height: "100%",
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </RevealBlock>

        {/* ── Current menu preview ── */}
        {songs[0]?.lyrics && (
          <RevealBlock delay={40}>
            <button
              onClick={() => setMode(mode === "lyrics-open" ? "idle" : "lyrics-open")}
              className="w-full flex items-center justify-between py-1 touch-manipulation active:opacity-70"
            >
              <p className="text-[10px] uppercase tracking-[0.3em]" style={{ color: "rgba(255,255,255,0.25)" }}>
                Options in this loop
              </p>
              <svg
                width="10" height="10" viewBox="0 0 12 12" fill="none"
                style={{
                  color: "rgba(255,255,255,0.2)",
                  transform: mode === "lyrics-open" ? "rotate(0deg)" : "rotate(-90deg)",
                  transition: "transform 200ms ease",
                }}
              >
                <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div style={{ display: "grid", gridTemplateRows: mode === "lyrics-open" ? "1fr" : "0fr", transition: "grid-template-rows 240ms ease" }}>
              <div style={{ overflow: "hidden" }}>
                <div
                  className="mt-2 rounded-xl border px-4 py-3"
                  style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}
                >
                  <p className="text-xs text-white/45 leading-relaxed whitespace-pre-wrap">
                    {songs[0].lyrics.slice(0, 600)}{songs[0].lyrics.length > 600 ? "…" : ""}
                  </p>
                </div>
              </div>
            </div>
          </RevealBlock>
        )}

        {/* ── Actions ── */}
        <RevealBlock delay={80}>
          {mode === "change-music" ? (
            /* Change music panel */
            <div
              className="flex flex-col gap-4 px-5 py-5 rounded-2xl border"
              style={{ background: TEAL.glow, borderColor: TEAL.border }}
            >
              <div>
                <p className="text-sm font-medium mb-1" style={{ color: TEAL.text }}>Regenerate the music</p>
                <p className="text-xs text-white/40 leading-relaxed">
                  Keep the menu options exactly as they are — just rebuild the loop in a different style.
                  Leave blank for a surprise.
                </p>
              </div>
              <input
                autoFocus
                value={genreInput}
                onChange={(e) => setGenreInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") triggerNewStyle();
                  if (e.key === "Escape") { setMode("idle"); setGenreInput(""); }
                }}
                placeholder="e.g. Ambient Lo-fi, Drum & Bass, Acoustic…"
                className="bg-transparent text-sm text-white/80 placeholder-white/20 outline-none border-b pb-2"
                style={{ borderColor: TEAL.border }}
              />
              <div className="flex gap-2">
                <button
                  onClick={triggerNewStyle}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold touch-manipulation active:scale-[0.98] transition-transform"
                  style={{ background: TEAL.hover, color: TEAL.text, border: `1px solid ${TEAL.border}` }}
                >
                  Generate new music
                </button>
                <button
                  onClick={() => { setMode("idle"); setGenreInput(""); }}
                  className="px-4 py-3 rounded-xl text-sm text-white/30 touch-manipulation"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            /* Default action buttons */
            <div className="flex flex-col gap-3">
              {/* Update menu — primary action */}
              <button
                onClick={goUpdate}
                className="w-full py-4 rounded-2xl text-sm font-semibold tracking-wide touch-manipulation active:scale-[0.98] transition-transform border flex items-center justify-center gap-3"
                style={{ background: TEAL.bg, borderColor: TEAL.border, color: TEAL.text }}
              >
                <MicIcon color={TEAL.text} />
                Update this menu
              </button>

              {/* Change music — secondary */}
              <button
                onClick={() => setMode("change-music")}
                className="w-full py-3.5 rounded-2xl text-sm font-medium touch-manipulation active:scale-[0.98] transition-transform border"
                style={{ background: "rgba(255,255,255,0.025)", borderColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)" }}
              >
                Regenerate the music
              </button>
            </div>
          )}
        </RevealBlock>

        {/* ── Notes for next update ── */}
        <RevealBlock delay={100}>
          <div
            className="rounded-2xl border px-5 py-4 flex flex-col gap-3"
            style={{ background: "rgba(255,255,255,0.025)", borderColor: "rgba(255,255,255,0.08)" }}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em]" style={{ color: TEAL.dim }}>Notes for next update</p>
                <p className="text-xs text-white/35 leading-relaxed mt-1">
                  Add takeaways, missing options, or things to remove next time.
                </p>
              </div>
              {menuNotes.trim() && (
                <button
                  onClick={() => setMenuNotes("")}
                  className="text-[10px] uppercase tracking-widest text-white/25 touch-manipulation active:opacity-70"
                >
                  Clear
                </button>
              )}
            </div>
            <textarea
              value={menuNotes}
              onChange={(e) => setMenuNotes(e.target.value)}
              rows={4}
              placeholder="e.g. Add passport check. Remove laundry. Mention water earlier."
              className="w-full resize-none rounded-xl border bg-transparent px-3 py-3 text-sm text-white/70 placeholder-white/20 outline-none"
              style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.14)" }}
            />
          </div>
        </RevealBlock>

        {/* ── History ── */}
        {historyBatches.length > 0 && (
          <RevealBlock delay={120}>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setHistoryOpen((v) => !v)}
                className="flex items-center justify-between py-1 touch-manipulation active:opacity-70"
              >
                <p className="text-[10px] uppercase tracking-[0.3em]" style={{ color: "rgba(255,255,255,0.2)" }}>
                  Previous menu versions ({historyBatches.reduce((n, b) => n + b.length, 0)})
                </p>
                <svg
                  width="10" height="10" viewBox="0 0 12 12" fill="none"
                  style={{
                    color: "rgba(255,255,255,0.15)",
                    transform: historyOpen ? "rotate(0deg)" : "rotate(-90deg)",
                    transition: "transform 200ms ease",
                  }}
                >
                  <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <div style={{ display: "grid", gridTemplateRows: historyOpen ? "1fr" : "0fr", transition: "grid-template-rows 240ms ease" }}>
                <div style={{ overflow: "hidden" }}>
                  <div className="flex flex-col gap-2 pb-1">
                    {historyBatches.map((batch, bi) =>
                      batch.map((song) => (
                        <div
                          key={song.id}
                          className="flex items-center gap-3 px-4 py-3 rounded-xl border"
                          style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}
                        >
                          <button
                            onClick={() => togglePlay(song)}
                            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center touch-manipulation active:scale-95"
                            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                          >
                            {currentTrackId === song.id && isPlaying
                              ? <PauseIcon color="rgba(255,255,255,0.45)" />
                              : <PlayIcon color="rgba(255,255,255,0.45)" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-white/40 leading-snug">{tm?.menuTitle}</p>
                            <p className="text-[10px] text-white/20 mt-0.5">
                              Requested style: {song.genre || "Not recorded"} · Created: {formatTrackDate(song.savedAt)}
                            </p>
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

// ─── Icons ────────────────────────────────────────────────────────────────────

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

function MicIcon({ color }: { color: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <rect x="9" y="2" width="6" height="12" rx="3" stroke={color} strokeWidth="1.8" fill="none" />
      <path d="M5 11a7 7 0 0 0 14 0" stroke={color} strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <line x1="12" y1="18" x2="12" y2="22" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
