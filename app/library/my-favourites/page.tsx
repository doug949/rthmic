"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { AppHeader } from "@/app/components/AppHeader";
import { RevealBlock } from "@/app/components/RevealBlock";
import { useSwipeBack } from "@/app/hooks/useSwipeBack";
import { useGeneration } from "@/app/contexts/GenerationContext";
import { useAudio } from "@/app/contexts/AudioContext";
import CustomStyleInput from "@/app/components/CustomStyleInput";
import type { SavedRhythm } from "@/app/api/library/route";
import {
  RhythmRow,
  SubsectionCard,
  ExploreAllIcon,
  TagsIcon,
  PillarsIcon,
} from "../_components";

type LoadState = "loading" | "ready" | "error";

function inferStyle(pillar: string): "A" | "B" {
  return (pillar || "").toLowerCase() === "movement" ? "A" : "B";
}

export default function MyFavouritesPage() {
  const [rhythms, setRhythms]     = useState<SavedRhythm[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [showLyricsId, setShowLyricsId]     = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [shareToastId, setShareToastId]       = useState<string | null>(null);
  const [recreateRhythm, setRecreateRhythm]   = useState<SavedRhythm | null>(null);

  const searchParams = useSearchParams();
  const openParam    = searchParams.get("open"); // "explore" | "tags" | "pillars"

  // Subsection state — pre-open the section specified by the ?open= param
  const [favExploreOpen, setFavExploreOpen]   = useState(openParam === "explore" || !openParam);
  const [favTagsOpen, setFavTagsOpen]         = useState(openParam === "tags");
  const [favPillarsOpen, setFavPillarsOpen]   = useState(openParam === "pillars");
  const [selectedFavTag, setSelectedFavTag]     = useState<string | null>(null);
  const [selectedFavPillar, setSelectedFavPillar] = useState<string | null>(null);

  const { currentTrackId, isPlaying, currentTime, duration, handlePlayUrl } = useAudio();
  const { startGeneration } = useGeneration();
  useSwipeBack("/library");

  const fetchLibrary = useCallback(async () => {
    try {
      const res = await fetch("/api/library");
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setRhythms(data.rhythms ?? []);
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, []);

  useEffect(() => { fetchLibrary(); }, [fetchLibrary]);

  const mutate = useCallback(async (body: Record<string, unknown>) => {
    await fetch("/api/library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    fetchLibrary();
  }, [fetchLibrary]);

  const favourites = rhythms.filter((r) => r.status === "favourite");

  const allFavTags    = [...new Set(favourites.flatMap((r) => r.tags ?? []))].sort();
  const allFavPillars = [...new Set(favourites.map((r) => r.pillar))].sort();

  const filteredByTag    = selectedFavTag    !== null ? favourites.filter((r) => r.tags?.includes(selectedFavTag as string))    : favourites;
  const filteredByPillar = selectedFavPillar !== null ? favourites.filter((r) => r.pillar === selectedFavPillar) : favourites;

  const handleRemove = (id: string) => {
    if (confirmRemoveId === id) {
      mutate({ action: "remove", id });
      setConfirmRemoveId(null);
    } else {
      setConfirmRemoveId(id);
      setTimeout(() => setConfirmRemoveId((c) => (c === id ? null : c)), 3000);
    }
  };

  const handleArchive = (rhythm: SavedRhythm) =>
    mutate({ action: "update", id: rhythm.id, status: rhythm.status === "archived" ? "active" : "archived" });

  const handleUngraduate = (id: string) =>
    mutate({ action: "update", id, status: "active" });

  const handleTag = (id: string, tags: string[]) =>
    mutate({ action: "update", id, tags });

  const togglePlay = useCallback((rhythm: SavedRhythm) => {
    if (!rhythm.audioUrl) return;
    handlePlayUrl(rhythm.id, rhythm.audioUrl, rhythm.title);
  }, [handlePlayUrl]);

  const handleShare = async (rhythm: SavedRhythm) => {
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rhythmId: rhythm.id }),
      });
      if (!res.ok) throw new Error("share failed");
      const { url } = await res.json();
      if (navigator.share) {
        await navigator.share({ title: rhythm.title, text: `Listen to "${rhythm.title}" on RTHMIC`, url });
      } else {
        await navigator.clipboard.writeText(url);
        setShareToastId(rhythm.id);
        setTimeout(() => setShareToastId((id) => (id === rhythm.id ? null : id)), 2500);
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") console.error("Share failed:", err);
    }
  };

  const handleGenreSelected = (genre: string) => {
    if (!recreateRhythm) return;
    startGeneration({
      lyrics: recreateRhythm.lyrics || "",
      style: inferStyle(recreateRhythm.pillar),
      title: recreateRhythm.title,
      pillar: recreateRhythm.pillar,
      genre,
    });
    setRecreateRhythm(null);
  };

  // Shared row props builder
  const rowProps = (rhythm: SavedRhythm) => ({
    rhythm,
    playing: currentTrackId === rhythm.id && isPlaying,
    currentTime: currentTrackId === rhythm.id ? currentTime : 0,
    duration: currentTrackId === rhythm.id ? duration : 0,
    showLyrics: showLyricsId === rhythm.id,
    onToggleLyrics: () => setShowLyricsId(showLyricsId === rhythm.id ? null : rhythm.id),
    onPlay: () => togglePlay(rhythm),
    onUngraduate: () => handleUngraduate(rhythm.id),
    onArchive: () => handleArchive(rhythm),
    onRemove: () => handleRemove(rhythm.id),
    onRecreate: () => setRecreateRhythm(rhythm),
    onShare: () => handleShare(rhythm),
    onTag: (tags: string[]) => handleTag(rhythm.id, tags),
    confirmingRemove: confirmRemoveId === rhythm.id,
    shareToast: shareToastId === rhythm.id,
    favourite: true as const,
  });

  return (
    <main
      className="relative z-10 min-h-screen flex flex-col px-6 pt-safe"
      style={{ animation: "page-enter 380ms ease forwards" }}
    >
      <RevealBlock delay={0}>
        <AppHeader title="My Favourites" />
      </RevealBlock>

      <section className="flex-1 flex flex-col gap-3 pb-16">

        {/* Loading / error */}
        {loadState === "loading" && (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 rounded-full border-2 border-white/15 border-t-white/40 animate-spin" />
          </div>
        )}
        {loadState === "error" && (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-6 text-center">
            <p className="text-sm text-white/50">Couldn't load library. Check your connection.</p>
          </div>
        )}

        {loadState === "ready" && favourites.length === 0 && (
          <div
            className="rounded-2xl px-5 py-12 flex flex-col items-center gap-3 text-center"
            style={{ border: "1px solid rgba(201,165,90,0.12)", background: "rgba(201,165,90,0.03)" }}
          >
            <p className="text-sm leading-relaxed" style={{ color: "rgba(201,165,90,0.5)" }}>
              Graduate a Rthm to add it here.
            </p>
            <p className="text-xs" style={{ color: "rgba(201,165,90,0.35)" }}>
              Tap ★ on any Rthm in My Rthms to graduate it.
            </p>
          </div>
        )}

        {loadState === "ready" && favourites.length > 0 && (
          <>
            {/* Explore All */}
            <SubsectionCard
              icon={<ExploreAllIcon />}
              title="Explore All"
              description={`${favourites.length} Rthm${favourites.length !== 1 ? "s" : ""}`}
              open={favExploreOpen}
              onToggle={() => setFavExploreOpen((o) => !o)}
            >
              <div className="flex flex-col gap-2 pt-2">
                {favourites.map((rhythm) => (
                  <RhythmRow key={rhythm.id} {...rowProps(rhythm)} />
                ))}
              </div>
            </SubsectionCard>

            {/* Tags */}
            <SubsectionCard
              icon={<TagsIcon />}
              title="Tags"
              description={allFavTags.length > 0 ? `${allFavTags.length} tag${allFavTags.length !== 1 ? "s" : ""}` : "No tags yet"}
              open={favTagsOpen}
              onToggle={() => setFavTagsOpen((o) => !o)}
              disabled={allFavTags.length === 0}
            >
              <div className="flex flex-col gap-3 pt-2">
                <div className="flex flex-wrap gap-2">
                  {allFavTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => setSelectedFavTag(selectedFavTag === tag ? null : tag)}
                      className="text-[11px] px-3 py-1.5 rounded-full touch-manipulation transition-all"
                      style={
                        selectedFavTag === tag
                          ? { background: "rgba(201,165,90,0.2)", color: "rgba(201,165,90,0.9)", border: "1px solid rgba(201,165,90,0.4)" }
                          : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.08)" }
                      }
                    >
                      {tag}
                    </button>
                  ))}
                </div>
                {selectedFavTag && (
                  <div className="flex flex-col gap-2">
                    {filteredByTag.map((rhythm) => (
                      <RhythmRow key={rhythm.id} {...rowProps(rhythm)} />
                    ))}
                  </div>
                )}
              </div>
            </SubsectionCard>

            {/* Pillars */}
            <SubsectionCard
              icon={<PillarsIcon />}
              title="Pillars"
              description={`${allFavPillars.length} pillar${allFavPillars.length !== 1 ? "s" : ""}`}
              open={favPillarsOpen}
              onToggle={() => setFavPillarsOpen((o) => !o)}
            >
              <div className="flex flex-col gap-3 pt-2">
                <div className="flex flex-wrap gap-2">
                  {allFavPillars.map((pillar) => (
                    <button
                      key={pillar}
                      onClick={() => setSelectedFavPillar(selectedFavPillar === pillar ? null : pillar)}
                      className="text-[11px] px-3 py-1.5 rounded-full touch-manipulation transition-all"
                      style={
                        selectedFavPillar === pillar
                          ? { background: "rgba(201,165,90,0.2)", color: "rgba(201,165,90,0.9)", border: "1px solid rgba(201,165,90,0.4)" }
                          : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.08)" }
                      }
                    >
                      {pillar}
                    </button>
                  ))}
                </div>
                {selectedFavPillar && (
                  <div className="flex flex-col gap-2">
                    {filteredByPillar.map((rhythm) => (
                      <RhythmRow key={rhythm.id} {...rowProps(rhythm)} />
                    ))}
                  </div>
                )}
              </div>
            </SubsectionCard>
          </>
        )}

      </section>

      {/* Genre picker overlay */}
      {recreateRhythm && (
        <FavGenrePicker
          rhythm={recreateRhythm}
          onSelect={handleGenreSelected}
          onClose={() => setRecreateRhythm(null)}
        />
      )}
    </main>
  );
}

// ─── Genre picker (same as My Rthms, scoped here) ────────────────────────────

function displayNameFor(g: string): string {
  const pipe = g.indexOf("|");
  if (pipe > 0) return g.slice(0, pipe);
  const comma = g.indexOf(",");
  return comma > 0 ? g.slice(0, comma) : g.slice(0, 42);
}

function sunoPromptFor(g: string): string {
  const pipe = g.indexOf("|");
  return pipe > 0 ? g.slice(pipe + 1) : g;
}

function FavGenrePicker({
  rhythm,
  onSelect,
  onClose,
}: {
  rhythm: SavedRhythm;
  onSelect: (genre: string) => void;
  onClose: () => void;
}) {
  const [genres, setGenres]         = useState<string[]>([]);
  const [userGenres, setUserGenres] = useState<string[]>([]);
  const [loadingGenres, setLoadingGenres] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [customStyle, setCustomStyle]     = useState("");
  const [customSelected, setCustomSelected] = useState(false);

  const persistCustomStyle = (style: string) => {
    const trimmed = style.trim();
    if (!trimmed) return;
    const isDuplicate = userGenres.some(
      (g) => g === trimmed || (g.indexOf("|") > 0 ? g.slice(g.indexOf("|") + 1) : g).toLowerCase() === trimmed.toLowerCase()
    );
    if (isDuplicate) return;
    const updated = [...userGenres, trimmed];
    setUserGenres(updated);
    setGenres((prev) => [...prev, trimmed]);
    fetch("/api/genres", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ genres: updated }) }).catch(() => {});
  };

  useEffect(() => {
    fetch("/api/genres")
      .then((r) => r.json())
      .then((d) => {
        setUserGenres(d.user || []);
        setGenres([...(d.builtIn || []), ...(d.user || [])]);
      })
      .catch(() => {})
      .finally(() => setLoadingGenres(false));
  }, []);

  const selectedGenre = customSelected && customStyle ? customStyle : selectedIndex !== null ? genres[selectedIndex] ?? "" : "";
  const canProceed    = selectedGenre.length > 0;
  const selectedLabel = canProceed ? displayNameFor(selectedGenre) : "";
  const buildLabel    = canProceed ? `Recreate with ${selectedLabel.slice(0, 28)}${selectedLabel.length > 28 ? "…" : ""}` : "Select a style";

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} style={{ backdropFilter: "blur(4px)" }} />
      <div className="relative rounded-t-3xl px-6 pt-6 flex flex-col gap-4 max-h-[85vh]" style={{ background: "#0d1628", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="flex justify-center -mt-1"><div className="w-10 h-1 rounded-full bg-white/15" /></div>
        <div className="flex-shrink-0">
          <p className="text-[10px] text-white/40 uppercase tracking-widest mb-1">Recreate in another genre</p>
          <h3 className="text-lg font-light text-white leading-snug" style={{ fontFamily: "var(--font-display)" }}>{rhythm.title}</h3>
        </div>
        <div className="flex-1 overflow-y-auto flex flex-col gap-2 pb-2">
          {loadingGenres ? (
            <div className="flex justify-center py-8"><div className="w-6 h-6 rounded-full border-2 border-white/15 border-t-white/40 animate-spin" /></div>
          ) : (
            <>
              {genres.map((genre, i) => {
                const isSelected = !customSelected && selectedIndex === i;
                return (
                  <button key={i} onClick={() => { setSelectedIndex(i); setCustomSelected(false); }}
                    className="w-full text-left px-5 py-4 rounded-2xl border transition-all duration-150 active:scale-[0.98] touch-manipulation"
                    style={isSelected ? { borderColor: "rgba(201,165,90,0.5)", background: "rgba(201,165,90,0.08)" } : { borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className={`text-sm font-medium leading-snug ${isSelected ? "text-[#c9a55a]" : "text-white/75"}`}>{displayNameFor(genre)}</span>
                      <div className="w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center"
                        style={isSelected ? { borderColor: "rgba(201,165,90,0.7)", background: "rgba(201,165,90,0.3)" } : { borderColor: "rgba(255,255,255,0.2)" }}>
                        {isSelected && <div className="w-2 h-2 rounded-full bg-[#c9a55a]" />}
                      </div>
                    </div>
                  </button>
                );
              })}
              <CustomStyleInput
                onStyleChange={(s) => { setCustomStyle(s); setCustomSelected(true); setSelectedIndex(null); }}
                selected={customSelected}
                onSelect={() => { if (customStyle) { setCustomSelected(true); setSelectedIndex(null); } }}
                onSave={persistCustomStyle}
              />
            </>
          )}
        </div>
        <div className="flex flex-col gap-2 pb-safe pt-2 flex-shrink-0">
          <button
            onClick={() => { if (!canProceed) return; if (customSelected && customStyle) persistCustomStyle(customStyle); onSelect(sunoPromptFor(selectedGenre)); }}
            disabled={!canProceed}
            className="w-full py-5 rounded-2xl text-sm font-semibold tracking-wide active:scale-[0.98] transition-all touch-manipulation disabled:opacity-30"
            style={{ background: "rgba(201,165,90,0.1)", border: "1px solid rgba(201,165,90,0.45)", color: "#c9a55a" }}
          >{buildLabel}</button>
          <button onClick={onClose} className="w-full py-3 text-white/50 text-sm tracking-wide touch-manipulation">Cancel</button>
        </div>
      </div>
    </div>
  );
}
