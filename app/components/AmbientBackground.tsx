"use client";

import { usePillarTheme } from "@/app/contexts/PillarThemeContext";

// ─── Per-pillar tint (R,G,B) ──────────────────────────────────────────────────

const TINT: Record<string, string> = {
  booksummary:   "202,178,128",
  journal:       "226,206,162",
  memory:        "210,148,60",
  mindset:       "58,192,172",
  mode:          "76,136,255",
  movement:      "228,106,48",
  epiphany:      "218,182,40",
  explain:       "98,138,228",
  bridge:        "208,96,128",
  invite:        "198,152,68",
  understanding: "126,86,218",
  menus:         "118,152,208",
};

const DEFAULT_TINT = "20,70,160";

// ─── SVG textures — pure geometry, no external images ────────────────────────
// All rendered into a viewBox="0 0 390 844" SVG (standard iPhone viewport).

function BookSummaryTexture() {
  // Simulated printed-text lines — typography on a page
  return (
    <>
      <defs>
        <pattern id="t-bs" x="20" y="38" width="300" height="58" patternUnits="userSpaceOnUse">
          <rect x="0"   y="6"  width="280" height="1.3" fill="white" />
          <rect x="0"   y="14" width="255" height="1.3" fill="white" />
          <rect x="0"   y="22" width="272" height="1.3" fill="white" />
          <rect x="0"   y="30" width="185" height="1.3" fill="white" />
          {/* y=38–58: paragraph gap */}
        </pattern>
      </defs>
      <rect width="390" height="844" fill="url(#t-bs)" />
    </>
  );
}

function JournalTexture() {
  // Ruled notebook lines with a left margin
  return (
    <>
      <defs>
        <pattern id="t-jn" x="0" y="0" width="390" height="26" patternUnits="userSpaceOnUse">
          <rect x="0" y="25.2" width="390" height="0.75" fill="white" />
        </pattern>
      </defs>
      <rect width="390" height="844" fill="url(#t-jn)" />
      {/* Left margin */}
      <rect x="58" y="0" width="0.8" height="844" fill="white" opacity="0.45" />
    </>
  );
}

function MemoryTexture() {
  // Concentric rings — layers of recall radiating outward
  const cx = 195, cy = 340;
  const radii = [70, 140, 215, 295, 380, 470];
  return (
    <g fill="none" stroke="white">
      {radii.map((r, i) => (
        <circle
          key={r}
          cx={cx} cy={cy} r={r}
          strokeWidth={i === 0 ? 1 : 0.75}
          opacity={1 - i * 0.12}
        />
      ))}
    </g>
  );
}

function MindsetTexture() {
  // Ascending diagonal lines — forward trajectory
  return (
    <>
      <defs>
        <pattern id="t-ms" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse"
          patternTransform="rotate(32)">
          <rect x="0" y="13.5" width="28" height="0.9" fill="white" />
        </pattern>
      </defs>
      <rect width="390" height="844" fill="url(#t-ms)" />
    </>
  );
}

function ModeTexture() {
  // Horizontal sine-wave bands — tuning / frequency
  const lines: string[] = [];
  for (let i = 0; i < 11; i++) {
    const y = 50 + i * 74;
    const a = 10 + (i % 3) * 4;
    lines.push(
      `M 0,${y} Q 30,${y - a} 60,${y} Q 90,${y + a} 120,${y}` +
      ` Q 150,${y - a} 180,${y} Q 210,${y + a} 240,${y}` +
      ` Q 270,${y - a} 300,${y} Q 330,${y + a} 360,${y}` +
      ` Q 375,${y - a} 390,${y}`
    );
  }
  return (
    <g fill="none" stroke="white" strokeWidth="0.85">
      {lines.map((d, i) => <path key={i} d={d} />)}
    </g>
  );
}

function MovementTexture() {
  // Grid of diagonal velocity marks — kinetic energy
  return (
    <>
      <defs>
        <pattern id="t-mv" x="6" y="6" width="34" height="34" patternUnits="userSpaceOnUse">
          <line x1="7" y1="24" x2="24" y2="7" stroke="white" strokeWidth="1.1" strokeLinecap="round" />
        </pattern>
      </defs>
      <rect width="390" height="844" fill="url(#t-mv)" />
    </>
  );
}

function EpiphanyTexture() {
  // Radial burst — lines from a single illuminated point
  const cx = 195, cy = 240;
  const count = 20;
  return (
    <g stroke="white" strokeWidth="0.65">
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2;
        const len = 620;
        return (
          <line
            key={i}
            x1={cx} y1={cy}
            x2={cx + Math.cos(angle) * len}
            y2={cy + Math.sin(angle) * len}
          />
        );
      })}
    </g>
  );
}

function ExplainTexture() {
  // Regular dot matrix — precision, clarity, structure
  return (
    <>
      <defs>
        <pattern id="t-ex" x="0" y="0" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="11" cy="11" r="1.1" fill="white" />
        </pattern>
      </defs>
      <rect width="390" height="844" fill="url(#t-ex)" />
    </>
  );
}

function BridgeTexture() {
  // Concentric arcs — connection, reach, bridge span
  const cx = 195, cy = 1460;
  const radii = [580, 720, 865, 1010];
  return (
    <g fill="none" stroke="white">
      {radii.map((r, i) => (
        <circle key={r} cx={cx} cy={cy} r={r} strokeWidth={0.85} opacity={1 - i * 0.15} />
      ))}
    </g>
  );
}

function InviteTexture() {
  // Expanding ripple arcs opening upward — an invitation spreading out
  const cx = 195, cy = 1020;
  const radii = [180, 320, 465, 615, 770];
  return (
    <g fill="none" stroke="white">
      {radii.map((r, i) => (
        <circle key={r} cx={cx} cy={cy} r={r} strokeWidth={0.85} opacity={1 - i * 0.13} />
      ))}
    </g>
  );
}

function UnderstandingTexture() {
  // Overlapping ring sets from offset centers — layers of depth
  const sets = [
    { cx: 195, cy: 340, radii: [90, 180, 270, 360] },
    { cx: 250, cy: 480, radii: [70, 150, 230] },
    { cx: 140, cy: 430, radii: [55, 125, 200] },
  ];
  return (
    <g fill="none" stroke="white" strokeWidth="0.7">
      {sets.map((s, si) =>
        s.radii.map((r, ri) => (
          <circle key={`${si}-${ri}`} cx={s.cx} cy={s.cy} r={r} opacity={0.9 - ri * 0.18} />
        ))
      )}
    </g>
  );
}

function MenusTexture() {
  // Fine structural grid — order, organisation
  return (
    <>
      <defs>
        <pattern id="t-mn" x="0" y="0" width="42" height="42" patternUnits="userSpaceOnUse">
          <rect x="0" y="0" width="42" height="0.7" fill="white" />
          <rect x="0" y="0" width="0.7" height="42" fill="white" />
        </pattern>
      </defs>
      <rect width="390" height="844" fill="url(#t-mn)" />
    </>
  );
}

function PillarTexture({ pillar }: { pillar: string }) {
  switch (pillar) {
    case "booksummary":   return <BookSummaryTexture />;
    case "journal":       return <JournalTexture />;
    case "memory":        return <MemoryTexture />;
    case "mindset":       return <MindsetTexture />;
    case "mode":          return <ModeTexture />;
    case "movement":      return <MovementTexture />;
    case "epiphany":      return <EpiphanyTexture />;
    case "explain":       return <ExplainTexture />;
    case "bridge":        return <BridgeTexture />;
    case "invite":        return <InviteTexture />;
    case "understanding": return <UnderstandingTexture />;
    case "menus":         return <MenusTexture />;
    default:              return null;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

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
      {/* Vinyl — shown only on default (no pillar selected) */}
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
          opacity: isDefault ? 0.07 : 0,
          transition: "opacity 1.1s ease",
          mixBlendMode: "luminosity",
        }}
      />

      {/* Per-pillar tint glow */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse 95% 52% at 50% 0%, rgba(${tint},0.16) 0%, transparent 100%)`,
          transition: "background 1.2s ease",
        }}
      />

      {/* Pillar texture — remounts on key change, fades in */}
      {!isDefault && (
        <svg
          key={key}
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 390 844"
          preserveAspectRatio="xMidYMid slice"
          style={{
            opacity: 0.055,
            mixBlendMode: "overlay",
            animation: "ambient-fade-in 1.4s ease forwards",
          }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <PillarTexture pillar={key} />
        </svg>
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
