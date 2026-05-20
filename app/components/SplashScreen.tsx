"use client";

// Intro splash — plays once per session (cleared when the PWA is killed and reopened).
//
// Flow:
//   prompt  → user sees RTHMIC logo + "tap to begin"
//   playing → video plays full-screen with audio; skip button visible
//   out     → fade to transparent (0.5s)
//   gone    → unmounts

import { useEffect, useRef, useState } from "react";

type Phase = "prompt" | "playing" | "out" | "gone";

export default function SplashScreen() {
  const [phase, setPhase] = useState<Phase | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // One play per session — sessionStorage is cleared when the PWA is killed
    if (sessionStorage.getItem("rthmic_intro_seen")) {
      setPhase("gone");
    } else {
      setPhase("prompt");
    }
  }, []);

  const startVideo = () => {
    setPhase("playing");
    const video = videoRef.current;
    if (!video) return;
    video.play().catch(() => {
      // Autoplay failed even after gesture — just skip to app
      finish();
    });
  };

  const finish = () => {
    sessionStorage.setItem("rthmic_intro_seen", "1");
    setPhase("out");
    setTimeout(() => setPhase("gone"), 500);
  };

  if (phase === null || phase === "gone") return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden"
      style={{
        background: "#050508",
        opacity: phase === "out" ? 0 : 1,
        transition: phase === "out" ? "opacity 0.5s ease-in-out" : "none",
      }}
    >
      {/* Hidden video — loaded during prompt phase so it's ready */}
      <video
        ref={videoRef}
        src="/intro.mp4"
        playsInline
        preload="auto"
        onEnded={finish}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ opacity: phase === "playing" ? 1 : 0, transition: "opacity 0.3s ease" }}
      />

      {/* Prompt overlay — tap anywhere to start */}
      {phase === "prompt" && (
        <button
          onClick={startVideo}
          className="absolute inset-0 flex flex-col items-center justify-center gap-4 touch-manipulation"
          aria-label="Tap to begin"
        >
          {/* RTHMIC wordmark */}
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "2rem",
              letterSpacing: "0.4em",
              fontWeight: 300,
              color: "#c9a55a",
            }}
          >
            RTHMIC
          </h1>
          <span
            style={{
              fontSize: "0.55rem",
              letterSpacing: "0.25em",
              textTransform: "uppercase",
              color: "#c9a55a",
              opacity: 0.35,
            }}
          >
            beta
          </span>
          {/* Tap prompt — pulses gently */}
          <p
            className="absolute bottom-16 text-[10px] uppercase tracking-[0.3em] animate-pulse"
            style={{ color: "rgba(255,255,255,0.3)" }}
          >
            tap to begin
          </p>
        </button>
      )}

      {/* Skip button — visible during playback */}
      {phase === "playing" && (
        <button
          onClick={finish}
          className="absolute top-safe right-5 touch-manipulation z-10 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest"
          style={{
            marginTop: "max(env(safe-area-inset-top), 16px)",
            background: "rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.4)",
          }}
        >
          Skip
        </button>
      )}
    </div>
  );
}
