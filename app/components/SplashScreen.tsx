"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

type Phase = "blank" | "line" | "waveform" | "logo" | "title" | "tagline" | "hold" | "fading" | "gone";

const TAGLINE = ["MUSIC", "BASED", "PRODUCTIVITY", "SYSTEM"];

const BARS = [0.25, 0.5, 0.8, 0.6, 1, 0.7, 0.45, 0.9, 0.55, 0.75, 0.4, 0.85, 0.6, 0.35, 0.7];

function after(phase: Phase, phases: Phase[]): boolean {
  const order: Phase[] = ["blank","line","waveform","logo","title","tagline","hold","fading","gone"];
  return phases.some(p => order.indexOf(phase) >= order.indexOf(p));
}

export default function SplashScreen() {
  const [phase, setPhase] = useState<Phase>("blank");

  useEffect(() => {
    const timings: [Phase, number][] = [
      ["line",    500],
      ["waveform",1300],
      ["logo",    2200],
      ["title",   3300],
      ["tagline", 4200],
      ["hold",    5000],
      ["fading",  6800],
      ["gone",    7700],
    ];
    const timers = timings.map(([p, t]) => setTimeout(() => setPhase(p), t));
    return () => timers.forEach(clearTimeout);
  }, []);

  if (phase === "gone") return null;

  const showLine     = after(phase, ["line"]);
  const showWaveform = after(phase, ["waveform"]);
  const showLogo     = after(phase, ["logo"]);
  const showTitle    = after(phase, ["title"]);
  const showTagline  = after(phase, ["tagline"]);
  const isFading     = after(phase, ["fading"]);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center transition-opacity duration-800 ease-in-out ${isFading ? "opacity-0" : "opacity-100"}`}
      style={{ backgroundColor: "#131420" }}
    >
      {/* ── Waveform + line ───────────────────────────────── */}
      <div className="relative flex items-center justify-center w-64 h-16 mb-6">

        {/* Horizontal line — expands from centre */}
        <div
          className="absolute inset-x-0 h-px transition-all duration-700 ease-out"
          style={{
            top: "50%",
            backgroundColor: "rgba(201,168,76,0.35)",
            transform: `scaleX(${showLine ? 1 : 0})`,
            transformOrigin: "center",
          }}
        />

        {/* Bars — grow up from the line */}
        <div className="relative flex items-center gap-[4px] h-full">
          {BARS.map((scale, i) => (
            <div
              key={i}
              className="w-[3px] rounded-full transition-all ease-out"
              style={{
                height: showWaveform ? `${scale * 100}%` : "1px",
                transitionDuration: showWaveform ? `${400 + i * 30}ms` : "300ms",
                transitionDelay: showWaveform ? `${i * 40}ms` : "0ms",
                backgroundColor: "rgba(201,168,76,0.7)",
                animation: showWaveform ? `wave ${0.8 + scale * 0.6}s ease-in-out infinite` : "none",
                animationDelay: `${i * 0.1}s`,
              }}
            />
          ))}
        </div>
      </div>

      {/* ── Logo ──────────────────────────────────────────── */}
      <div
        className="transition-all duration-1000 ease-out mb-7"
        style={{
          opacity: showLogo ? 1 : 0,
          filter: showLogo ? "blur(0px)" : "blur(16px)",
          transform: showLogo ? "scale(1)" : "scale(0.92)",
        }}
      >
        <Image
          src="/apple-touch-icon.png"
          alt="RTHMIC"
          width={160}
          height={160}
          priority
          className="rounded-[2rem]"
        />
      </div>

      {/* ── RTHMIC wordmark — letter-spacing reveal ───────── */}
      <div
        className="transition-all duration-700 ease-out"
        style={{
          opacity: showTitle ? 1 : 0,
          letterSpacing: showTitle ? "0.35em" : "0.8em",
          transform: showTitle ? "translateY(0)" : "translateY(6px)",
        }}
      >
        <h1 className="text-3xl font-semibold text-white/90 uppercase">
          RTHMIC
        </h1>
      </div>

      {/* ── Tagline — words stagger in ────────────────────── */}
      <div className="flex gap-2 mt-2">
        {TAGLINE.map((word, i) => (
          <span
            key={word}
            className="text-[9px] tracking-[0.25em] uppercase transition-all duration-500 ease-out"
            style={{
              color: "#c9a84c",
              opacity: showTagline ? 0.7 : 0,
              transform: showTagline ? "translateY(0)" : "translateY(4px)",
              transitionDelay: `${i * 120}ms`,
            }}
          >
            {word}
          </span>
        ))}
      </div>
    </div>
  );
}
