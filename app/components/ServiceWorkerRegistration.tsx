"use client";

import { useEffect, useRef, useState } from "react";
import { AUDIO_CACHE } from "@/app/lib/offlineAudio";
import { LAST_ROUTE_KEY, RELOAD_REASON_KEY, SW_VERSION_KEY, currentClientRoute, recordDiagnosticEvent, safeSetLocalItem, safeSetSessionItem } from "@/app/lib/clientDiagnostics";

const VERSION_CHECK_INTERVAL_MS = 30_000;

async function purgeAppCaches() {
  if (!("caches" in window)) return;
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key !== AUDIO_CACHE).map((key) => caches.delete(key)));
}

function persistUpdateReloadReason() {
  safeSetSessionItem(RELOAD_REASON_KEY, "user-clicked-update");
  safeSetSessionItem(LAST_ROUTE_KEY, currentClientRoute());
}

function persistServiceWorkerVersion(version: string) {
  safeSetSessionItem(SW_VERSION_KEY, version);
  safeSetLocalItem(SW_VERSION_KEY, version);
}

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
        if (data.build && data.build !== currentBuild) {
          recordDiagnosticEvent("app-update-available", { currentBuild, serverBuild: data.build });
          setServerBuild(data.build);
        }
      } catch {
        // Version checks are best-effort.
      }
    };

    checkAppVersion();
    const quickCheckTimer = window.setTimeout(checkAppVersion, 3500);
    const interval = window.setInterval(checkAppVersion, VERSION_CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") checkAppVersion();
    };
    window.addEventListener("focus", checkAppVersion);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", checkAppVersion);

    return () => {
      window.clearTimeout(quickCheckTimer);
      window.clearInterval(interval);
      window.removeEventListener("focus", checkAppVersion);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", checkAppVersion);
    };
  }, [currentBuild]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "SW_VERSION" && typeof event.data.version === "string") {
        persistServiceWorkerVersion(event.data.version);
        recordDiagnosticEvent("service-worker-version", { version: event.data.version });
      }
    };

    navigator.serviceWorker.addEventListener("message", onMessage);

    navigator.serviceWorker.register("/sw.js").then((registration) => {
      recordDiagnosticEvent("service-worker-register", { scope: registration.scope });

      const showUpdate = (worker: ServiceWorker | null) => {
        if (worker && navigator.serviceWorker.controller) {
          recordDiagnosticEvent("service-worker-waiting", { state: worker.state });
          setWaitingWorker(worker);
        }
      };

      showUpdate(registration.waiting);
      registration.active?.postMessage({ type: "GET_SW_VERSION" });
      navigator.serviceWorker.controller?.postMessage({ type: "GET_SW_VERSION" });
      registration.update().catch((error) => {
        recordDiagnosticEvent("service-worker-update-check-failed", { message: String(error) });
      });

      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          recordDiagnosticEvent("service-worker-statechange", { state: worker.state });
          if (worker.state === "installed") showUpdate(worker);
        });
      });

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        recordDiagnosticEvent("service-worker-controllerchange", { updating: updatingRef.current });
        if (!updatingRef.current) return;
        persistUpdateReloadReason();
        window.location.reload();
      });
    }).catch((error) => {
      recordDiagnosticEvent("service-worker-register-failed", { message: String(error) });
      // SW registration is best-effort — app works without it
    });

    return () => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
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
          persistUpdateReloadReason();
          recordDiagnosticEvent("app-update-clicked", { hasWaitingWorker: !!waitingWorker, appUpdateAvailable });
          purgeAppCaches().finally(() => {
            navigator.serviceWorker.controller?.postMessage({ type: "PURGE_APP_CACHES" });
            if (waitingWorker) {
              waitingWorker.postMessage({ type: "SKIP_WAITING" });
              window.setTimeout(() => {
                if (updatingRef.current) window.location.reload();
              }, 5000);
              return;
            }
            window.location.reload();
          });
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
