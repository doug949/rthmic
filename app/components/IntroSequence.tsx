"use client";

import { useEffect, useState } from "react";

const SEEN_KEY = "rthmic_intro_v4";
const FADE = 700;
const HOLD_LOGO = 900;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export default function IntroSequence() {
  const [gone, setGone] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(SEEN_KEY) === "1";
  });
  const [overlayOpacity, setOverlayOpacity] = useState(1);
  const [contentOpacity, setContentOpacity] = useState(0);
  const [showLogo, setShowLogo] = useState(false);

  const skip = () => {
    sessionStorage.setItem(SEEN_KEY, "1");
    setContentOpacity(0);
    setOverlayOpacity(0);
    setTimeout(() => {
      window.dispatchEvent(new Event("rthmic:intro-complete"));
      setGone(true);
    }, FADE + 50);
  };

  useEffect(() => {
    if (gone) return;

    let cancelled = false;

    const run = async () => {
      await sleep(80);
      if (cancelled) return;
      setShowLogo(true);
      await sleep(40);
      if (cancelled) return;
      setContentOpacity(1);
      await sleep(FADE + HOLD_LOGO);
      if (cancelled) return;
      setContentOpacity(0);
      await sleep(FADE + 80);
      if (cancelled) return;
      sessionStorage.setItem(SEEN_KEY, "1");
      setOverlayOpacity(0);
      await sleep(FADE + 50);
      if (cancelled) return;
      window.dispatchEvent(new Event("rthmic:intro-complete"));
      setGone(true);
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [gone]);

  if (gone) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-10"
      style={{
        background: "#050508",
        opacity: overlayOpacity,
        transition: `opacity ${FADE}ms ease-in-out`,
        willChange: "opacity",
      }}
    >
      <div
        style={{
          opacity: contentOpacity,
          transition: `opacity ${FADE}ms ease-in-out`,
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
        ) : null}
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
