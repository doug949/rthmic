type Router = { push: (href: string) => void; back: () => void };

const NAV_INTENT_KEY = "rthmic:navigation-intent";

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
  _onStart?.();
  setTimeout(() => {
    if (href === "__back__") router.back();
    else router.push(href);
    // Reveal is triggered by usePathname() change in PageTransitionLayer,
    // not by a timer — so the overlay only lifts once the new page is actually mounted.
  }, FADE_OUT);
}
