"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  CURRENT_ROUTE_KEY,
  LAST_ROUTE_KEY,
  NAV_INTENT_KEY,
  PREVIOUS_ROUTE_KEY,
  RELOAD_INTENT_KEY,
  RELOAD_REASON_KEY,
  currentClientRoute,
  markReloadIntent,
  persistCurrentRoute,
  readRecentReloadIntent,
  readPersistedRouteState,
  readRouteStack,
  recordDiagnosticEvent,
  safeGetLocalItem,
  safeGetSessionItem,
  safeRemoveLocalItem,
  safeRemoveSessionItem,
  safeSetSessionItem,
} from "@/app/lib/clientDiagnostics";

const RELOAD_REPORTED_KEY = "rthmic:last-reload-reported";
const RESTORE_ATTEMPT_KEY = "rthmic:reload-restore-attempt";
const LAST_RESTORE_AT_KEY = "rthmic:reload-restore-at";
const LAST_SNAPSHOT_KEY = "rthmic:last-route-snapshot-at";
const RESTORE_COOLDOWN_MS = 60_000;
const RESTORE_ROUTE_MAX_AGE_MS = 15 * 60_000;

function currentRoute() {
  return currentClientRoute();
}

function isRestorableRoute(route: string | null | undefined): route is string {
  return !!route && route.startsWith("/") && !route.startsWith("//");
}

function isAutoRestoreRoute(route: string): boolean {
  if (route === "/" || route.startsWith("/login") || route.startsWith("/r/")) return false;
  return true;
}

function bestRouteToRestore(routeAfterReload: string): string | null {
  const persistedState = readPersistedRouteState();
  const persistedAt = persistedState?.at ? Date.parse(persistedState.at) : 0;
  const persistedIsFresh = !!persistedAt && Date.now() - persistedAt < RESTORE_ROUTE_MAX_AGE_MS;
  const persisted = persistedIsFresh ? persistedState?.route : null;
  const sessionRoute = safeGetSessionItem(LAST_ROUTE_KEY) ?? safeGetSessionItem(CURRENT_ROUTE_KEY);
  const localRoute = safeGetLocalItem(CURRENT_ROUTE_KEY);
  const candidates = [persisted, sessionRoute, localRoute];
  return candidates.find((candidate) => isRestorableRoute(candidate) && candidate !== routeAfterReload) ?? null;
}

function restoreIsCoolingDown(): boolean {
  const restoredAt = safeGetSessionItem(LAST_RESTORE_AT_KEY);
  if (!restoredAt) return false;
  const parsed = Date.parse(restoredAt);
  return !!parsed && Date.now() - parsed < RESTORE_COOLDOWN_MS;
}

export default function RoutePersistence() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const wasReload = nav?.type === "reload";
    const route = currentRoute();
    const previousRoute = bestRouteToRestore(route);
    const reloadIntent = readRecentReloadIntent();
    const reason = safeGetSessionItem(RELOAD_REASON_KEY) ?? reloadIntent?.reason ?? null;
    const navigationIntent = safeGetSessionItem(NAV_INTENT_KEY);
    const restoreAttemptId = previousRoute ? `${previousRoute} -> ${route}` : null;
    const previousAttempt = safeGetSessionItem(RESTORE_ATTEMPT_KEY);
    const likelyProcessRestart = !!(
      route === "/" &&
      reloadIntent?.reason === "browser-or-runtime" &&
      reloadIntent.source === "pagehide"
    );
    const reloadKind = navigationIntent
      ? "navigation"
      : reason === "user-clicked-update"
        ? "app-update"
        : reason === "user-clicked-refresh"
          ? "manual-refresh"
        : "browser-or-runtime";
    const shouldRestore = !!(
      (wasReload || likelyProcessRestart) &&
      reason !== "user-clicked-update" &&
      reason !== "user-clicked-refresh" &&
      !navigationIntent &&
      previousRoute &&
      isAutoRestoreRoute(previousRoute) &&
      restoreAttemptId &&
      previousAttempt !== restoreAttemptId &&
      !restoreIsCoolingDown()
    );

    if (wasReload || likelyProcessRestart) {
      recordDiagnosticEvent("reload", {
        reloadKind,
        previousRoute,
        reason,
        reloadIntent,
        navigationType: nav?.type ?? "unknown",
        likelyProcessRestart,
        willRestore: shouldRestore,
        navigationIntent,
        persistedRouteState: readPersistedRouteState(),
        routeStack: readRouteStack(),
      });
      safeRemoveSessionItem(RELOAD_REASON_KEY);
      safeRemoveLocalItem(RELOAD_INTENT_KEY);
    }

    if ((wasReload || likelyProcessRestart) && reason !== "user-clicked-update" && previousRoute && previousRoute !== route) {
      const alreadyReported = safeGetSessionItem(RELOAD_REPORTED_KEY);
      if (alreadyReported !== previousRoute) {
        safeSetSessionItem(RELOAD_REPORTED_KEY, previousRoute);
      }
    }

    if (shouldRestore && previousRoute && restoreAttemptId) {
      safeSetSessionItem(RESTORE_ATTEMPT_KEY, restoreAttemptId);
      safeSetSessionItem(LAST_RESTORE_AT_KEY, new Date().toISOString());
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
        markReloadIntent("browser-or-runtime", "pagehide", currentRoute());
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
