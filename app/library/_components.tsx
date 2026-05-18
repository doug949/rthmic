"use client";

// Shared components for library sub-pages.
// Prefixed with _ so Next.js doesn't treat this as a route.

import React, { useState, useEffect } from "react";
import type { SavedRhythm } from "@/app/api/library/route";
import { useOfflineAudio } from "@/app/hooks/useOfflineAudio";

export type { SavedRhythm };

// ─── RhythmRow ────────────────────────────────────────────────────────────────

export function RhythmRow({
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
  const { isCached, cacheTrack, caching } = useOfflineAudio(rhythm.audioUrl);
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
          <p
            className={`text-sm font-semibold leading-snug truncate ${playing ? "text-white" : favourite ? "" : "text-white/75"}`}
            style={!playing && favourite ? { color: "rgba(201,165,90,0.9)" } : undefined}
          >
            {rhythm.title}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-[10px] text-white/50 uppercase tracking-wider">{rhythm.pillar}</span>
            {mayBeExpired && !playing && canPlay && (
              <span className="text-[10px] text-white/50 uppercase tracking-wider">· may have expired</span>
            )}
            {tags.map((tag) => (
              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.55)" }}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      </button>

      {/* Progress bar */}
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
          <SmallBtn onClick={onGraduate} label="Favourite" sublabel="Add to Favs" icon="★" gold />
        )}
        {onUngraduate && (
          <SmallBtn onClick={onUngraduate} label="Unfavourite" sublabel="Remove" icon="★" />
        )}
        <SmallBtn
          onClick={onArchive}
          label={rhythm.status === "archived" ? "Restore" : "Archive"}
          sublabel={rhythm.status === "archived" ? "Back to active" : "Keep but hide"}
          icon="⊙"
        />
        {canPlay && (
          <SmallBtn
            onClick={cacheTrack}
            label={isCached ? "Offline" : caching ? "Saving…" : "Offline"}
            sublabel={isCached ? "Available" : caching ? "Please wait" : "Save audio"}
            icon={isCached ? "✓" : "↓"}
            active={isCached}
          />
        )}
        <SmallBtn onClick={onRemove} label={confirmingRemove ? "Confirm?" : "Remove"} sublabel={confirmingRemove ? "Tap again" : "Delete"} icon="×" danger confirming={confirmingRemove} />
      </div>
    </div>
  );
}

// ─── LibraryLyricsView ────────────────────────────────────────────────────────

export function LibraryLyricsView({
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
    currentIdx = Math.min(Math.floor((currentTime - introGap) / lineTime), lines.length - 1);
  }

  const prevLine = currentIdx > 0 ? lines[currentIdx - 1] : null;
  const currLine = currentIdx >= 0 ? lines[currentIdx] : null;
  const nextLine =
    currentIdx >= 0 && currentIdx < lines.length - 1 ? lines[currentIdx + 1] :
    currentIdx === -1 ? lines[0] : null;

  return (
    <div className="px-6 pt-1 pb-5 flex flex-col items-center gap-1.5 text-center border-t border-white/[0.04]">
      {prevLine && <p className="text-[11px] text-white/30 leading-snug transition-all duration-500">{prevLine}</p>}
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

// ─── GraduatedPlaceholder ─────────────────────────────────────────────────────

export function GraduatedPlaceholder({
  title,
  onView,
  onDismiss,
}: {
  title: string;
  onView: () => void;
  onDismiss: () => void;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        border: "1px solid rgba(201,165,90,0.28)",
        background: "rgba(201,165,90,0.04)",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(-6px)",
        transition: "opacity 380ms ease, transform 380ms ease",
      }}
    >
      <div className="flex items-center gap-3 px-5 py-4">
        <span style={{ color: "rgba(201,165,90,0.75)", fontSize: "15px", flexShrink: 0 }}>★</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: "rgba(201,165,90,0.9)" }}>{title}</p>
          <p className="text-[11px] text-white/40 mt-0.5">Graduated to My Favourites</p>
        </div>
        <button
          onClick={onDismiss}
          className="text-white/25 hover:text-white/50 transition-colors touch-manipulation text-xl leading-none pl-2"
          aria-label="Dismiss"
        >×</button>
      </div>
      <div className="border-t px-5 py-3" style={{ borderColor: "rgba(201,165,90,0.12)" }}>
        <button
          onClick={onView}
          className="text-xs tracking-wide touch-manipulation transition-colors hover:opacity-80"
          style={{ color: "rgba(201,165,90,0.7)" }}
        >
          View in My Favourites →
        </button>
      </div>
    </div>
  );
}

// ─── SmallBtn ─────────────────────────────────────────────────────────────────

export function SmallBtn({ onClick, label, sublabel, icon, danger, confirming, active, gold }: {
  onClick: () => void; label: string; sublabel?: string; icon: string;
  danger?: boolean; confirming?: boolean; active?: boolean; gold?: boolean;
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

// ─── SubsectionCard ───────────────────────────────────────────────────────────

export function SubsectionCard({
  icon,
  title,
  description,
  open,
  onToggle,
  disabled,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  open: boolean;
  onToggle: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}>
      <button
        onClick={disabled ? undefined : onToggle}
        className={`flex items-center gap-4 px-5 py-4 w-full text-left touch-manipulation transition-colors ${disabled ? "opacity-40 cursor-default" : "hover:bg-white/[0.02] active:scale-[0.99]"}`}
      >
        <span className="text-white/40 flex-shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white/75 leading-snug">{title}</p>
          {description && <p className="text-[11px] text-white/35 mt-0.5">{description}</p>}
        </div>
        {!disabled && (
          <svg
            width="13" height="13" viewBox="0 0 16 16" fill="none"
            className="flex-shrink-0 transition-transform duration-200"
            style={{ color: "rgba(255,255,255,0.28)", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
          >
            <path d="M3 6L8 11L13 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      {open && children && (
        <div className="px-5 pb-4 border-t border-white/[0.05]">{children}</div>
      )}
    </div>
  );
}

// ─── Primitive icons ──────────────────────────────────────────────────────────

export function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-white ml-0.5">
      <path d="M4 2.5L13 8L4 13.5V2.5Z" fill="currentColor" />
    </svg>
  );
}

export function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-white">
      <rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
      <rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
    </svg>
  );
}

// ─── Section icons ────────────────────────────────────────────────────────────

export function MyRthmsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="12" width="3" height="6" rx="1" fill="currentColor" opacity="0.6" />
      <rect x="6.5" y="8" width="3" height="10" rx="1" fill="currentColor" opacity="0.8" />
      <rect x="11" y="4" width="3" height="14" rx="1" fill="currentColor" />
      <rect x="15.5" y="9" width="3" height="9" rx="1" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

export function MyFavouritesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path
        d="M10 3.5L11.9 7.6L16.4 8.27L13.2 11.4L13.97 15.9L10 13.77L6.03 15.9L6.8 11.4L3.6 8.27L8.1 7.6L10 3.5Z"
        stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"
      />
    </svg>
  );
}

export function RthmicLibraryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <rect x="3" y="4" width="4" height="13" rx="1.5" fill="currentColor" opacity="0.5" />
      <rect x="8.5" y="4" width="4" height="13" rx="1.5" fill="currentColor" opacity="0.75" />
      <rect x="14" y="4" width="4" height="13" rx="1.5" fill="currentColor" />
    </svg>
  );
}

export function ExploreAllIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10" cy="10" r="2.5" fill="currentColor" opacity="0.6" />
    </svg>
  );
}

export function TagsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <text x="3" y="15" fontSize="15" fontWeight="500" fill="currentColor" style={{ fontFamily: "system-ui, sans-serif" }}>#</text>
    </svg>
  );
}

export function PillarsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <rect x="3" y="14" width="14" height="2" rx="1" fill="currentColor" opacity="0.5" />
      <rect x="4" y="5" width="2.5" height="9" rx="1" fill="currentColor" />
      <rect x="8.75" y="5" width="2.5" height="9" rx="1" fill="currentColor" />
      <rect x="13.5" y="5" width="2.5" height="9" rx="1" fill="currentColor" />
      <rect x="3" y="4" width="14" height="2" rx="1" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

export function RthmixIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      {/* Vinyl record */}
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="10" cy="10" r="5" stroke="currentColor" strokeWidth="1" opacity="0.45" />
      <circle cx="10" cy="10" r="1.8" fill="currentColor" />
      <circle cx="10" cy="10" r="0.8" fill="currentColor" opacity="0" />
    </svg>
  );
}

export function ArchiveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="4" width="16" height="3.5" rx="1" fill="currentColor" opacity="0.45" />
      <path d="M3 7.5h14v8.5a1 1 0 01-1 1H4a1 1 0 01-1-1V7.5z" fill="currentColor" opacity="0.3" />
      <path d="M7 12h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
