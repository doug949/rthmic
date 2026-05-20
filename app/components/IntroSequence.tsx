"use client";

import { useEffect, useState } from "react";

const SEEN_KEY = "rthmic_intro_v3";
const FADE_IN  = 600;  // ms
const HOLD     = 1600; // ms per quote
const FADE_OUT = 400;  // ms

const ITEMS = [
  { type: "quote", text: "Music is the greatest operating system evolution ever built." },
  { type: "quote", text: "An entirely new category of productivity system" },
  { type: "quote", text: "Get on Track, Stay on Track" },
  { type: "logo" },
] as const;

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export default function IntroSequence() {
  const [gone, setGone]       = useState(false);
  const [idx, setIdx]         = useState(0);
  const [visible, setVisible] = useState(false);

  const skip = () => {
    sessionStorage.setItem(SEEN_KEY, "1");
    setGone(true);
  };

  useEffect(() => {
    if (sessionStorage.getItem(SEEN_KEY)) {
      setGone(true);
      return;
    }

    let cancelled = false;

    const run = async () => {
      for (let i = 0; i < ITEMS.length; i++) {
        if (cancelled) return;
        setIdx(i);
        await sleep(60); // let DOM settle before fading in
        if (cancelled) return;
        setVisible(true);
        const hold = ITEMS[i].type === "logo" ? HOLD + 800 : HOLD;
        await sleep(FADE_IN + hold);
        if (cancelled) return;
        setVisible(false);
        await sleep(FADE_OUT + 80);
        if (cancelled) return;
      }
      sessionStorage.setItem(SEEN_KEY, "1");
      setGone(true);
    };

    run();
    return () => { cancelled = true; };
  }, []);

  if (gone) return null;

  const item = ITEMS[idx];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-10"
      style={{ background: "#050508" }}
    >
      <div
        style={{
          opacity: visible ? 1 : 0,
          transition: `opacity ${visible ? FADE_IN : FADE_OUT}ms ease-in-out`,
          textAlign: "center",
          maxWidth: 300,
        }}
      >
        {item.type === "logo" ? (
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
              color: "rgba(255,255,255,0.72)",
              fontSize: "1.05rem",
              lineHeight: 1.75,
              letterSpacing: "0.01em",
            }}
          >
            {item.text}
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
