"use client";

import { useEffect, useState } from "react";

export default function SplashScreen() {
  const [phase, setPhase] = useState<"visible" | "fading" | "gone">("visible");

  useEffect(() => {
    const fadeTimer = setTimeout(() => setPhase("fading"), 1800);
    const goneTimer = setTimeout(() => setPhase("gone"), 2500);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(goneTimer);
    };
  }, []);

  if (phase === "gone") return null;

  return (
    <div
      className={`
        fixed inset-0 z-50 bg-[#0a0a0a]
        flex flex-col items-center justify-center
        transition-opacity duration-700 ease-in-out
        ${phase === "fading" ? "opacity-0" : "opacity-100"}
      `}
    >
      {/* Wordmark */}
      <div className="flex flex-col items-center gap-3 animate-fade-up">
        <h1 className="text-4xl font-semibold tracking-[0.35em] text-white/90 uppercase">
          RTHMIC
        </h1>
        <p className="text-[10px] tracking-[0.3em] text-white/30 uppercase">
          Music Based Productivity System
        </p>
      </div>

      {/* Waveform bars */}
      <div className="flex items-end gap-[5px] h-6 mt-10">
        {[0.3, 0.6, 1, 0.7, 0.4, 0.8, 0.5, 0.9, 0.6, 0.3].map((scale, i) => (
          <span
            key={i}
            className="w-[3px] rounded-full bg-white/20 animate-wave"
            style={{
              height: `${scale * 100}%`,
              animationDelay: `${i * 0.1}s`,
              animationDuration: `${0.8 + scale * 0.4}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
