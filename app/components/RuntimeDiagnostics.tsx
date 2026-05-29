"use client";

import { Component, type ErrorInfo, type ReactNode, useEffect } from "react";
import { recordDiagnosticEvent } from "@/app/lib/clientDiagnostics";

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

  return null;
}
