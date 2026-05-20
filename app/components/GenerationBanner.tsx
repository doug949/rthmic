"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useGeneration } from "@/app/contexts/GenerationContext";
import { WaveDots } from "@/app/components/CustomStyleInput";

export default function GenerationBanner() {
  const { genPhase, genError, clearGeneration } = useGeneration();
  const pathname = usePathname();

  // Speak page handles its own full-screen generation UI
  if (pathname === "/speak") return null;
  if (genPhase === "idle") return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex justify-center px-4 pt-safe pointer-events-none">
      <div
        className={`
          mt-3 w-full max-w-sm rounded-2xl border px-4 py-3
          flex items-center gap-3 shadow-xl backdrop-blur-md
          pointer-events-auto
          transition-all duration-300
          ${genPhase === "ready"
            ? "bg-[#0d1628]/90 border-white/25"
            : genPhase === "failed"
            ? "bg-[#0d1628]/90 border-red-400/20"
            : "bg-[#0d1628]/90 border-white/12"}
        `}
      >
        {genPhase === "generating" && (
          <>
            <WaveDots size="sm" />
            <p className="flex-1 text-sm text-white/50">Building your Rthms…</p>
          </>
        )}

        {genPhase === "ready" && (
          <>
            <span className="flex-shrink-0 text-white/50 leading-none">✓</span>
            <p className="flex-1 text-sm text-white/65">Your Rthms are ready</p>
            <Link
              href="/library/my-rthms?period=today"
              className="flex-shrink-0 text-xs text-white/45 border border-white/15 rounded-lg px-3 py-1.5 hover:text-white/70 hover:border-white/25 transition-colors touch-manipulation"
            >
              My Rthms →
            </Link>
            <button
              onClick={clearGeneration}
              className="flex-shrink-0 text-lg text-white/20 hover:text-white/50 transition-colors touch-manipulation leading-none pl-1"
              aria-label="Dismiss"
            >
              ×
            </button>
          </>
        )}

        {genPhase === "failed" && (
          <>
            <span className="flex-shrink-0 text-red-400/50 leading-none">⚠</span>
            <p className="flex-1 text-xs text-red-400/50 leading-snug">
              {genError || "Generation failed"}
            </p>
            <button
              onClick={clearGeneration}
              className="flex-shrink-0 text-[10px] uppercase tracking-widest text-white/20 hover:text-white/40 transition-colors touch-manipulation"
            >
              Dismiss
            </button>
          </>
        )}
      </div>
    </div>
  );
}
