"use client";

// Fixed ambient background — real vinyl photograph, slowly spinning.
// Photo sourced from Unsplash (free to use): top-down black vinyl record.
export function AmbientBackground() {
  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden select-none"
      aria-hidden
      style={{ zIndex: 0 }}
    >
      {/* ── Vinyl texture — full-bleed static, very restrained ──────────────── */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/vinyl.jpg"
        alt=""
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: 0.07,
          mixBlendMode: "luminosity",
        }}
      />

      {/* ── Edge vignette glow — very restrained ────────────────────────────── */}
      {/* Just a hint of blue at the top to ground the space */}
      <div
        style={{
          position: "absolute",
          width: "80vw",
          height: "40vw",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(20,70,160,0.18) 0%, transparent 75%)",
          top: "-18%",
          left: "10%",
          filter: "blur(30px)",
        }}
      />

      {/* Grain texture */}
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
