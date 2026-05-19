"use client";

import { useEffect, useState } from "react";

export default function SplashScreen() {
  const [phase, setPhase] = useState<"in" | "hold" | "out" | "gone">("in");

  useEffect(() => {
    const fadeIn  = setTimeout(() => setPhase("hold"), 50);
    const fadeOut = setTimeout(() => setPhase("out"),  3000);
    const done    = setTimeout(() => setPhase("gone"), 3600);
    return () => { clearTimeout(fadeIn); clearTimeout(fadeOut); clearTimeout(done); };
  }, []);

  if (phase === "gone") return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background: "#060810",
        opacity: phase === "out" ? 0 : 1,
        transition: phase === "out" ? "opacity 0.6s ease-in-out" : "none",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.5rem",
          opacity: phase === "in" ? 0 : 1,
          transition: phase !== "in" ? "opacity 0.8s ease-in-out" : "none",
        }}
      >
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "2rem",
            letterSpacing: "0.4em",
            fontWeight: 300,
            color: "#c9a55a",
          }}
        >
          {"RTHMIC".split("").map((letter, i) => (
            <span
              key={i}
              style={{
                display: "inline-block",
                animation: `letter-wipe 220ms cubic-bezier(0.4,0,0.2,1) forwards`,
                animationDelay: `${200 + i * 55}ms`,
                clipPath: "inset(0 100% 0 0)",
              }}
            >
              {letter}
            </span>
          ))}
        </h1>
        <span
          style={{
            fontSize: "0.55rem",
            letterSpacing: "0.25em",
            textTransform: "uppercase",
            color: "#c9a55a",
            opacity: 0.35,
          }}
        >
          beta
        </span>
      </div>
    </div>
  );
}
