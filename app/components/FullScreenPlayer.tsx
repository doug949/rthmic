"use client";

// Full-screen player — opens whenever any rhythm starts playing.
// Shows complete lyrics, audio controls, and all library actions.

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAudio } from "@/app/contexts/AudioContext";
import { useGeneration } from "@/app/contexts/GenerationContext";
import type { SavedRhythm } from "@/app/api/library/route";
import type { TimedWord } from "@/app/types/pipeline";
import CustomStyleInput from "@/app/components/CustomStyleInput";
import { useOfflineAudio } from "@/app/hooks/useOfflineAudio";
import { MoreSheet } from "@/app/library/_components";
import { BUILD_UPON_GENRE, buildUponLyrics, buildUponTitle } from "@/app/lib/buildUpon";
import { sideLabelFor } from "@/app/lib/rhythmPairs";

const LYRIC_SYNC_LEAD_SECONDS = 0.35;

function inferStyle(pillar: string): "A" | "B" {
  return (pillar || "").toLowerCase() === "movement" ? "A" : "B";
}

export default function FullScreenPlayer() {
  const {
    currentTrackId, currentTitle, isPlaying,
    currentTime, duration,
    playerOpen, closePlayer, stop,
    togglePlayPause, restart, seek, skip, handlePlayUrl,
    isLoop, setLoop,
  } = useAudio();
  const { startGeneration } = useGeneration();
  const router = useRouter();

  const [rhythm, setRhythm]           = useState<SavedRhythm | null>(null);
  const [libraryRhythms, setLibraryRhythms] = useState<SavedRhythm[]>([]);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [shareToast, setShareToast]   = useState(false);
  const [tagEditOpen, setTagEditOpen] = useState(false);
  const [tagInput, setTagInput]       = useState("");
  const [recreateOpen, setRecreateOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const offlineUrl = rhythm ? `/api/proxy-audio?id=${encodeURIComponent(rhythm.id)}` : undefined;
  const { isCached, cacheTrack, caching } = useOfflineAudio(offlineUrl);

  // ── Fetch rhythm once per track (persists across player open/close) ───────
  useEffect(() => {
    if (!currentTrackId) { setRhythm(null); return; }
    let cancelled = false;
    fetch("/api/library")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const rhythms = (data.rhythms ?? []) as SavedRhythm[];
        const found = rhythms.find(
          (r: SavedRhythm) => r.id === currentTrackId
        );
        setLibraryRhythms(rhythms);
        setRhythm(found ?? null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currentTrackId]); // intentionally NOT including playerOpen

  // Reset transient state when track changes
  useEffect(() => {
    setTagEditOpen(false);
    setTagInput("");
    setConfirmRemove(false);
    setRecreateOpen(false);
  }, [currentTrackId]);

  // ── On-demand timed lyrics fetch ─────────────────────────────────────────
  // If the rhythm loaded without timedLyrics but has both IDs, fetch them now.
  // This covers the race where the player opens before the background save
  // in GenerationContext has completed, and songs generated before sunoTaskId
  // was added to the pipeline.
  useEffect(() => {
    if (!rhythm || rhythm.timedLyrics) return;
    if (!rhythm.sunoTaskId || !rhythm.sunoClipId) return;

    let cancelled = false;
    const { sunoTaskId, sunoClipId, id } = rhythm;

    (async () => {
      try {
        const res = await fetch(
          `/api/timed-lyrics?taskId=${encodeURIComponent(sunoTaskId)}&audioId=${encodeURIComponent(sunoClipId)}`
        );
        if (!res.ok || cancelled) return;
        const data = await res.json() as { timedWords?: TimedWord[] };
        if (!data.timedWords?.length || cancelled) return;

        // Update local state immediately so sync starts without a reload
        setRhythm((r) => (r && r.id === id ? { ...r, timedLyrics: data.timedWords } : r));

        // Persist to library in the background
        fetch("/api/library", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update", id, timedLyrics: data.timedWords }),
        }).catch(console.error);
      } catch { /* non-critical */ }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rhythm?.id, rhythm?.sunoTaskId, rhythm?.sunoClipId]);

  // ── Library mutations ─────────────────────────────────────────────────────
  const mutate = useCallback(
    async (body: Record<string, unknown>) => {
      await fetch("/api/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      // Re-fetch to get updated state
      const data = await fetch("/api/library").then((r) => r.json());
      setRhythm(
        (data.rhythms ?? []).find((r: SavedRhythm) => r.id === currentTrackId) ?? null
      );
      // Notify list pages so they re-fetch and show fresh data (e.g. new tags)
      window.dispatchEvent(new CustomEvent("library-mutated"));
    },
    [currentTrackId]
  );

  const tags = rhythm?.tags ?? [];
  const alternate = useMemo(() => {
    if (!rhythm) return null;
    const baseTitle = rhythm.title.replace(/\s+\(Variation\)$/i, "").trim().toLowerCase();
    return libraryRhythms.find((candidate) => {
      if (candidate.id === rhythm.id || candidate.status === "deleted") return false;
      if (rhythm.alternateId && candidate.id === rhythm.alternateId) return true;
      if (candidate.alternateId === rhythm.id) return true;
      if (rhythm.pairId && candidate.pairId === rhythm.pairId) return true;
      const candidateBaseTitle = candidate.title.replace(/\s+\(Variation\)$/i, "").trim().toLowerCase();
      return (
        baseTitle.length > 0 &&
        candidateBaseTitle === baseTitle &&
        candidate.pillar === rhythm.pillar &&
        (candidate.lyrics ?? "").slice(0, 80) === (rhythm.lyrics ?? "").slice(0, 80)
      );
    }) ?? null;
  }, [libraryRhythms, rhythm]);
  const sideLabel = rhythm && alternate ? sideLabelFor(rhythm) : null;
  const preferredSideId = rhythm?.preferredSideId ?? alternate?.preferredSideId;
  const isPreferredSide = !!rhythm && preferredSideId === rhythm.id;
  const sidePreference = !preferredSideId ? "none" : isPreferredSide ? "current" : "other";
  const preferenceButtonLabel =
    sidePreference === "current"
      ? "✓ Preferred side"
      : sidePreference === "other"
      ? "Prefer this side instead"
      : "Tap if preferred";

  const handleSwapSide = useCallback(() => {
    if (!alternate) return;
    handlePlayUrl(
      alternate.id,
      `/api/proxy-audio?id=${encodeURIComponent(alternate.id)}`,
      alternate.title,
      { rhythmId: alternate.id, sunoTaskId: alternate.sunoTaskId }
    );
  }, [alternate, handlePlayUrl]);

  const handlePreferSide = useCallback(() => {
    if (!rhythm) return;
    mutate({ action: "preferSide", id: rhythm.id });
  }, [mutate, rhythm]);

  const handleGraduate   = () => rhythm && mutate({ action: "update", id: rhythm.id, status: "favourite" });
  const handleUngraduate = () => rhythm && mutate({ action: "update", id: rhythm.id, status: "active" });
  const handleArchive    = () =>
    rhythm && mutate({ action: "update", id: rhythm.id, status: rhythm.status === "archived" ? "active" : "archived" });
  const handleRemove = () => {
    if (!rhythm) return;
    if (confirmRemove) {
      mutate({ action: "remove", id: rhythm.id });
      stop();
      closePlayer();
    } else {
      setConfirmRemove(true);
      setTimeout(() => setConfirmRemove(false), 3000);
    }
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (!t || tags.includes(t)) { setTagInput(""); return; }
    mutate({ action: "update", id: rhythm!.id, tags: [...tags, t] });
    setTagInput("");
  };
  const removeTag = (tag: string) =>
    mutate({ action: "update", id: rhythm!.id, tags: tags.filter((t) => t !== tag) });

  const handleShare = async () => {
    if (!rhythm) return;
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
        setShareToast(true);
        setTimeout(() => setShareToast(false), 2500);
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") console.error("Share failed:", err);
    }
  };

  const handleTogglePlay = () => togglePlayPause();

  // ── Helpers ───────────────────────────────────────────────────────────────
  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // Swipe-down to close
  const touchStartY = useRef<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => { touchStartY.current = e.touches[0].clientY; };
  const handleTouchEnd   = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    if (e.changedTouches[0].clientY - touchStartY.current > 80) closePlayer();
    touchStartY.current = null;
  };

  if (!playerOpen || !currentTrackId) return null;

  const displayTitle  = rhythm?.title ?? currentTitle ?? "Playing…";
  const displayPillar = rhythm?.pillar ?? null;
  const hasAudio      = !!rhythm?.audioUrl || !!currentTrackId;
  const isFavourite   = rhythm?.status === "favourite";
  const theme = isFavourite
    ? {
        bg: "#0a1020",
        topButtonBg: "rgba(201,165,90,0.10)",
        topButtonBorder: "1px solid rgba(201,165,90,0.16)",
        title: "rgba(201,165,90,0.95)",
        muted: "rgba(201,165,90,0.52)",
        faint: "rgba(201,165,90,0.24)",
        playBg: "rgba(201,165,90,0.18)",
        playBorder: "1px solid rgba(201,165,90,0.36)",
        actionBg: "rgba(201,165,90,0.04)",
        actionBorder: "rgba(201,165,90,0.14)",
      }
    : {
        bg: "#0a1020",
        topButtonBg: "rgba(255,255,255,0.06)",
        topButtonBorder: "none",
        title: "rgba(255,255,255,0.85)",
        muted: "rgba(255,255,255,0.4)",
        faint: "rgba(255,255,255,0.35)",
        playBg: "rgba(255,255,255,0.12)",
        playBorder: "1px solid rgba(255,255,255,0.18)",
        actionBg: "rgba(255,255,255,0.02)",
        actionBorder: "rgba(255,255,255,0.07)",
      };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden"
      style={{ background: theme.bg }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4" style={{ paddingTop: "max(env(safe-area-inset-top), 16px)", paddingBottom: "12px" }}>
        <button
          onClick={closePlayer}
          className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full touch-manipulation active:scale-90 transition-transform"
          style={{ background: theme.topButtonBg, border: theme.topButtonBorder }}
          aria-label="Close player"
        >
          <ChevronDownIcon color={isFavourite ? "rgba(201,165,90,0.75)" : undefined} />
        </button>
        <div className="flex-1 min-w-0 text-center">
          {displayPillar && (
            <p className="text-[10px] uppercase tracking-widest mb-0.5" style={{ color: theme.muted }}>{displayPillar}</p>
          )}
          <p className="text-sm font-semibold truncate px-2" style={{ fontFamily: "var(--font-display)", color: theme.title }}>
            {displayTitle}
          </p>
        </div>
        <button
          onClick={() => { closePlayer(); router.push("/library/my-rthms"); }}
          className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full touch-manipulation active:scale-90 transition-transform"
          style={{ background: theme.topButtonBg, border: theme.topButtonBorder }}
          aria-label="Go to My Rthms"
        >
          <LibraryIcon color={isFavourite ? "rgba(201,165,90,0.75)" : undefined} />
        </button>
      </div>

      {sideLabel && alternate && (
        <div className="px-5 pb-3 flex items-center justify-center gap-2 flex-wrap">
          <span
            className="text-[10px] uppercase tracking-widest rounded-full px-3 py-1.5"
            style={{
              background: isFavourite ? "rgba(201,165,90,0.10)" : "rgba(255,255,255,0.045)",
              border: isFavourite ? "1px solid rgba(201,165,90,0.18)" : "1px solid rgba(255,255,255,0.08)",
              color: isFavourite ? "rgba(201,165,90,0.62)" : "rgba(255,255,255,0.42)",
            }}
          >
            {sideLabel}-side{isPreferredSide ? " · Preferred side" : ""}
          </span>
          <button
            onClick={handlePreferSide}
            disabled={isPreferredSide}
            className="text-[10px] uppercase tracking-widest rounded-full px-3 py-1.5 touch-manipulation active:scale-[0.98] transition-transform disabled:opacity-55"
            style={{
              background: isPreferredSide
                ? isFavourite ? "rgba(201,165,90,0.16)" : "rgba(139,92,246,0.13)"
                : isFavourite ? "rgba(201,165,90,0.08)" : "rgba(255,255,255,0.04)",
              border: isPreferredSide
                ? isFavourite ? "1px solid rgba(201,165,90,0.32)" : "1px solid rgba(139,92,246,0.28)"
                : isFavourite ? "1px solid rgba(201,165,90,0.18)" : "1px solid rgba(255,255,255,0.08)",
              color: isFavourite ? "rgba(201,165,90,0.76)" : isPreferredSide ? "rgba(167,139,250,0.75)" : "rgba(255,255,255,0.48)",
            }}
          >
            {preferenceButtonLabel}
          </button>
          <button
            onClick={handleSwapSide}
            className="text-[10px] uppercase tracking-widest rounded-full px-3 py-1.5 touch-manipulation active:scale-[0.98] transition-transform"
            style={{
              background: isFavourite ? "rgba(201,165,90,0.14)" : "rgba(255,255,255,0.07)",
              border: isFavourite ? "1px solid rgba(201,165,90,0.28)" : "1px solid rgba(255,255,255,0.12)",
              color: isFavourite ? "rgba(201,165,90,0.82)" : "rgba(255,255,255,0.62)",
            }}
          >
            Swap to {sideLabel === "A" ? "B" : "A"}-side
          </button>
        </div>
      )}

      {/* ── Lyrics — scrollable main area ─────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {rhythm?.lyrics ? (
          <FullLyricsView
            lyrics={rhythm.lyrics}
            currentTime={currentTime}
            duration={duration}
            isPlaying={isPlaying}
            timedLyrics={rhythm.timedLyrics}
            gold={isFavourite}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm" style={{ color: theme.faint }}>No lyrics available</p>
          </div>
        )}
      </div>

      {/* ── Controls + Actions — fixed bottom ─────────────────────────────── */}
      <div
        className="flex-shrink-0 px-5 pb-safe"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 20px)" }}
      >
        {/* Seek bar */}
        {hasAudio && (
          <div className="mb-4">
            <SeekBar currentTime={currentTime} duration={duration} onSeek={seek} gold={isFavourite} />
            <div className="flex justify-between mt-1.5">
              <span className="text-[10px] tabular-nums" style={{ color: theme.faint }}>{fmt(currentTime)}</span>
              <span className="text-[10px] tabular-nums" style={{ color: theme.faint }}>{duration > 0 ? fmt(duration) : "--:--"}</span>
            </div>
          </div>
        )}

        {/* Transport controls */}
        <div className="flex items-center justify-center gap-6 mb-5">
          <button
            onClick={() => setLoop(!isLoop)}
            className="flex flex-col items-center gap-0.5 transition-colors touch-manipulation"
            style={{ color: isLoop ? "rgba(201,165,90,0.9)" : "rgba(255,255,255,0.35)" }}
          >
            <LoopIcon />
            <span className="text-[9px] tracking-wider">loop</span>
          </button>

          <button
            onClick={() => skip(-10)}
            className="flex flex-col items-center gap-0.5 active:text-white/70 transition-colors touch-manipulation"
            style={{ color: theme.muted }}
          >
            <SkipBackIcon />
            <span className="text-[9px] tracking-wider">10s</span>
          </button>

          <button
            onClick={handleTogglePlay}
            className="w-16 h-16 rounded-full flex items-center justify-center active:scale-95 transition-transform touch-manipulation"
            style={{ background: theme.playBg, border: theme.playBorder, color: isFavourite ? "rgba(201,165,90,0.9)" : undefined }}
          >
            {isPlaying ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
          </button>

          <button
            onClick={() => skip(10)}
            className="flex flex-col items-center gap-0.5 active:text-white/70 transition-colors touch-manipulation"
            style={{ color: theme.muted }}
          >
            <SkipFwdIcon />
            <span className="text-[9px] tracking-wider">10s</span>
          </button>

          <button
            onClick={restart}
            className="flex flex-col items-center gap-0.5 active:text-white/70 transition-colors touch-manipulation"
            style={{ color: theme.faint }}
          >
            <RestartIcon />
            <span className="text-[9px] tracking-wider">start</span>
          </button>
        </div>

        {/* Tag edit panel */}
        {tagEditOpen && rhythm && (
          <div
            className="mb-3 rounded-2xl border px-4 py-3 flex flex-col gap-2"
            style={{ borderColor: theme.actionBorder, background: theme.actionBg }}
          >
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
                <button onClick={addTag} className="text-[10px] text-white/50 touch-manipulation">+ Add</button>
              )}
            </div>
            <p className="text-[10px] text-white/25">Enter to add · tap tag to remove</p>
          </div>
        )}

        {/* Action buttons — primary only */}
        {rhythm && (
          <div className="flex border rounded-2xl overflow-hidden" style={{ borderColor: theme.actionBorder, background: theme.actionBg }}>
            <ActionBtn onClick={handleShare} icon="↗" label={shareToast ? "Copied!" : "Share"} active={shareToast} gold={isFavourite} />
            {(rhythm.status === "active" || rhythm.status === "new") && (
              <ActionBtn onClick={handleGraduate} icon="☆" label="Add to Favs" />
            )}
            {rhythm.status === "favourite" && (
              <ActionBtn onClick={handleUngraduate} icon="★" label="Unfavourite" gold />
            )}
            <ActionBtn onClick={() => setMoreOpen(true)} icon="···" label="More" gold={isFavourite} />
          </div>
        )}

        {/* Overflow sheet */}
        {moreOpen && rhythm && (
          <MoreSheet
            title={rhythm.title}
            onClose={() => setMoreOpen(false)}
            items={[
              {
                icon: "↺", label: "Recreate", sublabel: "New genre",
                onClick: () => setRecreateOpen(true),
              },
              {
                icon: "+",
                label: "Build upon this",
                sublabel: "Extend the concept",
                onClick: () => {
                  startGeneration({
                    lyrics: buildUponLyrics(rhythm),
                    style: inferStyle(rhythm.pillar),
                    title: buildUponTitle(rhythm.title),
                    pillar: rhythm.pillar,
                    genre: BUILD_UPON_GENRE,
                    note: `Built upon: ${rhythm.title}`,
                  });
                  setMoreOpen(false);
                  closePlayer();
                },
              },
              {
                icon: "⌗", label: "Tags",
                sublabel: tags.length > 0 ? `${tags.length} tag${tags.length > 1 ? "s" : ""}` : "Add tag",
                active: tagEditOpen,
                onClick: () => setTagEditOpen((v) => !v),
              },
              ...(rhythm.audioUrl || rhythm.audioKey ? [{
                icon: isCached ? "✓" : caching ? "…" : "↓",
                label: isCached ? "Available Offline" : caching ? "Saving…" : "Save Offline",
                active: isCached,
                onClick: () => { if (!isCached && !caching) cacheTrack(); },
              }] : []),
              {
                icon: "⊙",
                label: rhythm.status === "archived" ? "Restore" : "Archive",
                sublabel: rhythm.status === "archived" ? "Back to active" : "Keep but hide",
                onClick: handleArchive,
              },
              {
                icon: "×",
                label: confirmRemove ? "Confirm delete?" : "Remove",
                sublabel: confirmRemove ? "Tap again to confirm" : "Delete permanently",
                danger: true, confirming: confirmRemove,
                onClick: handleRemove,
                keepOpen: true,
              },
            ]}
          />
        )}
      </div>

      {/* Genre picker overlay */}
      {recreateOpen && rhythm && (
        <PlayerGenrePicker
          rhythm={rhythm}
          onSelect={(genre) => {
            startGeneration({
              lyrics: rhythm.lyrics || "",
              style: inferStyle(rhythm.pillar),
              title: rhythm.title,
              pillar: rhythm.pillar,
              genre,
            });
            setRecreateOpen(false);
            closePlayer();
          }}
          onClose={() => setRecreateOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Full lyrics display with line-level karaoke highlight ───────────────────
//
// When timedLyrics (TimedWord[]) is present: uses word timestamps to derive
// per-line start/end times, then highlights the whole active line.
// Falls back to equal-division estimation when not available.

function FullLyricsView({
  lyrics,
  currentTime,
  duration,
  isPlaying,
  timedLyrics,
  gold,
}: {
  lyrics: string;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  timedLyrics?: TimedWord[];
  gold?: boolean;
}) {
  const lines = lyrics
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const nonTagLines = lines.filter((l) => !l.match(/^\[.*\]$/));

  // ── Build line-level timestamp ranges from word data ──────────────────────
  const { lineTimings, lineToNonTagIdx } = useMemo(() => {
    const ltnMap: number[] = [];
    let cnt = -1;
    for (const line of lines) {
      if (!line.match(/^\[.*\]$/)) { cnt++; ltnMap.push(cnt); }
      else { ltnMap.push(-1); }
    }

    if (!timedLyrics || timedLyrics.length === 0) {
      return { lineTimings: [], lineToNonTagIdx: ltnMap };
    }

    // Distribute words across non-tag lines by normalised character count,
    // then derive each line's startS/endS from its first/last word.
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const lineWords: TimedWord[][] = Array.from({ length: nonTagLines.length }, () => []);
    let wordIdx = 0;
    for (let li = 0; li < nonTagLines.length && wordIdx < timedLyrics.length; li++) {
      const lineCharCount = norm(nonTagLines[li]).length;
      let lineCharsConsumed = 0;
      while (wordIdx < timedLyrics.length && lineCharsConsumed < lineCharCount) {
        const tw = timedLyrics[wordIdx];
        lineWords[li].push(tw);
        lineCharsConsumed += Math.max(1, norm(tw.word).length);
        wordIdx++;
      }
    }

    const timings = lineWords.map((words) =>
      words.length > 0
        ? { startS: words[0].startS, endS: words[words.length - 1].endS }
        : null
    );

    return { lineTimings: timings, lineToNonTagIdx: ltnMap };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lyrics, timedLyrics]);

  // ── Current line resolution ───────────────────────────────────────────────
  let currentNonTagLineIdx = -1;
  const lyricClock = currentTime + LYRIC_SYNC_LEAD_SECONDS;

  if (timedLyrics && lineTimings.length > 0) {
    // Find the line whose window contains currentTime; if between lines use the last started
    let lastStarted = -1;
    for (let li = 0; li < lineTimings.length; li++) {
      const t = lineTimings[li];
      if (!t) continue;
      if (lyricClock >= t.startS) lastStarted = li;
      if (lyricClock >= t.startS && lyricClock <= t.endS) { lastStarted = li; break; }
    }
    currentNonTagLineIdx = lastStarted;
  } else {
    // Fallback: equal-division estimation
    const introGap = duration > 0 ? Math.min(10, duration * 0.07) : 0;
    const lyricSpan = Math.max(0, duration - introGap);
    const lineTime = nonTagLines.length > 1 ? lyricSpan / nonTagLines.length : lyricSpan;
    if (isPlaying && duration > 0 && lyricClock >= introGap) {
      currentNonTagLineIdx = Math.min(
        Math.floor((lyricClock - introGap) / lineTime),
        nonTagLines.length - 1
      );
    }
  }

  // Auto-scroll active line into view
  const currentRef = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => {
    if (currentRef.current && isPlaying) {
      currentRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentNonTagLineIdx, isPlaying]);

  return (
    <div className="px-6 py-6 flex flex-col gap-0.5">
      {timedLyrics && timedLyrics.length > 0 && (
        <p
          className="text-[9px] uppercase tracking-widest mb-3 text-center"
          style={{ color: gold ? "rgba(201,165,90,0.22)" : "rgba(255,255,255,0.15)" }}
        >
          Synced
        </p>
      )}
      {lines.map((line, i) => {
        const isTag = line.match(/^\[.*\]$/);
        if (isTag) {
          return (
            <p
              key={i}
              className="text-[10px] uppercase tracking-widest mt-5 mb-2 first:mt-0"
              style={{ color: gold ? "rgba(201,165,90,0.38)" : "rgba(255,255,255,0.25)" }}
            >
              {line.replace(/^\[|\]$/g, "")}
            </p>
          );
        }

        const thisNonTagIdx = lineToNonTagIdx[i] ?? -1;
        const isCurrentLine = thisNonTagIdx >= 0 && thisNonTagIdx === currentNonTagLineIdx;

        return (
          <p
            key={i}
            ref={isCurrentLine ? currentRef : null}
            className="text-base leading-relaxed transition-all duration-300"
            style={{
              color: isCurrentLine
                ? gold ? "rgba(201,165,90,0.96)" : "rgba(255,255,255,0.95)"
                : gold ? "rgba(201,165,90,0.46)" : "rgba(255,255,255,0.38)",
              fontWeight: isCurrentLine ? 500 : 400,
            }}
          >
            {line}
          </p>
        );
      })}
      {/* Bottom padding so last line is never behind controls */}
      <div className="h-4" />
    </div>
  );
}

// ─── Seek bar ─────────────────────────────────────────────────────────────────

function SeekBar({ currentTime, duration, onSeek, gold }: { currentTime: number; duration: number; onSeek: (t: number) => void; gold?: boolean }) {
  const barRef = useRef<HTMLDivElement>(null);
  const progress = duration > 0 ? currentTime / duration : 0;

  const seekFromClientX = (clientX: number) => {
    if (duration <= 0 || !barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onSeek(ratio * duration);
  };

  const handleClick  = (e: React.MouseEvent<HTMLDivElement>) => seekFromClientX(e.clientX);
  const handleTouch  = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation(); // don't fire swipe-to-close
    seekFromClientX(e.touches[0]?.clientX ?? e.changedTouches[0].clientX);
  };

  return (
    <div
      ref={barRef}
      className="h-5 flex items-center cursor-pointer"
      onClick={handleClick}
      onTouchStart={handleTouch}
      onTouchMove={handleTouch}
    >
      <div className="w-full h-1 rounded-full relative overflow-hidden" style={{ background: gold ? "rgba(201,165,90,0.18)" : "rgba(255,255,255,0.12)" }}>
        <div
          className="h-full rounded-full transition-none"
          style={{ width: `${progress * 100}%`, background: gold ? "rgba(201,165,90,0.64)" : "rgba(255,255,255,0.55)" }}
        />
      </div>
    </div>
  );
}

// ─── Action button ────────────────────────────────────────────────────────────

function ActionBtn({
  onClick, icon, label, sublabel, danger, confirming, active, gold,
}: {
  onClick: () => void; icon: string; label: string; sublabel?: string;
  danger?: boolean; confirming?: boolean; active?: boolean; gold?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center gap-1 py-3.5 touch-manipulation transition-colors
        ${confirming ? "text-red-400/90"
          : danger   ? "text-white/40 hover:text-red-400/80"
          : gold     ? ""
          : active   ? "text-white/80"
          : "text-white/50 hover:text-white/70"}`}
      style={gold ? { color: "rgba(201,165,90,0.75)" } : undefined}
    >
      <span className="text-base leading-none">{icon}</span>
      <span className="uppercase tracking-wider text-[9px] font-medium">{label}</span>
      {sublabel && <span className="text-[9px] opacity-60 normal-case">{sublabel}</span>}
    </button>
  );
}

// ─── Transport icons ──────────────────────────────────────────────────────────

function PlayIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className="ml-0.5">
      <path d="M5 3.5L17 10L5 16.5V3.5Z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <rect x="4" y="3" width="4" height="14" rx="1.5" fill="currentColor" />
      <rect x="12" y="3" width="4" height="14" rx="1.5" fill="currentColor" />
    </svg>
  );
}

function ChevronDownIcon({ color }: { color?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" className={color ? undefined : "text-white/60"} style={color ? { color } : undefined}>
      <path d="M4 7L10 13L16 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SkipBackIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-current">
      <path d="M11 17l-5-5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 17l-5-5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SkipFwdIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-current">
      <path d="M13 7l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 7l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RestartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-current">
      <path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.36 2.64L3 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 3v5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LibraryIcon({ color }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className={color ? undefined : "text-white/60"} style={color ? { color } : undefined}>
      <rect x="3" y="4" width="4" height="13" rx="1.5" fill="currentColor" opacity="0.5" />
      <rect x="8.5" y="4" width="4" height="13" rx="1.5" fill="currentColor" opacity="0.75" />
      <rect x="14" y="4" width="4" height="13" rx="1.5" fill="currentColor" />
    </svg>
  );
}

function LoopIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-current">
      <path d="M17 2l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 11V9a4 4 0 014-4h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 22l-4-4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 13v2a4 4 0 01-4 4H3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Genre picker (embedded in player) ───────────────────────────────────────

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

function PlayerGenrePicker({
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

  const selectedGenre  = customSelected && customStyle ? customStyle : selectedIndex !== null ? genres[selectedIndex] ?? "" : "";
  const canProceed     = selectedGenre.length > 0;
  const selectedLabel  = canProceed ? displayNameFor(selectedGenre) : "";
  const buildLabel     = canProceed ? `Recreate with ${selectedLabel.slice(0, 28)}${selectedLabel.length > 28 ? "…" : ""}` : "Select a style";

  return (
    <div className="absolute inset-0 z-10 flex flex-col justify-end" style={{ background: "rgba(10,16,32,0.8)", backdropFilter: "blur(8px)" }}>
      <div className="rounded-t-3xl px-6 pt-6 flex flex-col gap-4 max-h-[80vh]" style={{ background: "#0d1628", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
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
