"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/app/components/AppHeader";
import { RevealBlock } from "@/app/components/RevealBlock";

const STUDIO_CODE = "doug2026";

export default function StudioPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [checked, setChecked] = useState(false);

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
          <AppHeader title="RTHMIC Studio" />
        </RevealBlock>
        <section className="flex-1 flex flex-col items-center justify-center text-center pb-28">
          <p className="text-sm text-white/45">Studio is private for now.</p>
          <button onClick={() => router.push("/")} className="mt-5 text-xs uppercase tracking-widest text-white/35">Return Home</button>
        </section>
      </main>
    );
  }

  return (
    <main className="relative z-10 min-h-screen flex flex-col px-6 pt-safe" style={{ animation: "page-enter 380ms ease forwards" }}>
      <RevealBlock delay={0}>
        <AppHeader title="RTHMIC Studio" />
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

        <StudioAction title="Export Rthm" detail="Prepare a track for use in a video, deck, page, workshop, or client context." status="Next" />
        <StudioAction title="RTHMIX Album Generator" detail="Turn a goal into track zero, ordered unlock tracks, and a reflective bonus track. Intended for gradual generation." status="Prototype next" />
        <StudioAction title="Use-Case Builder" detail="Create a Rthm around a specific scenario rather than a personal moment." status="Planned" />
        <StudioAction title="Studio Notes" detail="Collect production notes, export intent, and follow-up tasks for Codex." status="Planned" />
        <StudioAction title="Style Archetypes" detail="Review and tune the named style characters that shape generated music." status="Planned" />
      </section>
    </main>
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
