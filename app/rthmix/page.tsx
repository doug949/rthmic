"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/app/components/AppHeader";
import { RevealBlock } from "@/app/components/RevealBlock";
import { CassetteIcon } from "@/app/components/HomeTileIcons";

const RTHMIX_CODE = "doug2026";

const progressionTracks = [
  {
    title: "RTHMIX Album Generator",
    detail: "Turn a goal into track zero, ordered unlock tracks, and a reflective bonus track. Intended for gradual generation.",
    status: "Prototype next",
  },
  {
    title: "Track Zero",
    detail: "Explain the concept, the target, and how the listener should move through the album.",
    status: "Planned",
  },
  {
    title: "Ordered Unlocks",
    detail: "Each track revisits the previous unlock briefly, then introduces one new unlock.",
    status: "Planned",
  },
  {
    title: "Bonus Reflection",
    detail: "Close the Rthmix by acknowledging what has been achieved and giving it a moment to land.",
    status: "Planned",
  },
];

const croatianMemoryRthmix = [
  {
    number: "00",
    title: "Ground Zero: Six Words, Six Hooks",
    unlock: "How to use this Memory Rthmix",
    detail: "One Croatian word per Rthm. Each track starts with the word, gives you one sticky sound hook, then ends on the word again.",
    hook: "Do not rush the set. Play a track until the hook brings the word back without effort, then move on.",
  },
  {
    number: "01",
    title: "Hvala",
    unlock: "hvala = thank you",
    detail: "Hvala sounds like 'voila'. Someone helps, the moment appears: voila, thank you, hvala.",
    hook: "Hvala at the start, voila in the middle, hvala at the end.",
  },
  {
    number: "02",
    title: "Molim",
    unlock: "molim = please / you're welcome",
    detail: "Molim sounds like 'moll him'. Imagine asking softly, not pushing: molim, please.",
    hook: "The polite little ask is molim.",
  },
  {
    number: "03",
    title: "Da",
    unlock: "da = yes",
    detail: "Da is short like a door opening: da, yes, go through.",
    hook: "Da is the open door.",
  },
  {
    number: "04",
    title: "Ne",
    unlock: "ne = no",
    detail: "Ne sounds like 'nay'. The horse says nay, the answer says no: ne.",
    hook: "Nay means no. Ne means no.",
  },
  {
    number: "05",
    title: "Voda",
    unlock: "voda = water",
    detail: "Voda sounds like 'water' beginning with a V. Visualise a V-shaped stream pouring water.",
    hook: "V-shaped water becomes voda.",
  },
  {
    number: "06",
    title: "Kruh",
    unlock: "kruh = bread",
    detail: "Kruh sounds like 'crust'. Bread has a crust; crust pulls you back to kruh.",
    hook: "Crust on bread, kruh for bread.",
  },
];

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
          <AppHeader title="Rthmix" titleIcon={<CassetteIcon />} />
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
        <AppHeader title="Rthmix" titleIcon={<CassetteIcon />} />
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

        <RthmixSection
          label="Memory Rthmixes"
          intro="Kept separate because these are retrieval chains: one memory hook per track, played in order until the word comes back automatically."
        >
          <div className="rounded-2xl border overflow-hidden" style={{ background: "rgba(139,92,246,0.06)", borderColor: "rgba(139,92,246,0.22)" }}>
            <div className="px-5 py-4 border-b" style={{ borderColor: "rgba(139,92,246,0.16)" }}>
              <p className="text-[10px] uppercase tracking-[0.28em]" style={{ color: "rgba(167,139,250,0.82)" }}>Prototype</p>
              <h2 className="text-lg font-light text-white/88 mt-1" style={{ fontFamily: "var(--font-display)" }}>
                Croatian Starter: 6 Words in 6 Rthms
              </h2>
              <p className="text-xs text-white/42 leading-relaxed mt-2">
                Ground zero plus six Memory Rthms. Each track installs one Croatian word using an explicit association hook.
              </p>
            </div>
            <div className="flex flex-col">
              {croatianMemoryRthmix.map((track) => (
                <MemoryTrack key={track.number} {...track} />
              ))}
            </div>
          </div>
        </RthmixSection>

        <RthmixSection
          label="Progression Rthmixes"
          intro="Goal-based albums where track zero explains the mission and each following track builds one conceptual unlock."
        >
          {progressionTracks.map((track) => (
            <RthmixAction key={track.title} {...track} />
          ))}
        </RthmixSection>
      </section>
    </main>
  );
}

function RthmixSection({ label, intro, children }: { label: string; intro: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 mt-2">
      <div>
        <p className="text-[10px] uppercase tracking-[0.28em] text-white/35">{label}</p>
        <p className="text-xs text-white/35 leading-relaxed mt-1">{intro}</p>
      </div>
      {children}
    </section>
  );
}

function MemoryTrack({ number, title, unlock, detail, hook }: {
  number: string;
  title: string;
  unlock: string;
  detail: string;
  hook: string;
}) {
  return (
    <div className="px-5 py-4 border-b last:border-b-0" style={{ borderColor: "rgba(139,92,246,0.13)" }}>
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] uppercase tracking-wider"
          style={{ background: "rgba(139,92,246,0.15)", color: "rgba(196,181,253,0.9)", border: "1px solid rgba(139,92,246,0.25)" }}
        >
          {number}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-white/78">{title}</p>
            <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: "rgba(139,92,246,0.12)", color: "rgba(196,181,253,0.72)" }}>Memory</span>
          </div>
          <p className="text-xs mt-1" style={{ color: "rgba(196,181,253,0.74)" }}>{unlock}</p>
          <p className="text-xs text-white/42 leading-relaxed mt-2">{detail}</p>
          <p className="text-[11px] text-white/32 leading-relaxed mt-2">{hook}</p>
        </div>
      </div>
    </div>
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
