"use client";

import { RevealBlock } from "@/app/components/RevealBlock";
import { TransitionLink } from "@/app/components/TransitionLink";

export default function Home() {
  return (
    <main className="relative z-10 min-h-screen flex flex-col px-6 pt-safe" style={{ animation: "page-enter 380ms ease forwards" }}>
      {/* Wordmark */}
      <RevealBlock delay={0}>
        <header className="pt-14 pb-12">
          <h1 className="text-3xl tracking-[0.4em] uppercase" style={{ fontFamily: "var(--font-display)", fontWeight: 300, color: "#c9a55a" }}>
            RTHMIC
          </h1>
          <p className="text-xs mt-1.5 tracking-widest uppercase" style={{ color: "#c9a55a", opacity: 0.6 }}>
            Rthm-based action
          </p>
        </header>
      </RevealBlock>

      <section className="flex-1 flex flex-col gap-4 pb-6">
        <RevealBlock delay={60}>
          <ModeCard
            href="/speak"
            label="Speak"
            description="Tell Rthmic your state. Get a Rthm built for you."
            icon={<MicIcon />}
            primary
          />
        </RevealBlock>
        <RevealBlock delay={120}>
          <ModeCard
            href="/library"
            label="Listen"
            description="Your generated Rthms and the curated collection."
            icon={<PlayIcon />}
            blue
          />
        </RevealBlock>
        <RevealBlock delay={160}>
          <ModeCard
            href="/structure"
            label="Structure: Rthmic Menus"
            description="Morning, afternoon, evening — build a Rthm for the time of day."
            icon={<StructureIcon />}
            teal
          />
        </RevealBlock>
        <RevealBlock delay={220}>
          <ModeCard
            href="/settings"
            label="RTHMIC Styles"
            description="Configure your genre map and preferences"
            icon={<NoteIcon />}
            subtle
          />
        </RevealBlock>
        <RevealBlock delay={270}>
          <ModeCard
            href="/feedback"
            label="Share Feedback"
            description="Speak your thoughts directly to the team"
            icon={<BubbleIcon />}
            subtle
          />
        </RevealBlock>
        <RevealBlock delay={320}>
          <ModeCard
            href="/understand"
            label="About RTHMIC"
            description="What it is and when to use it"
            icon={<InfoIcon />}
            subtle
          />
        </RevealBlock>
      </section>
    </main>
  );
}

function ModeCard({
  href,
  label,
  description,
  icon,
  primary,
  blue,
  teal,
  subtle,
}: {
  href: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  primary?: boolean;
  blue?: boolean;
  teal?: boolean;
  subtle?: boolean;
}) {
  const iconColor  = primary ? "#c9a55a" : blue ? "rgba(120,160,255,0.75)" : teal ? "rgba(100,195,165,0.85)" : subtle ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.45)";
  const labelColor = primary ? "#c9a55a" : blue ? "rgba(140,175,255,0.92)" : teal ? "rgba(120,210,180,0.92)" : subtle ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.9)";
  const arrowColor = primary ? "rgba(201,165,90,0.4)" : blue ? "rgba(120,160,255,0.35)" : teal ? "rgba(100,195,165,0.35)" : subtle ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.2)";

  return (
    <TransitionLink
      href={href}
      className={`
        flex items-center gap-5 px-6 rounded-2xl border transition-all duration-150
        active:scale-[0.98] touch-manipulation
        ${primary || blue || teal ? "py-7" : subtle ? "py-4" : "py-7"}
        ${primary || blue || teal ? "" : "bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.07]"}
      `}
      style={
        primary ? { background: "rgba(201,165,90,0.08)", borderColor: "rgba(201,165,90,0.35)" }
        : blue   ? { background: "rgba(100,140,255,0.06)", borderColor: "rgba(120,160,255,0.28)" }
        : teal   ? { background: "rgba(100,195,165,0.06)", borderColor: "rgba(100,195,165,0.28)" }
        : {}
      }
    >
      <span className="flex-shrink-0" style={{ color: iconColor }} aria-hidden>{icon}</span>
      <div className="flex-1 min-w-0">
        <p
          className={`font-semibold tracking-wide ${subtle ? "text-base" : "text-lg"}`}
          style={{ color: labelColor }}
        >
          {label}
        </p>
        <p className={`mt-0.5 leading-snug ${subtle ? "text-xs text-white/35" : "text-sm text-white/55"}`}>{description}</p>
      </div>
      <span className="flex-shrink-0 text-lg" style={{ color: arrowColor }}>›</span>
    </TransitionLink>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function MicIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" />
      <path d="M5 11a7 7 0 0 0 14 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="12" y1="18" x2="12" y2="22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="8.5" y1="22" x2="15.5" y2="22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M6 4.5L20 12L6 19.5V4.5Z" fill="currentColor" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" />
      <line x1="12" y1="11" x2="12" y2="17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="7.5" r="1.2" fill="currentColor" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M9 18V6l12-2v12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="6" cy="18" r="3" fill="currentColor" />
      <circle cx="18" cy="16" r="3" fill="currentColor" />
    </svg>
  );
}

function StructureIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      {/* Horizon line */}
      <line x1="2" y1="16" x2="22" y2="16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      {/* Sun arc */}
      <path d="M5 16 A7 7 0 0 1 19 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" fill="none" />
      {/* Sun circle */}
      <circle cx="12" cy="9" r="2.2" stroke="currentColor" strokeWidth="1.5" fill="none" />
      {/* Rays */}
      <line x1="12" y1="4.5" x2="12" y2="5.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="16.8" y1="6" x2="15.9" y2="6.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="7.2" y1="6" x2="8.1" y2="6.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function BubbleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
