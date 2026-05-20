"use client";

import { useEffect, useRef, useState } from "react";

// 10 frames at 30fps ≈ 333ms
const FADE_MS = 333;

type Phase = "fadein" | "playing" | "fadeout" | "gone";

export default function SplashScreen() {
  const [phase, setPhase] = useState<Phase | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (sessionStorage.getItem("rthmic_intro_seen")) {
      setPhase("gone");
      return;
    }
    // Mount the video first (phase="fadein"), then play + reveal it
    setPhase("fadein");
  }, []);

  // Once the video element is in the DOM, start playing and fade in
  useEffect(() => {
    if (phase !== "fadein") return;
    videoRef.current?.play().catch(() => finish());
    const t = setTimeout(() => setPhase("playing"), FADE_MS);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const finish = () => {
    sessionStorage.setItem("rthmic_intro_seen", "1");
    setPhase("fadeout");
    setTimeout(() => setPhase("gone"), FADE_MS);
  };

  if (phase === null || phase === "gone") return null;

  // Black overlay: opaque during fadein/fadeout, transparent while playing
  const overlayOpaque = phase === "fadein" || phase === "fadeout";

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden" style={{ background: "#050508" }}>
      <video
        ref={videoRef}
        src="/intro.mp4"
        playsInline
        muted
        preload="auto"
        onEnded={finish}
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Fade overlay — black in, transparent during play, black out */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "#050508",
          opacity: overlayOpaque ? 1 : 0,
          transition: `opacity ${FADE_MS}ms ease-in-out`,
        }}
      />

      <button
        onClick={finish}
        className="absolute right-5 touch-manipulation z-10 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest"
        style={{
          top: "max(env(safe-area-inset-top), 16px)",
          background: "rgba(255,255,255,0.08)",
          color: "rgba(255,255,255,0.4)",
        }}
      >
        Skip
      </button>
    </div>
  );
}
