"use client";

import { useEffect, useRef, useState } from "react";

const FADE_MS = 333; // 10 frames @ 30fps
// Bumped key version — invalidates any "seen" flag written by old broken builds
const SEEN_KEY = "rthmic_intro_v2";

type Phase = "fadein" | "playing" | "fadeout" | "gone";

export default function SplashScreen() {
  // "fadein" as initial state puts <video> in the DOM on render 1,
  // so videoRef.current is live by the time useEffect fires.
  const [phase, setPhase] = useState<Phase>("fadein");
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (sessionStorage.getItem(SEEN_KEY)) {
      setPhase("gone");
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    const startFadeIn = () => setTimeout(() => setPhase("playing"), FADE_MS);
    let fadeTimer: ReturnType<typeof setTimeout>;

    // Fade in once video has buffered enough to actually display a frame
    const onCanPlay = () => {
      video.play().catch(() => {});
      fadeTimer = startFadeIn();
    };

    if (video.readyState >= 3) {
      // Already buffered
      onCanPlay();
    } else {
      video.addEventListener("canplay", onCanPlay, { once: true });
      // Fallback: if canplay never fires (e.g. slow network), fade in anyway after 3s
      const fallback = setTimeout(onCanPlay, 3000);
      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(fallback);
        video.removeEventListener("canplay", onCanPlay);
      };
    }

    return () => clearTimeout(fadeTimer);
  }, []);

  const finish = () => {
    sessionStorage.setItem(SEEN_KEY, "1");
    setPhase("fadeout");
    setTimeout(() => setPhase("gone"), FADE_MS);
  };

  if (phase === "gone") return null;

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

      {/* Black overlay — fades out when video is ready, fades back in on end/skip */}
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
