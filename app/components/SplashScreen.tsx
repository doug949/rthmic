"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

export default function SplashScreen() {
  const [phase, setPhase] = useState<"entering" | "visible" | "fading" | "gone">("entering");

  useEffect(() => {
    const enterTimer  = setTimeout(() => setPhase("visible"), 100);
    const fadeTimer   = setTimeout(() => setPhase("fading"),  3200);
    const goneTimer   = setTimeout(() => setPhase("gone"),    4000);
    return () => {
      clearTimeout(enterTimer);
      clearTimeout(fadeTimer);
      clearTimeout(goneTimer);
    };
  }, []);

  if (phase === "gone") return null;

  return (
    <div
      className={`
        fixed inset-0 z-50
        flex flex-col items-center justify-center
        transition-opacity duration-700 ease-in-out
        ${phase === "fading" ? "opacity-0" : phase === "entering" ? "opacity-0" : "opacity-100"}
      `}
      style={{ backgroundColor: "#131420" }}
    >
      {/* Logo image */}
      <div
        className={`
          transition-all duration-1000 ease-out
          ${phase === "entering" ? "opacity-0 scale-95" : "opacity-100 scale-100"}
        `}
      >
        <Image
          src="/apple-touch-icon.png"
          alt="RTHMIC"
          width={200}
          height={200}
          priority
          className="rounded-3xl"
        />
      </div>

      {/* Waveform bars — fade in slightly after logo */}
      <div
        className={`
          flex items-end gap-[5px] h-5 mt-8
          transition-opacity duration-1000 delay-300
          ${phase === "entering" ? "opacity-0" : "opacity-100"}
        `}
      >
        {[0.4, 0.7, 1, 0.6, 0.9, 0.5, 0.8, 0.4, 0.7, 0.5].map((scale, i) => (
          <span
            key={i}
            className="w-[3px] rounded-full animate-wave"
            style={{
              height: `${scale * 100}%`,
              backgroundColor: "#c9a84c",
              opacity: 0.6,
              animationDelay: `${i * 0.1}s`,
              animationDuration: `${0.8 + scale * 0.5}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
