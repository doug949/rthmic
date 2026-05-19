"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/app/components/AppHeader";
import { RevealBlock } from "@/app/components/RevealBlock";
import { TransitionLink } from "@/app/components/TransitionLink";
import { useSwipeBack } from "@/app/hooks/useSwipeBack";
import { useGeneration } from "@/app/contexts/GenerationContext";
import { useAudio } from "@/app/contexts/AudioContext";
import CustomStyleInput from "@/app/components/CustomStyleInput";
import type { SavedRhythm } from "@/app/api/library/route";
import { RhythmRow, GraduatedPlaceholder } from "../_components";

type LoadState = "loading" | "ready" | "error";
type TimePeriod = "today" | "week" | "month" | "all";

function inferStyle(pillar: string): "A" | "B" {
  return (pillar || "").toLowerCase() === "movement" ? "A" : "B";
}

function periodStart(period: TimePeriod): number {
  if (period === "all") return 0;
  const d = new Date();
  if (period === "today") { d.setHours(0, 0, 0, 0); return d.getTime(); }
  if (period === "week")  { d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); d.setHours(0, 0, 0, 0); return d.getTime(); }
  // month
  d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime();
}

const ALL_TIME_PREVIEW = 8;
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

export default function MyRthmsPage() {
  const [rhythms, setRhythms]       = useState<SavedRhythm[]>([]);
  const [loadState, setLoadState]   = useState<LoadState>("loading");
  const [showLyricsId, setShowLyricsId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [shareToastId, setShareToastId]       = useState<string | null>(null);
  const [graduatedItems, setGraduatedItems]   = useState<Array<{ id: string; title: string }>>([]);
  const [timePeriod, setTimePeriod]     = useState<TimePeriod>("all");
  const [expanded, setExpanded]        = useState(false);
  const [selectedRecentTag, setSelectedRecentTag] = useState<string | null>(null);
  const [selectedOtherTags, setSelectedOtherTags] = useState<string[]>([]);
  const [deletedOpen, setDeletedOpen]   = useState(false);
  const [recreateRhythm, setRecreateRhythm] = useState<SavedRhythm | null>(null);

  const { currentTrackId, isPlaying, currentTime, duration, handlePlayUrl } = useAudio();
  const { startGeneration } = useGeneration();
  const router = useRouter();
  useSwipeBack("/library");

  const fetchLibrary = useCallback(async () => {
    try {
      const res = await fetch("/api/library");
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      const rhythms = data.rhythms ?? [];
      setRhythms(rhythms);
      setLoadState("ready");
      const { saveLibraryCache } = await import("@/app/lib/libraryCache");
      saveLibraryCache(rhythms);
    } catch {
      const { loadLibraryCache } = await import("@/app/lib/libraryCache");
      const cached = loadLibraryCache();
      setRhythms(cached);
      setLoadState(cached.length > 0 ? "ready" : "error");
    }
  }, []);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("period");
    if (p && (["today","week","month","all"] as string[]).includes(p)) setTimePeriod(p as TimePeriod);
    fetchLibrary();
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

  const now = Date.now();
  const myRthms       = rhythms.filter((r) => r.status === "active");
  const recentlyDeleted = rhythms.filter(
    (r) => r.status === "deleted" && r.deletedAt !== undefined && now - r.deletedAt < THIRTY_DAYS
  );

  const handleRemove = (id: string) => {
    if (confirmRemoveId === id) {
      mutate({ action: "remove", id });
      setConfirmRemoveId(null);
    } else {
      setConfirmRemoveId(id);
      setTimeout(() => setConfirmRemoveId((c) => c === id ? null : c), 3000);
    }
  };

  const handleArchive = (rhythm: SavedRhythm) =>
    mutate({ action: "update", id: rhythm.id, status: "archived" });

  const handleGraduate = (id: string) => {
    const rhythm = myRthms.find((r) => r.id === id);
    if (rhythm) setGraduatedItems((prev) => [{ id, title: rhythm.title }, ...prev]);
    mutate({ action: "update", id, status: "favourite" });
  };

  const handleTag = (id: string, tags: string[]) =>
    mutate({ action: "update", id, tags });

  const handleRestore = (id: string) =>
    mutate({ action: "update", id, status: "active" });

  const dismissGraduated = (id: string) =>
    setGraduatedItems((prev) => prev.filter((g) => g.id !== id));

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
        setTimeout(() => setShareToastId((id) => id === rhythm.id ? null : id), 2500);
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

  // ── Tag lists ─────────────────────────────────────────────────────────────
  // Row 1 (recent, single-select): tags appearing on rthms from the last 7 days
  // Row 2 (other, multi-select):   tags that only appear on older rthms
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentTagSet = new Set<string>();
  const olderTagSet  = new Set<string>();
  for (const r of myRthms) {
    for (const tag of (r.tags ?? [])) {
      if (r.savedAt >= sevenDaysAgo) recentTagSet.add(tag);
      else olderTagSet.add(tag);
    }
  }
  // Tags that appear in both buckets stay in row 1 only
  const recentTags = [...recentTagSet].sort();
  const otherTags  = [...olderTagSet].filter((t) => !recentTagSet.has(t)).sort();

  // ── Filtering ─────────────────────────────────────────────────────────────
  const start = periodStart(timePeriod);
  const activeTags = [...(selectedRecentTag ? [selectedRecentTag] : []), ...selectedOtherTags];
  const filteredRthms = myRthms
    .filter((r) => r.savedAt >= start)
    .filter((r) => activeTags.length === 0 || activeTags.every((t) => (r.tags ?? []).includes(t)));
  const visibleRthms = timePeriod === "all" && !expanded
    ? filteredRthms.slice(0, ALL_TIME_PREVIEW)
    : filteredRthms;

  return (
    <main className="relative z-10 min-h-screen flex flex-col px-6 pt-safe" style={{ animation: "page-enter 380ms ease forwards" }}>
      <RevealBlock delay={0}>
        <AppHeader title="My Rthms" />
      </RevealBlock>

      <section className="flex-1 flex flex-col gap-6 pb-16">

        {/* ── Active Rthms ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2">
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
          {loadState === "ready" && myRthms.length === 0 && graduatedItems.length === 0 && (
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-12 flex flex-col items-center gap-3">
              <p className="text-sm text-white/50 text-center leading-relaxed">
                Rthms you generate will appear here.
              </p>
              <TransitionLink href="/speak" className="text-xs text-white/45 underline underline-offset-4 hover:text-white/60 transition-colors">
                Speak your state →
              </TransitionLink>
            </div>
          )}
          {loadState === "ready" && (myRthms.length > 0 || graduatedItems.length > 0) && (
            <>
              {/* Graduated placeholders */}
              {graduatedItems.map((item) => (
                <GraduatedPlaceholder
                  key={item.id}
                  title={item.title}
                  onView={() => { dismissGraduated(item.id); router.push("/library/my-favourites"); }}
                  onDismiss={() => dismissGraduated(item.id)}
                />
              ))}

              {/* Time period tabs */}
              <TimePeriodTabs
                active={timePeriod}
                onChange={(p) => { setTimePeriod(p); setExpanded(false); setSelectedRecentTag(null); setSelectedOtherTags([]); }}
                counts={{
                  today: myRthms.filter((r) => r.savedAt >= periodStart("today")).length,
                  week:  myRthms.filter((r) => r.savedAt >= periodStart("week")).length,
                  month: myRthms.filter((r) => r.savedAt >= periodStart("month")).length,
                  all:   myRthms.length,
                }}
              />

              {/* Tag filter rows */}
              {(recentTags.length > 0 || otherTags.length > 0) && (
                <TagFilterRows
                  recentTags={recentTags}
                  otherTags={otherTags}
                  selectedRecentTag={selectedRecentTag}
                  selectedOtherTags={selectedOtherTags}
                  onSelectRecent={(tag) => setSelectedRecentTag(selectedRecentTag === tag ? null : tag)}
                  onToggleOther={(tag) => setSelectedOtherTags((prev) =>
                    prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                  )}
                />
              )}

              {/* Song rows */}
              {filteredRthms.length === 0 ? (
                <p className="text-center text-sm text-white/30 py-8">
                  {activeTags.length > 0 ? "No Rthms match these tags" : "No Rthms in this period"}
                </p>
              ) : (
                <>
                  {visibleRthms.map((rhythm) => (
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
                      onRecreate={() => setRecreateRhythm(rhythm)}
                      onShare={() => handleShare(rhythm)}
                      onTag={(tags) => handleTag(rhythm.id, tags)}
                      confirmingRemove={confirmRemoveId === rhythm.id}
                      shareToast={shareToastId === rhythm.id}
                    />
                  ))}

                  {timePeriod === "all" && filteredRthms.length > ALL_TIME_PREVIEW && (
                    <button
                      onClick={() => setExpanded((e) => !e)}
                      className="text-[10px] text-white/50 uppercase tracking-widest py-2 touch-manipulation hover:text-white/65 transition-colors"
                    >
                      {expanded ? "Show less ↑" : `+${filteredRthms.length - ALL_TIME_PREVIEW} more ↓`}
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* ── Recently Deleted ─────────────────────────────────────────────────── */}
        {recentlyDeleted.length > 0 && (
          <div className="flex flex-col gap-2">
            <DimHeader
              title="Recently Deleted"
              count={recentlyDeleted.length}
              open={deletedOpen}
              onToggle={() => setDeletedOpen((o) => !o)}
            />
            {deletedOpen && recentlyDeleted.map((rhythm) => (
              <div key={rhythm.id} className="rounded-2xl border border-white/[0.05] bg-white/[0.02] opacity-40">
                <div className="flex items-center gap-4 px-5 py-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white/50 truncate">{rhythm.title}</p>
                  </div>
                  <button
                    onClick={() => handleRestore(rhythm.id)}
                    className="flex-shrink-0 text-[10px] uppercase tracking-widest text-white/45 hover:text-white/70 transition-colors touch-manipulation px-3 py-1.5 rounded-lg border border-white/[0.08] hover:border-white/20"
                  >
                    Restore
                  </button>
                </div>
              </div>
            ))}
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

// ─── Tag filter rows ──────────────────────────────────────────────────────────

function TagFilterRows({
  recentTags,
  otherTags,
  selectedRecentTag,
  selectedOtherTags,
  onSelectRecent,
  onToggleOther,
}: {
  recentTags: string[];
  otherTags: string[];
  selectedRecentTag: string | null;
  selectedOtherTags: string[];
  onSelectRecent: (tag: string) => void;
  onToggleOther: (tag: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {/* Row 1 — recent tags, single select */}
      <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-1 px-1 scrollbar-none">
        {recentTags.map((tag) => {
          const active = selectedRecentTag === tag;
          return (
            <button
              key={tag}
              onClick={() => onSelectRecent(tag)}
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-medium tracking-wide touch-manipulation transition-all"
              style={
                active
                  ? { background: "rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.95)", border: "1px solid rgba(255,255,255,0.3)" }
                  : { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.08)" }
              }
            >
              {tag}
            </button>
          );
        })}
      </div>

      {/* Row 2 — other tags, multi select */}
      {otherTags.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-1 px-1 scrollbar-none">
          {otherTags.map((tag) => {
            const active = selectedOtherTags.includes(tag);
            return (
              <button
                key={tag}
                onClick={() => onToggleOther(tag)}
                className="flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-medium tracking-wide touch-manipulation transition-all"
                style={
                  active
                    ? { background: "rgba(201,165,90,0.18)", color: "rgba(201,165,90,0.95)", border: "1px solid rgba(201,165,90,0.35)" }
                    : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.38)", border: "1px solid rgba(255,255,255,0.07)" }
                }
              >
                {tag}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Time period tab bar ──────────────────────────────────────────────────────

const PERIODS: { key: TimePeriod; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week",  label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "all",   label: "All Time" },
];

function TimePeriodTabs({
  active,
  onChange,
  counts,
}: {
  active: TimePeriod;
  onChange: (p: TimePeriod) => void;
  counts: Record<TimePeriod, number>;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
      {PERIODS.map(({ key, label }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className="flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full touch-manipulation transition-all text-[11px] font-medium tracking-wide"
            style={
              isActive
                ? { background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.9)", border: "1px solid rgba(255,255,255,0.18)" }
                : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.06)" }
            }
          >
            {label}
            {counts[key] > 0 && (
              <span
                className="text-[10px] tabular-nums"
                style={{ color: isActive ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.25)" }}
              >
                {counts[key]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Dim section header ───────────────────────────────────────────────────────

function DimHeader({ title, count, open, onToggle }: { title: string; count?: number; open: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className="flex items-baseline gap-2 touch-manipulation text-left w-full py-0.5">
      <h2 className="text-sm font-light text-white/40 uppercase tracking-widest">{title}</h2>
      {count !== undefined && <span className="text-xs text-white/30 tabular-nums">{count}</span>}
      <span className="ml-auto text-[10px] text-white/30 uppercase tracking-widest">{open ? "↑" : "↓"}</span>
    </button>
  );
}

// ─── Genre picker bottom sheet ────────────────────────────────────────────────

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

function LibraryGenrePicker({
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
        const user: string[]    = d.user || [];
        setUserGenres(user);
        setGenres([...builtIn, ...user]);
      })
      .catch(() => {})
      .finally(() => setLoadingGenres(false));
  }, []);

  const selectedGenre = customSelected && customStyle
    ? customStyle
    : selectedIndex !== null ? genres[selectedIndex] ?? "" : "";
  const canProceed   = selectedGenre.length > 0;
  const selectedLabel = canProceed ? displayNameFor(selectedGenre) : "";
  const buildLabel   = canProceed
    ? `Recreate with ${selectedLabel.slice(0, 28)}${selectedLabel.length > 28 ? "…" : ""}`
    : "Select a style";

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} style={{ backdropFilter: "blur(4px)" }} />
      <div className="relative rounded-t-3xl px-6 pt-6 flex flex-col gap-4 max-h-[85vh]" style={{ background: "#0d1628", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="flex justify-center -mt-1">
          <div className="w-10 h-1 rounded-full bg-white/15" />
        </div>
        <div className="flex-shrink-0">
          <p className="text-[10px] text-white/40 uppercase tracking-widest mb-1">Recreate in another genre</p>
          <h3 className="text-lg font-light text-white leading-snug" style={{ fontFamily: "var(--font-display)" }}>{rhythm.title}</h3>
        </div>

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
                    style={isSelected
                      ? { borderColor: "rgba(201,165,90,0.5)", background: "rgba(201,165,90,0.08)" }
                      : { borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}
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
          <button onClick={onClose} className="w-full py-3 text-white/50 text-sm tracking-wide touch-manipulation">Cancel</button>
        </div>
      </div>
    </div>
  );
}
