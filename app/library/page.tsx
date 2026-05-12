"use client";

import { useState, useEffect, useCallback } from "react";
import { TransitionLink } from "@/app/components/TransitionLink";
import { AppHeader } from "@/app/components/AppHeader";
import { RevealBlock } from "@/app/components/RevealBlock";
import type { SavedRhythm } from "@/app/api/library/route";
import { useGeneration } from "@/app/contexts/GenerationContext";
import { useAudio } from "@/app/contexts/AudioContext";
import CustomStyleInput from "@/app/components/CustomStyleInput";
import { useSwipeBack } from "@/app/hooks/useSwipeBack";

type LoadState = "loading" | "ready" | "error";

function inferStyle(pillar: string): "A" | "B" {
  // Movement uses Style A (forward momentum); all others default to B (calm focus)
  return (pillar || "").toLowerCase() === "movement" ? "A" : "B";
}

export default function LibraryPage() {
  const [rhythms, setRhythms] = useState<SavedRhythm[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [showLyricsId, setShowLyricsId] = useState<string | null>(null);
  const { currentTrackId, isPlaying, currentTime, duration, handlePlayUrl } = useAudio();

  // Recreate genre picker
  const [recreateRhythm, setRecreateRhythm] = useState<SavedRhythm | null>(null);
  const { startGeneration } = useGeneration();
  useSwipeBack("/");

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

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

  const mutate = useCallback(async (body: Record<string, unknown>) => {
    await fetch("/api/library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    fetchLibrary();
  }, [fetchLibrary]);

  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [shareToastId, setShareToastId] = useState<string | null>(null);
  const [myRthmsOpen, setMyRthmsOpen] = useState(false);
  const [myRthmsExpanded, setMyRthmsExpanded] = useState(false);
  const [myFavouritesOpen, setMyFavouritesOpen] = useState(false);
  const [rthmicLibraryOpen, setRthmicLibraryOpen] = useState(false);
  const [rthmixAlbumsOpen, setRthmixAlbumsOpen] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [deletedOpen, setDeletedOpen] = useState(false);
  const MY_RTHMS_PREVIEW = 5;

  const handleRemove = (id: string) => {
    if (confirmRemoveId === id) {
      mutate({ action: "remove", id });
      setConfirmRemoveId(null);
    } else {
      setConfirmRemoveId(id);
      setTimeout(() => setConfirmRemoveId(c => c === id ? null : c), 3000);
    }
  };

  const handleArchive = (rhythm: SavedRhythm) =>
    mutate({
      action: "update",
      id: rhythm.id,
      status: rhythm.status === "archived" ? "active" : "archived",
    });

  const handleGraduate = (id: string) =>
    mutate({ action: "update", id, status: "favourite" });

  const handleUngraduate = (id: string) =>
    mutate({ action: "update", id, status: "active" });

  const handleTag = (id: string, tags: string[]) =>
    mutate({ action: "update", id, tags });

  const togglePlay = useCallback((rhythm: SavedRhythm) => {
    if (!rhythm.audioUrl) return;
    handlePlayUrl(rhythm.id, rhythm.audioUrl, rhythm.title);
  }, [handlePlayUrl]);

  const handleRecreate = (rhythm: SavedRhythm) => {
    setRecreateRhythm(rhythm);
  };

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
        await navigator.share({
          title: rhythm.title,
          text: `Listen to "${rhythm.title}" on RTHMIC`,
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        // Brief toast — we'll reuse the same confirmingRemove mechanism timing
        setShareToastId(rhythm.id);
        setTimeout(() => setShareToastId(id => id === rhythm.id ? null : id), 2500);
      }
    } catch (err) {
      // User cancelled the share sheet — not an error worth surfacing
      if (err instanceof Error && err.name !== "AbortError") {
        console.error("Share failed:", err);
      }
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

  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const myRthms = rhythms.filter((r) => r.status === "active");
  const favourites = rhythms.filter((r) => r.status === "favourite");
  const archived = rhythms.filter((r) => r.status === "archived");
  const recentlyDeleted = rhythms.filter(
    (r) => r.status === "deleted" && r.deletedAt !== undefined && now - r.deletedAt < THIRTY_DAYS
  );

  const handleRestore = (id: string) =>
    mutate({ action: "update", id, status: "active" });

  return (
    <main className="relative z-10 min-h-screen flex flex-col px-6 pt-safe" style={{ animation: "page-enter 380ms ease forwards" }}>

      <RevealBlock delay={0}>
        <AppHeader title="Library" />
      </RevealBlock>

      <section className="flex-1 flex flex-col gap-8 pb-16">

        {/* ── My Rthms ─────────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          <SectionHeader
            title="My Rthms"
            count={myRthms.length > 0 ? myRthms.length : undefined}
            open={myRthmsOpen}
            onToggle={() => setMyRthmsOpen((o) => !o)}
          />
          {myRthmsOpen && (
            <>
              {loadState === "loading" && (
                <div className="flex justify-center py-10">
                  <div className="w-6 h-6 rounded-full border-2 border-white/15 border-t-white/40 animate-spin" />
                </div>
              )}
              {loadState === "error" && (
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-6 text-center">
                  <p className="text-sm text-white/50">Couldn't load library. Check your connection.</p>
                </div>
              )}
              {loadState === "ready" && myRthms.length === 0 && (
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-8 flex flex-col items-center gap-3">
                  <p className="text-sm text-white/50 text-center leading-relaxed">
                    Rthms you generate will appear here.
                  </p>
                  <TransitionLink href="/speak" className="text-xs text-white/45 underline underline-offset-4 hover:text-white/60 transition-colors">
                    Speak your state →
                  </TransitionLink>
                </div>
              )}
              {loadState === "ready" && myRthms.length > 0 && (
                <div className="flex flex-col gap-2">
                  {(myRthmsExpanded ? myRthms : myRthms.slice(0, MY_RTHMS_PREVIEW)).map((rhythm) => (
                    <RhythmRow
                      key={rhythm.id}
                      rhythm={rhythm}
                      playing={currentTrackId === rhythm.id && isPlaying}
                      currentTime={currentTrackId === rhythm.id ? currentTime : 0}
                      duration={currentTrackId === rhythm.id ? duration : 0}
                      showLyrics={showLyricsId === rhythm.id}
                      onToggleLyrics={() => setShowLyricsId(showLyricsId === rhythm.id ? null : rhythm.id)}
                      onPlay={() => togglePlay(rhythm)}
                      onGraduate={() => handleGraduate(rhythm.id)}
                      onArchive={() => handleArchive(rhythm)}
                      onRemove={() => handleRemove(rhythm.id)}
                      onRecreate={() => handleRecreate(rhythm)}
                      onShare={() => handleShare(rhythm)}
                      onTag={(tags) => handleTag(rhythm.id, tags)}
                      confirmingRemove={confirmRemoveId === rhythm.id}
                      shareToast={shareToastId === rhythm.id}
                    />
                  ))}
                  {myRthms.length > MY_RTHMS_PREVIEW && (
                    <button
                      onClick={() => setMyRthmsExpanded((e) => !e)}
                      className="text-[10px] text-white/50 uppercase tracking-widest py-2 touch-manipulation hover:text-white/65 transition-colors"
                    >
                      {myRthmsExpanded ? "Show less ↑" : `+${myRthms.length - MY_RTHMS_PREVIEW} more ↓`}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── My Favourites ────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          <SectionHeader
            title="My Favourites"
            count={favourites.length > 0 ? favourites.length : undefined}
            open={myFavouritesOpen}
            onToggle={() => setMyFavouritesOpen((o) => !o)}
            gold
          />
          {myFavouritesOpen && (
            <>
              {favourites.length === 0 ? (
                <div className="rounded-2xl px-5 py-6 text-center" style={{ border: "1px solid rgba(201,165,90,0.12)", background: "rgba(201,165,90,0.03)" }}>
                  <p className="text-sm leading-relaxed" style={{ color: "rgba(201,165,90,0.5)" }}>
                    Graduate a Rthm to add it here.
                  </p>
                  <p className="text-xs mt-1.5" style={{ color: "rgba(201,165,90,0.35)" }}>
                    Tap ★ on any Rthm in My Rthms to graduate it.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {favourites.map((rhythm) => (
                    <RhythmRow
                      key={rhythm.id}
                      rhythm={rhythm}
                      playing={currentTrackId === rhythm.id && isPlaying}
                      currentTime={currentTrackId === rhythm.id ? currentTime : 0}
                      duration={currentTrackId === rhythm.id ? duration : 0}
                      showLyrics={showLyricsId === rhythm.id}
                      onToggleLyrics={() => setShowLyricsId(showLyricsId === rhythm.id ? null : rhythm.id)}
                      onPlay={() => togglePlay(rhythm)}
                      onUngraduate={() => handleUngraduate(rhythm.id)}
                      onArchive={() => handleArchive(rhythm)}
                      onRemove={() => handleRemove(rhythm.id)}
                      onRecreate={() => handleRecreate(rhythm)}
                      onShare={() => handleShare(rhythm)}
                      onTag={(tags) => handleTag(rhythm.id, tags)}
                      confirmingRemove={confirmRemoveId === rhythm.id}
                      shareToast={shareToastId === rhythm.id}
                      favourite
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── The RTHMIC Library ───────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          <SectionHeader
            title="The RTHMIC Library"
            open={rthmicLibraryOpen}
            onToggle={() => setRthmicLibraryOpen((o) => !o)}
          />
          {rthmicLibraryOpen && (
            <TransitionLink
              href="/explore"
              className="flex items-center gap-5 px-6 py-6 rounded-2xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] active:scale-[0.98] transition-all touch-manipulation"
            >
              <span className="text-2xl flex-shrink-0 text-white/45" aria-hidden>◎</span>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-white/80 tracking-wide">Explore</p>
                <p className="text-sm text-white/50 mt-0.5">20 hand-selected Rthms</p>
              </div>
              <span className="text-white/50 text-lg flex-shrink-0">›</span>
            </TransitionLink>
          )}
        </div>

        {/* ── Rthmix Albums ────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          <SectionHeader
            title="Rthmix Albums"
            open={rthmixAlbumsOpen}
            onToggle={() => setRthmixAlbumsOpen((o) => !o)}
            dim
          />
          {rthmixAlbumsOpen && (
            <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] px-5 py-8 flex flex-col items-center gap-2 text-center">
              <p className="text-sm text-white/45 leading-relaxed">Ordered Rthm sequences — coming soon.</p>
              <p className="text-xs text-white/30 leading-relaxed">Albums let you build a playlist of Rthms in a specific order, like a personal album.</p>
            </div>
          )}
        </div>

        {/* ── Archived ─────────────────────────────────────────────────────────── */}
        {archived.length > 0 && (
          <div className="flex flex-col gap-3">
            <SectionHeader
              title="Archived"
              count={archived.length}
              open={archivedOpen}
              onToggle={() => setArchivedOpen((o) => !o)}
              dim
            />
            {archivedOpen && (
              <div className="flex flex-col gap-2">
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
                    onArchive={() => handleArchive(rhythm)}
                    onRemove={() => handleRemove(rhythm.id)}
                    onRecreate={() => handleRecreate(rhythm)}
                    onShare={() => handleShare(rhythm)}
                    onTag={(tags) => handleTag(rhythm.id, tags)}
                    confirmingRemove={confirmRemoveId === rhythm.id}
                    shareToast={shareToastId === rhythm.id}
                    dimmed
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Recently Deleted ─────────────────────────────────────────────────── */}
        {recentlyDeleted.length > 0 && (
          <div className="flex flex-col gap-3">
            <SectionHeader
              title="Recently Deleted"
              count={recentlyDeleted.length}
              subtitle="Recoverable for 30 days"
              open={deletedOpen}
              onToggle={() => setDeletedOpen((o) => !o)}
              dim
            />
            {deletedOpen && (
              <div className="flex flex-col gap-2">
                {recentlyDeleted.map((rhythm) => {
                  const daysLeft = Math.ceil((THIRTY_DAYS - (now - (rhythm.deletedAt ?? now))) / (24 * 60 * 60 * 1000));
                  return (
                    <div key={rhythm.id} className="rounded-2xl border border-white/[0.05] bg-white/[0.02] opacity-40">
                      <div className="flex items-center gap-4 px-5 py-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white/50 truncate">{rhythm.title}</p>
                          <p className="text-[10px] text-white/50 uppercase tracking-wider mt-0.5">
                            {daysLeft} day{daysLeft !== 1 ? "s" : ""} left to restore
                          </p>
                        </div>
                        <button
                          onClick={() => handleRestore(rhythm.id)}
                          className="flex-shrink-0 text-[10px] uppercase tracking-widest text-white/45 hover:text-white/70 transition-colors touch-manipulation px-3 py-1.5 rounded-lg border border-white/[0.08] hover:border-white/20"
                        >
                          Restore
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Genre picker overlay */}
      {recreateRhythm && (
        <LibraryGenrePicker
          rhythm={recreateRhythm}
          onSelect={handleGenreSelected}
          onClose={() => setRecreateRhythm(null)}
        />
      )}
    </main>
  );
}

// ─── Genre picker bottom sheet ────────────────────────────────────────────────

// Extract display name from "Name|Suno prompt" or plain string
function displayNameFor(g: string): string {
  const pipe = g.indexOf("|");
  if (pipe > 0) return g.slice(0, pipe);
  const comma = g.indexOf(",");
  return comma > 0 ? g.slice(0, comma) : g.slice(0, 42);
}

// Extract Suno prompt from "Name|Suno prompt" or plain string
function sunoPromptFor(g: string): string {
  const pipe = g.indexOf("|");
  return pipe > 0 ? g.slice(pipe + 1) : g;
}

function LibraryGenrePicker({
  rhythm,
  onSelect,
  onClose,
}: {
  rhythm: SavedRhythm;
  onSelect: (genre: string) => void;
  onClose: () => void;
}) {
  const [genres, setGenres] = useState<string[]>([]);
  const [userGenres, setUserGenres] = useState<string[]>([]);
  const [loadingGenres, setLoadingGenres] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [customStyle, setCustomStyle] = useState("");
  const [customSelected, setCustomSelected] = useState(false);

  const selectPreset = (i: number) => { setSelectedIndex(i); setCustomSelected(false); };
  const selectCustom = () => { if (customStyle) { setCustomSelected(true); setSelectedIndex(null); } };

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
        const builtIn: string[] = d.builtIn || [];
        const user: string[] = d.user || [];
        setUserGenres(user);
        setGenres([...builtIn, ...user]);
      })
      .catch(() => {})
      .finally(() => setLoadingGenres(false));
  }, []);

  const selectedGenre = customSelected && customStyle
    ? customStyle
    : selectedIndex !== null ? genres[selectedIndex] ?? "" : "";
  const canProceed = selectedGenre.length > 0;
  const selectedLabel = canProceed ? displayNameFor(selectedGenre) : "";
  const buildLabel = canProceed
    ? `Recreate with ${selectedLabel.slice(0, 28)}${selectedLabel.length > 28 ? "…" : ""}`
    : "Select a style";

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} style={{ backdropFilter: "blur(4px)" }} />

      <div
        className="relative rounded-t-3xl px-6 pt-6 flex flex-col gap-4 max-h-[85vh]"
        style={{ background: "#0d1628", borderTop: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="flex justify-center -mt-1">
          <div className="w-10 h-1 rounded-full bg-white/15" />
        </div>

        <div className="flex-shrink-0">
          <p className="text-[10px] text-white/40 uppercase tracking-widest mb-1">Recreate in another genre</p>
          <h3 className="text-lg font-light text-white leading-snug" style={{ fontFamily: "var(--font-display)" }}>
            {rhythm.title}
          </h3>
        </div>

        {/* Scrollable genre list */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-2 pb-2">
          {loadingGenres ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 rounded-full border-2 border-white/15 border-t-white/40 animate-spin" />
            </div>
          ) : (
            <>
              {genres.map((genre, i) => {
                const isSelected = !customSelected && selectedIndex === i;
                return (
                  <button
                    key={i}
                    onClick={() => selectPreset(i)}
                    className="w-full text-left px-5 py-4 rounded-2xl border transition-all duration-150 active:scale-[0.98] touch-manipulation"
                    style={
                      isSelected
                        ? { borderColor: "rgba(201,165,90,0.5)", background: "rgba(201,165,90,0.08)" }
                        : { borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }
                    }
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className={`text-sm font-medium leading-snug ${isSelected ? "text-[#c9a55a]" : "text-white/75"}`}>
                        {displayNameFor(genre)}
                      </span>
                      <div
                        className="w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center"
                        style={isSelected
                          ? { borderColor: "rgba(201,165,90,0.7)", background: "rgba(201,165,90,0.3)" }
                          : { borderColor: "rgba(255,255,255,0.2)" }}
                      >
                        {isSelected && <div className="w-2 h-2 rounded-full bg-[#c9a55a]" />}
                      </div>
                    </div>
                  </button>
                );
              })}

              {/* Custom style */}
              <CustomStyleInput
                onStyleChange={(s) => { setCustomStyle(s); setCustomSelected(true); setSelectedIndex(null); }}
                selected={customSelected}
                onSelect={selectCustom}
                onSave={persistCustomStyle}
              />
            </>
          )}
        </div>

        <div className="flex flex-col gap-2 pb-safe pt-2 flex-shrink-0">
          <button
            onClick={() => {
              if (!canProceed) return;
              if (customSelected && customStyle) persistCustomStyle(customStyle);
              onSelect(sunoPromptFor(selectedGenre));
            }}
            disabled={!canProceed}
            className="w-full py-5 rounded-2xl text-sm font-semibold tracking-wide active:scale-[0.98] transition-all touch-manipulation disabled:opacity-30"
            style={{ background: "rgba(201,165,90,0.1)", border: "1px solid rgba(201,165,90,0.45)", color: "#c9a55a" }}
          >
            {buildLabel}
          </button>
          <button onClick={onClose} className="w-full py-3 text-white/50 text-sm tracking-wide touch-manipulation">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function RhythmRow({
  rhythm,
  playing,
  currentTime,
  duration,
  showLyrics,
  onToggleLyrics,
  onPlay,
  onGraduate,
  onUngraduate,
  onArchive,
  onRemove,
  onRecreate,
  onShare,
  onTag,
  confirmingRemove,
  shareToast,
  dimmed,
  favourite,
}: {
  rhythm: SavedRhythm;
  playing: boolean;
  currentTime: number;
  duration: number;
  showLyrics: boolean;
  onToggleLyrics: () => void;
  onPlay: () => void;
  onGraduate?: () => void;
  onUngraduate?: () => void;
  onArchive: () => void;
  onRemove: () => void;
  onRecreate: () => void;
  onShare: () => void;
  onTag?: (tags: string[]) => void;
  confirmingRemove?: boolean;
  shareToast?: boolean;
  dimmed?: boolean;
  favourite?: boolean;
}) {
  const canPlay = !!rhythm.audioUrl;
  const mayBeExpired = Date.now() - rhythm.savedAt > 20 * 60 * 60 * 1000;
  const [tagEditOpen, setTagEditOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");

  const tags = rhythm.tags ?? [];

  const addTag = () => {
    const t = tagInput.trim();
    if (!t || tags.includes(t)) { setTagInput(""); return; }
    onTag?.([...tags, t]);
    setTagInput("");
  };

  const removeTag = (tag: string) => onTag?.(tags.filter((t) => t !== tag));

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className={`rounded-2xl border transition-all duration-200 ${dimmed ? "opacity-50" : ""}`}
      style={
        favourite
          ? { background: playing ? "rgba(201,165,90,0.07)" : "rgba(201,165,90,0.03)", borderColor: playing ? "rgba(201,165,90,0.35)" : "rgba(201,165,90,0.15)" }
          : { background: playing ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)", borderColor: playing ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.08)" }
      }
    >
      {/* Play button row */}
      <button
        onClick={onPlay}
        disabled={!canPlay}
        className="w-full flex items-center gap-4 px-5 py-4 text-left touch-manipulation active:scale-[0.99] transition-transform disabled:opacity-40"
      >
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center border flex-shrink-0"
          style={
            favourite
              ? { background: playing ? "rgba(201,165,90,0.25)" : "rgba(201,165,90,0.08)", borderColor: playing ? "rgba(201,165,90,0.5)" : "rgba(201,165,90,0.2)" }
              : { background: playing ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.06)", borderColor: playing ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.10)" }
          }
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold leading-snug truncate ${playing ? "text-white" : favourite ? "" : "text-white/75"}`}
            style={!playing && favourite ? { color: "rgba(201,165,90,0.9)" } : undefined}>
            {rhythm.title}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-[10px] text-white/50 uppercase tracking-wider">{rhythm.pillar}</span>
            {mayBeExpired && !playing && canPlay && (
              <span className="text-[10px] text-white/50 uppercase tracking-wider">· may have expired</span>
            )}
            {/* Tags inline */}
            {tags.map((tag) => (
              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.55)" }}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      </button>

      {/* Progress bar when playing */}
      {playing && duration > 0 && (
        <div className="px-5 pb-3">
          <div className="h-[3px] bg-white/10 rounded-full">
            <div className="h-full bg-white/40 rounded-full" style={{ width: `${(currentTime / duration) * 100}%` }} />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-xs text-white/50 tabular-nums">{fmt(currentTime)}</span>
            <span className="text-xs text-white/50 tabular-nums">{fmt(duration)}</span>
          </div>
        </div>
      )}

      {/* Lyrics panel */}
      {showLyrics && rhythm.lyrics && (
        <LibraryLyricsView lyrics={rhythm.lyrics} currentTime={currentTime} duration={duration} isPlaying={playing} />
      )}

      {/* Tag editing panel */}
      {tagEditOpen && (
        <div className="px-5 pb-4 pt-2 border-t border-white/[0.05] flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5 items-center">
            {tags.map((tag) => (
              <button
                key={tag}
                onClick={() => removeTag(tag)}
                className="text-[11px] px-2 py-0.5 rounded-full flex items-center gap-1 touch-manipulation"
                style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.65)" }}
              >
                {tag} <span className="text-[10px] opacity-60">×</span>
              </button>
            ))}
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } }}
              placeholder="Add tag…"
              className="text-[11px] bg-transparent outline-none placeholder:text-white/25 min-w-[80px]"
              style={{ color: "rgba(255,255,255,0.7)" }}
              autoFocus
            />
            {tagInput.trim() && (
              <button onClick={addTag} className="text-[10px] text-white/50 hover:text-white/70 transition-colors touch-manipulation">
                + Add
              </button>
            )}
          </div>
          <p className="text-[10px] text-white/30">Press Enter to add · tap a tag to remove</p>
        </div>
      )}

      {/* Action bar */}
      <div className="flex border-t border-white/[0.06]">
        {rhythm.lyrics && (
          <SmallBtn onClick={onToggleLyrics} label="Lyrics" icon="≡" active={showLyrics} />
        )}
        <SmallBtn onClick={onShare} label={shareToast ? "Copied!" : "Share"} sublabel={shareToast ? "Link ready" : "Send link"} icon="↗" active={shareToast} />
        <SmallBtn onClick={onRecreate} label="Recreate" sublabel="New genre" icon="↺" />
        {onTag && (
          <SmallBtn onClick={() => setTagEditOpen((v) => !v)} label="Tags" sublabel={tags.length > 0 ? `${tags.length} tag${tags.length > 1 ? "s" : ""}` : "Add tag"} icon="⌗" active={tagEditOpen} />
        )}
        {onGraduate && (
          <SmallBtn onClick={onGraduate} label="Graduate" sublabel="To Favourites" icon="★" gold />
        )}
        {onUngraduate && (
          <SmallBtn onClick={onUngraduate} label="Move back" sublabel="To My Rthms" icon="↓" />
        )}
        <SmallBtn
          onClick={onArchive}
          label={rhythm.status === "archived" ? "Restore" : "Archive"}
          sublabel={rhythm.status === "archived" ? "Back to active" : "Keep but hide"}
          icon="⊙"
        />
        <SmallBtn onClick={onRemove} label={confirmingRemove ? "Confirm?" : "Remove"} sublabel={confirmingRemove ? "Tap again" : "Delete"} icon="×" danger confirming={confirmingRemove} />
      </div>
    </div>
  );
}

function LibraryLyricsView({
  lyrics,
  currentTime,
  duration,
  isPlaying,
}: {
  lyrics: string;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
}) {
  const lines = lyrics
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.match(/^\[.*\]$/));

  if (lines.length === 0) return null;

  const introGap = duration > 0 ? Math.min(10, duration * 0.07) : 0;
  const lyricSpan = Math.max(0, duration - introGap);
  const lineTime = lines.length > 1 ? lyricSpan / lines.length : lyricSpan;

  let currentIdx = -1;
  if (isPlaying && duration > 0 && currentTime >= introGap) {
    currentIdx = Math.min(
      Math.floor((currentTime - introGap) / lineTime),
      lines.length - 1
    );
  }

  const prevLine = currentIdx > 0 ? lines[currentIdx - 1] : null;
  const currLine = currentIdx >= 0 ? lines[currentIdx] : null;
  const nextLine =
    currentIdx >= 0 && currentIdx < lines.length - 1 ? lines[currentIdx + 1] :
    currentIdx === -1 ? lines[0] : null;

  return (
    <div className="px-6 pt-1 pb-5 flex flex-col items-center gap-1.5 text-center border-t border-white/[0.04]">
      {prevLine && (
        <p className="text-[11px] text-white/30 leading-snug transition-all duration-500">{prevLine}</p>
      )}
      {currLine ? (
        <p className="text-sm text-white/80 font-medium leading-snug transition-all duration-300">{currLine}</p>
      ) : (
        <p className="text-[11px] text-white/25 leading-snug italic">{nextLine}</p>
      )}
      {currLine && nextLine && (
        <p className="text-[11px] text-white/30 leading-snug transition-all duration-500">{nextLine}</p>
      )}
    </div>
  );
}

// ─── Micro components ─────────────────────────────────────────────────────────

function SmallBtn({ onClick, label, sublabel, icon, danger, confirming, active, gold }: {
  onClick: () => void; label: string; sublabel?: string; icon: string; danger?: boolean; confirming?: boolean; active?: boolean; gold?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center gap-1 py-3 touch-manipulation transition-colors
        ${confirming ? "text-red-400/90"
          : danger ? "text-white/45 hover:text-red-400/80"
          : gold ? ""
          : active ? "text-white/80"
          : "text-white/55 hover:text-white/75"}`}
      style={gold ? { color: "rgba(201,165,90,0.75)" } : undefined}
    >
      <span className="text-base leading-none">{icon}</span>
      <span className="uppercase tracking-wider text-[10px] font-medium">{label}</span>
      {sublabel && <span className="text-[10px] opacity-60 normal-case tracking-normal">{sublabel}</span>}
    </button>
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


function SectionHeader({
  title,
  count,
  subtitle,
  open,
  onToggle,
  dim,
  gold,
}: {
  title: string;
  count?: number;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  dim?: boolean;
  gold?: boolean;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex items-baseline gap-2 touch-manipulation text-left w-full py-0.5"
    >
      <h2
        className={`font-light tracking-wide ${dim ? "text-sm text-white/50 uppercase tracking-widest" : "text-lg"}`}
        style={gold ? { color: "rgba(201,165,90,0.85)", fontFamily: "var(--font-display)" } : dim ? {} : { color: "white", fontFamily: "var(--font-display)" }}
      >
        {title}
      </h2>
      {count !== undefined && count > 0 && (
        <span className="text-xs tabular-nums" style={gold ? { color: "rgba(201,165,90,0.5)" } : { color: "rgba(255,255,255,0.5)" }}>{count}</span>
      )}
      {subtitle && (
        <span className="text-[10px] text-white/45 ml-1">{subtitle}</span>
      )}
      <span className="ml-auto text-[10px] text-white/50 uppercase tracking-widest">
        {open ? "↑" : "↓"}
      </span>
    </button>
  );
}
