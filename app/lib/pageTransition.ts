type Router = { push: (href: string) => void; back: () => void };

const NAV_INTENT_KEY = "rthmic:navigation-intent";
const PREVIOUS_ROUTE_KEY = "rthmic:previous-route";

// Module-level singleton — the overlay subscribes once at layout mount.
let _onStart: (() => void) | null = null;

export function subscribeToTransitions(onStart: () => void) {
  _onStart = onStart;
  return () => { _onStart = null; };
}

const FADE_OUT = 240; // ms — time for overlay to reach full black before navigating

export function transitionTo(href: string, router: Router) {
  if (typeof window !== "undefined") {
    sessionStorage.setItem(NAV_INTENT_KEY, href);
  }

  const currentPath =
    typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}${window.location.hash}`
      : "";

  if (href !== "__back__" && href === currentPath) return;

  _onStart?.();
  setTimeout(() => {
    if (href === "__back__") {
      const previousRoute = sessionStorage.getItem(PREVIOUS_ROUTE_KEY);
      if (previousRoute && previousRoute !== currentPath && previousRoute.startsWith("/")) {
        sessionStorage.setItem(NAV_INTENT_KEY, previousRoute);
        sessionStorage.removeItem(PREVIOUS_ROUTE_KEY);
        router.push(previousRoute);
        return;
      }

      const before = typeof window !== "undefined" ? window.location.href : "";
      router.back();
      window.setTimeout(() => {
        if (window.location.href === before) {
          sessionStorage.setItem(NAV_INTENT_KEY, "/");
          router.push("/");
        }
      }, 650);
    } else {
      if (typeof window !== "undefined" && currentPath && currentPath !== href) {
        sessionStorage.setItem(PREVIOUS_ROUTE_KEY, currentPath);
      }
      router.push(href);
    }
    // Reveal is triggered by usePathname() change in PageTransitionLayer,
    // with a failsafe in case browser history does not move.
  }, FADE_OUT);
}
