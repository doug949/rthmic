"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  CURRENT_ROUTE_KEY,
  LAST_ROUTE_KEY,
  NAV_INTENT_KEY,
  PREVIOUS_ROUTE_KEY,
  RELOAD_REASON_KEY,
  currentClientRoute,
  getDiagnosticSessionId,
  persistCurrentRoute,
  readPersistedRouteState,
  readRouteStack,
  recordDiagnosticEvent,
  safeGetLocalItem,
  safeGetSessionItem,
  safeRemoveSessionItem,
  safeSetSessionItem,
} from "@/app/lib/clientDiagnostics";

const RELOAD_REPORTED_KEY = "rthmic:last-reload-reported";
const RESTORE_ATTEMPT_KEY = "rthmic:reload-restore-attempt";
const LAST_SNAPSHOT_KEY = "rthmic:last-route-snapshot-at";

function currentRoute() {
  return currentClientRoute();
}

function isRestorableRoute(route: string | null | undefined): route is string {
  return !!route && route.startsWith("/") && !route.startsWith("//");
}

function bestRouteToRestore(routeAfterReload: string): string | null {
  const persisted = readPersistedRouteState()?.route;
  const sessionRoute = safeGetSessionItem(LAST_ROUTE_KEY) ?? safeGetSessionItem(CURRENT_ROUTE_KEY);
  const localRoute = safeGetLocalItem(CURRENT_ROUTE_KEY);
  const candidates = [persisted, sessionRoute, localRoute];
  return candidates.find((candidate) => isRestorableRoute(candidate) && candidate !== routeAfterReload) ?? null;
}

export default function RoutePersistence() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const wasReload = nav?.type === "reload";
    const route = currentRoute();
    const sessionId = getDiagnosticSessionId();
    const previousRoute = bestRouteToRestore(route);
    const reason = safeGetSessionItem(RELOAD_REASON_KEY);
    const navigationIntent = safeGetSessionItem(NAV_INTENT_KEY);
    const restoreAttemptId = previousRoute ? `${previousRoute} -> ${route}` : null;
    const previousAttempt = safeGetSessionItem(RESTORE_ATTEMPT_KEY);
    const shouldRestore = !!(
      wasReload &&
      reason !== "user-clicked-update" &&
      previousRoute &&
      restoreAttemptId &&
      previousAttempt !== restoreAttemptId
    );

    if (wasReload) {
      recordDiagnosticEvent("reload", {
        previousRoute,
        reason,
        navigationType: nav?.type ?? "unknown",
        willRestore: shouldRestore,
        navigationIntent,
        persistedRouteState: readPersistedRouteState(),
        routeStack: readRouteStack(),
      });
    }

    if (wasReload && reason !== "user-clicked-update" && previousRoute && previousRoute !== route) {
      const alreadyReported = safeGetSessionItem(RELOAD_REPORTED_KEY);
      if (alreadyReported !== previousRoute) {
        safeSetSessionItem(RELOAD_REPORTED_KEY, previousRoute);
        const transcript = [
          "[App diagnostic] Unexpected reload detected.",
          `Current route after reload: ${route}`,
          `Previous route before reload: ${previousRoute ?? "unknown"}`,
          `Stored reload reason: ${reason ?? "unknown"}`,
          `Navigation type: ${nav?.type ?? "unknown"}`,
          `Will restore route: ${shouldRestore ? "yes" : "no"}`,
          `Navigation intent: ${navigationIntent ?? "none"}`,
          `Session: ${sessionId}`,
          `User agent: ${navigator.userAgent}`,
        ].join("\n");
        fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript }),
          keepalive: true,
        }).catch(() => {});
      }
    }

    if (shouldRestore && previousRoute && restoreAttemptId) {
      safeSetSessionItem(RESTORE_ATTEMPT_KEY, restoreAttemptId);
      const stack = readRouteStack();
      const previousStackRoute = stack.find((candidate) => candidate !== previousRoute && candidate !== route);
      if (previousStackRoute) safeSetSessionItem(PREVIOUS_ROUTE_KEY, previousStackRoute);
      recordDiagnosticEvent("route-restore", {
        from: route,
        to: previousRoute,
        routeStack: stack,
      });
      router.replace(previousRoute);
      return;
    }

    persistCurrentRoute(route);
    if (route === navigationIntent || navigationIntent === "__back__") {
      safeRemoveSessionItem(NAV_INTENT_KEY);
    }
  }, [pathname, router]);

  useEffect(() => {
    const snapshotRoute = (reason: string) => {
      const route = currentRoute();
      safeSetSessionItem(LAST_SNAPSHOT_KEY, new Date().toISOString());
      persistCurrentRoute(route);
      recordDiagnosticEvent(reason, {
        visibilityState: document.visibilityState,
      });
    };

    const markPageHide = (event: PageTransitionEvent) => {
      if (safeGetSessionItem(RELOAD_REASON_KEY) !== "user-clicked-update") {
        safeSetSessionItem(RELOAD_REASON_KEY, "browser-or-runtime");
      }
      snapshotRoute("pagehide");
      recordDiagnosticEvent("pagehide-detail", {
        visibilityState: document.visibilityState,
        persisted: event.persisted,
      });
    };

    const markBeforeUnload = () => {
      snapshotRoute("beforeunload");
    };

    const markVisibility = () => {
      snapshotRoute("visibilitychange");
    };

    const markFreeze = () => {
      snapshotRoute("freeze");
    };

    const markResume = () => {
      snapshotRoute("resume");
    };

    const interval = window.setInterval(() => persistCurrentRoute(currentRoute()), 1500);
    persistCurrentRoute(currentRoute());

    window.addEventListener("pagehide", markPageHide);
    window.addEventListener("beforeunload", markBeforeUnload);
    document.addEventListener("visibilitychange", markVisibility);
    document.addEventListener("freeze", markFreeze);
    document.addEventListener("resume", markResume);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("pagehide", markPageHide);
      window.removeEventListener("beforeunload", markBeforeUnload);
      document.removeEventListener("visibilitychange", markVisibility);
      document.removeEventListener("freeze", markFreeze);
      document.removeEventListener("resume", markResume);
    };
  }, []);

  return null;
}
