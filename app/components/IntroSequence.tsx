"use client";

import { useEffect, useState } from "react";

const SEEN_KEY  = "rthmic_intro_v4";
const FADE      = 700;   // ms — consistent in/out, no duration-switch glitch
const QUOTE_CONTAINER_FADE = 1800;
const HOLD_Q    = 6000;  // ms quote hold
const HOLD_LOGO = 1600;  // ms logo hold
const QUOTE_WORD_FADE = 2100;
const QUOTE_WORD_STAGGER = 320;

const QUOTES = [
  "Music is the greatest operating system evolution ever built.",
  "An entirely new category of productivity system",
  "Get on Track, Stay on Track",
];

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export default function IntroSequence() {
  const [gone,             setGone]             = useState(false);
  const [overlayOpacity,   setOverlayOpacity]   = useState(1);
  const [contentOpacity,   setContentOpacity]   = useState(0);
  const [showLogo,         setShowLogo]         = useState(false);

  // Deterministic for SSR/hydration; randomized after mount before it fades in.
  const [quote, setQuote] = useState(QUOTES[0]);

  const skip = () => {
    sessionStorage.setItem(SEEN_KEY, "1");
    setContentOpacity(0);
    setOverlayOpacity(0);
    setTimeout(() => setGone(true), FADE + 50);
  };

  useEffect(() => {
    if (sessionStorage.getItem(SEEN_KEY)) {
      setGone(true);
      return;
    }

    let cancelled = false;

    const run = async () => {
      const pickedQuote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
      const quoteWordCount = pickedQuote.split(/\s+/).length;
      setQuote(pickedQuote);

      // ── Quote ──────────────────────────────────────────────────
      await sleep(80);
      if (cancelled) return;
      setContentOpacity(1);
      await sleep(QUOTE_WORD_FADE + quoteWordCount * QUOTE_WORD_STAGGER + HOLD_Q);
      if (cancelled) return;
      setContentOpacity(0);
      await sleep(FADE + 120);

      // ── Logo ───────────────────────────────────────────────────
      if (cancelled) return;
      setShowLogo(true);
      await sleep(40); // let DOM swap render before fading in
      if (cancelled) return;
      setContentOpacity(1);
      await sleep(FADE + HOLD_LOGO);
      if (cancelled) return;
      setContentOpacity(0);
      await sleep(FADE + 80);

      // ── Fade overlay out → reveal main menu ───────────────────
      if (cancelled) return;
      sessionStorage.setItem(SEEN_KEY, "1");
      setOverlayOpacity(0);
      await sleep(FADE + 50);
      if (cancelled) return;
      setGone(true);
    };

    run();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (gone) return null;

  const quoteWords = quote.split(" ");

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-10"
      style={{
        background: "#050508",
        opacity: overlayOpacity,
        transition: `opacity ${FADE}ms ease-in-out`,
        // GPU-composite the overlay so opacity never triggers re-rasterisation
        willChange: "opacity",
      }}
    >
      <div
        style={{
          opacity: contentOpacity,
          transition: `opacity ${showLogo ? FADE : QUOTE_CONTAINER_FADE}ms ease-in-out`,
          willChange: "opacity",
          textAlign: "center",
          maxWidth: 300,
        }}
      >
        {showLogo ? (
          <div>
            <p
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 300,
                color: "#c9a55a",
                fontSize: "2rem",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
              }}
            >
              RTHMIC
            </p>
            <p
              style={{
                color: "rgba(201,165,90,0.45)",
                fontSize: "0.6rem",
                letterSpacing: "0.28em",
                marginTop: "0.5rem",
                textTransform: "uppercase",
              }}
            >
              beta
            </p>
          </div>
        ) : (
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 300,
              color: "rgba(255,255,255,0.75)",
              fontSize: "1.05rem",
              lineHeight: 1.75,
              letterSpacing: "0.01em",
            }}
          >
            {quoteWords.map((word, index) => (
              <span
                key={`${quote}-${index}`}
                style={{
                  display: "inline-block",
                  opacity: 0,
                  animation: `quote-word-in ${QUOTE_WORD_FADE}ms cubic-bezier(0.22,1,0.36,1) ${index * QUOTE_WORD_STAGGER}ms forwards`,
                }}
              >
                {word}{index < quoteWords.length - 1 ? "\u00A0" : ""}
              </span>
            ))}
          </p>
        )}
      </div>

      <button
        onClick={skip}
        className="touch-manipulation"
        style={{
          position: "absolute",
          top: "max(env(safe-area-inset-top, 0px), 16px)",
          right: "1.25rem",
          background: "rgba(255,255,255,0.07)",
          color: "rgba(255,255,255,0.35)",
          border: "none",
          borderRadius: 999,
          padding: "6px 12px",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          cursor: "pointer",
        }}
      >
        Skip
      </button>
    </div>
  );
}
