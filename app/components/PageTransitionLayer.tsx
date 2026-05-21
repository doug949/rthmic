"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { subscribeToTransitions } from "@/app/lib/pageTransition";

/**
 * Fixed overlay that covers the screen during page transitions.
 *
 * Flow:
 *  1. TransitionLink tap → onStart() → overlay fades TO black (240ms)
 *  2. After 240ms, router.push fires — new page starts mounting
 *  3. usePathname() detects the URL change (new page is mounted)
 *  4. Overlay fades OUT, revealing the new page cleanly
 */
export function PageTransitionLayer() {
  const [covering, setCovering] = useState(false);
  const pathname = usePathname();
  const pendingReveal = useRef(false);
  const failsafeRef = useRef<number | null>(null);

  useEffect(() => {
    const unsub = subscribeToTransitions(() => {
      if (failsafeRef.current !== null) window.clearTimeout(failsafeRef.current);
      setCovering(true);
      pendingReveal.current = true;
      failsafeRef.current = window.setTimeout(() => {
        pendingReveal.current = false;
        setCovering(false);
        failsafeRef.current = null;
      }, 1800);
    });
    return () => {
      if (failsafeRef.current !== null) window.clearTimeout(failsafeRef.current);
      unsub();
    };
  }, []);

  // When the pathname changes the new page has mounted — reveal it
  useEffect(() => {
    if (pendingReveal.current) {
      pendingReveal.current = false;
      if (failsafeRef.current !== null) {
        window.clearTimeout(failsafeRef.current);
        failsafeRef.current = null;
      }
      // One extra frame so the new page paints before we start lifting the curtain
      requestAnimationFrame(() => setCovering(false));
    }
  }, [pathname]);

  return (
    <div
      aria-hidden
      className="fixed inset-0 pointer-events-none"
      style={{
        zIndex: 99,
        background: "#0d1628",
        opacity: covering ? 1 : 0,
        transition: covering
          ? "opacity 0.24s ease"   // fast fade to black on tap
          : "opacity 0.35s ease",  // slightly slower reveal
      }}
    />
  );
}
