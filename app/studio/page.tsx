"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/app/components/AppHeader";
import { RevealBlock } from "@/app/components/RevealBlock";
import { LockIcon } from "@/app/components/HomeTileIcons";

const STUDIO_CODE = "doug2026";

export default function StudioPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [checked, setChecked] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkContext, setLinkContext] = useState("");

  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)rthmic_code=([^;]+)/);
    const code = match ? decodeURIComponent(match[1]) : "";
    if (code === STUDIO_CODE) setAllowed(true);
    setChecked(true);
  }, []);

  if (!checked) {
    return (
      <main className="relative z-10 min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-white/15 border-t-white/50 animate-spin" />
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="relative z-10 min-h-screen flex flex-col px-6 pt-safe" style={{ animation: "page-enter 380ms ease forwards" }}>
        <RevealBlock delay={0}>
          <AppHeader title="Developer" titleIcon={<LockIcon />} />
        </RevealBlock>
        <section className="flex-1 flex flex-col items-center justify-center text-center pb-28">
          <p className="text-sm text-white/45">Studio is private for now.</p>
          <button onClick={() => router.push("/")} className="mt-5 text-xs uppercase tracking-widest text-white/35">Return Home</button>
        </section>
      </main>
    );
  }

  const startWalkingTour = () => {
    const seed = [
      "Developer experiment: Walking Tour.",
      "Create a Rthm that works like an audio walking-tour companion.",
      "The user will describe the place, route, stops, atmosphere, observations, and what the listener should notice while walking.",
      "Make it practical, location-aware, and paced for movement.",
    ].join(" ");
    router.push(`/speak?pillar=explain&experiment=walking-tour&seed=${encodeURIComponent(seed)}`);
  };

  const startLinkRthm = () => {
    const url = linkUrl.trim();
    if (!url) return;
    const context = linkContext.trim();
    const seed = [
      "Developer experiment: Paste a link and make a Rthm about it.",
      `Link: ${url}`,
      context ? `User context: ${context}` : "User context: Make this useful before acting on the link.",
      "If this is a real estate listing, make the Rthm useful before a viewing: what to notice, what to question, what the listing implies, what tradeoffs to remember, and how to stay clear-eyed.",
      "If it is another kind of page, make the Rthm a practical pre-listen that helps the user absorb, remember, and act on the linked material.",
      "Do not pretend to have read page details that are not in the prompt. Use the URL and user context honestly.",
    ].join(" ");
    router.push(`/speak?pillar=explain&experiment=link-song&autoText=1&seed=${encodeURIComponent(seed)}`);
  };

  return (
    <main className="relative z-10 min-h-screen flex flex-col px-6 pt-safe" style={{ animation: "page-enter 380ms ease forwards" }}>
      <RevealBlock delay={0}>
        <AppHeader title="Developer" titleIcon={<LockIcon />} />
      </RevealBlock>

      <section className="flex-1 flex flex-col gap-4 pb-28">
        <div className="rounded-2xl border px-5 py-5" style={{ background: "rgba(109,40,217,0.08)", borderColor: "rgba(139,92,246,0.28)" }}>
          <p className="text-[10px] uppercase tracking-[0.3em] mb-2" style={{ color: "rgb(167,139,250)" }}>Private export workspace</p>
          <h1 className="text-2xl font-light text-white/90 leading-tight" style={{ fontFamily: "var(--font-display)" }}>
            Make Rthms intended to leave the app.
          </h1>
          <p className="text-sm text-white/45 leading-relaxed mt-3">
            A place for export-ready pieces, client demos, use-case tracks, and versions that need cleaner naming, notes, or download workflows.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <p className="px-1 text-[10px] uppercase tracking-[0.3em]" style={{ color: "rgba(167,139,250,0.72)" }}>Experimental categories</p>
          <ExperimentAction
            title="Walking Tour"
            detail="Prototype a Rthm that acts like a walking companion for a place, route, gallery, neighbourhood, or property viewing."
            status="Experiment"
            onClick={startWalkingTour}
          />
          <div className="rounded-2xl border px-5 py-4" style={{ background: "rgba(255,255,255,0.045)", borderColor: "rgba(255,255,255,0.10)" }}>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(139,92,246,0.16)", color: "rgb(167,139,250)" }}>
                ↗
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-white/78">Paste Link to Rthm</p>
                  <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.32)" }}>Experiment</span>
                </div>
                <p className="text-xs text-white/40 leading-relaxed mt-1">
                  Turn a link into a useful pre-listen. Good first test: a property listing before a viewing.
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  <input
                    value={linkUrl}
                    onChange={(event) => setLinkUrl(event.target.value)}
                    placeholder="Paste listing, article, venue, or video URL"
                    className="w-full rounded-xl border bg-white/[0.035] px-3 py-3 text-sm text-white/76 outline-none placeholder:text-white/24"
                    style={{ borderColor: "rgba(255,255,255,0.10)" }}
                    inputMode="url"
                  />
                  <textarea
                    value={linkContext}
                    onChange={(event) => setLinkContext(event.target.value)}
                    placeholder="Optional context: viewing a house today, evaluating a neighbourhood, reading before a meeting..."
                    className="min-h-20 w-full resize-none rounded-xl border bg-white/[0.035] px-3 py-3 text-sm text-white/76 outline-none placeholder:text-white/24"
                    style={{ borderColor: "rgba(255,255,255,0.10)" }}
                  />
                  <button
                    onClick={startLinkRthm}
                    disabled={!linkUrl.trim()}
                    className="w-full rounded-xl px-4 py-3 text-[11px] font-semibold uppercase tracking-widest transition-all active:scale-[0.98] disabled:opacity-35"
                    style={{ background: "rgba(139,92,246,0.14)", border: "1px solid rgba(139,92,246,0.32)", color: "rgb(190,170,250)" }}
                  >
                    Create from link
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <StudioAction title="Export Rthm" detail="Prepare a track for use in a video, deck, page, workshop, or client context." status="Next" />
        <StudioAction title="Use-Case Builder" detail="Create a Rthm around a specific scenario rather than a personal moment." status="Now: experiments above" />
        <StudioAction title="Studio Notes" detail="Collect production notes, export intent, and follow-up tasks for Codex." status="Planned" />
        <StudioAction title="Style Archetypes" detail="Review and tune the named style characters that shape generated music." status="Planned" />
      </section>
    </main>
  );
}

function ExperimentAction({ title, detail, status, onClick }: { title: string; detail: string; status: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-2xl border px-5 py-4 text-left transition-all active:scale-[0.985] touch-manipulation"
      style={{ background: "rgba(139,92,246,0.08)", borderColor: "rgba(139,92,246,0.24)" }}
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(139,92,246,0.16)", color: "rgb(167,139,250)" }}>
          +
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-white/82">{title}</p>
            <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.34)" }}>{status}</span>
          </div>
          <p className="text-xs text-white/43 leading-relaxed mt-1">{detail}</p>
        </div>
      </div>
    </button>
  );
}

function StudioAction({ title, detail, status }: { title: string; detail: string; status: string }) {
  return (
    <div className="rounded-2xl border px-5 py-4" style={{ background: "rgba(255,255,255,0.045)", borderColor: "rgba(255,255,255,0.10)" }}>
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(139,92,246,0.16)", color: "rgb(167,139,250)" }}>
          +
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-white/78">{title}</p>
            <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.32)" }}>{status}</span>
          </div>
          <p className="text-xs text-white/40 leading-relaxed mt-1">{detail}</p>
        </div>
      </div>
    </div>
  );
}
