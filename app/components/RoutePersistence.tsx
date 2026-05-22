"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const LAST_ROUTE_KEY = "rthmic:last-route";
const RELOAD_REASON_KEY = "rthmic:last-reload-reason";
const RELOAD_REPORTED_KEY = "rthmic:last-reload-reported";
const NAV_INTENT_KEY = "rthmic:navigation-intent";

function currentRoute() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export default function RoutePersistence() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const wasReload = nav?.type === "reload";
    const route = currentRoute();
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
    };
    window.addEventListener("pagehide", markReload);
    return () => window.removeEventListener("pagehide", markReload);
  }, []);

  return null;
}
