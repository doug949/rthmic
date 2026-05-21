"use client";

import React, { useState, useEffect, useCallback } from "react";
import { TransitionLink } from "@/app/components/TransitionLink";
import { AppHeader } from "@/app/components/AppHeader";
import { RevealBlock } from "@/app/components/RevealBlock";
import { useSwipeBack } from "@/app/hooks/useSwipeBack";
import type { SavedRhythm } from "@/app/api/library/route";
import {
  MyRthmsIcon,
  MyFavouritesIcon,
  RthmicLibraryIcon,
  ExploreAllIcon,
  TagsIcon,
  PillarsIcon,
  ArchiveIcon,
} from "./_components";

interface QueueJob {
  jobId: string;
  title: string;
  pillar: string;
  status: "pending" | "generating";
}

export default function CatalogPage() {
  const [rhythms, setRhythms]                 = useState<SavedRhythm[]>([]);
  const [queueJobs, setQueueJobs]             = useState<QueueJob[]>([]);
  const [myRthmsOpen, setMyRthmsOpen]         = useState(false);
  const [myFavouritesOpen, setMyFavouritesOpen] = useState(false);
  const [archiveOpen, setArchiveOpen]         = useState(false);
  const [rthmicLibraryOpen, setRthmicLibraryOpen] = useState(false);
const [clearingQueue, setClearingQueue]     = useState(false);
  useSwipeBack("/");

  const fetchCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/library");
      if (!res.ok) throw new Error();
      const data = await res.json();
      const rhythms = data.rhythms ?? [];
      setRhythms(rhythms);
      const { saveLibraryCache } = await import("@/app/lib/libraryCache");
      saveLibraryCache(rhythms);
    } catch {
      const { loadLibraryCache } = await import("@/app/lib/libraryCache");
      setRhythms(loadLibraryCache());
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
    fetchCounts();
    fetchQueueJobs();
    const pollId = setInterval(() => { fetchQueueJobs(); fetchCounts(); }, 15_000);
    return () => clearInterval(pollId);
  }, [fetchCounts, fetchQueueJobs]);

  const activeRthms     = rhythms.filter((r) => r.status === "new" || r.status === "active" || r.status === "favourite");
  const myRthmsCount    = activeRthms.length;
  const favouritesCount = rhythms.filter((r) => r.status === "favourite").length;
  const archiveCount    = rhythms.filter((r) => r.status === "archived").length;

  const startOf = (period: "today" | "week" | "month") => {
    const d = new Date();
    if (period === "today") { d.setHours(0, 0, 0, 0); return d.getTime(); }
    if (period === "week")  { d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); d.setHours(0, 0, 0, 0); return d.getTime(); }
    d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime();
  };
  const todayCount = activeRthms.filter((r) => r.savedAt >= startOf("today")).length;
  const weekCount  = activeRthms.filter((r) => r.savedAt >= startOf("week")).length;
  const monthCount = activeRthms.filter((r) => r.savedAt >= startOf("month")).length;

  return (
    <main
      className="relative z-10 min-h-screen flex flex-col px-6 pt-safe"
      style={{ animation: "page-enter 380ms ease forwards" }}
    >
      <RevealBlock delay={0}>
        <AppHeader title="Catalog" />
      </RevealBlock>

      <section className="flex-1 flex flex-col gap-5 pb-16">

        {/* ── Generating queue ──────────────────────────────────────────── */}
        {queueJobs.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 px-1">
              <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgb(139,92,246)" }}>Generating</span>
              <span
                className="inline-flex items-center justify-center text-[9px] font-semibold rounded-full px-1.5 py-0.5 leading-none"
                style={{ background: "rgba(109,40,217,0.2)", color: "rgb(167,139,250)" }}
              >
                {queueJobs.length}
              </span>
              <button
                onClick={async () => {
                  setClearingQueue(true);
                  try {
                    await fetch("/api/clear-queue", { method: "POST" });
                    setQueueJobs([]);
                  } catch { /* ignore */ }
                  finally { setClearingQueue(false); }
                }}
                disabled={clearingQueue}
                className="ml-auto text-[10px] uppercase tracking-widest touch-manipulation transition-colors disabled:opacity-40"
                style={{ color: "rgba(255,255,255,0.25)" }}
              >
                {clearingQueue ? "Clearing…" : "Clear"}
              </button>
            </div>
            <p className="px-1 text-xs text-white/32 leading-relaxed">
              You can leave RTHMIC open or come back later. Finished Rthms will appear automatically when they are ready.
            </p>
            {queueJobs.map((job) => (
              <div
                key={job.jobId}
                className="rounded-2xl border px-5 py-4 flex items-center gap-4"
                style={{ background: "rgba(109,40,217,0.05)", borderColor: "rgba(109,40,217,0.28)" }}
              >
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

        {/* ── My Rthms ─────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          <SectionAccordionHeader
            icon={<MyRthmsIcon />}
            title="My Rthms"
            description="Every Rthm you've made. Graduate the ones that stick."
            count={myRthmsCount || undefined}
            open={myRthmsOpen}
            onToggle={() => setMyRthmsOpen((o) => !o)}
          />
          <AnimatedAccordion open={myRthmsOpen}>
            <SubNavCard href="/library/my-rthms?period=today" icon={<TodayIcon />}  label="Today"      detail={todayCount > 0 ? `${todayCount} Rthms` : "None yet today"} />
            <SubNavCard href="/library/my-rthms?period=week"  icon={<WeekIcon />}   label="This Week"  detail={weekCount  > 0 ? `${weekCount} Rthms`  : "None this week"}  />
            <SubNavCard href="/library/my-rthms?period=month" icon={<MonthIcon />}  label="This Month" detail={monthCount > 0 ? `${monthCount} Rthms` : "None this month"} />
            <SubNavCard href="/library/my-rthms"              icon={<MyRthmsIcon />} label="All Rthms" detail={myRthmsCount > 0 ? `${myRthmsCount} saved` : undefined}     />
          </AnimatedAccordion>
        </div>

        {/* ── My Favourites ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          <SectionAccordionHeader
            icon={<MyFavouritesIcon />}
            title="My Favourites"
            description="Your best Rthms. Browse by tag, pillar, or all at once."
            count={favouritesCount || undefined}
            open={myFavouritesOpen}
            onToggle={() => setMyFavouritesOpen((o) => !o)}
            gold
          />
          <AnimatedAccordion open={myFavouritesOpen}>
            <SubNavCard href="/library/my-favourites?open=explore" icon={<ExploreAllIcon />}  label="Explore All" detail={favouritesCount > 0 ? `${favouritesCount} Rthms` : undefined} gold />
            <SubNavCard href="/library/my-favourites?open=tags"    icon={<TagsIcon />}        label="Tags"        detail="Browse by tag"   gold />
            <SubNavCard href="/library/my-favourites?open=pillars" icon={<PillarsIcon />}     label="Pillars"     detail="Browse by pillar" gold />
          </AnimatedAccordion>
        </div>

        {/* ── The RTHMIC Library ────────────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          <SectionAccordionHeader
            icon={<RthmicLibraryIcon />}
            title="The RTHMIC Library"
            description="Hand-curated Rthms from the RTHMIC team."
            open={rthmicLibraryOpen}
            onToggle={() => setRthmicLibraryOpen((o) => !o)}
          />
          <AnimatedAccordion open={rthmicLibraryOpen}>
            <SubNavCard href="/explore" icon={<ExploreAllIcon />} label="Explore" detail="20 hand-selected Rthms" />
          </AnimatedAccordion>
        </div>


        {/* ── The Archive ───────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          <SectionAccordionHeader
            icon={<ArchiveIcon />}
            title="The Archive"
            description="Rthms you're keeping but hiding everywhere else."
            count={archiveCount || undefined}
            open={archiveOpen}
            onToggle={() => setArchiveOpen((o) => !o)}
            dim
          />
          <AnimatedAccordion open={archiveOpen}>
            <SubNavCard
              href="/library/archive"
              icon={<ArchiveIcon />}
              label="Archived Rthms"
              detail={archiveCount > 0 ? `${archiveCount} kept` : "Empty"}
            />
          </AnimatedAccordion>
        </div>

        {/* ── Generation Log ────────────────────────────────────────────────── */}
        <TransitionLink
          href="/library/log"
          className="flex items-center gap-4 px-5 py-4 rounded-2xl border touch-manipulation active:scale-[0.985] transition-all"
          style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}
        >
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <span style={{ color: "rgba(255,255,255,0.3)" }}><GenLogIcon /></span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-medium leading-snug" style={{ color: "rgba(255,255,255,0.55)", fontFamily: "var(--font-display)" }}>Generation Log</h2>
            <p className="text-[11px] mt-0.5 leading-snug" style={{ color: "rgba(255,255,255,0.25)" }}>Timing and status for every Rthm you&apos;ve made</p>
          </div>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
            <path d="M5 3L11 8L5 13" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </TransitionLink>

      </section>
    </main>
  );
}

// ─── Animated accordion body ──────────────────────────────────────────────────

function AnimatedAccordion({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: open ? "1fr" : "0fr",
        transition: "grid-template-rows 280ms cubic-bezier(0.4,0,0.2,1)",
      }}
    >
      <div style={{ overflow: "hidden" }}>
        <div
          className="flex flex-col gap-2 pl-1 pb-1"
          style={{
            opacity: open ? 1 : 0,
            transform: open ? "translateY(0)" : "translateY(-6px)",
            transition: "opacity 220ms ease, transform 240ms ease",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Period icons ─────────────────────────────────────────────────────────────

function TodayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="11" r="5.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10 8.5v2.5l1.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 3h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

function WeekIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="5" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6 2v3M14 2v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.5" />
      <rect x="5" y="10" width="2.5" height="2.5" rx="0.5" fill="currentColor" />
      <rect x="8.75" y="10" width="2.5" height="2.5" rx="0.5" fill="currentColor" opacity="0.6" />
      <rect x="12.5" y="10" width="2.5" height="2.5" rx="0.5" fill="currentColor" opacity="0.3" />
    </svg>
  );
}

function MonthIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="5" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6 2v3M14 2v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.5" />
      <rect x="5"    y="10" width="2" height="2" rx="0.4" fill="currentColor" opacity="0.4" />
      <rect x="9"    y="10" width="2" height="2" rx="0.4" fill="currentColor" opacity="0.4" />
      <rect x="13"   y="10" width="2" height="2" rx="0.4" fill="currentColor" opacity="0.4" />
      <rect x="5"    y="13" width="2" height="2" rx="0.4" fill="currentColor" opacity="0.4" />
      <rect x="9"    y="13" width="2" height="2" rx="0.4" fill="currentColor" />
      <rect x="13"   y="13" width="2" height="2" rx="0.4" fill="currentColor" opacity="0.4" />
    </svg>
  );
}

function GenLogIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <rect x="3" y="3" width="14" height="2" rx="1" fill="currentColor" opacity="0.5" />
      <rect x="3" y="7" width="10" height="2" rx="1" fill="currentColor" opacity="0.7" />
      <rect x="3" y="11" width="12" height="2" rx="1" fill="currentColor" />
      <rect x="3" y="15" width="7" height="2" rx="1" fill="currentColor" opacity="0.4" />
    </svg>
  );
}

// ─── Section accordion header ─────────────────────────────────────────────────

function SectionAccordionHeader({
  icon,
  title,
  description,
  count,
  open,
  onToggle,
  gold,
  dim,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  gold?: boolean;
  dim?: boolean;
}) {
  const goldColor = "rgba(201,165,90,0.85)";
  const goldDim   = "rgba(201,165,90,0.45)";

  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-4 touch-manipulation text-left w-full py-1"
    >
      {/* Icon */}
      <div
        className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
        style={
          gold
            ? { background: "rgba(201,165,90,0.09)", border: "1px solid rgba(201,165,90,0.18)" }
            : dim
            ? { background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)" }
            : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }
        }
      >
        <span style={{ color: gold ? goldColor : dim ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.55)" }}>
          {icon}
        </span>
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <h2
            className="text-base font-medium leading-snug"
            style={{ color: gold ? goldColor : dim ? "rgba(255,255,255,0.38)" : "rgba(255,255,255,0.88)", fontFamily: "var(--font-display)" }}
          >
            {title}
          </h2>
          {count !== undefined && count > 0 && (
            <span className="text-xs tabular-nums" style={{ color: gold ? goldDim : "rgba(255,255,255,0.35)" }}>
              {count}
            </span>
          )}
        </div>
        {description && (
          <p className="text-[11px] mt-0.5 leading-snug" style={{ color: gold ? "rgba(201,165,90,0.42)" : dim ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.38)" }}>
            {description}
          </p>
        )}
      </div>

      {/* Chevron */}
      <svg
        width="14" height="14" viewBox="0 0 16 16" fill="none"
        className="flex-shrink-0 transition-transform duration-200"
        style={{ color: gold ? goldDim : "rgba(255,255,255,0.28)", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
      >
        <path d="M3 6L8 11L13 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

// ─── Sub-navigation card (opens a page) ──────────────────────────────────────

function SubNavCard({
  href,
  icon,
  label,
  detail,
  gold,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  detail?: string;
  gold?: boolean;
}) {
  return (
    <TransitionLink
      href={href}
      className="flex items-center gap-4 px-5 py-4 rounded-2xl border touch-manipulation active:scale-[0.985] transition-all"
      style={
        gold
          ? { background: "rgba(201,165,90,0.04)", borderColor: "rgba(201,165,90,0.14)" }
          : { background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.07)" }
      }
    >
      <span style={{ color: gold ? "rgba(201,165,90,0.6)" : "rgba(255,255,255,0.38)" }}>{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-snug" style={{ color: gold ? "rgba(201,165,90,0.85)" : "rgba(255,255,255,0.75)" }}>{label}</p>
        {detail && <p className="text-[11px] mt-0.5" style={{ color: gold ? "rgba(201,165,90,0.42)" : "rgba(255,255,255,0.38)" }}>{detail}</p>}
      </div>
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
        <path d="M5 3L11 8L5 13" stroke={gold ? "rgba(201,165,90,0.4)" : "rgba(255,255,255,0.25)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </TransitionLink>
  );
}
