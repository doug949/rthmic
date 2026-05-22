"use client";

import { useEffect, useRef, useState } from "react";

export default function ServiceWorkerRegistration() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [serverBuild, setServerBuild] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const updatingRef = useRef(false);
  const currentBuild = process.env.NEXT_PUBLIC_RTHMIC_BUILD ?? "dev";

  const appUpdateAvailable = !!serverBuild && serverBuild !== currentBuild;

  useEffect(() => {
    const checkAppVersion = async () => {
      try {
        const res = await fetch(`/api/version?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json() as { build?: string };
        if (data.build) {
          sessionStorage.setItem("rthmic:last-server-build", data.build);
          if (data.build !== currentBuild) setServerBuild(data.build);
        }
      } catch {
        // Version checks are best-effort.
      }
    };

    checkAppVersion();
    const timer = window.setTimeout(checkAppVersion, 3500);
    const onVisible = () => {
      if (document.visibilityState === "visible") checkAppVersion();
    };
    window.addEventListener("focus", checkAppVersion);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", checkAppVersion);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", checkAppVersion);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", checkAppVersion);
    };
  }, [currentBuild]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").then((registration) => {
      const showUpdate = (worker: ServiceWorker | null) => {
        if (worker && navigator.serviceWorker.controller) setWaitingWorker(worker);
      };

      showUpdate(registration.waiting);
      registration.update().catch(() => {});

      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed") showUpdate(worker);
        });
      });

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!updatingRef.current) return;
        sessionStorage.setItem("rthmic:last-reload-reason", "user-clicked-update");
        sessionStorage.setItem("rthmic:last-route", `${window.location.pathname}${window.location.search}${window.location.hash}`);
        window.location.reload();
      });
    }).catch(() => {
        // SW registration is best-effort — app works without it
    });
  }, []);

  if (!waitingWorker && !appUpdateAvailable && !updating) return null;

  if (updating) {
    return (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center px-6 text-center"
        style={{
          background: "rgba(6,10,20,0.96)",
          backdropFilter: "blur(18px)",
        }}
        role="status"
        aria-live="assertive"
      >
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-9 h-9 rounded-full border-2 animate-spin"
            style={{ borderColor: "rgba(201,165,90,0.18)", borderTopColor: "rgba(201,165,90,0.9)" }}
          />
          <div>
            <p className="text-base font-medium" style={{ color: "rgba(201,165,90,0.92)" }}>Updating RTHMIC</p>
            <p className="text-sm text-white/58 mt-2 leading-relaxed max-w-xs">
              Hold on a moment. The app is updating now, so recording and generation are paused until the refresh completes.
            </p>
          </div>
        </div>
      </div>
    );
  }

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
          setUpdating(true);
          if (waitingWorker) {
            waitingWorker.postMessage({ type: "SKIP_WAITING" });
          } else {
            sessionStorage.setItem("rthmic:last-reload-reason", "user-clicked-update");
            sessionStorage.setItem("rthmic:last-route", `${window.location.pathname}${window.location.search}${window.location.hash}`);
            window.location.reload();
          }
        }}
        disabled={updating}
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
