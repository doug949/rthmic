"use client";

import { useQueueStatus } from "@/app/hooks/useQueueStatus";
import { useRouter } from "next/navigation";
import { transitionTo } from "@/app/lib/pageTransition";

export function QueuePill() {
  const { active } = useQueueStatus();
  const router = useRouter();

  if (active === 0) return null;

  return (
    <button
      onClick={() => transitionTo("/library", router)}
      className="flex items-center gap-2 px-3 py-1.5 rounded-full touch-manipulation transition-opacity active:opacity-70"
      style={{
        background: "rgba(201,165,90,0.1)",
        border: "1px solid rgba(201,165,90,0.25)",
      }}
    >
      {/* Pulsing dot */}
      <span className="relative flex h-2 w-2 flex-shrink-0">
        <span
          className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
          style={{ background: "rgba(201,165,90,0.6)" }}
        />
        <span
          className="relative inline-flex h-2 w-2 rounded-full"
          style={{ background: "rgba(201,165,90,0.9)" }}
        />
      </span>
      <span className="text-[11px] uppercase tracking-wider" style={{ color: "rgba(201,165,90,0.85)" }}>
        {active === 1 ? "1 Rthm generating" : `${active} Rthms generating`}
      </span>
      <span className="text-[11px]" style={{ color: "rgba(201,165,90,0.5)" }}>›</span>
    </button>
  );
}
