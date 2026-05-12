"use client";

// Full-screen player — opens whenever any rhythm starts playing.
// Shows complete lyrics, audio controls, and all library actions.

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAudio } from "@/app/contexts/AudioContext";
import { useGeneration } from "@/app/contexts/GenerationContext";
import type { SavedRhythm } from "@/app/api/library/route";
import CustomStyleInput from "@/app/components/CustomStyleInput";

function inferStyle(pillar: string): "A" | "B" {
  return (pillar || "").toLowerCase() === "movement" ? "A" : "B";
}

export default function FullScreenPlayer() {
  const {
    currentTrackId, currentTitle, isPlaying,
    currentTime, duration,
    playerOpen, closePlayer, stop,
    restart, seek, skip,
    handlePlayUrl,
  } = useAudio();
  const { startGeneration } = useGeneration();

  const [rhythm, setRhythm]           = useState<SavedRhythm | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [shareToast, setShareToast]   = useState(false);
  const [tagEditOpen, setTagEditOpen] = useState(false);
  const [tagInput, setTagInput]       = useState("");
  const [recreateOpen, setRecreateOpen] = useState(false);

  // ── Fetch rhythm from library whenever track or player opens ──────────────
  useEffect(() => {
    if (!playerOpen || !currentTrackId) return;
    let cancelled = false;
    fetch("/api/library")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const found = (data.rhythms ?? []).find(
          (r: SavedRhythm) => r.id === currentTrackId
        );
        setRhythm(found ?? null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [playerOpen, currentTrackId]);

  // Reset transient state when track changes
  useEffect(() => {
    setTagEditOpen(false);
    setTagInput("");
    setConfirmRemove(false);
    setRecreateOpen(false);
  }, [currentTrackId]);

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
    },
    [currentTrackId]
  );

  const tags = rhythm?.tags ?? [];

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

  const handleTogglePlay = () => {
    if (!rhythm?.audioUrl && !currentTrackId) return;
    if (rhythm?.audioUrl) {
      handlePlayUrl(rhythm.id, rhythm.audioUrl, rhythm.title);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  if (!playerOpen || !currentTrackId) return null;

  const displayTitle  = rhythm?.title ?? currentTitle ?? "Playing…";
  const displayPillar = rhythm?.pillar ?? null;
  const hasAudio      = !!rhythm?.audioUrl || !!currentTrackId;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden"
      style={{ background: "#0a1020" }}
    >
      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-5 pt-safe" style={{ paddingTop: "max(env(safe-area-inset-top), 16px)", paddingBottom: "12px" }}>
        <button
          onClick={closePlayer}
          className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full touch-manipulation active:scale-90 transition-transform"
          style={{ background: "rgba(255,255,255,0.06)" }}
          aria-label="Close player"
        >
          <ChevronDownIcon />
        </button>
        <div className="flex-1 min-w-0 text-center">
          {displayPillar && (
            <p className="text-[10px] uppercase tracking-widest text-white/40 mb-0.5">{displayPillar}</p>
          )}
          <p className="text-sm font-semibold text-white/85 truncate px-2" style={{ fontFamily: "var(--font-display)" }}>
            {displayTitle}
          </p>
        </div>
        <div className="w-10 flex-shrink-0" /> {/* balance */}
      </div>

      {/* ── Lyrics — scrollable main area ─────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {rhythm?.lyrics ? (
          <FullLyricsView
            lyrics={rhythm.lyrics}
            currentTime={currentTime}
            duration={duration}
            isPlaying={isPlaying}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-white/30 text-sm">No lyrics available</p>
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
            <SeekBar currentTime={currentTime} duration={duration} onSeek={seek} />
            <div className="flex justify-between mt-1.5">
              <span className="text-[10px] text-white/35 tabular-nums">{fmt(currentTime)}</span>
              <span className="text-[10px] text-white/35 tabular-nums">{duration > 0 ? fmt(duration) : "--:--"}</span>
            </div>
          </div>
        )}

        {/* Transport controls */}
        <div className="flex items-center justify-center gap-8 mb-5">
          <button
            onClick={() => skip(-10)}
            className="flex flex-col items-center gap-0.5 text-white/40 active:text-white/70 transition-colors touch-manipulation"
          >
            <SkipBackIcon />
            <span className="text-[9px] tracking-wider">10s</span>
          </button>

          <button
            onClick={handleTogglePlay}
            className="w-16 h-16 rounded-full flex items-center justify-center active:scale-95 transition-transform touch-manipulation"
            style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.18)" }}
          >
            {isPlaying ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
          </button>

          <button
            onClick={() => skip(10)}
            className="flex flex-col items-center gap-0.5 text-white/40 active:text-white/70 transition-colors touch-manipulation"
          >
            <SkipFwdIcon />
            <span className="text-[9px] tracking-wider">10s</span>
          </button>
        </div>

        {/* Tag edit panel */}
        {tagEditOpen && rhythm && (
          <div className="mb-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 flex flex-col gap-2">
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

        {/* Action buttons */}
        {rhythm && (
          <div className="flex border border-white/[0.07] rounded-2xl overflow-hidden bg-white/[0.02]">
            <ActionBtn onClick={handleShare}  icon="↗" label={shareToast ? "Copied!" : "Share"} active={shareToast} />
            <ActionBtn onClick={() => setRecreateOpen(true)} icon="↺" label="Recreate" />
            <ActionBtn onClick={() => setTagEditOpen((v) => !v)} icon="⌗" label="Tags" sublabel={tags.length > 0 ? `${tags.length}` : undefined} active={tagEditOpen} />
            {rhythm.status === "active" && (
              <ActionBtn onClick={handleGraduate} icon="★" label="Graduate" gold />
            )}
            {rhythm.status === "favourite" && (
              <ActionBtn onClick={handleUngraduate} icon="↓" label="Move back" />
            )}
            <ActionBtn onClick={handleArchive} icon="⊙" label={rhythm.status === "archived" ? "Restore" : "Archive"} />
            <ActionBtn
              onClick={handleRemove}
              icon="×"
              label={confirmRemove ? "Confirm?" : "Remove"}
              danger
              confirming={confirmRemove}
            />
          </div>
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

// ─── Full lyrics display with current-line highlight ──────────────────────────

function FullLyricsView({
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
  const lineRefs = useRef<(HTMLElement | null)[]>([]);

  const lines = lyrics
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // Determine current line index
  const nonTagLines = lines.filter((l) => !l.match(/^\[.*\]$/));
  const introGap = duration > 0 ? Math.min(10, duration * 0.07) : 0;
  const lyricSpan = Math.max(0, duration - introGap);
  const lineTime  = nonTagLines.length > 1 ? lyricSpan / nonTagLines.length : lyricSpan;

  let currentNonTagIdx = -1;
  if (isPlaying && duration > 0 && currentTime >= introGap) {
    currentNonTagIdx = Math.min(
      Math.floor((currentTime - introGap) / lineTime),
      nonTagLines.length - 1
    );
  }

  // Build map from nonTagLine index → global line index
  let nonTagCount = 0;
  const currentLineText = nonTagLines[currentNonTagIdx] ?? null;

  // Auto-scroll current line into view
  const currentRef = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => {
    if (currentRef.current && isPlaying) {
      currentRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentNonTagIdx, isPlaying]);

  return (
    <div className="px-6 py-6 flex flex-col gap-0.5">
      {lines.map((line, i) => {
        const isTag = line.match(/^\[.*\]$/);
        if (isTag) {
          return (
            <p
              key={i}
              className="text-[10px] uppercase tracking-widest mt-5 mb-2 first:mt-0"
              style={{ color: "rgba(255,255,255,0.25)" }}
            >
              {line.replace(/^\[|\]$/g, "")}
            </p>
          );
        }

        const isCurrentLine = line === currentLineText && currentLineText !== null;
        if (!isTag) nonTagCount++;

        return (
          <p
            key={i}
            ref={isCurrentLine ? currentRef : null}
            className="text-base leading-relaxed transition-all duration-300"
            style={{
              color: isCurrentLine
                ? "rgba(255,255,255,0.95)"
                : "rgba(255,255,255,0.38)",
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

function SeekBar({ currentTime, duration, onSeek }: { currentTime: number; duration: number; onSeek: (t: number) => void }) {
  const progress = duration > 0 ? currentTime / duration : 0;

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(ratio * duration);
  };

  return (
    <div
      className="h-1 rounded-full cursor-pointer relative overflow-hidden"
      style={{ background: "rgba(255,255,255,0.12)" }}
      onClick={handleClick}
    >
      <div
        className="h-full rounded-full transition-none"
        style={{ width: `${progress * 100}%`, background: "rgba(255,255,255,0.55)" }}
      />
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
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className="text-white ml-0.5">
      <path d="M5 3.5L17 10L5 16.5V3.5Z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className="text-white">
      <rect x="4" y="3" width="4" height="14" rx="1.5" fill="currentColor" />
      <rect x="12" y="3" width="4" height="14" rx="1.5" fill="currentColor" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" className="text-white/60">
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
