"use client";

import { Component, type ErrorInfo, type ReactNode, useEffect } from "react";
import {
  RELOAD_REASON_KEY,
  recordDiagnosticEvent,
  safeGetSessionItem,
} from "@/app/lib/clientDiagnostics";

type RuntimeDiagnosticsBoundaryProps = {
  children: ReactNode;
};

type RuntimeDiagnosticsBoundaryState = {
  error: Error | null;
};

function errorDetail(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
  };
}

function fetchRequestDetail(input: RequestInfo | URL, init?: RequestInit) {
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");
  const rawUrl = input instanceof Request ? input.url : String(input);
  let url = rawUrl;
  let origin = "unknown";

  try {
    const parsed = new URL(rawUrl, window.location.href);
    origin = parsed.origin === window.location.origin ? "same-origin" : parsed.origin;
    url = parsed.origin === window.location.origin
      ? `${parsed.pathname}${parsed.search}`
      : parsed.origin;
  } catch {
    // Keep the raw value if URL parsing fails.
  }

  return {
    method,
    url,
    origin,
    online: navigator.onLine,
    visibilityState: document.visibilityState,
  };
}

function isUserUpdatingApp(): boolean {
  return safeGetSessionItem(RELOAD_REASON_KEY) === "user-clicked-update";
}

function isLoadFailed(error: unknown): boolean {
  return error instanceof Error && error.name === "TypeError" && error.message === "Load failed";
}

function libraryActionFromBody(body: BodyInit | null | undefined): string | undefined {
  if (!body || typeof body !== "string") return undefined;
  try {
    const parsed = JSON.parse(body) as { action?: unknown };
    return typeof parsed.action === "string" ? parsed.action : undefined;
  } catch {
    return undefined;
  }
}

function shouldSuppressExpectedUpdateFetch(detail: ReturnType<typeof fetchRequestDetail>, error: unknown): boolean {
  return isUserUpdatingApp() && detail.origin === "same-origin" && detail.url === "/api/library" && isLoadFailed(error);
}

export class RuntimeDiagnosticsBoundary extends Component<
  RuntimeDiagnosticsBoundaryProps,
  RuntimeDiagnosticsBoundaryState
> {
  state: RuntimeDiagnosticsBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RuntimeDiagnosticsBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    recordDiagnosticEvent("react-error-boundary", {
      error: errorDetail(error),
      componentStack: errorInfo.componentStack,
    });
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="relative z-10 flex min-h-screen items-center justify-center px-6 text-center text-white">
        <section
          className="max-w-md rounded-3xl border p-6"
          style={{ borderColor: "rgba(201,165,90,0.26)", background: "rgba(8,14,25,0.82)" }}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.28em]" style={{ color: "rgba(201,165,90,0.82)" }}>
            RTHMIC recovered an error
          </p>
          <h1 className="mt-3 text-2xl font-semibold">Something interrupted this screen.</h1>
          <p className="mt-3 text-sm leading-relaxed text-white/60">
            The error was recorded locally in diagnostics. Reload RTHMIC to restore your last saved route and continue.
          </p>
          <button
            className="mt-5 rounded-full px-5 py-3 text-sm font-medium"
            style={{ background: "rgba(201,165,90,0.18)", color: "rgba(201,165,90,0.95)" }}
            onClick={() => window.location.reload()}
          >
            Reload RTHMIC
          </button>
        </section>
      </main>
    );
  }
}

export function RuntimeDiagnosticsListeners() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      recordDiagnosticEvent("window-error", {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: errorDetail(event.error),
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isUserUpdatingApp() && isLoadFailed(event.reason)) return;
      recordDiagnosticEvent("unhandledrejection", {
        reason: errorDetail(event.reason),
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  useEffect(() => {
    const originalFetch = window.fetch;
    if ((originalFetch as typeof originalFetch & { __rthmicDiagnosticsPatched?: boolean }).__rthmicDiagnosticsPatched) {
      return;
    }

    const patchedFetch: typeof window.fetch = async (input, init) => {
      const startedAt = performance.now();
      const detail = {
        ...fetchRequestDetail(input, init),
        action: libraryActionFromBody(init?.body),
      };

      try {
        const response = await originalFetch(input, init);
        if (response.status >= 500) {
          recordDiagnosticEvent("fetch-response-error", {
            ...detail,
            status: response.status,
            statusText: response.statusText,
            durationMs: Math.round(performance.now() - startedAt),
          });
        }
        return response;
      } catch (error) {
        if (shouldSuppressExpectedUpdateFetch(detail, error)) {
          throw error;
        }
        recordDiagnosticEvent("fetch-load-failed", {
          ...detail,
          durationMs: Math.round(performance.now() - startedAt),
          error: errorDetail(error),
        });
        throw error;
      }
    };

    (patchedFetch as typeof patchedFetch & { __rthmicDiagnosticsPatched?: boolean }).__rthmicDiagnosticsPatched = true;
    window.fetch = patchedFetch;

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}
