"use client";

import { usePillarTheme } from "@/app/contexts/PillarThemeContext";
import { NeuralCanvas } from "@/app/components/NeuralCanvas";
import type { CSSProperties } from "react";


// ─── Per-pillar tint colors (R,G,B) ─────────────────────────────────────────

const TINT: Record<string, string> = {
  booksummary:   "202,178,128",
  journal:       "226,206,162",
  memory:        "210,148,60",
  mindset:       "90,110,140",
  mode:          "76,136,255",
  movement:      "228,106,48",
  epiphany:      "218,182,40",
  explain:       "98,138,228",
  bridge:        "180,160,140",
  invite:        "218,185,120",
  understanding: "100,85,140",
  menus:         "118,152,208",
};

const DEFAULT_TINT = "0,0,0";

// ─── Component ───────────────────────────────────────────────────────────────

export function AmbientBackground() {
  const { activePillar } = usePillarTheme();
  const key = (activePillar ?? "").toLowerCase();
  const tint = TINT[key] ?? DEFAULT_TINT;
  const isDefault = !key || !TINT[key];

  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden select-none"
      aria-hidden
      style={{ zIndex: 0 }}
    >
      {/* Solid base — matches html/body bg so no flash */}
      <div style={{ position: "absolute", inset: 0, background: "#0d1628" }} />

      {/* Animated gradient mesh blobs */}
      <div style={{ position: "absolute", inset: "-20%", willChange: "transform" }}>
        {/* Top-left — deep teal */}
        <div style={{
          position: "absolute",
          top: "5%", left: "10%",
          width: "55%", height: "55%",
          borderRadius: "50%",
          background: "radial-gradient(ellipse at center, rgba(10,20,50,0.7) 0%, transparent 70%)",
          filter: "blur(48px)",
          animation: "mesh-blob-1 22s ease-in-out infinite alternate",
          willChange: "transform",
        }} />
        {/* Bottom-right — bioluminescent cyan */}
        <div style={{
          position: "absolute",
          top: "40%", left: "50%",
          width: "60%", height: "60%",
          borderRadius: "50%",
          background: "radial-gradient(ellipse at center, rgba(15,25,55,0.65) 0%, transparent 70%)",
          filter: "blur(56px)",
          animation: "mesh-blob-2 28s ease-in-out infinite alternate",
          willChange: "transform",
        }} />
        {/* Top-right — deep emerald */}
        <div style={{
          position: "absolute",
          top: "0%", left: "55%",
          width: "50%", height: "50%",
          borderRadius: "50%",
          background: "radial-gradient(ellipse at center, rgba(20,15,45,0.6) 0%, transparent 70%)",
          filter: "blur(52px)",
          animation: "mesh-blob-3 18s ease-in-out infinite alternate",
          willChange: "transform",
        }} />
        {/* Bottom-left — violet-teal */}
        <div style={{
          position: "absolute",
          top: "55%", left: "5%",
          width: "45%", height: "45%",
          borderRadius: "50%",
          background: "radial-gradient(ellipse at center, rgba(30,20,80,0.45) 0%, transparent 70%)",
          filter: "blur(44px)",
          animation: "mesh-blob-4 34s ease-in-out infinite alternate",
          willChange: "transform",
        }} />
      </div>

      {/* Dark scrim to unify depth */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)" }} />

      {/* Neural / molecular network — mind chemistry */}
      <NeuralCanvas />

      {/* Photographic pillar texture */}
      {!isDefault && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={key}
          src={`/textures/${key}.webp`}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: 0,
            "--ambient-opacity": 0.085,
            mixBlendMode: "luminosity",
            animation: "ambient-fade-in 1.4s ease forwards",
          } as CSSProperties}
        />
      )}

      {/* Per-pillar tint glow — only shown when a pillar is active */}
      {!isDefault && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(ellipse 95% 52% at 50% 0%, rgba(${tint},0.15) 0%, transparent 100%)`,
            transition: "background 1.2s ease",
          }}
        />
      )}

      {/* Grain — always on */}
      <svg
        className="absolute inset-0 w-full h-full"
        style={{ opacity: 0.04, mixBlendMode: "overlay" }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <filter id="rthmic-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.68"
            numOctaves="4"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#rthmic-grain)" />
      </svg>
    </div>
  );
}
