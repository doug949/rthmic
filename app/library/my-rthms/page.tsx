"use client";

import { useState, useEffect, useCallback, type ChangeEvent } from "react";
import { AppHeader } from "@/app/components/AppHeader";
import { RevealBlock } from "@/app/components/RevealBlock";
import { TransitionLink } from "@/app/components/TransitionLink";
import { useSwipeBack } from "@/app/hooks/useSwipeBack";
import { useGeneration } from "@/app/contexts/GenerationContext";
import { useAudio } from "@/app/contexts/AudioContext";
import CustomStyleInput from "@/app/components/CustomStyleInput";
import type { SavedRhythm } from "@/app/types/library";
import { RhythmRow } from "../_components";
import { BUILD_UPON_GENRE, buildUponLyrics, buildUponTitle } from "@/app/lib/buildUpon";
import { displayGenerationFailure } from "@/app/lib/generationErrors";
import { groupRhythmPairs, sideLabelFor } from "@/app/lib/rhythmPairs";
import { PlayIcon } from "@/app/components/HomeTileIcons";

type LoadState = "loading" | "ready" | "error";
type TimePeriod = "today" | "week" | "month" | "all";
type LibraryCollection = "main" | "bridge" | "invite";
type LibrarySection = "main" | "new";

interface QueueJob {
  jobId: string;
  title: string;
  pillar: string;
  status: "pending" | "writing" | "generating" | "failed";
  statusDetail?: string;
  failureReason?: string;
  createdAt: number;
}

function inferStyle(pillar: string): "A" | "B" {
  return (pillar || "").toLowerCase() === "movement" ? "A" : "B";
}

function periodStart(period: TimePeriod): number {
  if (period === "all") return 0;
  const day = 24 * 60 * 60 * 1000;
  if (period === "today") return Date.now() - day;
  if (period === "week")  return Date.now() - 7 * day;
  return Date.now() - 30 * day;
}

const ALL_TIME_PREVIEW = 8;
const CHART_LIMIT = 20;
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

function periodLabel(period: TimePeriod): string {
  if (period === "today") return "Last 24 Hours";
  if (period === "week") return "Last 7 Days";
  if (period === "month") return "Last 30 Days";
  return "All Time";
}

function collectionFromQuery(value: string | null): LibraryCollection {
  if (value === "bridge" || value === "invite") return value;
  return "main";
}

function collectionTitle(collection: LibraryCollection): string {
  if (collection === "bridge") return "Rthmic Bridge";
  if (collection === "invite") return "Rthmic Invite";
  return "My Rthms";
}

function collectionEmptyCopy(collection: LibraryCollection): string {
  if (collection === "bridge") return "Bridge songs you create will appear here, separate from your main library.";
  if (collection === "invite") return "Invite songs you create will appear here, separate from your main library.";
  return "Rthms you generate will appear here.";
}

function pageTitle(collection: LibraryCollection, section: LibrarySection): string {
  if (section === "new") return "New";
  return collectionTitle(collection);
}

function belongsToCollection(rhythm: SavedRhythm, collection: LibraryCollection): boolean {
  if (rhythm.rthmixId) return false;
  if (collection === "bridge") return rhythm.pillar === "Bridge";
  if (collection === "invite") return rhythm.pillar === "Invite";
  return rhythm.pillar !== "Bridge" && rhythm.pillar !== "Invite";
}

function normaliseSearchText(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function searchableText(rhythm: SavedRhythm): string {
  return normaliseSearchText([
    rhythm.title,
    rhythm.pillar,
    rhythm.note,
    rhythm.lyrics,
    ...(rhythm.tags ?? []),
  ].filter(Boolean).join(" "));
}

function matchesSearch(rhythm: SavedRhythm, query: string): boolean {
  const terms = normaliseSearchText(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = searchableText(rhythm);
  return terms.every((term) => haystack.includes(term));
}

export default function MyRthmsPage() {
  const [rhythms, setRhythms]       = useState<SavedRhythm[]>([]);
  const [loadState, setLoadState]   = useState<LoadState>("loading");
  const [showLyricsId, setShowLyricsId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [shareToastId, setShareToastId]       = useState<string | null>(null);
  const [timePeriod, setTimePeriod]     = useState<TimePeriod>("all");
  const [chartsMode, setChartsMode]     = useState(false);
  const [collection, setCollection] = useState<LibraryCollection>("main");
  const [section, setSection] = useState<LibrarySection>("main");
  const [searchQuery, setSearchQuery] = useState("");
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
  const [confirmArchiveNonFavourites, setConfirmArchiveNonFavourites] = useState(false);
  const [bulkArchiving, setBulkArchiving] = useState(false);
  const [autoTagging, setAutoTagging] = useState(false);
  const [autoTagMessage, setAutoTagMessage] = useState<string | null>(null);
  const [pendingMutationIds, setPendingMutationIds] = useState<Set<string>>(new Set());

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

  async function dismissFailedJob(jobId: string) {
    setQueueJobs((jobs) => jobs.filter((job) => job.jobId !== jobId));
    try {
      const res = await fetch(`/api/queue-jobs?jobId=${encodeURIComponent(jobId)}`, { method: "DELETE" });
      if (!res.ok) await fetchQueueJobs();
    } catch {
      await fetchQueueJobs();
    }
  }

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("period");
    const params = new URLSearchParams(window.location.search);
    const c = collectionFromQuery(params.get("collection"));
    setSection(params.get("section") === "new" ? "new" : "main");
    setCollection(c);
    if (c === "bridge" || c === "invite") setTimePeriod("all");
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

  const markPending = useCallback((ids: string[], pending: boolean) => {
    if (ids.length === 0) return;
    setPendingMutationIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => pending ? next.add(id) : next.delete(id));
      return next;
    });
  }, []);

  const mutate = useCallback(async (body: Record<string, unknown>, pendingIds: string[] = typeof body.id === "string" ? [body.id] : []) => {
    markPending(pendingIds, true);
    try {
      const res = await fetch("/api/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("library mutation failed");
      fetchLibrary();
      window.dispatchEvent(new CustomEvent("library-mutated"));
    } catch {
      fetchLibrary();
    } finally {
      markPending(pendingIds, false);
    }
  }, [fetchLibrary, markPending]);

  const updateRhythmLocal = useCallback((id: string, patch: Partial<SavedRhythm>) => {
    setRhythms((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r));
  }, []);

  const updateRhythm = useCallback((id: string, patch: Partial<SavedRhythm>) => {
    updateRhythmLocal(id, patch);
    mutate({ action: "update", id, ...patch });
  }, [mutate, updateRhythmLocal]);

  const now = Date.now();
  const regularRhythms = rhythms.filter((r) => belongsToCollection(r, collection));
  const searchActive = normaliseSearchText(searchQuery).length > 0;
  const newRthms      = regularRhythms.filter((r) => r.status === "new" && matchesSearch(r, searchQuery));
  const myRthms       = regularRhythms.filter((r) => r.status === "active" || r.status === "favourite");
  const archiveableNonFavourites = regularRhythms.filter((r) => r.status === "active");
  const recentlyDeleted = regularRhythms.filter(
    (r) => r.status === "deleted" && r.deletedAt !== undefined && now - r.deletedAt < THIRTY_DAYS
  );

  const handleRemove = (id: string, ids: string[] = [id]) => {
    if (confirmRemoveId === id) {
      ids.forEach((targetId) => updateRhythmLocal(targetId, { status: "deleted", deletedAt: Date.now() }));
      mutate(ids.length > 1 ? { action: "batch-remove", ids } : { action: "remove", id: ids[0] }, ids);
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

  const handleMarkListened = (rhythm: SavedRhythm) => {
    const alternate = rhythms.find((r) =>
      r.id === rhythm.alternateId ||
      (rhythm.pairId && r.pairId === rhythm.pairId && r.id !== rhythm.id)
    );
    const ids = alternate?.status === "new" ? [rhythm.id, alternate.id] : [rhythm.id];
    ids.forEach((id) => updateRhythmLocal(id, { status: "active" }));
    mutate({ action: "update", id: rhythm.id, status: "active" }, ids);
  };

  const handleMoveToMainLibrary = handleMarkListened;

  const handleUngraduate = (id: string) =>
    updateRhythm(id, { status: "active" });

  const handleTag = (id: string, tags: string[]) =>
    updateRhythm(id, { tags });

  const handleNote = (id: string, note: string) =>
    updateRhythm(id, { note });

  const handlePreferSide = (id: string) => {
    const target = rhythms.find((r) => r.id === id);
    const ids = rhythms
      .filter((r) =>
        r.id === id ||
        (!!target?.pairId && r.pairId === target.pairId) ||
        r.id === target?.alternateId ||
        r.alternateId === id
      )
      .map((r) => r.id);
    setRhythms((prev) => prev.map((r) => ids.includes(r.id) ? { ...r, preferredSideId: id } : r));
    mutate({ action: "preferSide", id }, ids);
  };

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

  const handleArchiveNonFavourites = async () => {
    if (archiveableNonFavourites.length === 0 || bulkArchiving) return;
    if (!confirmArchiveNonFavourites) {
      setConfirmArchiveNonFavourites(true);
      setTimeout(() => setConfirmArchiveNonFavourites(false), 5000);
      return;
    }

    const ids = archiveableNonFavourites.map((r) => r.id);
    setBulkArchiving(true);
    setConfirmArchiveNonFavourites(false);
    setRhythms((prev) => prev.map((r) => ids.includes(r.id) ? { ...r, status: "archived" } : r));
    try {
      const res = await fetch("/api/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archiveNonFavourites", collection }),
      });
      if (!res.ok) throw new Error("archive failed");
      await fetchLibrary();
      window.dispatchEvent(new CustomEvent("library-mutated"));
    } catch {
      await fetchLibrary();
    } finally {
      setBulkArchiving(false);
    }
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
    .filter((r) => selectedTags.length === 0 || selectedTags.every((t) => (r.tags ?? []).includes(t)))
    .filter((r) => matchesSearch(r, searchQuery));
  const orderedRthms = chartsMode
    ? [...filteredRthms].sort((a, b) =>
        (b.playCount ?? 0) - (a.playCount ?? 0) ||
        (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0) ||
        b.savedAt - a.savedAt
      )
    : filteredRthms;
  const visibleRthms = chartsMode
    ? orderedRthms.slice(0, CHART_LIMIT)
    : searchActive
    ? orderedRthms
    : timePeriod === "all" && !expanded
    ? orderedRthms.slice(0, ALL_TIME_PREVIEW)
    : orderedRthms;
  const newCards = groupRhythmPairs(newRthms, selectedSideIds);
  const visibleCards = groupRhythmPairs(visibleRthms, selectedSideIds);

  return (
    <main className="relative z-10 min-h-screen flex flex-col px-6 pt-safe" style={{ animation: "page-enter 380ms ease forwards" }}>
      <RevealBlock delay={0}>
        <AppHeader title={pageTitle(collection, section)} titleIcon={<PlayIcon />} />
      </RevealBlock>

      <section className="flex-1 flex flex-col gap-6 pb-32">

        {/* ── Generating (in queue) ────────────────────────────────────────────── */}
        {queueJobs.filter((job) =>
          collection === "bridge" ? job.pillar === "Bridge" :
          collection === "invite" ? job.pillar === "Invite" :
          job.pillar !== "Bridge" && job.pillar !== "Invite"
        ).length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 px-1">
              <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgb(170,225,255)" }}>Generating</span>
              <span
                className="inline-flex items-center justify-center text-[9px] font-semibold rounded-full px-1.5 py-0.5 leading-none"
                style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}
              >
                {queueJobs.filter((job) =>
                  collection === "bridge" ? job.pillar === "Bridge" :
                  collection === "invite" ? job.pillar === "Invite" :
                  job.pillar !== "Bridge" && job.pillar !== "Invite"
                ).length}
              </span>
            </div>
            <p className="px-1 text-xs text-white/32 leading-relaxed">
              Rthms usually take 1-2 minutes to generate on RTHMIC's servers. You can close the app completely and come back later.
            </p>
            {queueJobs.filter((job) =>
              collection === "bridge" ? job.pillar === "Bridge" :
              collection === "invite" ? job.pillar === "Invite" :
              job.pillar !== "Bridge" && job.pillar !== "Invite"
            ).map((job) => (
              <div
                key={job.jobId}
                className="rounded-2xl border px-5 py-4 flex items-center gap-4"
                style={{
                  background: job.status === "failed" ? "rgba(248,113,113,0.045)" : job.status === "generating" ? "rgba(170,225,255,0.045)" : "rgba(255,255,255,0.02)",
                  borderColor: job.status === "failed" ? "rgba(248,113,113,0.22)" : job.status === "generating" ? "rgba(170,225,255,0.22)" : "rgba(255,255,255,0.07)",
                  boxShadow: job.status === "generating" ? "0 0 28px rgba(170,225,255,0.08), inset 0 0 18px rgba(170,225,255,0.035)" : undefined,
                }}
              >
                {/* Pulsing dot */}
                <div className="flex-shrink-0 relative flex h-2.5 w-2.5">
                  {job.status !== "failed" && (
                    <span className="absolute inline-flex h-full w-full rounded-full animate-ping opacity-70" style={{ background: job.status === "generating" ? "rgba(170,225,255,0.78)" : "rgba(255,255,255,0.3)" }} />
                  )}
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: job.status === "failed" ? "rgba(248,113,113,0.72)" : job.status === "generating" ? "rgb(170,225,255)" : "rgba(255,255,255,0.25)", boxShadow: job.status === "generating" ? "0 0 14px rgba(170,225,255,0.72)" : undefined }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate" style={{ color: job.status === "failed" ? "rgba(248,113,113,0.78)" : job.status === "generating" ? "rgb(210,242,255)" : "rgba(255,255,255,0.6)" }}>{job.title}</p>
                  <p className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: job.status === "failed" ? "rgba(248,113,113,0.58)" : job.status === "generating" ? "rgba(170,225,255,0.62)" : "rgba(255,255,255,0.25)" }}>
                    {job.status === "failed" ? `Failed · ${displayGenerationFailure(job.failureReason)}` : job.status === "generating" ? "Generating..." : job.statusDetail ?? "Queued"} · {job.pillar}
                  </p>
                </div>
                {job.status === "failed" && (
                  <button
                    onClick={() => dismissFailedJob(job.jobId)}
                    className="h-8 w-8 flex-shrink-0 rounded-full text-lg leading-none touch-manipulation transition-colors active:bg-white/[0.08]"
                    style={{ color: "rgba(255,255,255,0.34)", border: "1px solid rgba(255,255,255,0.08)" }}
                    aria-label={`Dismiss failed generation ${job.title}`}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {loadState === "ready" && (
          <LibrarySearchBox
            value={searchQuery}
            onChange={(value) => {
              setSearchQuery(value);
              setExpanded(false);
            }}
            onClear={() => setSearchQuery("")}
            resultCount={section === "new" ? newRthms.length : filteredRthms.length}
            totalCount={section === "new" ? regularRhythms.filter((r) => r.status === "new").length : myRthms.length}
          />
        )}

      {/* ── New Rthms ───────────────────────────────────────────────────────── */}
        {section === "new" && (
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
            {section === "new" && (
              <p className="px-1 text-xs text-white/32 leading-relaxed">
                These are freshly generated. Move the ones worth keeping into the main library, or delete the ones you do not need.
              </p>
            )}
            {loadState === "ready" && newCards.length === 0 && section === "new" && (
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-12 flex flex-col items-center gap-3">
                <p className="text-sm text-white/50 text-center leading-relaxed">
                  {searchActive ? "No new Rthms match that search." : "No new Rthms waiting."}
                </p>
                <TransitionLink href="/library/my-rthms" className="text-xs text-white/45 underline underline-offset-4 hover:text-white/60 transition-colors">
                  View main library →
                </TransitionLink>
              </div>
            )}
            {newCards.map(({ key, rhythm, alternate, preferredSideId }) => {
              const isSelected = selectedIds.has(rhythm.id);
              const pairIds = alternate ? [rhythm.id, alternate.id] : [rhythm.id];
              return (
                <div key={key}>
                <div className="relative overflow-hidden">
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
                      onMarkListened={() => handleMoveToMainLibrary(rhythm)}
                      onGraduate={() => handleGraduate(rhythm.id)}
                      onArchive={() => handleArchive(rhythm)}
                      onRemove={() => handleRemove(key, pairIds)}
                      onRecreate={() => setRecreateRhythm(rhythm)}
                      onBuildUpon={() => handleBuildUpon(rhythm)}
                      onShare={() => handleShare(rhythm)}
                      onTag={(tags) => handleTag(rhythm.id, tags)}
                      onNote={(note) => handleNote(rhythm.id, note)}
                      actionPending={pairIds.some((id) => pendingMutationIds.has(id))}
                      markListenedLabel="Move"
                      markListenedSublabel="To main library"
                      confirmingRemove={confirmRemoveId === key}
                      shareToast={shareToastId === rhythm.id}
                      sideLabel={alternate ? sideLabelFor(rhythm) : undefined}
                      alternateLabel={alternate?.title}
                      onSwapSide={alternate ? () => setSelectedSideIds((prev) => ({ ...prev, [key]: alternate.id })) : undefined}
                      sidePreference={!preferredSideId ? "none" : preferredSideId === rhythm.id ? "current" : "other"}
                      onPreferSide={alternate ? () => handlePreferSide(rhythm.id) : undefined}
                    />
                  </div>
                </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Active Rthms ─────────────────────────────────────────────────────── */}
        {section === "main" && (
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
                <span style={{ color: "rgb(167,139,250)" }}>{collectionEmptyCopy(collection)}</span>
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

              <button
                onClick={handleArchiveNonFavourites}
                disabled={archiveableNonFavourites.length === 0 || bulkArchiving}
                className="w-full rounded-2xl border px-4 py-3 text-left touch-manipulation transition-all active:scale-[0.99] disabled:opacity-35"
                style={
                  confirmArchiveNonFavourites
                    ? { background: "rgba(248,113,113,0.10)", borderColor: "rgba(248,113,113,0.34)" }
                    : { background: "rgba(255,255,255,0.035)", borderColor: "rgba(255,255,255,0.08)" }
                }
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{
                      background: confirmArchiveNonFavourites ? "rgba(248,113,113,0.13)" : "rgba(255,255,255,0.055)",
                      color: confirmArchiveNonFavourites ? "rgba(248,113,113,0.85)" : "rgba(255,255,255,0.42)",
                    }}
                  >
                    <ArchiveGlyph />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: confirmArchiveNonFavourites ? "rgba(248,113,113,0.9)" : "rgba(255,255,255,0.68)" }}>
                      {bulkArchiving ? "Archiving..." : confirmArchiveNonFavourites ? "Are you sure? This can't be undone" : "Archive all non-favourites"}
                    </p>
                    <p className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: confirmArchiveNonFavourites ? "rgba(248,113,113,0.58)" : "rgba(255,255,255,0.28)" }}>
                      {archiveableNonFavourites.length > 0 ? `${archiveableNonFavourites.length} Rthm${archiveableNonFavourites.length === 1 ? "" : "s"} will move to The Archive` : "No non-favourite Rthms to archive"}
                    </p>
                  </div>
                  <span className="text-[10px] uppercase tracking-widest" style={{ color: confirmArchiveNonFavourites ? "rgba(248,113,113,0.72)" : "rgba(255,255,255,0.28)" }}>
                    {confirmArchiveNonFavourites ? "Confirm" : "Archive"}
                  </span>
                </div>
              </button>

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
                    : searchActive
                    ? "No Rthms match that search"
                    : chartsMode
                    ? "Play a few Rthms and your chart will appear here"
                    : "No Rthms in this period"}
                </p>
              ) : (
                <>
                  {visibleCards.map(({ key, rhythm, alternate, preferredSideId }) => {
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
                            actionPending={pendingMutationIds.has(rhythm.id)}
                            confirmingRemove={confirmRemoveId === rhythm.id}
                            shareToast={shareToastId === rhythm.id}
                            sideLabel={alternate ? sideLabelFor(rhythm) : undefined}
                            alternateLabel={alternate?.title}
                            onSwapSide={alternate ? () => setSelectedSideIds((prev) => ({ ...prev, [key]: alternate.id })) : undefined}
                            sidePreference={!preferredSideId ? "none" : preferredSideId === rhythm.id ? "current" : "other"}
                            onPreferSide={alternate ? () => handlePreferSide(rhythm.id) : undefined}
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

                  {!chartsMode && !searchActive && timePeriod === "all" && orderedRthms.length > ALL_TIME_PREVIEW && (
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
        )}

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
  { key: "today", label: "Last 24 Hours" },
  { key: "week",  label: "Last 7 Days" },
  { key: "month", label: "Last 30 Days" },
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

// ─── Search box ──────────────────────────────────────────────────────────────

function LibrarySearchBox({
  value,
  onChange,
  onClear,
  resultCount,
  totalCount,
}: {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  resultCount: number;
  totalCount: number;
}) {
  const active = normaliseSearchText(value).length > 0;

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[9px] uppercase tracking-widest text-white/25 px-0.5" htmlFor="library-search">
        Search
      </label>
      <div
        className="flex items-center gap-3 rounded-2xl border px-4 py-3"
        style={{
          background: active ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.035)",
          borderColor: active ? "rgba(201,165,90,0.26)" : "rgba(255,255,255,0.08)",
        }}
      >
        <span className="text-base leading-none" style={{ color: active ? "rgba(201,165,90,0.7)" : "rgba(255,255,255,0.28)" }}>
          ⌕
        </span>
        <input
          id="library-search"
          type="search"
          value={value}
          onChange={handleChange}
          placeholder="Search title, tag, category, note, lyrics..."
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent outline-none text-sm placeholder:text-white/25"
          style={{ color: "rgba(255,255,255,0.78)" }}
        />
        {active && (
          <>
            <span className="text-[10px] tabular-nums whitespace-nowrap" style={{ color: "rgba(255,255,255,0.34)" }}>
              {resultCount}/{totalCount}
            </span>
            <button
              onClick={onClear}
              className="h-7 w-7 rounded-full flex items-center justify-center text-lg leading-none touch-manipulation active:scale-[0.95] transition-transform"
              style={{ color: "rgba(255,255,255,0.42)", background: "rgba(255,255,255,0.06)" }}
              aria-label="Clear search"
            >
              ×
            </button>
          </>
        )}
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

function ArchiveGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="3" y="5" width="14" height="3" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 8h10v7.2A1.8 1.8 0 0 1 13.2 17H6.8A1.8 1.8 0 0 1 5 15.2V8Z" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 11h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
    </svg>
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
