import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

const FADE_DURATION = 240; // ms — must match CSS transition duration

/**
 * Fade the current page out, then navigate.
 * Pass "__back__" to use router.back() instead of router.push().
 */
export function transitionTo(href: string, router: AppRouterInstance) {
  document.documentElement.classList.add("page-leaving");
  setTimeout(() => {
    if (href === "__back__") router.back();
    else router.push(href);
    // Remove class immediately after push — old DOM is gone, new page uses page-enter
    requestAnimationFrame(() => {
      document.documentElement.classList.remove("page-leaving");
    });
  }, FADE_DURATION);
}
