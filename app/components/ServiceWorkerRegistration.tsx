"use client";

import { useEffect, useRef, useState } from "react";

export default function ServiceWorkerRegistration() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const updatingRef = useRef(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").then((registration) => {
      const showUpdate = (worker: ServiceWorker | null) => {
        if (worker && navigator.serviceWorker.controller) setWaitingWorker(worker);
      };

      showUpdate(registration.waiting);

      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed") showUpdate(worker);
        });
      });

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!updatingRef.current) return;
        window.location.reload();
      });
    }).catch(() => {
        // SW registration is best-effort — app works without it
    });
  }, []);

  if (!waitingWorker) return null;

  return (
    <div
      className="fixed left-4 right-4 z-[70] rounded-2xl border px-4 py-3 flex items-center gap-3"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
        background: "rgba(10,16,32,0.94)",
        borderColor: "rgba(201,165,90,0.28)",
        boxShadow: "0 14px 44px rgba(0,0,0,0.35)",
        backdropFilter: "blur(18px)",
      }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: "rgba(201,165,90,0.9)" }}>Update available</p>
        <p className="text-xs mt-0.5 text-white/55">Tap update when you are ready. RTHMIC will not refresh mid-recording.</p>
      </div>
      <button
        onClick={() => {
          updatingRef.current = true;
          waitingWorker.postMessage({ type: "SKIP_WAITING" });
        }}
        className="flex-shrink-0 rounded-full px-4 py-2 text-[11px] uppercase tracking-widest touch-manipulation active:scale-[0.98] transition-transform"
        style={{
          background: "rgba(201,165,90,0.14)",
          border: "1px solid rgba(201,165,90,0.34)",
          color: "rgba(201,165,90,0.92)",
        }}
      >
        Update
      </button>
    </div>
  );
}
