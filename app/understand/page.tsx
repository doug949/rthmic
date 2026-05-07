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
  const [active, setActive]         = useState(0);
  const [generation, setGeneration] = useState(0);
  const router = useRouter();
  const panel  = panels[active];
  const isLast = active === panels.length - 1;

  // Bump generation to force a fresh mount (and panel-enter animation) on each change
  const goTo = useCallback((index: number) => {
    if (index === active) return;
    setActive(index);
    setGeneration((g) => g + 1);
  }, [active]);

  const goBack = () => {
    if (active > 0) goTo(active - 1);
    else transitionTo("/", router);
  };

  const onSwipeLeft  = useCallback(() => {
    if (active < panels.length - 1) goTo(active + 1);
  }, [active, goTo]);
  const onSwipeRight = useCallback(() => {
    if (active > 0) goTo(active - 1);
    else transitionTo("/", router);
  }, [active, goTo, router]);

  useSwipeNavigation(onSwipeLeft, onSwipeRight);

  const canGoLeft  = active > 0;
  const canGoRight = active < panels.length - 1;

  return (
    <main className="relative z-10 min-h-screen flex flex-col px-6 pt-safe" style={{ animation: "page-enter 380ms ease forwards" }}>

      {/* Swipe edge indicators */}
      {canGoLeft && (
        <div className="fixed left-0 top-1/2 -translate-y-1/2 pointer-events-none" style={{ zIndex: 20 }}>
          <div style={{ background: "linear-gradient(to right, rgba(13,22,40,0.55) 0%, transparent 100%)", padding: "28px 20px 28px 8px" }}>
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "1.4rem" }}>‹</span>
          </div>
        </div>
      )}
      {canGoRight && (
        <div className="fixed right-0 top-1/2 -translate-y-1/2 pointer-events-none" style={{ zIndex: 20 }}>
          <div style={{ background: "linear-gradient(to left, rgba(13,22,40,0.55) 0%, transparent 100%)", padding: "28px 8px 28px 20px" }}>
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "1.4rem" }}>›</span>
          </div>
        </div>
      )}

      {/* Nav */}
      <header className="flex items-center gap-4 pt-12 pb-8">
        <button
          onClick={goBack}
          className="text-white/40 hover:text-white/70 transition-colors text-sm tracking-widest uppercase touch-manipulation"
        >
          ← Back
        </button>
        <span className="text-white/25 text-sm uppercase tracking-widest ml-auto">
          About RTHMIC
        </span>
      </header>

      {/* Panel content — key forces remount so panel-enter animation always fires */}
      <section className="flex-1 flex flex-col justify-center pb-8">
        <div key={generation} style={{ animation: "panel-enter 220ms ease both" }}>

          {/* Step dots */}
          <div className="flex gap-2 mb-10">
            {panels.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={`h-1 rounded-full transition-all duration-300 touch-manipulation ${
                  i === active ? "w-8 bg-white/70" : "w-4 bg-white/20"
                }`}
                aria-label={`Panel ${i + 1}`}
              />
            ))}
          </div>

          <p className="text-xs text-white/45 uppercase tracking-[0.3em] mb-5">{panel.heading}</p>
          <h2 className="text-2xl font-semibold text-white leading-snug mb-6">{panel.body}</h2>
          <p className="text-base leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>{panel.detail}</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="pb-10 flex gap-3">
        {isLast ? (
          <>
            <TransitionLink
              href="/"
              className="flex-1 py-4 rounded-2xl bg-white/[0.06] border border-white/[0.08] text-sm font-medium tracking-wide text-center active:scale-[0.98] transition-all touch-manipulation"
              style={{ color: "rgba(255,255,255,0.7)" }}
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
            onClick={() => goTo(active + 1)}
            className="ml-auto py-4 px-8 rounded-2xl bg-white/[0.06] border border-white/[0.08] text-sm font-medium tracking-wide active:scale-[0.98] transition-transform touch-manipulation"
            style={{ color: "rgba(255,255,255,0.7)" }}
          >
            Next →
          </button>
        )}
      </footer>
    </main>
  );
}
