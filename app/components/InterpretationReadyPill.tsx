"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  INTERPRETATION_DRAFT_EVENT,
  readInterpretationDraft,
  type InterpretationDraft,
} from "@/app/lib/interpretationDraft";
import { transitionTo } from "@/app/lib/pageTransition";

export function InterpretationReadyPill() {
  const router = useRouter();
  const pathname = usePathname();
  const [draft, setDraft] = useState<InterpretationDraft | null>(null);

  useEffect(() => {
    const sync = () => setDraft(readInterpretationDraft());
    sync();
    window.addEventListener(INTERPRETATION_DRAFT_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(INTERPRETATION_DRAFT_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  if (!draft || pathname === "/speak") return null;

  return (
    <button
      onClick={() => transitionTo("/speak?draft=1", router)}
      className="fixed left-4 right-4 z-[65] rounded-2xl border px-4 py-3 flex items-center gap-3 text-left touch-manipulation active:scale-[0.99] transition-transform"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 86px)",
        background: "rgba(10,16,32,0.94)",
        borderColor: "rgba(201,165,90,0.34)",
        boxShadow: "0 14px 44px rgba(0,0,0,0.35)",
        backdropFilter: "blur(18px)",
      }}
    >
      <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: "rgba(201,165,90,0.9)", boxShadow: "0 0 18px rgba(201,165,90,0.45)" }} />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium" style={{ color: "rgba(201,165,90,0.92)" }}>Interpretation ready</span>
        <span className="block text-xs text-white/52 mt-0.5 truncate">Choose the style for {draft.title}</span>
      </span>
      <span className="text-xs uppercase tracking-widest" style={{ color: "rgba(201,165,90,0.82)" }}>Open</span>
    </button>
  );
}
