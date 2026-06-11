"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { transitionTo } from "@/app/lib/pageTransition";

const messages = [
  {
    eyebrow: "A new kind of tool",
    heading: "A Rthm is a song generated on the RTHMIC platform.",
    body: "Your first Explain Rthm has started. It is being made specifically for what you asked RTHMIC to help you understand.",
  },
  {
    eyebrow: "Why it works",
    heading: "A Rthm uses music to bypass mental and emotional blocks.",
    body: "It can help unlock action, achievement, understanding, memory, regulation, and more — by giving the mind another route through.",
  },
  {
    eyebrow: "Begin with the experience",
    heading: "The best way to explain RTHMIC is with a Rthm.",
    body: "An Introducing RTHMIC track is waiting in the RTHMIC Catalog. Listen while your new Explain Rthm is created — generation usually takes 1–2 minutes.",
  },
];

export default function OnboardingCompletePage() {
  const [active, setActive] = useState(0);
  const router = useRouter();
  const message = messages[active];
  const last = active === messages.length - 1;

  return (
    <main className="relative z-10 min-h-screen flex flex-col px-7 pt-safe" style={{ animation: "page-enter 380ms ease forwards" }}>
      <section className="flex-1 flex flex-col justify-center pb-10">
        <div className="flex gap-2 mb-12" aria-label={`Step ${active + 1} of ${messages.length}`}>
          {messages.map((_, index) => (
            <span
              key={index}
              className="h-1 rounded-full transition-all duration-300"
              style={{
                width: index === active ? 34 : 16,
                background: index <= active ? "rgba(64,205,235,0.75)" : "rgba(255,255,255,0.14)",
              }}
            />
          ))}
        </div>

        <div key={active} style={{ animation: "panel-enter 260ms ease both" }}>
          <p className="text-[11px] uppercase tracking-[0.3em] mb-5" style={{ color: "rgba(64,205,235,0.72)" }}>{message.eyebrow}</p>
          <h1 className="text-3xl font-light text-white leading-tight" style={{ fontFamily: "var(--font-display)" }}>{message.heading}</h1>
          <p className="mt-7 text-base leading-relaxed text-white/55">{message.body}</p>
        </div>
      </section>

      <footer className="pb-12">
        <button
          type="button"
          onClick={() => last ? transitionTo("/", router) : setActive((value) => value + 1)}
          className="w-full py-5 rounded-2xl text-sm font-semibold tracking-wide active:scale-[0.98] transition-transform touch-manipulation"
          style={{
            color: "rgb(64,205,235)",
            background: "rgba(64,205,235,0.10)",
            border: "1px solid rgba(64,205,235,0.42)",
          }}
        >
          {last ? "Continue to Home →" : "Next →"}
        </button>
        {last && <p className="mt-4 text-center text-xs text-white/30">From Home, open Your Catalog → The RTHMIC Library → Explore.</p>}
      </footer>
    </main>
  );
}
