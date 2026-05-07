import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { transitionTo } from "@/app/lib/pageTransition";

// Swipe right (≥60px horizontal, more horizontal than vertical) → navigate back.
// Optional backPath overrides router.back() with a specific route.
export function useSwipeBack(backPath?: string) {
  const router = useRouter();
  const startX = useRef(0);
  const startY = useRef(0);

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
    };

    const onEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX.current;
      const dy = e.changedTouches[0].clientY - startY.current;
      // Require clearly horizontal swipe
      if (dx > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) {
        transitionTo(backPath ?? "__back__", router);
      }
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchend", onEnd);
    };
  }, [router, backPath]);
}

// For pages with internal left/right navigation (settings slots, understand panels).
// onLeft = swipe left (advance), onRight = swipe right (go back/prev).
export function useSwipeNavigation(
  onLeft?: () => void,
  onRight?: () => void
) {
  const startX = useRef(0);
  const startY = useRef(0);

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
    };

    const onEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX.current;
      const dy = e.changedTouches[0].clientY - startY.current;
      if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
      if (dx < 0 && onLeft) onLeft();
      if (dx > 0 && onRight) onRight();
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchend", onEnd);
    };
  }, [onLeft, onRight]);
}
