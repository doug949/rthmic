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
  TagsIcon,
  PillarsIcon,
  ArchiveIcon,
} from "./_components";

export default function CatalogPage() {
  const [rhythms, setRhythms]                 = useState<SavedRhythm[]>([]);
  const [myRthmsOpen, setMyRthmsOpen]         = useState(false);
  const [myFavouritesOpen, setMyFavouritesOpen] = useState(false);
  const [archiveOpen, setArchiveOpen]         = useState(false);
  const [rthmicLibraryOpen, setRthmicLibraryOpen] = useState(false);
  const [rthmixAlbumsOpen, setRthmixAlbumsOpen]   = useState(false);
  useSwipeBack("/");

  const fetchCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/library");
      if (!res.ok) return;
      const data = await res.json();
      setRhythms(data.rhythms ?? []);
    } catch { /* counts optional */ }
  }, []);

  useEffect(() => { fetchCounts(); }, [fetchCounts]);

  const myRthmsCount    = rhythms.filter((r) => r.status === "active").length;
  const favouritesCount = rhythms.filter((r) => r.status === "favourite").length;
  const archiveCount    = rhythms.filter((r) => r.status === "archived").length;

  return (
    <main
      className="relative z-10 min-h-screen flex flex-col px-6 pt-safe"
      style={{ animation: "page-enter 380ms ease forwards" }}
    >
      <RevealBlock delay={0}>
        <AppHeader title="Catalog" />
      </RevealBlock>

      <section className="flex-1 flex flex-col gap-5 pb-16">

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
          {myRthmsOpen && (
            <div className="flex flex-col gap-2 pl-1">
              <SubNavCard
                href="/library/my-rthms"
                icon={<MyRthmsIcon />}
                label="All Rthms"
                detail={myRthmsCount > 0 ? `${myRthmsCount} saved` : undefined}
              />
            </div>
          )}
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
          {myFavouritesOpen && (
            <div className="flex flex-col gap-2 pl-1">
              <SubNavCard href="/library/my-favourites?open=explore" icon={<ExploreAllIcon />}  label="Explore All" detail={favouritesCount > 0 ? `${favouritesCount} Rthms` : undefined} gold />
              <SubNavCard href="/library/my-favourites?open=tags"    icon={<TagsIcon />}        label="Tags"        detail="Browse by tag"   gold />
              <SubNavCard href="/library/my-favourites?open=pillars" icon={<PillarsIcon />}     label="Pillars"     detail="Browse by pillar" gold />
            </div>
          )}
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
          {archiveOpen && (
            <div className="flex flex-col gap-2 pl-1">
              <SubNavCard
                href="/library/archive"
                icon={<ArchiveIcon />}
                label="Archived Rthms"
                detail={archiveCount > 0 ? `${archiveCount} kept` : "Empty"}
              />
            </div>
          )}
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
          {rthmicLibraryOpen && (
            <div className="flex flex-col gap-2 pl-1">
              <SubNavCard href="/explore" icon={<ExploreAllIcon />} label="Explore" detail="20 hand-selected Rthms" />
            </div>
          )}
        </div>

        {/* ── Rthmix Albums ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          <SectionAccordionHeader
            icon={<RthmixIcon />}
            title="Rthmix Albums"
            description="Ordered Rthm sequences — coming soon."
            open={rthmixAlbumsOpen}
            onToggle={() => setRthmixAlbumsOpen((o) => !o)}
            dim
          />
          {rthmixAlbumsOpen && (
            <div className="rounded-2xl border border-white/[0.05] bg-white/[0.015] px-5 py-5 ml-1">
              <p className="text-xs text-white/35 leading-relaxed">
                Albums let you build ordered playlists of Rthms — like a personal album. Coming soon.
              </p>
            </div>
          )}
        </div>

      </section>
    </main>
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
