"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const LAST_ROUTE_KEY = "rthmic:last-route";
const RELOAD_REASON_KEY = "rthmic:last-reload-reason";

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

    if (
      wasReload &&
      previousRoute &&
      previousRoute !== route &&
      previousRoute.startsWith("/") &&
      route === "/"
    ) {
      router.replace(previousRoute);
      return;
    }

    sessionStorage.setItem(LAST_ROUTE_KEY, route);
  }, [pathname, router]);

  useEffect(() => {
    const markReload = () => {
      sessionStorage.setItem(RELOAD_REASON_KEY, "browser-or-runtime");
      sessionStorage.setItem(LAST_ROUTE_KEY, currentRoute());
    };
    window.addEventListener("pagehide", markReload);
    return () => window.removeEventListener("pagehide", markReload);
  }, []);

  return null;
}
