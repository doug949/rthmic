"use client";

import { useState, useEffect } from "react";
import { AppHeader } from "@/app/components/AppHeader";
import { RevealBlock } from "@/app/components/RevealBlock";
import { useSwipeBack } from "@/app/hooks/useSwipeBack";
import type { GenLogEntry } from "@/app/api/genlog/route";

function fmt(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function fullDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function styleLabel(style: string): string {
  if (style === "A") return "Energy";
  if (style === "B") return "Focus";
  return style || "—";
}

function cleanGenre(genre: string): string {
  const pipe = genre.indexOf("|");
  return pipe > 0 ? genre.slice(pipe + 1) : genre;
}

// ─── Single entry card ────────────────────────────────────────────────────────

function LogEntryCard({ entry }: { entry: GenLogEntry }) {
  const [expanded, setExpanded] = useState(false);

  const statusStyle =
    entry.status === "success"
      ? { bg: "rgba(74,222,128,0.1)", color: "rgba(74,222,128,0.8)", border: "1px solid rgba(74,222,128,0.2)" }
      : entry.status === "timeout"
      ? { bg: "rgba(251,191,36,0.1)", color: "rgba(251,191,36,0.8)", border: "1px solid rgba(251,191,36,0.2)" }
      : { bg: "rgba(248,113,113,0.1)", color: "rgba(248,113,113,0.8)", border: "1px solid rgba(248,113,113,0.2)" };

  const cardBorder =
    entry.status === "success"
      ? { background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }
      : { background: "rgba(248,113,113,0.04)", borderColor: "rgba(248,113,113,0.15)" };

  return (
    <div className="rounded-2xl border overflow-hidden" style={cardBorder}>

      {/* ── Summary row (always visible, tappable) ── */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full px-5 py-4 flex flex-col gap-2 text-left touch-manipulation active:bg-white/[0.03] transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium leading-snug text-white/80 flex-1 min-w-0">
            {entry.title || "Untitled"}
          </p>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span
              className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full"
              style={{ background: statusStyle.bg, color: statusStyle.color, border: statusStyle.border }}
            >
              {entry.status === "success" ? "✓ Done" : entry.status === "timeout" ? "⏱ Timeout" : "✗ Failed"}
            </span>
            {/* Chevron */}
            <svg
              width="11" height="11" viewBox="0 0 12 12" fill="none"
              className="flex-shrink-0 transition-transform duration-200"
              style={{ color: "rgba(255,255,255,0.25)", transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
            >
              <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        {/* Summary meta */}
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <span className="text-[10px] text-white/35 uppercase tracking-wider">{entry.pillar}</span>
          {entry.genre && (
            <span className="text-[10px] text-white/25 truncate max-w-[140px]">
              {entry.genre.split("|")[0].split(",")[0].slice(0, 28)}
            </span>
          )}
          <span className="text-[10px] text-white/30">⏱ {fmt(entry.durationMs)}</span>
          <span className="text-[10px] text-white/25">{relativeTime(entry.timestamp)}</span>
        </div>
      </button>

      {/* ── Expanded detail (animated height) ── */}
      <div style={{
        display: "grid",
        gridTemplateRows: expanded ? "1fr" : "0fr",
        transition: "grid-template-rows 260ms cubic-bezier(0.4,0,0.2,1)",
      }}>
        <div style={{ overflow: "hidden" }}>
          <div
            className="px-5 pb-5 flex flex-col gap-4 border-t"
            style={{
              borderColor: "rgba(255,255,255,0.06)",
              opacity: expanded ? 1 : 0,
              transform: expanded ? "translateY(0)" : "translateY(-4px)",
              transition: "opacity 200ms ease, transform 220ms ease",
            }}
          >
            {/* ── Timing ── */}
            <DetailSection label="Timing">
              <DetailRow label="Duration" value={fmt(entry.durationMs)} />
              <DetailRow label="Started" value={fullDate(entry.timestamp)} />
            </DetailSection>

            {/* ── Generation params ── */}
            <DetailSection label="Parameters">
              <DetailRow label="Pillar" value={entry.pillar || "—"} />
              <DetailRow label="Style"  value={styleLabel(entry.style)} />
              {entry.menuSlug && <DetailRow label="Destination" value={`Menu · ${entry.menuSlug}`} mono />}
              {entry.genre && (
                <DetailRow label="Genre" value={cleanGenre(entry.genre)} mono />
              )}
            </DetailSection>

            {/* ── Songs produced ── */}
            {entry.songs && entry.songs.length > 0 && (
              <DetailSection label="Rthms produced">
                {entry.songs.map((s) => (
                  <div key={s.id} className="flex flex-col gap-0.5">
                    <p className="text-[12px] text-white/70 leading-snug">{s.title}</p>
                    <p className="text-[10px] text-white/25 font-mono break-all">{s.id}</p>
                  </div>
                ))}
              </DetailSection>
            )}

            {/* ── Error ── */}
            {entry.error && (
              <DetailSection label="Error">
                <p className="text-[12px] leading-relaxed" style={{ color: "rgba(248,113,113,0.7)" }}>
                  {entry.error}
                </p>
              </DetailSection>
            )}

            {/* ── Entry ID ── */}
            <DetailSection label="Entry ID">
              <p className="text-[10px] text-white/20 font-mono break-all">{entry.id}</p>
            </DetailSection>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[9px] uppercase tracking-[0.2em] text-white/25">{label}</p>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[11px] text-white/35 flex-shrink-0">{label}</span>
      <span className={`text-[11px] text-white/65 text-right leading-snug ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GenLogPage() {
  const [entries, setEntries] = useState<GenLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  useSwipeBack("/library");

  useEffect(() => {
    fetch("/api/genlog")
      .then(r => r.json())
      .then(d => setEntries(d.entries ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="relative z-10 min-h-screen flex flex-col px-6 pt-safe" style={{ animation: "page-enter 380ms ease forwards" }}>
      <RevealBlock delay={0}>
        <AppHeader title="Gen Log" />
      </RevealBlock>

      <section className="flex-1 flex flex-col gap-3 pb-16">
        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 rounded-full border-2 border-white/15 border-t-white/40 animate-spin" />
          </div>
        )}

        {!loading && entries.length === 0 && (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-12 flex flex-col items-center gap-3">
            <p className="text-sm text-white/40 text-center">No generations logged yet.</p>
            <p className="text-xs text-white/25 text-center">Each Rthm you create will appear here.</p>
          </div>
        )}

        {!loading && entries.map((entry, i) => (
          <RevealBlock key={entry.id} delay={i * 20}>
            <LogEntryCard entry={entry} />
          </RevealBlock>
        ))}
      </section>
    </main>
  );
}
