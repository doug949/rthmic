"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { AppHeader } from "@/app/components/AppHeader";
import {
  getDeploymentVersion,
  getDiagnosticSessionId,
  getMemorySnapshot,
  getServiceWorkerVersion,
  getStorageSnapshot,
  readDiagnosticEvents,
  readPersistedRouteState,
  readRouteStack,
  type DiagnosticEvent,
} from "@/app/lib/clientDiagnostics";

interface DiagnosticsSnapshot {
  route: string;
  sessionId: string;
  clientBuild: string;
  serverBuild: string;
  clientDeployment: string;
  serverDeployment: string;
  serviceWorkerVersion: string;
  online: boolean;
  visibilityState: DocumentVisibilityState;
  navigationType: string;
  serviceWorker: string;
  caches: string[];
  lastRoute: string | null;
  reloadReason: string | null;
  routeStack: string[];
  persistedRouteState: unknown;
  memory: Record<string, number | string>;
  storage: Record<string, number | string>;
  events: DiagnosticEvent[];
  userAgent: string;
}

async function cacheNames(): Promise<string[]> {
  if (!("caches" in window)) return [];
  return caches.keys();
}

async function serviceWorkerStatus(): Promise<string> {
  if (!("serviceWorker" in navigator)) return "unavailable";
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return "not registered";
  const active = registration.active ? `active:${registration.active.state}` : "active:none";
  const waiting = registration.waiting ? `waiting:${registration.waiting.state}` : "waiting:none";
  const installing = registration.installing ? `installing:${registration.installing.state}` : "installing:none";
  return [active, waiting, installing].join(" / ");
}

function collectStorage(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

async function collectSnapshot(): Promise<DiagnosticsSnapshot> {
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  let serverBuild = "unknown";
  let serverDeployment = "unknown";
  try {
    const res = await fetch(`/api/version?t=${Date.now()}`, { cache: "no-store" });
    const data = await res.json() as { build?: string; deployment?: string };
    serverBuild = data.build ?? "unknown";
    serverDeployment = data.deployment ?? serverBuild;
  } catch {
    serverBuild = "unreachable";
    serverDeployment = "unreachable";
  }

  return {
    route: `${window.location.pathname}${window.location.search}${window.location.hash}`,
    sessionId: getDiagnosticSessionId(),
    clientBuild: process.env.NEXT_PUBLIC_RTHMIC_BUILD ?? "dev",
    serverBuild,
    clientDeployment: getDeploymentVersion(),
    serverDeployment,
    serviceWorkerVersion: getServiceWorkerVersion(),
    online: navigator.onLine,
    visibilityState: document.visibilityState,
    navigationType: nav?.type ?? "unknown",
    serviceWorker: await serviceWorkerStatus(),
    caches: await cacheNames(),
    lastRoute: collectStorage("rthmic:last-route"),
    reloadReason: collectStorage("rthmic:last-reload-reason"),
    routeStack: readRouteStack(),
    persistedRouteState: readPersistedRouteState(),
    memory: getMemorySnapshot(),
    storage: getStorageSnapshot(),
    events: readDiagnosticEvents(),
    userAgent: navigator.userAgent,
  };
}

export default function DiagnosticsPage() {
  const [snapshot, setSnapshot] = useState<DiagnosticsSnapshot | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    setSnapshot(await collectSnapshot());
  }, []);

  useEffect(() => {
    void collectSnapshot().then(setSnapshot);
    const onChange = () => refresh();
    window.addEventListener("online", onChange);
    window.addEventListener("offline", onChange);
    document.addEventListener("visibilitychange", onChange);
    return () => {
      window.removeEventListener("online", onChange);
      window.removeEventListener("offline", onChange);
      document.removeEventListener("visibilitychange", onChange);
    };
  }, [refresh]);

  const copySnapshot = async () => {
    if (!snapshot) return;
    await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const clearDiagnostics = () => {
    localStorage.removeItem("rthmic:diagnostic-events-v1");
    localStorage.removeItem("rthmic:route-stack-v1");
    refresh();
  };

  return (
    <main className="relative z-10 min-h-screen px-5 pt-safe pb-10">
      <AppHeader title="Diagnostics" />

      <section className="mx-auto flex w-full max-w-2xl flex-col gap-4 pt-4">
        <div className="flex gap-2">
          <button
            onClick={refresh}
            className="flex-1 rounded-xl border px-4 py-3 text-sm font-medium"
            style={{ borderColor: "rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.78)", background: "rgba(255,255,255,0.05)" }}
          >
            Refresh
          </button>
          <button
            onClick={copySnapshot}
            className="flex-1 rounded-xl border px-4 py-3 text-sm font-medium"
            style={{ borderColor: "rgba(201,165,90,0.28)", color: "rgba(201,165,90,0.9)", background: "rgba(201,165,90,0.08)" }}
          >
            {copied ? "Copied" : "Copy JSON"}
          </button>
        </div>

        {!snapshot ? (
          <p className="text-sm text-white/50">Collecting diagnostics...</p>
        ) : (
          <>
            <Panel title="Runtime">
              <Row label="Route" value={snapshot.route} />
              <Row label="Session" value={snapshot.sessionId} />
              <Row label="Online" value={snapshot.online ? "yes" : "no"} />
              <Row label="Visibility" value={snapshot.visibilityState} />
              <Row label="Navigation" value={snapshot.navigationType} />
            </Panel>

            <Panel title="Build And Cache">
              <Row label="Client build" value={snapshot.clientBuild} />
              <Row label="Server build" value={snapshot.serverBuild} />
              <Row label="Client deploy" value={snapshot.clientDeployment} />
              <Row label="Server deploy" value={snapshot.serverDeployment} />
              <Row label="SW version" value={snapshot.serviceWorkerVersion} />
              <Row label="Service worker" value={snapshot.serviceWorker} />
              <Row label="Caches" value={snapshot.caches.length ? snapshot.caches.join(", ") : "none"} />
            </Panel>

            <Panel title="Reload State">
              <Row label="Last route" value={snapshot.lastRoute ?? "none"} />
              <Row label="Reload reason" value={snapshot.reloadReason ?? "none"} />
              <Row label="Route stack" value={snapshot.routeStack.length ? snapshot.routeStack.join(" -> ") : "none"} />
              <Row label="Saved route" value={snapshot.persistedRouteState ? JSON.stringify(snapshot.persistedRouteState) : "none"} />
            </Panel>

            <Panel title="Memory And Storage">
              <Row label="Memory" value={JSON.stringify(snapshot.memory)} />
              <Row label="Storage" value={JSON.stringify(snapshot.storage)} />
            </Panel>

            <Panel title={`Recent Events (${snapshot.events.length})`}>
              {snapshot.events.length === 0 ? (
                <p className="text-sm text-white/45">No events recorded yet.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {snapshot.events.slice(0, 20).map((event) => (
                    <div key={event.id} className="rounded-xl border p-3" style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.035)" }}>
                      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(201,165,90,0.82)" }}>{event.type}</p>
                      <p className="mt-1 text-xs text-white/45">{event.at}</p>
                      <p className="mt-1 text-sm text-white/70">{event.route}</p>
                      {event.detail && (
                        <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg p-2 text-[11px] leading-relaxed text-white/45" style={{ background: "rgba(0,0,0,0.22)" }}>
                          {JSON.stringify(event.detail, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Device">
              <p className="break-words text-xs leading-relaxed text-white/45">{snapshot.userAgent}</p>
            </Panel>

            <button
              onClick={clearDiagnostics}
              className="rounded-xl border px-4 py-3 text-sm"
              style={{ borderColor: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.46)", background: "rgba(255,255,255,0.03)" }}
            >
              Clear Diagnostics
            </button>
          </>
        )}
      </section>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border p-4" style={{ borderColor: "rgba(255,255,255,0.10)", background: "rgba(8,14,25,0.68)" }}>
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.24em]" style={{ color: "rgba(255,255,255,0.52)" }}>{title}</h2>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 text-sm">
      <span className="text-white/38">{label}</span>
      <span className="break-words text-white/72">{value}</span>
    </div>
  );
}
