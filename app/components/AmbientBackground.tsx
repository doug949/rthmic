"use client";

import { usePillarTheme } from "@/app/contexts/PillarThemeContext";

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

const DEFAULT_TINT = "20,70,160";

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
      {/* Background texture — default state only */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/bg.jpg"
        alt=""
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: isDefault ? 0.07 : 0,
          transition: "opacity 1.1s ease",
          mixBlendMode: "luminosity",
        }}
      />

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
            opacity: 0.085,
            mixBlendMode: "luminosity",
            animation: "ambient-fade-in 1.4s ease forwards",
          }}
        />
      )}

      {/* Per-pillar tint glow */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse 95% 52% at 50% 0%, rgba(${tint},0.15) 0%, transparent 100%)`,
          transition: "background 1.2s ease",
        }}
      />

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
