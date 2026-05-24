"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  currentClientRoute,
  getDiagnosticSessionId,
  recordDiagnosticEvent,
  updateRouteStack,
} from "@/app/lib/clientDiagnostics";

const LAST_ROUTE_KEY = "rthmic:last-route";
const RELOAD_REASON_KEY = "rthmic:last-reload-reason";
const RELOAD_REPORTED_KEY = "rthmic:last-reload-reported";
const NAV_INTENT_KEY = "rthmic:navigation-intent";

function currentRoute() {
  return currentClientRoute();
}

export default function RoutePersistence() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const wasReload = nav?.type === "reload";
    const route = currentRoute();
    const sessionId = getDiagnosticSessionId();
    const previousRoute = sessionStorage.getItem(LAST_ROUTE_KEY);
    const reason = sessionStorage.getItem(RELOAD_REASON_KEY);
    const navigationIntent = sessionStorage.getItem(NAV_INTENT_KEY);
    const intendedHome = navigationIntent === "/";
    const shouldRestore = !!(
      wasReload &&
      !intendedHome &&
      previousRoute &&
      previousRoute !== route &&
      previousRoute.startsWith("/") &&
      route === "/"
    );

    const shouldReport = !!(wasReload && reason !== "user-clicked-update" && previousRoute && previousRoute !== route);

    if (wasReload) {
      recordDiagnosticEvent("reload", {
        previousRoute,
        reason,
        navigationType: nav?.type ?? "unknown",
        willRestore: shouldRestore,
        navigationIntent,
      });
    }

    if (shouldReport) {
      const alreadyReported = sessionStorage.getItem(RELOAD_REPORTED_KEY);
      if (alreadyReported !== previousRoute) {
        sessionStorage.setItem(RELOAD_REPORTED_KEY, previousRoute);
        const transcript = [
          "[App diagnostic] Unexpected reload detected.",
          `Current route after reload: ${route}`,
          `Previous route before reload: ${previousRoute ?? "unknown"}`,
          `Stored reload reason: ${reason ?? "unknown"}`,
          `Navigation type: ${nav?.type ?? "unknown"}`,
          `Will restore route: ${shouldRestore ? "yes" : "no"}`,
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

    if (shouldRestore && previousRoute) {
      router.replace(previousRoute);
      return;
    }

    sessionStorage.setItem(LAST_ROUTE_KEY, route);
    updateRouteStack(route);
    if (route === navigationIntent || navigationIntent === "__back__") {
      sessionStorage.removeItem(NAV_INTENT_KEY);
    }
  }, [pathname, router]);

  useEffect(() => {
    const markReload = () => {
      if (sessionStorage.getItem(RELOAD_REASON_KEY) !== "user-clicked-update") {
        sessionStorage.setItem(RELOAD_REASON_KEY, "browser-or-runtime");
      }
      sessionStorage.setItem(LAST_ROUTE_KEY, currentRoute());
      recordDiagnosticEvent("pagehide", {
        visibilityState: document.visibilityState,
        persisted: "unknown",
      });
    };

    const markBeforeUnload = () => {
      recordDiagnosticEvent("beforeunload", {
        visibilityState: document.visibilityState,
      });
    };

    const markVisibility = () => {
      recordDiagnosticEvent("visibilitychange", {
        visibilityState: document.visibilityState,
      });
    };

    window.addEventListener("pagehide", markReload);
    window.addEventListener("beforeunload", markBeforeUnload);
    document.addEventListener("visibilitychange", markVisibility);
    return () => {
      window.removeEventListener("pagehide", markReload);
      window.removeEventListener("beforeunload", markBeforeUnload);
      document.removeEventListener("visibilitychange", markVisibility);
    };
  }, []);

  return null;
}
