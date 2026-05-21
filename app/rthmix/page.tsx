"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/app/components/AppHeader";
import { RevealBlock } from "@/app/components/RevealBlock";

const RTHMIX_CODE = "doug2026";

export default function RthmixPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)rthmic_code=([^;]+)/);
    const code = match ? decodeURIComponent(match[1]) : "";
    setAllowed(code === RTHMIX_CODE);
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
          <AppHeader title="Rthmix" />
        </RevealBlock>
        <section className="flex-1 flex flex-col items-center justify-center text-center pb-28">
          <p className="text-sm text-white/45">Rthmix is coming soon.</p>
          <button onClick={() => router.push("/")} className="mt-5 text-xs uppercase tracking-widest text-white/35">Return Home</button>
        </section>
      </main>
    );
  }

  return (
    <main className="relative z-10 min-h-screen flex flex-col px-6 pt-safe" style={{ animation: "page-enter 380ms ease forwards" }}>
      <RevealBlock delay={0}>
        <AppHeader title="Rthmix" />
      </RevealBlock>

      <section className="flex-1 flex flex-col gap-4 pb-28">
        <div className="rounded-2xl border px-5 py-5" style={{ background: "rgba(230,155,60,0.08)", borderColor: "rgba(230,155,60,0.28)" }}>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-[10px] uppercase tracking-[0.3em]" style={{ color: "rgba(240,170,80,0.9)" }}>Private preview</p>
            <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: "rgba(230,155,60,0.12)", color: "rgba(240,170,80,0.72)", border: "1px solid rgba(230,155,60,0.22)" }}>Soon</span>
          </div>
          <h1 className="text-2xl font-light text-white/90 leading-tight" style={{ fontFamily: "var(--font-display)" }}>
            Build albums that teach one unlock at a time.
          </h1>
          <p className="text-sm text-white/45 leading-relaxed mt-3">
            Rthmix is where a goal becomes track zero, ordered progress tracks, and a reflective bonus track.
          </p>
        </div>

        <RthmixAction
          title="RTHMIX Album Generator"
          detail="Turn a goal into track zero, ordered unlock tracks, and a reflective bonus track. Intended for gradual generation."
          status="Prototype next"
        />
        <RthmixAction
          title="Track Zero"
          detail="Explain the concept, the target, and how the listener should move through the album."
          status="Planned"
        />
        <RthmixAction
          title="Ordered Unlocks"
          detail="Each track revisits the previous unlock briefly, then introduces one new unlock."
          status="Planned"
        />
        <RthmixAction
          title="Bonus Reflection"
          detail="Close the Rthmix by acknowledging what has been achieved and giving it a moment to land."
          status="Planned"
        />
      </section>
    </main>
  );
}

function RthmixAction({ title, detail, status }: { title: string; detail: string; status: string }) {
  return (
    <div className="rounded-2xl border px-5 py-4" style={{ background: "rgba(255,255,255,0.045)", borderColor: "rgba(255,255,255,0.10)" }}>
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(230,155,60,0.14)", color: "rgba(240,170,80,0.9)" }}>
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
