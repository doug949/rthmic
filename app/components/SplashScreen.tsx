"use client";

import { useEffect, useRef, useState } from "react";

type Phase = "playing" | "out" | "gone";

export default function SplashScreen() {
  const [phase, setPhase] = useState<Phase | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (sessionStorage.getItem("rthmic_intro_seen")) {
      setPhase("gone");
      return;
    }
    setPhase("playing");
    videoRef.current?.play().catch(() => finish());
  }, []);

  const finish = () => {
    sessionStorage.setItem("rthmic_intro_seen", "1");
    setPhase("out");
    setTimeout(() => setPhase("gone"), 500);
  };

  if (phase === null || phase === "gone") return null;

  return (
    <div
      className="fixed inset-0 z-[100] overflow-hidden"
      style={{
        background: "#050508",
        opacity: phase === "out" ? 0 : 1,
        transition: phase === "out" ? "opacity 0.5s ease-in-out" : "none",
      }}
    >
      <video
        ref={videoRef}
        src="/intro.mp4"
        playsInline
        muted
        preload="auto"
        onEnded={finish}
        className="absolute inset-0 w-full h-full object-cover"
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
