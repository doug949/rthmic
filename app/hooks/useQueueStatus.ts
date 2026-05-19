"use client";

import { useState, useEffect, useCallback } from "react";

export function useQueueStatus() {
  const [active, setActive] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/queue-status", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json() as { active?: number };
      setActive(data.active ?? 0);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  return { active, refresh };
}
