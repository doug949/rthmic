"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";

export default function AttentionStackLauncher() {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (window.self !== window.top) return;
    let cancelled = false;
    fetch("/api/settings")
      .then(response => response.json())
      .then(data => { if (!cancelled) setIsAdmin(!!data.access?.isAdmin); })
      .catch(() => { if (!cancelled) setIsAdmin(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const handleOpen = () => {
      setLoaded(false);
      setOpen(true);
    };
    window.addEventListener("rthmic:open-attention-stack", handleOpen);
    return () => window.removeEventListener("rthmic:open-attention-stack", handleOpen);
  }, []);

  if (!isAdmin || pathname === "/login" || pathname === "/attention-stack" || typeof window === "undefined" || window.self !== window.top) return null;

  return createPortal(
    <>
      {open && (
        <div className="fixed inset-0 z-[80]">
          <button type="button" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/60" aria-label="Close Attention Stack" />
          <section
            className="absolute bottom-0 right-0 top-0 w-full border-l border-white/10 bg-[#0d1628] shadow-2xl sm:w-[min(92vw,620px)]"
            style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
            aria-label="Attention Stack panel"
          >
            <button type="button" onClick={() => setOpen(false)} className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[#111d32]/95 text-xl text-white/55 shadow-lg" aria-label="Hide Attention Stack">×</button>
            <div className="relative h-full w-full bg-[#0d1628]">
              {!loaded && <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0d1628]"><div className="h-7 w-7 animate-spin rounded-full border-2 border-white/15 border-t-white/60" /></div>}
              <iframe title="Attention Stack" src="/attention-stack?embedded=1" onLoad={() => setLoaded(true)} className="h-full w-full border-0 bg-[#0d1628]" style={{ colorScheme: "dark" }} allow="microphone" />
            </div>
          </section>
        </div>
      )}
    </>,
    document.body,
  );
}
