"use client";

import { useEffect, useRef, useState } from "react";

export default function SplashScreen() {
  const [phase, setPhase] = useState<"visible" | "fading" | "gone">("visible");
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setPhase("fading"), 7500);
    const goneTimer = setTimeout(() => setPhase("gone"),   8400);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(goneTimer);
    };
  }, []);

  // Play as soon as component mounts (required on iOS)
  useEffect(() => {
    videoRef.current?.play().catch(() => {
      // If autoplay fails (e.g. power-save mode), just skip ahead
      setPhase("fading");
    });
  }, []);

  if (phase === "gone") return null;

  return (
    <div
      className={`
        fixed inset-0 z-50 bg-[#131420]
        transition-opacity duration-700 ease-in-out
        ${phase === "fading" ? "opacity-0" : "opacity-100"}
      `}
    >
      <video
        ref={videoRef}
        src="/splash.mp4"
        muted
        playsInline
        preload="auto"
        className="absolute inset-0 w-full h-full object-cover"
      />
    </div>
  );
}
