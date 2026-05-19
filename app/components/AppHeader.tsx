"use client";

/**
 * AppHeader — shared top-of-page navigation bar.
 *
 * Layout: [← Back]  ·····  [title]  [⌂]
 *
 * Rules:
 *  - Back button behaviour is controlled by the caller via `onBack`.
 *    Pass a function for custom logic, undefined for the default
 *    (browser router.back()), or null to disable it entirely.
 *  - The Home icon (⌂) is ALWAYS visible and ALWAYS goes to /.
 *    This gives users a guaranteed escape hatch from any screen.
 *  - During blocking async states (loading, transcribing, generating)
 *    pass onBack={null} so Back is greyed out and unresponsive.
 */

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { transitionTo } from "@/app/lib/pageTransition";

interface AppHeaderProps {
  /** Label text for the ← button. Defaults to "← Back". */
  backLabel?: string;
  /**
   * Behaviour when Back is pressed.
   *  - Function  → run it (custom per-page logic)
   *  - undefined → navigate via router.back()
   *  - null      → disable the button entirely (greyed out)
   */
  onBack?: (() => void) | null;
  /**
   * Short label shown in the top-right corner next to the Home icon.
   * Typically the page name (e.g. "Speak", "Library").
   */
  title?: string;
}

export function AppHeader({ backLabel = "← Back", onBack, title }: AppHeaderProps) {
  const router = useRouter();

  const handleBack = useCallback(() => {
    if (onBack === null) return;        // disabled — do nothing
    if (onBack !== undefined) { onBack(); return; } // custom handler
    // Default: browser history back with page transition
    transitionTo("__back__", router);
  }, [onBack, router]);

  const handleHome = useCallback(() => {
    transitionTo("/", router);
  }, [router]);

  return (
    <header className="relative flex items-center pt-12 pb-8">
      {/* ← Back */}
      <button
        onClick={handleBack}
        disabled={onBack === null}
        className="text-white/45 hover:text-white/70 transition-colors text-sm tracking-widest uppercase touch-manipulation disabled:opacity-20 disabled:cursor-default"
        aria-label="Go back"
      >
        {backLabel}
      </button>

      {/* Page title — absolutely centred regardless of surrounding button widths */}
      {title && (
        <span className="absolute left-1/2 -translate-x-1/2 text-white/45 text-sm uppercase tracking-widest pointer-events-none">
          {title}
        </span>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* ⌂ Home — always present, always goes to / */}
      <button
        onClick={handleHome}
        className="flex items-center gap-1.5 px-2 h-8 rounded-full touch-manipulation active:bg-white/[0.06] transition-colors"
        style={{ color: "rgba(255,255,255,0.45)" }}
        aria-label="Home"
        title="Home"
      >
        <HomeIcon />
        <span className="text-sm uppercase tracking-widest leading-none">Home</span>
      </button>
    </header>
  );
}

function HomeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ display: "block" }}>
      <path d="M12 3L2 11H5V21H19V11H22L12 3Z" fill="currentColor" />
    </svg>
  );
}
