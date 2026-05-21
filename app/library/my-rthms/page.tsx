"use client";

import { useState, useEffect, useCallback } from "react";
import { AppHeader } from "@/app/components/AppHeader";
import { RevealBlock } from "@/app/components/RevealBlock";
import { TransitionLink } from "@/app/components/TransitionLink";
import { useSwipeBack } from "@/app/hooks/useSwipeBack";
import { useGeneration } from "@/app/contexts/GenerationContext";
import { useAudio } from "@/app/contexts/AudioContext";
import CustomStyleInput from "@/app/components/CustomStyleInput";
import type { SavedRhythm } from "@/app/api/library/route";
import { RhythmRow } from "../_components";
import { BUILD_UPON_GENRE, buildUponLyrics, buildUponTitle } from "@/app/lib/buildUpon";
import { groupRhythmPairs, sideLabelFor } from "@/app/lib/rhythmPairs";
import { PlayIcon } from "@/app/components/HomeTileIcons";

type LoadState = "loading" | "ready" | "error";
type TimePeriod = "today" | "week" | "month" | "all";

interface QueueJob {
  jobId: string;
  title: string;
  pillar: string;
  status: "pending" | "generating";
  createdAt: number;
}

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
const CHART_LIMIT = 20;
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

function periodLabel(period: TimePeriod): string {
  if (period === "today") return "Today";
  if (period === "week") return "This Week";
  if (period === "month") return "This Month";
  return "All Time";
}

export default function MyRthmsPage() {
  const [rhythms, setRhythms]       = useState<SavedRhythm[]>([]);
  const [loadState, setLoadState]   = useState<LoadState>("loading");
  const [showLyricsId, setShowLyricsId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [shareToastId, setShareToastId]       = useState<string | null>(null);
  const [timePeriod, setTimePeriod]     = useState<TimePeriod>("all");
  const [chartsMode, setChartsMode]     = useState(false);
  const [expanded, setExpanded]        = useState(false);
  const [selectedPillar, setSelectedPillar] = useState<string | null>(null);
  const [selectedTags, setSelectedTags]     = useState<string[]>([]);
  const [deletedOpen, setDeletedOpen]   = useState(false);
  const [recreateRhythm, setRecreateRhythm] = useState<SavedRhythm | null>(null);
  const [queueJobs, setQueueJobs] = useState<QueueJob[]>([]);
  const [selectMode, setSelectMode]       = useState(false);
  const [selectedIds, setSelectedIds]     = useState<Set<string>>(new Set());
  const [selectedSideIds, setSelectedSideIds] = useState<Record<string, string>>({});
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);
  const [autoTagging, setAutoTagging] = useState(false);
  const [autoTagMessage, setAutoTagMessage] = useState<string | null>(null);

  const { currentTrackId, isPlaying, currentTime, duration, handlePlayUrl } = useAudio();
  const { startGeneration } = useGeneration();
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

  const fetchQueueJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/queue-jobs", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setQueueJobs(data.jobs ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("period");
    if (p === "charts") {
      setTimePeriod("all");
      setChartsMode(true);
    } else if (p && (["today","week","month","all"] as string[]).includes(p)) {
      setTimePeriod(p as TimePeriod);
    }
    fetchLibrary();
    fetchQueueJobs();
    const onMutated = () => { fetchLibrary(); fetchQueueJobs(); };
    window.addEventListener("library-mutated", onMutated);
    const pollId = setInterval(() => { fetchQueueJobs(); fetchLibrary(); }, 15_000);
    return () => {
      window.removeEventListener("library-mutated", onMutated);
      clearInterval(pollId);
    };
  }, [fetchLibrary, fetchQueueJobs]);

  const mutate = useCallback(async (body: Record<string, unknown>) => {
    await fetch("/api/library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    fetchLibrary();
    window.dispatchEvent(new CustomEvent("library-mutated"));
  }, [fetchLibrary]);

  const updateRhythmLocal = useCallback((id: string, patch: Partial<SavedRhythm>) => {
    setRhythms((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r));
  }, []);

  const updateRhythm = useCallback((id: string, patch: Partial<SavedRhythm>) => {
    updateRhythmLocal(id, patch);
    mutate({ action: "update", id, ...patch });
  }, [mutate, updateRhythmLocal]);

  const now = Date.now();
  const newRthms      = rhythms.filter((r) => r.status === "new");
  const myRthms       = rhythms.filter((r) => r.status === "active" || r.status === "favourite");
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
    updateRhythm(rhythm.id, { status: "archived" });

  const handleGraduate = (id: string) =>
    updateRhythm(id, { status: "favourite" });

  const handleUngraduate = (id: string) =>
    updateRhythm(id, { status: "active" });

  const handleTag = (id: string, tags: string[]) =>
    updateRhythm(id, { tags });

  const handleNote = (id: string, note: string) =>
    updateRhythm(id, { note });

  const handleRestore = (id: string) =>
    updateRhythm(id, { status: "active" });

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()); setConfirmBatchDelete(false); };

  const handleBatchDelete = async () => {
    if (!confirmBatchDelete) { setConfirmBatchDelete(true); setTimeout(() => setConfirmBatchDelete(false), 3000); return; }
    await mutate({ action: "batch-remove", ids: [...selectedIds] });
    exitSelectMode();
  };

  const handleAutoTagOlder = async () => {
    setAutoTagging(true);
    setAutoTagMessage(null);
    try {
      const res = await fetch("/api/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retag" }),
      });
      if (!res.ok) throw new Error("retag failed");
      const data = await res.json();
      await fetchLibrary();
      window.dispatchEvent(new CustomEvent("library-mutated"));
      const count = data.retagged ?? 0;
      setAutoTagMessage(count > 0 ? `Updated ${count}` : "Tags already clean");
      setTimeout(() => setAutoTagMessage(null), 3000);
    } catch {
      setAutoTagMessage("Couldn't auto-tag");
      setTimeout(() => setAutoTagMessage(null), 3000);
    } finally {
      setAutoTagging(false);
    }
  };

  const togglePlay = useCallback((rhythm: SavedRhythm) => {
    if (!rhythm.audioUrl && !rhythm.audioKey) return;
    // Route through our proxy — fetches a fresh Suno URL server-side and pipes
    // the audio back so iOS never has to handle expired CDN links directly.
    const proxyUrl = `/api/proxy-audio?id=${encodeURIComponent(rhythm.id)}`;
    handlePlayUrl(rhythm.id, proxyUrl, rhythm.title);
    if (rhythm.status === "new") {
      updateRhythm(rhythm.id, { status: "active" });
      const alternate = rhythms.find((r) =>
        r.id === rhythm.alternateId ||
        (rhythm.pairId && r.pairId === rhythm.pairId && r.id !== rhythm.id)
      );
      if (alternate?.status === "new") updateRhythm(alternate.id, { status: "active" });
    }
  }, [handlePlayUrl, rhythms, updateRhythm]);

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

  // ── Rthmic category + tag lists (from active rthms only) ──────────────────
  const pillarSet = new Set<string>();
  const tagSet    = new Set<string>();
  for (const r of myRthms) {
    if (r.pillar) pillarSet.add(r.pillar);
    for (const t of (r.tags ?? [])) tagSet.add(t);
  }
  const allPillars = [...pillarSet].sort();
  const allTags    = [...tagSet].sort();

  // ── Filtering ─────────────────────────────────────────────────────────────
  const start = periodStart(timePeriod);
  const filteredRthms = myRthms
    .filter((r) => r.savedAt >= start)
    .filter((r) => !chartsMode || (r.playCount ?? 0) > 0)
    .filter((r) => !selectedPillar || r.pillar === selectedPillar)
    .filter((r) => selectedTags.length === 0 || selectedTags.every((t) => (r.tags ?? []).includes(t)));
  const orderedRthms = chartsMode
    ? [...filteredRthms].sort((a, b) =>
        (b.playCount ?? 0) - (a.playCount ?? 0) ||
        (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0) ||
        b.savedAt - a.savedAt
      )
    : filteredRthms;
  const visibleRthms = chartsMode
    ? orderedRthms.slice(0, CHART_LIMIT)
    : timePeriod === "all" && !expanded
    ? orderedRthms.slice(0, ALL_TIME_PREVIEW)
    : orderedRthms;
  const newCards = groupRhythmPairs(newRthms, selectedSideIds);
  const visibleCards = groupRhythmPairs(visibleRthms, selectedSideIds);

  return (
    <main className="relative z-10 min-h-screen flex flex-col px-6 pt-safe" style={{ animation: "page-enter 380ms ease forwards" }}>
      <RevealBlock delay={0}>
        <AppHeader title="My Rthms" titleIcon={<PlayIcon />} />
      </RevealBlock>

      <section className="flex-1 flex flex-col gap-6 pb-32">

        {/* ── Generating (in queue) ────────────────────────────────────────────── */}
        {queueJobs.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 px-1">
              <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgb(167,139,250)" }}>Generating</span>
              <span
                className="inline-flex items-center justify-center text-[9px] font-semibold rounded-full px-1.5 py-0.5 leading-none"
                style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}
              >
                {queueJobs.length}
              </span>
            </div>
            {queueJobs.map((job) => (
              <div
                key={job.jobId}
                className="rounded-2xl border px-5 py-4 flex items-center gap-4"
                style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}
              >
                {/* Pulsing dot */}
                <div className="flex-shrink-0 relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full rounded-full animate-ping opacity-60" style={{ background: job.status === "generating" ? "rgba(109,40,217,0.8)" : "rgba(255,255,255,0.3)" }} />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: job.status === "generating" ? "rgb(109,40,217)" : "rgba(255,255,255,0.25)" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate" style={{ color: job.status === "generating" ? "rgb(167,139,250)" : "rgba(255,255,255,0.6)" }}>{job.title}</p>
                  <p className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: job.status === "generating" ? "rgb(139,92,246)" : "rgba(255,255,255,0.25)" }}>
                    {job.status === "generating" ? "Generating…" : "Queued"} · {job.pillar}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

      {/* ── New (unplayed) Rthms ─────────────────────────────────────────────── */}
        {newCards.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 px-1">
              <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgb(139,92,246)" }}>New</span>
              <span
                className="inline-flex items-center justify-center text-[9px] font-semibold rounded-full px-1.5 py-0.5 leading-none"
                style={{ background: "rgba(109,40,217,0.2)", color: "rgb(167,139,250)" }}
              >
                {newCards.length}
              </span>
            </div>
            {newCards.map(({ key, rhythm, alternate }) => {
              const isSelected = selectedIds.has(rhythm.id);
              return (
                <div key={key} className="relative">
                  {selectMode && (
                    <button
                      onClick={() => toggleSelect(rhythm.id)}
                      className="absolute left-0 top-0 bottom-0 z-10 flex items-center pl-3 pr-2 touch-manipulation"
                    >
                      <div
                        className="w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-all"
                        style={isSelected
                          ? { background: "rgba(201,165,90,0.9)", borderColor: "rgba(201,165,90,1)" }
                          : { background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.2)" }}
                      >
                        {isSelected && (
                          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                            <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                    </button>
                  )}
                  <div style={selectMode ? { paddingLeft: 36, opacity: isSelected ? 1 : 0.5, transition: "opacity 150ms" } : {}}>
                    <RhythmRow
                      rhythm={rhythm}
                      isNew
                      playing={currentTrackId === rhythm.id && isPlaying}
                      currentTime={currentTrackId === rhythm.id ? currentTime : 0}
                      duration={currentTrackId === rhythm.id ? duration : 0}
                      showLyrics={showLyricsId === rhythm.id}
                      onToggleLyrics={() => setShowLyricsId(showLyricsId === rhythm.id ? null : rhythm.id)}
                      onPlay={() => selectMode ? toggleSelect(rhythm.id) : togglePlay(rhythm)}
                      onGraduate={() => handleGraduate(rhythm.id)}
                      onArchive={() => handleArchive(rhythm)}
                      onRemove={() => handleRemove(rhythm.id)}
                      onRecreate={() => setRecreateRhythm(rhythm)}
                      onBuildUpon={() => handleBuildUpon(rhythm)}
                      onShare={() => handleShare(rhythm)}
                      onTag={(tags) => handleTag(rhythm.id, tags)}
                      onNote={(note) => handleNote(rhythm.id, note)}
                      confirmingRemove={confirmRemoveId === rhythm.id}
                      shareToast={shareToastId === rhythm.id}
                      sideLabel={alternate ? sideLabelFor(rhythm) : undefined}
                      alternateLabel={alternate?.title}
                      onSwapSide={alternate ? () => setSelectedSideIds((prev) => ({ ...prev, [key]: alternate.id })) : undefined}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

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
          {loadState === "ready" && myRthms.length === 0 && (
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-12 flex flex-col items-center gap-3">
              <p className="text-sm text-white/50 text-center leading-relaxed">
                <span style={{ color: "rgb(167,139,250)" }}>Rthms you generate</span> will appear here.
              </p>
              <TransitionLink href="/speak" className="text-xs text-white/45 underline underline-offset-4 hover:text-white/60 transition-colors">
                Speak your state →
              </TransitionLink>
            </div>
          )}
          {loadState === "ready" && myRthms.length > 0 && (
            <>
              {/* Select mode toggle */}
              <div className="flex items-center justify-between gap-3 -mb-1">
                <button
                  onClick={handleAutoTagOlder}
                  disabled={autoTagging}
                  className="text-[10px] uppercase tracking-widest touch-manipulation transition-colors px-2 py-1 disabled:opacity-40"
                  style={{ color: autoTagMessage ? "rgba(201,165,90,0.8)" : "rgba(255,255,255,0.3)" }}
                >
                  {autoTagging ? "Tagging…" : autoTagMessage ?? "Auto-tag older Rthms"}
                </button>
                <button
                  onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
                  className="text-[10px] uppercase tracking-widest touch-manipulation transition-colors px-2 py-1"
                  style={{ color: selectMode ? "rgba(201,165,90,0.8)" : "rgba(255,255,255,0.3)" }}
                >
                  {selectMode ? "Cancel" : "Select"}
                </button>
              </div>

              <ChartsFeature
                active={chartsMode}
                periodLabel={periodLabel(timePeriod)}
                count={myRthms.filter((r) => r.savedAt >= periodStart(timePeriod) && (r.playCount ?? 0) > 0).length}
                onClick={() => {
                  setChartsMode((active) => !active);
                  setExpanded(false);
                  setSelectedPillar(null);
                  setSelectedTags([]);
                }}
              />

              {/* Release date tabs */}
              <TimePeriodTabs
                active={timePeriod}
                onChange={(p) => { setTimePeriod(p); setExpanded(false); setSelectedPillar(null); setSelectedTags([]); }}
                counts={{
                  today: myRthms.filter((r) => r.savedAt >= periodStart("today")).length,
                  week:  myRthms.filter((r) => r.savedAt >= periodStart("week")).length,
                  month: myRthms.filter((r) => r.savedAt >= periodStart("month")).length,
                  all:   myRthms.length,
                }}
              />

              {/* Tag filter rows */}
              {(allPillars.length > 0 || allTags.length > 0) && (
                <TagFilterRows
                  pillars={allPillars}
                  tags={allTags}
                  selectedPillar={selectedPillar}
                  selectedTags={selectedTags}
                  onSelectPillar={(p) => setSelectedPillar(selectedPillar === p ? null : p)}
                  onToggleTag={(t) => setSelectedTags((prev) =>
                    prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
                  )}
                />
              )}

              {/* Song rows */}
              {orderedRthms.length === 0 ? (
                <p className="text-center text-sm text-white/30 py-8">
                  {(selectedPillar || selectedTags.length > 0)
                    ? "No Rthms match these filters"
                    : chartsMode
                    ? "Play a few Rthms and your chart will appear here"
                    : "No Rthms in this period"}
                </p>
              ) : (
                <>
                  {visibleCards.map(({ key, rhythm, alternate }) => {
                    const isSelected = selectedIds.has(rhythm.id);
                    return (
                      <div key={key} className="relative">
                        {selectMode && (
                          <button
                            onClick={() => toggleSelect(rhythm.id)}
                            className="absolute left-0 top-0 bottom-0 z-10 flex items-center pl-3 pr-2 touch-manipulation"
                            aria-label={isSelected ? "Deselect" : "Select"}
                          >
                            <div
                              className="w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-all"
                              style={isSelected
                                ? { background: "rgba(201,165,90,0.9)", borderColor: "rgba(201,165,90,1)" }
                                : { background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.2)" }}
                            >
                              {isSelected && (
                                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                  <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </div>
                          </button>
                        )}
                        <div style={selectMode ? { paddingLeft: 36, opacity: isSelected ? 1 : 0.5, transition: "opacity 150ms" } : {}}>
                          <RhythmRow
                            rhythm={rhythm}
                            chartRank={chartsMode ? orderedRthms.findIndex((r) => r.id === rhythm.id) + 1 : undefined}
                            playing={currentTrackId === rhythm.id && isPlaying}
                            currentTime={currentTrackId === rhythm.id ? currentTime : 0}
                            duration={currentTrackId === rhythm.id ? duration : 0}
                            showLyrics={showLyricsId === rhythm.id}
                            onToggleLyrics={() => setShowLyricsId(showLyricsId === rhythm.id ? null : rhythm.id)}
                            onPlay={() => selectMode ? toggleSelect(rhythm.id) : togglePlay(rhythm)}
                            favourite={rhythm.status === "favourite"}
                            onGraduate={rhythm.status === "active" ? () => handleGraduate(rhythm.id) : undefined}
                            onUngraduate={rhythm.status === "favourite" ? () => handleUngraduate(rhythm.id) : undefined}
                            onArchive={() => handleArchive(rhythm)}
                            onRemove={() => handleRemove(rhythm.id)}
                            onRecreate={() => setRecreateRhythm(rhythm)}
                            onBuildUpon={() => handleBuildUpon(rhythm)}
                            onShare={() => handleShare(rhythm)}
                            onTag={(tags) => handleTag(rhythm.id, tags)}
                            onNote={(note) => handleNote(rhythm.id, note)}
                            confirmingRemove={confirmRemoveId === rhythm.id}
                            shareToast={shareToastId === rhythm.id}
                            sideLabel={alternate ? sideLabelFor(rhythm) : undefined}
                            alternateLabel={alternate?.title}
                            onSwapSide={alternate ? () => setSelectedSideIds((prev) => ({ ...prev, [key]: alternate.id })) : undefined}
                          />
                        </div>
                      </div>
                    );
                  })}

                  {chartsMode && orderedRthms.length > CHART_LIMIT && (
                    <p className="text-center text-[10px] uppercase tracking-widest text-white/25 py-2">
                      Showing top {CHART_LIMIT} · {periodLabel(timePeriod)}
                    </p>
                  )}

                  {!chartsMode && timePeriod === "all" && orderedRthms.length > ALL_TIME_PREVIEW && (
                    <button
                      onClick={() => setExpanded((e) => !e)}
                      className="text-[10px] text-white/50 uppercase tracking-widest py-2 touch-manipulation hover:text-white/65 transition-colors"
                    >
                      {expanded ? "Show less ↑" : `+${orderedRthms.length - ALL_TIME_PREVIEW} more ↓`}
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

      {/* Multi-select delete bar */}
      {selectMode && (
        <div
          className="fixed bottom-0 inset-x-0 px-6 pb-safe pt-4 flex flex-col gap-2"
          style={{ background: "linear-gradient(to top, #0d1628 80%, transparent)", zIndex: 40 }}
        >
          <button
            onClick={handleBatchDelete}
            disabled={selectedIds.size === 0}
            className="w-full py-4 rounded-2xl text-sm font-semibold tracking-wide transition-all active:scale-[0.98] touch-manipulation disabled:opacity-30"
            style={confirmBatchDelete
              ? { background: "rgba(220,60,60,0.18)", border: "1px solid rgba(220,60,60,0.5)", color: "rgba(255,100,100,0.95)" }
              : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}
          >
            {selectedIds.size === 0
              ? "Select tracks to delete"
              : confirmBatchDelete
                ? `Confirm — delete ${selectedIds.size} track${selectedIds.size > 1 ? "s" : ""}`
                : `Delete ${selectedIds.size} track${selectedIds.size > 1 ? "s" : ""}`}
          </button>
        </div>
      )}

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
  pillars,
  tags,
  selectedPillar,
  selectedTags,
  onSelectPillar,
  onToggleTag,
}: {
  pillars: string[];
  tags: string[];
  selectedPillar: string | null;
  selectedTags: string[];
  onSelectPillar: (p: string) => void;
  onToggleTag: (t: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">

      {/* Row 1 — Rthmic Categories, single select */}
      {pillars.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] uppercase tracking-widest text-white/25 px-0.5">Rthmic Categories</span>
          <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-1 px-1 scrollbar-none">
            {pillars.map((p) => {
              const active = selectedPillar === p;
              return (
                <button
                  key={p}
                  onClick={() => onSelectPillar(p)}
                  className="flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-medium tracking-wide touch-manipulation transition-all"
                  style={
                    active
                      ? { background: "rgba(255,255,255,0.16)", color: "rgba(255,255,255,0.95)", border: "1px solid rgba(255,255,255,0.28)" }
                      : { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.08)" }
                  }
                >
                  {p.charAt(0) + p.slice(1).toLowerCase()}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Row 2 — Tags, multi select */}
      {tags.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] uppercase tracking-widest text-white/25 px-0.5">Tags</span>
          <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-1 px-1 scrollbar-none">
            {tags.map((t) => {
              const active = selectedTags.includes(t);
              return (
                <button
                  key={t}
                  onClick={() => onToggleTag(t)}
                  className="flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-medium tracking-wide touch-manipulation transition-all"
                  style={
                    active
                      ? { background: "rgba(201,165,90,0.18)", color: "rgba(201,165,90,0.95)", border: "1px solid rgba(201,165,90,0.35)" }
                      : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.38)", border: "1px solid rgba(255,255,255,0.07)" }
                  }
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Top of the Charts feature toggle ─────────────────────────────────────────

function ChartsFeature({
  active,
  periodLabel,
  count,
  onClick,
}: {
  active: boolean;
  periodLabel: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-2xl border px-4 py-3 text-left touch-manipulation transition-all active:scale-[0.99]"
      style={
        active
          ? { background: "rgba(201,165,90,0.10)", borderColor: "rgba(201,165,90,0.32)" }
          : { background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.08)" }
      }
    >
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: active ? "rgba(201,165,90,0.18)" : "rgba(255,255,255,0.06)", color: active ? "rgba(201,165,90,0.95)" : "rgba(255,255,255,0.45)" }}
        >
          🚀
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: active ? "rgba(201,165,90,0.95)" : "rgba(255,255,255,0.72)" }}>
            Top of the Charts · {periodLabel}
          </p>
          <p className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: active ? "rgba(201,165,90,0.55)" : "rgba(255,255,255,0.32)" }}>
            Top 20 · Plays{count > 0 ? ` · ${count} ranked` : ""}
          </p>
        </div>
        <span className="text-[10px] uppercase tracking-widest" style={{ color: active ? "rgba(201,165,90,0.72)" : "rgba(255,255,255,0.28)" }}>
          {active ? "On" : "View"}
        </span>
      </div>
    </button>
  );
}

// ─── Release date tab bar ────────────────────────────────────────────────────

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
    <div className="flex flex-col gap-1.5">
      <span className="text-[9px] uppercase tracking-widest text-white/25 px-0.5">Release Date</span>
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
