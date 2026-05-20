"use client";

// Shared components for library sub-pages.
// Prefixed with _ so Next.js doesn't treat this as a route.

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
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
  onNote,
  confirmingRemove,
  shareToast,
  dimmed,
  favourite,
  isNew,
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
  onNote?: (note: string) => void;
  confirmingRemove?: boolean;
  shareToast?: boolean;
  dimmed?: boolean;
  favourite?: boolean;
  isNew?: boolean;
}) {
  // colour theme — priority: favourite > isNew > default
  const P = isNew && !favourite ? {
    border:      (active: boolean) => active ? "rgba(139,92,246,0.48)"  : "rgba(109,40,217,0.34)",
    bg:          (active: boolean) => active ? "rgba(109,40,217,0.14)"  : "rgba(109,40,217,0.08)",
    btnBorder:   (active: boolean) => active ? "rgba(139,92,246,0.55)"  : "rgba(109,40,217,0.35)",
    btnBg:       (active: boolean) => active ? "rgba(109,40,217,0.30)"  : "rgba(109,40,217,0.12)",
    icon:    "rgb(167,139,250)",
    title:   "rgb(167,139,250)",
    sub:     "rgb(139,92,246)",
    bar:     "rgba(109,40,217,0.18)",
    barFill: "rgba(139,92,246,0.6)",
    divider: "rgba(109,40,217,0.18)",
    action:  "rgba(167,139,250,0.75)",
  } : null;
  const canPlay = !!rhythm.audioUrl || !!rhythm.audioKey;
  const mayBeExpired = Date.now() - rhythm.savedAt > 20 * 60 * 60 * 1000;
  const { isCached, cacheTrack, caching } = useOfflineAudio(rhythm.audioUrl);
  const [tagEditOpen, setTagEditOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [noteEditOpen, setNoteEditOpen] = useState(false);
  const [noteInput, setNoteInput] = useState(rhythm.note ?? "");
  const [moreOpen, setMoreOpen] = useState(false);
  const [confirmingDownload, setConfirmingDownload] = useState(false);

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
          : P
          ? { background: P.bg(playing), borderColor: P.border(playing) }
          : { background: playing ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)", borderColor: playing ? "rgba(255,255,255,0.24)" : "rgba(255,255,255,0.11)" }
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
              : P
              ? { background: P.btnBg(playing), borderColor: P.btnBorder(playing) }
              : { background: playing ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.06)", borderColor: playing ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.10)" }
          }
        >
          {playing
            ? <PauseIcon color={favourite ? "rgba(201,165,90,0.9)" : P ? P.icon : "white"} />
            : <PlayIcon  color={favourite ? "rgba(201,165,90,0.9)" : P ? P.icon : "white"} />
          }
        </div>
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm font-semibold leading-snug ${playing ? "text-white" : favourite || P ? "" : "text-white/75"}`}
            style={playing ? undefined : favourite ? { color: "rgba(201,165,90,0.9)" } : P ? { color: P.title } : undefined}
          >
            {rhythm.title}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider" style={{ color: favourite ? "rgba(201,165,90,0.6)" : P ? P.sub : "rgba(255,255,255,0.5)" }}>{rhythm.pillar}</span>
            {mayBeExpired && !playing && canPlay && (
              <span className="text-[10px] uppercase tracking-wider" style={{ color: favourite ? "rgba(201,165,90,0.5)" : "rgba(255,255,255,0.5)" }}>· may have expired</span>
            )}
            {tags.map((tag) => (
              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: favourite ? "rgba(201,165,90,0.1)" : "rgba(255,255,255,0.06)", color: favourite ? "rgba(201,165,90,0.65)" : "rgba(255,255,255,0.55)" }}>
                {tag}
              </span>
            ))}
          </div>
          {rhythm.note && (
            <p className="text-[11px] mt-1 leading-snug" style={{ color: favourite ? "rgba(201,165,90,0.5)" : "rgba(255,255,255,0.4)" }}>
              {rhythm.note}
            </p>
          )}
        </div>
      </button>

      {/* Progress bar */}
      {playing && duration > 0 && (
        <div className="px-5 pb-3">
          <div className="h-[3px] rounded-full" style={{ background: favourite ? "rgba(201,165,90,0.15)" : P ? P.bar : "rgba(255,255,255,0.1)" }}>
            <div className="h-full rounded-full" style={{ width: `${(currentTime / duration) * 100}%`, background: favourite ? "rgba(201,165,90,0.5)" : P ? P.barFill : "rgba(255,255,255,0.4)" }} />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-xs tabular-nums" style={{ color: favourite ? "rgba(201,165,90,0.5)" : P ? P.sub : "rgba(255,255,255,0.5)" }}>{fmt(currentTime)}</span>
            <span className="text-xs tabular-nums" style={{ color: favourite ? "rgba(201,165,90,0.5)" : P ? P.sub : "rgba(255,255,255,0.5)" }}>{fmt(duration)}</span>
          </div>
        </div>
      )}

      {/* Lyrics panel */}
      {showLyrics && rhythm.lyrics && (
        <LibraryLyricsView lyrics={rhythm.lyrics} currentTime={currentTime} duration={duration} isPlaying={playing} />
      )}

      {/* Tag editing panel */}
      {tagEditOpen && (
        <div className="px-5 pb-4 pt-2 flex flex-col gap-2" style={{ borderTop: `1px solid ${favourite ? "rgba(201,165,90,0.1)" : "rgba(255,255,255,0.05)"}` }}>
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

      {/* Note editing panel */}
      {noteEditOpen && (
        <div className="px-5 pb-4 pt-2 flex flex-col gap-2" style={{ borderTop: `1px solid ${favourite ? "rgba(201,165,90,0.1)" : "rgba(255,255,255,0.05)"}` }}>
          <textarea
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            placeholder="Add a short note about this Rthm…"
            rows={2}
            className="w-full text-[12px] bg-transparent outline-none placeholder:text-white/25 resize-none leading-relaxed"
            style={{ color: "rgba(255,255,255,0.7)" }}
            autoFocus
          />
          <div className="flex gap-3">
            <button
              onClick={() => { onNote?.(noteInput.trim()); setNoteEditOpen(false); }}
              className="text-[11px] touch-manipulation transition-colors"
              style={{ color: "rgba(255,255,255,0.55)" }}
            >
              Save
            </button>
            <button
              onClick={() => { setNoteInput(rhythm.note ?? ""); setNoteEditOpen(false); }}
              className="text-[11px] touch-manipulation transition-colors"
              style={{ color: "rgba(255,255,255,0.28)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Action bar — primary actions only */}
      <div className="flex" style={{ borderTop: `1px solid ${favourite ? "rgba(201,165,90,0.12)" : P ? P.divider : "rgba(255,255,255,0.06)"}` }}>
        <SmallBtn onClick={onShare} label={shareToast ? "Copied!" : "Share"} sublabel={shareToast ? "Link ready" : "Send link"} icon="↗" active={shareToast} gold={favourite} purple={!!P} />
        {onGraduate && (
          <SmallBtn onClick={onGraduate} label="Add to Favs" icon="☆" purple={!!P} />
        )}
        {onUngraduate && (
          <SmallBtn onClick={onUngraduate} label="Unfavourite" icon="★" gold />
        )}
        <SmallBtn onClick={() => setMoreOpen(true)} label="More" icon="···" gold={favourite} purple={!!P} />
      </div>

      {/* Overflow bottom sheet */}
      {moreOpen && (
        <MoreSheet
          title={rhythm.title}
          onClose={() => { setMoreOpen(false); setConfirmingDownload(false); }}
          items={[
            {
              icon: "↺", label: "Recreate", sublabel: "New genre",
              onClick: onRecreate,
            },
            ...(onTag ? [{
              icon: "⌗", label: "Tags", sublabel: tags.length > 0 ? `${tags.length} tag${tags.length > 1 ? "s" : ""}` : "Add tag",
              active: tagEditOpen,
              onClick: () => { setTagEditOpen((v) => !v); setNoteEditOpen(false); },
            }] : []),
            ...(onNote ? [{
              icon: "✎", label: "Note", sublabel: rhythm.note ? rhythm.note.slice(0, 30) + (rhythm.note.length > 30 ? "…" : "") : "Add a note",
              active: noteEditOpen,
              onClick: () => { setNoteEditOpen((v) => !v); setTagEditOpen(false); },
            }] : []),
            ...(canPlay ? [{
              icon: isCached ? "✓" : caching ? "…" : "↓",
              label: isCached ? "Available Offline" : caching ? "Saving…" : "Save Offline",
              active: isCached,
              onClick: () => { if (!isCached && !caching) cacheTrack(); },
            }] : []),
            ...(canPlay ? [{
              icon: "⬇",
              label: confirmingDownload ? "Save as .mp3?" : "Download",
              sublabel: confirmingDownload ? "Tap again to confirm" : "Save to Files app",
              confirming: confirmingDownload,
              keepOpen: true,
              onClick: () => {
                if (!confirmingDownload) {
                  setConfirmingDownload(true);
                  return;
                }
                setConfirmingDownload(false);
                const rawName = rhythm.title.replace(/\.mp3$/i, "");
                const filename = encodeURIComponent(rawName);
                const a = document.createElement("a");
                a.href = `/api/download?id=${encodeURIComponent(rhythm.id)}&filename=${filename}`;
                a.download = rawName + ".mp3";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setMoreOpen(false);
              },
            }] : []),
            {
              icon: "⊙",
              label: rhythm.status === "archived" ? "Restore" : "Archive",
              sublabel: rhythm.status === "archived" ? "Back to active" : "Keep but hide",
              onClick: onArchive,
            },
            {
              icon: "×", label: confirmingRemove ? "Confirm delete?" : "Remove",
              sublabel: confirmingRemove ? "Tap again to confirm" : "Delete permanently",
              danger: true, confirming: confirmingRemove,
              onClick: onRemove,
              keepOpen: true,
            },
          ]}
        />
      )}
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

// ─── MoreSheet ────────────────────────────────────────────────────────────────

export type SheetItem = {
  icon: string;
  label: string;
  sublabel?: string;
  danger?: boolean;
  confirming?: boolean;
  active?: boolean;
  gold?: boolean;
  keepOpen?: boolean;
  onClick: () => void;
};

export function MoreSheet({ title, onClose, items }: { title: string; onClose: () => void; items: SheetItem[] }) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setMounted(true);
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 280);
  };

  const sheet = (
    <>
      <div
        className="fixed inset-0 z-[120]"
        style={{
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(3px)",
          WebkitBackdropFilter: "blur(3px)",
          opacity: visible ? 1 : 0,
          transition: "opacity 280ms ease",
        }}
        onClick={handleClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${title} options`}
        className="fixed bottom-0 left-0 right-0 z-[121] rounded-t-2xl"
        style={{
          background: "rgba(16,16,26,0.98)",
          borderTop: "1px solid rgba(255,255,255,0.09)",
          transform: visible ? "translateY(0)" : "translateY(100%)",
          transition: "transform 300ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-[3px] rounded-full" style={{ background: "rgba(255,255,255,0.18)" }} />
        </div>
        <p className="text-center text-[11px] text-white/35 px-6 py-2 truncate">{title}</p>
        <div className="px-3 pb-8 flex flex-col gap-1">
          {items.map((item) => (
            <button
              key={item.label}
              onClick={() => { item.onClick(); if (!item.keepOpen) handleClose(); }}
              className="flex items-center gap-4 px-4 py-3.5 rounded-xl touch-manipulation w-full text-left transition-opacity active:opacity-70"
              style={{
                background: item.confirming ? "rgba(248,113,113,0.09)" : "rgba(255,255,255,0.04)",
                color: item.confirming
                  ? "rgba(248,113,113,0.9)"
                  : item.danger
                  ? "rgba(255,255,255,0.45)"
                  : item.gold
                  ? "rgba(201,165,90,0.85)"
                  : item.active
                  ? "rgba(255,255,255,0.85)"
                  : "rgba(255,255,255,0.65)",
              }}
            >
              <span className="text-lg w-6 text-center leading-none flex-shrink-0">{item.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-snug">{item.label}</p>
                {item.sublabel && <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>{item.sublabel}</p>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  );

  if (!mounted) return null;
  return createPortal(sheet, document.body);
}

// ─── SmallBtn ─────────────────────────────────────────────────────────────────

export function SmallBtn({ onClick, label, sublabel, icon, danger, confirming, active, gold, purple }: {
  onClick: () => void; label: string; sublabel?: string; icon: string;
  danger?: boolean; confirming?: boolean; active?: boolean; gold?: boolean; purple?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center gap-1 py-3 touch-manipulation transition-colors
        ${confirming ? "text-red-400/90"
          : danger ? "text-white/45 hover:text-red-400/80"
          : gold || purple ? ""
          : active ? "text-white/80"
          : "text-white/55 hover:text-white/75"}`}
      style={gold ? { color: "rgba(201,165,90,0.75)" } : purple ? { color: "rgba(167,139,250,0.75)" } : undefined}
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

export function PlayIcon({ color = "white" }: { color?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="ml-0.5" style={{ color }}>
      <path d="M4 2.5L13 8L4 13.5V2.5Z" fill="currentColor" />
    </svg>
  );
}

export function PauseIcon({ color = "white" }: { color?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ color }}>
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
        fill="currentColor" strokeLinejoin="round"
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
