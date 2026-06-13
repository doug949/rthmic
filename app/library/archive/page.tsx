"use client";

import { useState, useEffect, useCallback } from "react";
import { AppHeader } from "@/app/components/AppHeader";
import { RevealBlock } from "@/app/components/RevealBlock";
import { useSwipeBack } from "@/app/hooks/useSwipeBack";
import { useGeneration } from "@/app/contexts/GenerationContext";
import { useAudio } from "@/app/contexts/AudioContext";
import CustomStyleInput from "@/app/components/CustomStyleInput";
import type { SavedRhythm } from "@/app/types/library";
import { RhythmRow } from "../_components";
import { BUILD_UPON_GENRE, buildUponLyrics, buildUponTitle } from "@/app/lib/buildUpon";

type LoadState = "loading" | "ready" | "error";

function inferStyle(pillar: string): "A" | "B" {
  return (pillar || "").toLowerCase() === "movement" ? "A" : "B";
}

export default function ArchivePage() {
  const [rhythms, setRhythms]         = useState<SavedRhythm[]>([]);
  const [loadState, setLoadState]     = useState<LoadState>("loading");
  const [showLyricsId, setShowLyricsId]       = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [shareToastId, setShareToastId]       = useState<string | null>(null);
  const [recreateRhythm, setRecreateRhythm]   = useState<SavedRhythm | null>(null);

  const { currentTrackId, isPlaying, currentTime, duration, handlePlayUrl } = useAudio();
  const { startGeneration } = useGeneration();
  useSwipeBack("/library");

  const fetchLibrary = useCallback(async () => {
    try {
      const res = await fetch("/api/library?scope=archived", { cache: "no-store" });
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setRhythms(data.rhythms ?? []);
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    fetchLibrary();
    // Refresh when another part of the app mutates the library
    const onMutated = () => fetchLibrary();
    window.addEventListener("library-mutated", onMutated);
    return () => window.removeEventListener("library-mutated", onMutated);
  }, [fetchLibrary]);

  const mutate = useCallback(async (body: Record<string, unknown>) => {
    await fetch("/api/library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    fetchLibrary();
    window.dispatchEvent(new CustomEvent("library-mutated"));
  }, [fetchLibrary]);

  const archived = rhythms.filter((r) => r.status === "archived");

  const handleRemove = (id: string) => {
    if (confirmRemoveId === id) {
      mutate({ action: "remove", id });
      setConfirmRemoveId(null);
    } else {
      setConfirmRemoveId(id);
      setTimeout(() => setConfirmRemoveId((c) => (c === id ? null : c)), 3000);
    }
  };

  // Restore an archived rhythm back to active
  const handleRestore = (rhythm: SavedRhythm) =>
    mutate({ action: "update", id: rhythm.id, status: "active" });

  const handleTag = (id: string, tags: string[]) =>
    mutate({ action: "update", id, tags });

  const togglePlay = useCallback((rhythm: SavedRhythm) => {
    if (!rhythm.audioUrl && !rhythm.audioKey) return;
    handlePlayUrl(rhythm.id, `/api/proxy-audio?id=${encodeURIComponent(rhythm.id)}`, rhythm.title, {
      rhythmId: rhythm.id,
      sunoTaskId: rhythm.sunoTaskId,
      genre: rhythm.genre,
      createdAt: rhythm.savedAt,
    });
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

  const handleBuildUpon = (rhythm: SavedRhythm) => {
    startGeneration({
      lyrics: buildUponLyrics(rhythm),
      style: inferStyle(rhythm.pillar),
      title: buildUponTitle(rhythm.title),
      pillar: rhythm.pillar,
      genre: BUILD_UPON_GENRE,
      note: `Built upon: ${rhythm.title}`,
    });
  };

  return (
    <main
      className="relative z-10 min-h-screen flex flex-col px-6 pt-safe"
      style={{ animation: "page-enter 380ms ease forwards" }}
    >
      <RevealBlock delay={0}>
        <AppHeader title="The Archive" />
      </RevealBlock>

      <section className="flex-1 flex flex-col gap-2 pb-16">

        {loadState === "loading" && (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 rounded-full border-2 border-white/15 border-t-white/40 animate-spin" />
          </div>
        )}

        {loadState === "error" && (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-6 text-center">
            <p className="text-sm text-white/50">Couldn't load archive. Check your connection.</p>
          </div>
        )}

        {loadState === "ready" && archived.length === 0 && (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-12 flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-white/40 leading-relaxed">
              Nothing archived yet.
            </p>
            <p className="text-xs text-white/30 leading-relaxed">
              Tap ⊙ Archive on any Rthm to keep it but hide it everywhere else.
            </p>
          </div>
        )}

        {loadState === "ready" && archived.length > 0 && (
          <>
            <p className="text-[11px] text-white/30 pb-1 leading-relaxed">
              Archived Rthms are hidden everywhere else. Tap Restore to bring one back.
            </p>
            {archived.map((rhythm) => (
              <RhythmRow
                key={rhythm.id}
                rhythm={rhythm}
                playing={currentTrackId === rhythm.id && isPlaying}
                currentTime={currentTrackId === rhythm.id ? currentTime : 0}
                duration={currentTrackId === rhythm.id ? duration : 0}
                showLyrics={showLyricsId === rhythm.id}
                onToggleLyrics={() => setShowLyricsId(showLyricsId === rhythm.id ? null : rhythm.id)}
                onPlay={() => togglePlay(rhythm)}
                onArchive={() => handleRestore(rhythm)}
                onRestore={() => handleRestore(rhythm)}
                onRemove={() => handleRemove(rhythm.id)}
                onRecreate={() => setRecreateRhythm(rhythm)}
                onBuildUpon={() => handleBuildUpon(rhythm)}
                onShare={() => handleShare(rhythm)}
                onTag={(tags) => handleTag(rhythm.id, tags)}
                confirmingRemove={confirmRemoveId === rhythm.id}
                shareToast={shareToastId === rhythm.id}
              />
            ))}
          </>
        )}

      </section>

      {/* Genre picker overlay */}
      {recreateRhythm && (
        <ArchiveGenrePicker
          rhythm={recreateRhythm}
          onSelect={handleGenreSelected}
          onClose={() => setRecreateRhythm(null)}
        />
      )}
    </main>
  );
}

// ─── Genre picker ─────────────────────────────────────────────────────────────

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

function ArchiveGenrePicker({
  rhythm,
  onSelect,
  onClose,
}: {
  rhythm: SavedRhythm;
  onSelect: (genre: string) => void;
  onClose: () => void;
}) {
  const [genres, setGenres]             = useState<string[]>([]);
  const [userGenres, setUserGenres]     = useState<string[]>([]);
  const [loadingGenres, setLoadingGenres] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [customStyle, setCustomStyle]   = useState("");
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
    fetch("/api/genres", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ genres: updated }),
    }).catch(() => {});
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
                const isSel = !customSelected && selectedIndex === i;
                return (
                  <button key={i} onClick={() => { setSelectedIndex(i); setCustomSelected(false); }}
                    className="w-full text-left px-5 py-4 rounded-2xl border transition-all duration-150 active:scale-[0.98] touch-manipulation"
                    style={isSel ? { borderColor: "rgba(201,165,90,0.5)", background: "rgba(201,165,90,0.08)" } : { borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className={`text-sm font-medium ${isSel ? "text-[#c9a55a]" : "text-white/75"}`}>{displayNameFor(genre)}</span>
                      <div className="w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center"
                        style={isSel ? { borderColor: "rgba(201,165,90,0.7)", background: "rgba(201,165,90,0.3)" } : { borderColor: "rgba(255,255,255,0.2)" }}>
                        {isSel && <div className="w-2 h-2 rounded-full bg-[#c9a55a]" />}
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
