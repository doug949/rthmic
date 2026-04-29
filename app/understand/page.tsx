"use client";

import Link from "next/link";
import { useState } from "react";

const panels = [
  {
    heading: "What",
    body: "RTHMIC is a rhythm-based action system. Short audio tracks designed to move you — physically, mentally, emotionally.",
    detail: "Each track is called a RTHM. They're not music for the background. They're tools for doing.",
  },
  {
    heading: "When",
    body: "Use it when you're stuck. Overwhelmed. Procrastinating. Frozen before a task.",
    detail: "The moment you notice resistance — that's when RTHMIC works. You don't need to be ready. You just need to press play.",
  },
  {
    heading: "How",
    body: "Press play. Follow the rhythm. Let your state shift.",
    detail: "No setup. No decisions. One tap is enough. The RTHM does the rest.",
  },
];

export default function UnderstandPage() {
  const [active, setActive] = useState(0);
  const panel = panels[active];

  return (
    <main className="min-h-screen bg-[#0a0a0a] flex flex-col px-6 pt-safe">
      {/* Nav */}
      <header className="flex items-center gap-4 pt-12 pb-8">
        <Link
          href="/"
          className="text-white/30 hover:text-white/60 transition-colors text-sm tracking-widest uppercase"
        >
          ← Back
        </Link>
        <span className="text-white/15 text-sm uppercase tracking-widest ml-auto">
          Understand
        </span>
      </header>

      {/* Panel content */}
      <section className="flex-1 flex flex-col justify-center pb-8">
        <div key={active} className="animate-fade-up">
          {/* Step indicator */}
          <div className="flex gap-2 mb-10">
            {panels.map((_, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                className={`h-1 rounded-full transition-all duration-300 touch-manipulation ${
                  i === active ? "w-8 bg-white/70" : "w-4 bg-white/15"
                }`}
                aria-label={`Panel ${i + 1}`}
              />
            ))}
          </div>

          <p className="text-xs text-white/30 uppercase tracking-[0.3em] mb-5">
            {panel.heading}
          </p>
          <h2 className="text-2xl font-semibold text-white leading-snug mb-6">
            {panel.body}
          </h2>
          <p className="text-base text-white/45 leading-relaxed">{panel.detail}</p>
        </div>
      </section>

      {/* Navigation buttons */}
      <footer className="pb-10 flex gap-3">
        {active < panels.length - 1 ? (
          <button
            onClick={() => setActive((a) => a + 1)}
            className="flex-1 py-4 rounded-2xl bg-white/[0.06] border border-white/[0.08] text-white/70 text-sm font-medium tracking-wide active:scale-[0.98] transition-transform touch-manipulation"
          >
            Next
          </button>
        ) : null}

        <Link
          href="/unlock"
          className="flex-1 py-4 rounded-2xl bg-white/10 border border-white/20 text-white text-sm font-semibold tracking-wide text-center active:scale-[0.98] transition-transform touch-manipulation"
        >
          Unlock now
        </Link>

        {active === panels.length - 1 && (
          <Link
            href="/explore"
            className="flex-1 py-4 rounded-2xl bg-white/[0.06] border border-white/[0.08] text-white/70 text-sm font-medium tracking-wide text-center active:scale-[0.98] transition-transform touch-manipulation"
          >
            Explore
          </Link>
        )}
      </footer>
    </main>
  );
}
