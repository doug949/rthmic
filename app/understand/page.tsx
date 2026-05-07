"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSwipeNavigation } from "@/app/hooks/useSwipeBack";
import { TransitionLink } from "@/app/components/TransitionLink";
import { transitionTo } from "@/app/lib/pageTransition";

const panels = [
  {
    heading: "What",
    body: "Rthmic generates complete songs — built specifically to solve your immediate challenge in the moment.",
    detail: "Each song is called a Rthm. Not background music. A tool. Created for exactly what you're facing right now.",
  },
  {
    heading: "When",
    body: "Use it when you're stuck. Overwhelmed. Procrastinating. Frozen before a task.",
    detail: "The moment you notice resistance — that's when Rthmic works. You don't need to be ready. You just need to press play.",
  },
  {
    heading: "How",
    body: "Over time, you build a library. A toolkit of go-to tracks that work specifically for you, in specific moments.",
    detail: "Every Rthm you generate is saved. The more you use it, the more precisely your library fits your life.",
  },
];

export default function UnderstandPage() {
  const [active, setActive] = useState(0);
  const router = useRouter();
  const panel = panels[active];
  const isLast = active === panels.length - 1;

  const goBack = () => {
    if (active > 0) setActive((a) => a - 1);
    else transitionTo("/", router);
  };

  const onSwipeLeft = useCallback(() => {
    if (active < panels.length - 1) setActive((a) => a + 1);
  }, [active]);
  const onSwipeRight = useCallback(() => {
    if (active > 0) setActive((a) => a - 1);
    else transitionTo("/", router);
  }, [active, router]);

  useSwipeNavigation(onSwipeLeft, onSwipeRight);

  return (
    <main className="relative z-10 min-h-screen flex flex-col px-6 pt-safe" style={{ animation: "page-enter 380ms ease forwards" }}>
      {/* Nav */}
      <header className="flex items-center gap-4 pt-12 pb-8">
        <button
          onClick={goBack}
          className="text-white/30 hover:text-white/60 transition-colors text-sm tracking-widest uppercase touch-manipulation"
        >
          ← Back
        </button>
        <span className="text-white/15 text-sm uppercase tracking-widest ml-auto">
          About RTHMIC
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
        {isLast ? (
          <>
            <TransitionLink
              href="/"
              className="flex-1 py-4 rounded-2xl bg-white/[0.06] border border-white/[0.08] text-white/70 text-sm font-medium tracking-wide text-center active:scale-[0.98] transition-all touch-manipulation"
            >
              Home
            </TransitionLink>
            <TransitionLink
              href="/speak"
              className="flex-1 py-4 rounded-2xl text-sm font-semibold tracking-wide text-center active:scale-[0.98] transition-all touch-manipulation"
              style={{ background: "rgba(201,165,90,0.1)", border: "1px solid rgba(201,165,90,0.45)", color: "#c9a55a" }}
            >
              Start speaking
            </TransitionLink>
          </>
        ) : (
          <button
            onClick={() => setActive((a) => a + 1)}
            className="ml-auto py-4 px-8 rounded-2xl bg-white/[0.06] border border-white/[0.08] text-white/70 text-sm font-medium tracking-wide active:scale-[0.98] transition-transform touch-manipulation"
          >
            Next →
          </button>
        )}
      </footer>
    </main>
  );
}
