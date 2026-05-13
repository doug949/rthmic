"use client";

import { useRouter } from "next/navigation";
import { AppHeader } from "@/app/components/AppHeader";
import { RevealBlock } from "@/app/components/RevealBlock";

const TEAL = {
  text:   "rgba(120,210,180,0.92)",
  dim:    "rgba(100,195,165,0.65)",
  bg:     "rgba(100,195,165,0.06)",
  border: "rgba(100,195,165,0.22)",
};

const TIME_MENUS = [
  {
    label: "Morning Menus",
    description: "Start the day with intention",
    seed: "My morning routine — the things I want to do as I start the day",
  },
  {
    label: "Start the Day",
    description: "Lay out everything you need to get through today",
    seed: "Everything I need to get through today — tasks, priorities, intentions",
  },
  {
    label: "Afternoon",
    description: "Check in and finish strong",
    seed: "My afternoon — what I still need to do and how I want to finish the day",
  },
  {
    label: "End of Day",
    description: "Close out what happened and what carries over",
    seed: "Wrapping up the day — what happened, what's done, what carries over",
  },
  {
    label: "Before Bed",
    description: "Let go and wind down",
    seed: "My evening wind-down — what I want to let go of and how I want to rest",
  },
];

export default function StructurePage() {
  const router = useRouter();

  const select = (seed: string) => {
    const params = new URLSearchParams({ pillar: "menus", seed });
    router.push(`/speak?${params.toString()}`);
  };

  return (
    <main
      className="relative z-10 min-h-screen flex flex-col px-6"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)", animation: "page-enter 380ms ease forwards" }}
    >
      <AppHeader title="Structure" />

      <section className="flex-1 flex flex-col pb-10">
        <RevealBlock delay={0}>
          <div className="flex flex-col gap-1 pb-6">
            <div className="flex items-center gap-2.5 mb-1">
              <span style={{ color: TEAL.dim }}><StructureIcon /></span>
              <p className="text-[10px] uppercase tracking-[0.3em]" style={{ color: TEAL.dim }}>
                Structure: Rthmic Menus
              </p>
            </div>
            <p
              className="text-xl font-light text-white/70 leading-snug"
              style={{ fontFamily: "var(--font-display)" }}
            >
              When do you want to structure?
            </p>
          </div>
        </RevealBlock>

        <div className="flex flex-col gap-2">
          {TIME_MENUS.map((tm, i) => (
            <RevealBlock key={tm.label} delay={i * 40}>
              <button
                onClick={() => select(tm.seed)}
                className="w-full flex items-center gap-4 px-6 py-5 rounded-2xl border text-left touch-manipulation active:scale-[0.98] transition-all"
                style={{ background: TEAL.bg, borderColor: TEAL.border }}
              >
                <span className="flex-shrink-0" style={{ color: TEAL.dim }}>
                  <StructureIcon />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold tracking-wide" style={{ color: TEAL.text }}>{tm.label}</p>
                  <p className="text-xs text-white/45 mt-0.5">{tm.description}</p>
                </div>
                <span className="text-lg flex-shrink-0" style={{ color: TEAL.border }}>›</span>
              </button>
            </RevealBlock>
          ))}
        </div>
      </section>
    </main>
  );
}

function StructureIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <line x1="2" y1="16" x2="22" y2="16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M5 16 A7 7 0 0 1 19 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" fill="none" />
      <circle cx="12" cy="9" r="2.2" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <line x1="12" y1="4.5" x2="12" y2="5.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="16.8" y1="6" x2="15.9" y2="6.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="7.2" y1="6" x2="8.1" y2="6.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
