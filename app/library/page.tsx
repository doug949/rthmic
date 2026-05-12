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
  RthmixIcon,
  ExploreAllIcon,
} from "./_components";

export default function LibraryPage() {
  const [rhythms, setRhythms] = useState<SavedRhythm[]>([]);
  useSwipeBack("/");

  // Fetch counts — lightweight, non-blocking
  const fetchCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/library");
      if (!res.ok) return;
      const data = await res.json();
      setRhythms(data.rhythms ?? []);
    } catch { /* counts are optional */ }
  }, []);

  useEffect(() => { fetchCounts(); }, [fetchCounts]);

  const myRthmsCount    = rhythms.filter((r) => r.status === "active").length;
  const favouritesCount = rhythms.filter((r) => r.status === "favourite").length;

  return (
    <main
      className="relative z-10 min-h-screen flex flex-col px-6 pt-safe"
      style={{ animation: "page-enter 380ms ease forwards" }}
    >
      <RevealBlock delay={0}>
        <AppHeader title="Library" />
      </RevealBlock>

      <section className="flex-1 flex flex-col gap-3 pb-16">

        {/* My Rthms */}
        <SectionTile
          href="/library/my-rthms"
          icon={<MyRthmsIcon />}
          title="My Rthms"
          description="Every Rthm you've made. Graduate the ones that stick."
          count={myRthmsCount || undefined}
        />

        {/* My Favourites */}
        <SectionTile
          href="/library/my-favourites"
          icon={<MyFavouritesIcon />}
          title="My Favourites"
          description="Your best Rthms. Browse by tag, pillar, or all at once."
          count={favouritesCount || undefined}
          gold
        />

        {/* The RTHMIC Library */}
        <SectionTile
          href="/explore"
          icon={<RthmicLibraryIcon />}
          title="The RTHMIC Library"
          description="Hand-curated Rthms from the RTHMIC team."
          subsectionLabel="Explore"
          subsectionIcon={<ExploreAllIcon />}
        />

        {/* Rthmix Albums */}
        <SectionTile
          icon={<RthmixIcon />}
          title="Rthmix Albums"
          description="Ordered Rthm sequences — coming soon."
          dim
        />

      </section>
    </main>
  );
}

// ─── Section tile ─────────────────────────────────────────────────────────────

function SectionTile({
  href,
  icon,
  title,
  description,
  count,
  subsectionLabel,
  subsectionIcon,
  gold,
  dim,
}: {
  href?: string;
  icon: React.ReactNode;
  title: string;
  description?: string;
  count?: number;
  subsectionLabel?: string;
  subsectionIcon?: React.ReactNode;
  gold?: boolean;
  dim?: boolean;
}) {
  const goldColor   = "rgba(201,165,90,0.85)";
  const goldDim     = "rgba(201,165,90,0.45)";
  const goldBg      = "rgba(201,165,90,0.08)";
  const goldBorder  = "rgba(201,165,90,0.18)";
  const goldIconBg  = "rgba(201,165,90,0.10)";
  const goldIconBorder = "rgba(201,165,90,0.20)";

  const inner = (
    <div
      className={`rounded-2xl border flex flex-col overflow-hidden transition-all duration-150 ${!dim && href ? "active:scale-[0.985]" : ""}`}
      style={
        gold
          ? { background: goldBg, borderColor: goldBorder }
          : dim
          ? { background: "rgba(255,255,255,0.015)", borderColor: "rgba(255,255,255,0.05)" }
          : { background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }
      }
    >
      {/* Main row */}
      <div className="flex items-center gap-4 px-5 py-5">
        {/* Icon */}
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={
            gold
              ? { background: goldIconBg, border: `1px solid ${goldIconBorder}` }
              : dim
              ? { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }
              : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }
          }
        >
          <span style={{ color: gold ? goldColor : dim ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.55)" }}>
            {icon}
          </span>
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <p
              className="text-base font-medium leading-snug"
              style={{ color: gold ? goldColor : dim ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.85)", fontFamily: "var(--font-display)" }}
            >
              {title}
            </p>
            {count !== undefined && count > 0 && (
              <span className="text-xs tabular-nums" style={{ color: gold ? goldDim : "rgba(255,255,255,0.35)" }}>
                {count}
              </span>
            )}
          </div>
          {description && (
            <p className="text-[11px] mt-0.5 leading-snug" style={{ color: gold ? "rgba(201,165,90,0.42)" : dim ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.38)" }}>
              {description}
            </p>
          )}
        </div>

        {/* Chevron — only when tappable */}
        {href && !subsectionLabel && (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
            <path d="M5 3L11 8L5 13" stroke={gold ? goldDim : "rgba(255,255,255,0.28)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      {/* Optional subsection row (e.g. Explore for RTHMIC Library) */}
      {subsectionLabel && href && (
        <div
          className="flex items-center gap-4 px-5 py-4 border-t"
          style={{ borderColor: "rgba(255,255,255,0.06)" }}
        >
          <span className="text-white/35 flex-shrink-0">{subsectionIcon}</span>
          <p className="text-sm font-medium text-white/65 flex-1">{subsectionLabel}</p>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
            <path d="M5 3L11 8L5 13" stroke="rgba(255,255,255,0.28)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </div>
  );

  // Wrap in link only when navigable
  if (href) {
    return (
      <TransitionLink href={href} className="block touch-manipulation">
        {inner}
      </TransitionLink>
    );
  }

  return inner;
}

