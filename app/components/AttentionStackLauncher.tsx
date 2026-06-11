"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";

export default function AttentionStackLauncher() {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (window.self !== window.top) return;
    let cancelled = false;
    fetch("/api/settings")
      .then(response => response.json())
      .then(data => { if (!cancelled) setIsAdmin(!!data.access?.isAdmin); })
      .catch(() => { if (!cancelled) setIsAdmin(false); });
    return () => { cancelled = true; };
  }, []);

  if (!isAdmin || pathname === "/login" || pathname === "/attention-stack" || typeof window === "undefined" || window.self !== window.top) return null;

  return createPortal(
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed right-4 z-[44] flex h-12 w-12 items-center justify-center rounded-full border text-green-200 transition-transform active:scale-95"
          style={{
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 76px)",
            borderColor: "rgba(74,222,128,0.34)",
            background: "rgba(10,24,26,0.88)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.34), 0 0 20px rgba(34,197,94,0.08)",
            backdropFilter: "blur(16px)",
          }}
          aria-label="Open Attention Stack"
          title="Attention Stack"
        >
          <StackIcon />
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[80]">
          <button type="button" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/60" aria-label="Close Attention Stack" />
          <section
            className="absolute bottom-0 right-0 top-0 w-full border-l border-white/10 bg-[#0d1628] shadow-2xl sm:w-[min(92vw,620px)]"
            style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
            aria-label="Attention Stack panel"
          >
            <div className="flex h-16 items-center justify-between border-b border-white/[0.07] px-5">
              <div className="flex items-center gap-3 text-white/78"><StackIcon /><span className="text-sm font-medium tracking-wide">Attention Stack</span></div>
              <button type="button" onClick={() => setOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-xl text-white/55" aria-label="Hide Attention Stack">×</button>
            </div>
            <iframe title="Attention Stack" src="/attention-stack?embedded=1" className="w-full border-0" style={{ height: "calc(100% - 4rem)" }} allow="microphone" />
          </section>
        </div>
      )}
    </>,
    document.body,
  );
}

function StackIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 7h14M7 12h10M9 17h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
}
