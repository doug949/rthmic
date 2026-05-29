"use client";

import { useEffect } from "react";
import { recordDiagnosticEvent } from "@/app/lib/clientDiagnostics";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    recordDiagnosticEvent("next-error-boundary", {
      name: error.name,
      message: error.message,
      stack: error.stack,
      digest: error.digest,
    });
  }, [error]);

  return (
    <main className="relative z-10 flex min-h-screen items-center justify-center px-6 text-center text-white">
      <section
        className="max-w-md rounded-3xl border p-6"
        style={{ borderColor: "rgba(201,165,90,0.26)", background: "rgba(8,14,25,0.82)" }}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.28em]" style={{ color: "rgba(201,165,90,0.82)" }}>
          RTHMIC diagnostic capture
        </p>
        <h1 className="mt-3 text-2xl font-semibold">This route hit a runtime error.</h1>
        <p className="mt-3 text-sm leading-relaxed text-white/60">
          The failure has been saved to diagnostics with the current route, build, visibility state, and memory snapshot where available.
        </p>
        <button
          className="mt-5 rounded-full px-5 py-3 text-sm font-medium"
          style={{ background: "rgba(201,165,90,0.18)", color: "rgba(201,165,90,0.95)" }}
          onClick={reset}
        >
          Try again
        </button>
      </section>
    </main>
  );
}
