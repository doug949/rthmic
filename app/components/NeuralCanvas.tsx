"use client";

import { useEffect, useRef } from "react";

// Gold or blue — assigned at init, never changes
type NodeColor = "gold" | "blue";

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  pulse: number;
  pulsed: boolean;
  color: NodeColor;
}

const NODE_COUNT  = 52;
const CONNECT_DIST = 125;
const PULSE_CHANCE = 0.00006; // very slow firing
const PULSE_DECAY  = 0.003;   // very slow fade-out (~330 frames per pulse)

// Base RGB for each color type
const GOLD = { r: 190, g: 148, b: 55 };
const BLUE = { r: 55,  g: 140, b: 210 };

export function NeuralCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = 0, H = 0;
    const nodes: Node[] = [];

    function resize() {
      W = canvas!.width  = canvas!.offsetWidth;
      H = canvas!.height = canvas!.offsetHeight;
    }

    function init() {
      resize();
      nodes.length = 0;
      for (let i = 0; i < NODE_COUNT; i++) {
        nodes.push({
          x: Math.random() * W,
          y: Math.random() * H,
          vx: (Math.random() - 0.5) * 0.25,
          vy: (Math.random() - 0.5) * 0.25,
          r: Math.random() * 1.5 + 1,
          pulse: 0,
          pulsed: false,
          color: Math.random() < 0.5 ? "gold" : "blue",
        });
      }
    }

    function draw() {
      ctx!.clearRect(0, 0, W, H);

      // update positions & pulse
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > W) n.vx *= -1;
        if (n.y < 0 || n.y > H) n.vy *= -1;
        if (n.pulse > 0) n.pulse = Math.max(0, n.pulse - PULSE_DECAY);
        if (!n.pulsed && Math.random() < PULSE_CHANCE) n.pulse = 1;
        n.pulsed = n.pulse > 0;
      }

      // connections — blend toward whichever end is pulsing
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > CONNECT_DIST) continue;

          const proximity  = 1 - dist / CONNECT_DIST;
          const pulseGlow  = Math.max(a.pulse, b.pulse);
          const alpha      = proximity * 0.22 + pulseGlow * 0.4;

          // pick dominant color from whichever node is pulsing more
          const dominant = a.pulse >= b.pulse ? a : b;
          const base     = dominant.color === "gold" ? GOLD : BLUE;
          const boost    = pulseGlow * 50;

          if (pulseGlow > 0.05) {
            ctx!.shadowBlur  = 8 + pulseGlow * 12;
            ctx!.shadowColor = dominant.color === "gold"
              ? `rgba(210,165,60,${(pulseGlow * 0.6).toFixed(2)})`
              : `rgba(60,160,240,${(pulseGlow * 0.6).toFixed(2)})`;
          }

          ctx!.beginPath();
          ctx!.moveTo(a.x, a.y);
          ctx!.lineTo(b.x, b.y);
          ctx!.strokeStyle = `rgba(${Math.round(base.r + boost)},${Math.round(base.g + boost * 0.6)},${Math.round(base.b + boost * 0.3)},${alpha.toFixed(3)})`;
          ctx!.lineWidth   = proximity * 0.8 + pulseGlow * 0.8;
          ctx!.stroke();
          ctx!.shadowBlur  = 0;
          ctx!.shadowColor = "transparent";
        }
      }

      // nodes
      for (const n of nodes) {
        const glow   = n.pulse;
        const alpha  = 0.45 + glow * 0.55;
        const radius = n.r + glow * 3;
        const base   = n.color === "gold" ? GOLD : BLUE;
        const boost  = glow * 55;

        const nr = Math.round(base.r + boost);
        const ng = Math.round(base.g + boost * 0.7);
        const nb = Math.round(base.b + boost * 0.4);

        // outer glow halo
        if (glow > 0.05) {
          ctx!.shadowBlur  = 12 + glow * 18;
          ctx!.shadowColor = n.color === "gold"
            ? `rgba(220,170,70,${(glow * 0.7).toFixed(2)})`
            : `rgba(70,160,245,${(glow * 0.7).toFixed(2)})`;
        }

        ctx!.beginPath();
        ctx!.arc(n.x, n.y, radius, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(${nr},${ng},${nb},${alpha.toFixed(3)})`;
        ctx!.fill();

        // soft outer ring when pulsing
        if (glow > 0.1) {
          ctx!.beginPath();
          ctx!.arc(n.x, n.y, radius + 6 * glow, 0, Math.PI * 2);
          ctx!.fillStyle = n.color === "gold"
            ? `rgba(215,168,65,${(glow * 0.08).toFixed(3)})`
            : `rgba(65,155,235,${(glow * 0.08).toFixed(3)})`;
          ctx!.fill();
        }

        ctx!.shadowBlur  = 0;
        ctx!.shadowColor = "transparent";
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    init();
    draw();

    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        opacity: 0.7,
      }}
    />
  );
}
