"use client";

export const DIAGNOSTIC_SESSION_KEY = "rthmic:diagnostic-session-id";
export const DIAGNOSTIC_EVENTS_KEY = "rthmic:diagnostic-events-v1";
export const ROUTE_STACK_KEY = "rthmic:route-stack-v1";
export const CURRENT_ROUTE_KEY = "rthmic:current-route-v1";
export const LAST_ROUTE_KEY = "rthmic:last-route";
export const PREVIOUS_ROUTE_KEY = "rthmic:previous-route";
export const RELOAD_REASON_KEY = "rthmic:last-reload-reason";
export const NAV_INTENT_KEY = "rthmic:navigation-intent";
export const SW_VERSION_KEY = "rthmic:service-worker-version";

const MAX_EVENTS = 120;
const MAX_ROUTES = 24;
const MAX_DIAGNOSTIC_PARAM_LENGTH = 180;
const OMITTED_ROUTE_PARAMS = new Set([
  "autoText",
  "context",
  "draft",
  "lyrics",
  "prompt",
  "seed",
  "text",
  "transcript",
]);

export interface DiagnosticEvent {
  id: string;
  at: string;
  type: string;
  route: string;
  sessionId: string;
  currentRoute: string;
  previousRoute: string | null;
  appVersion: string;
  deploymentVersion: string;
  serviceWorkerVersion: string;
  visibilityState: string;
  detail?: Record<string, unknown>;
}

export function currentClientRoute(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function sanitizeDiagnosticRoute(route: string | null | undefined): string | null {
  if (!route) return null;
  try {
    const parsed = new URL(route, window.location.origin);
    const params = new URLSearchParams(parsed.search);
    let changed = false;

    for (const [key, value] of Array.from(params.entries())) {
      if (OMITTED_ROUTE_PARAMS.has(key)) {
        params.set(key, `[omitted ${value.length} chars]`);
        changed = true;
      } else if (value.length > MAX_DIAGNOSTIC_PARAM_LENGTH) {
        params.set(key, `${value.slice(0, MAX_DIAGNOSTIC_PARAM_LENGTH)}... [truncated ${value.length} chars]`);
        changed = true;
      }
    }

    if (!changed && route.length <= 700) return route;

    const search = params.toString();
    const hash = parsed.hash && parsed.hash.length > MAX_DIAGNOSTIC_PARAM_LENGTH
      ? "#[omitted hash]"
      : parsed.hash;
    const sanitized = `${parsed.pathname}${search ? `?${search}` : ""}${hash}`;
    return sanitized.length > 900 ? `${sanitized.slice(0, 900)}... [truncated route]` : sanitized;
  } catch {
    return route.length > 700 ? `${route.slice(0, 700)}... [truncated route]` : route;
  }
}

function diagnosticRoute(): string {
  return sanitizeDiagnosticRoute(currentClientRoute()) ?? "/";
}

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

export function safeGetSessionItem(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSetSessionItem(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in private or constrained browser contexts.
  }
}

export function safeRemoveSessionItem(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Best-effort cleanup.
  }
}

export function safeGetLocalItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSetLocalItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Diagnostic writes are intentionally non-fatal.
  }
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = safeGetLocalItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function getDiagnosticSessionId(): string {
  try {
    const existing = safeGetSessionItem(DIAGNOSTIC_SESSION_KEY);
    if (existing) return existing;
    const next = randomId("session");
    safeSetSessionItem(DIAGNOSTIC_SESSION_KEY, next);
    return next;
  } catch {
    return "session-unavailable";
  }
}

export function readDiagnosticEvents(): DiagnosticEvent[] {
  return readJson<DiagnosticEvent[]>(DIAGNOSTIC_EVENTS_KEY, []);
}

export function getAppVersion(): string {
  return process.env.NEXT_PUBLIC_RTHMIC_BUILD ?? "dev";
}

export function getDeploymentVersion(): string {
  return process.env.NEXT_PUBLIC_RTHMIC_DEPLOYMENT ?? getAppVersion();
}

export function getServiceWorkerVersion(): string {
  return safeGetSessionItem(SW_VERSION_KEY) ?? safeGetLocalItem(SW_VERSION_KEY) ?? "unknown";
}

export function getMemorySnapshot(): Record<string, number | string> {
  const performanceWithMemory = performance as Performance & {
    memory?: {
      usedJSHeapSize?: number;
      totalJSHeapSize?: number;
      jsHeapSizeLimit?: number;
    };
  };
  const memory = performanceWithMemory.memory;

  if (!memory) {
    return { available: "no" };
  }

  return {
    available: "yes",
    usedJSHeapSize: memory.usedJSHeapSize ?? 0,
    totalJSHeapSize: memory.totalJSHeapSize ?? 0,
    jsHeapSizeLimit: memory.jsHeapSizeLimit ?? 0,
  };
}

function estimateStorage(storage: Storage): number {
  let total = 0;
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key) continue;
    const value = storage.getItem(key) ?? "";
    total += key.length + value.length;
  }
  return total;
}

export function getStorageSnapshot(): Record<string, number | string> {
  try {
    return {
      available: "yes",
      localStorageApproxBytes: estimateStorage(localStorage) * 2,
      sessionStorageApproxBytes: estimateStorage(sessionStorage) * 2,
      localStorageKeys: localStorage.length,
      sessionStorageKeys: sessionStorage.length,
    };
  } catch {
    return { available: "no" };
  }
}

export function collectDiagnosticDetail(extra?: Record<string, unknown>): Record<string, unknown> {
  return {
    currentRoute: diagnosticRoute(),
    previousRoute: sanitizeDiagnosticRoute(safeGetSessionItem(LAST_ROUTE_KEY) ?? safeGetSessionItem(PREVIOUS_ROUTE_KEY)),
    appVersion: getAppVersion(),
    deploymentVersion: getDeploymentVersion(),
    serviceWorkerVersion: getServiceWorkerVersion(),
    visibilityState: typeof document === "undefined" ? "unknown" : document.visibilityState,
    timestamp: new Date().toISOString(),
    memory: getMemorySnapshot(),
    storage: getStorageSnapshot(),
    ...extra,
  };
}

export function recordDiagnosticEvent(
  type: string,
  detail?: Record<string, unknown>
): DiagnosticEvent | null {
  try {
    const route = diagnosticRoute();
    const previousRoute = sanitizeDiagnosticRoute(safeGetSessionItem(LAST_ROUTE_KEY) ?? safeGetSessionItem(PREVIOUS_ROUTE_KEY));
    const event: DiagnosticEvent = {
      id: randomId("event"),
      at: new Date().toISOString(),
      type,
      route,
      currentRoute: route,
      previousRoute,
      sessionId: getDiagnosticSessionId(),
      appVersion: getAppVersion(),
      deploymentVersion: getDeploymentVersion(),
      serviceWorkerVersion: getServiceWorkerVersion(),
      visibilityState: typeof document === "undefined" ? "unknown" : document.visibilityState,
      detail: collectDiagnosticDetail(detail),
    };
    const next = [event, ...readDiagnosticEvents()].slice(0, MAX_EVENTS);
    safeSetLocalItem(DIAGNOSTIC_EVENTS_KEY, JSON.stringify(next));
    return event;
  } catch {
    return null;
  }
}

export function updateRouteStack(route: string): string[] {
  try {
    const routeForDiagnostics = sanitizeDiagnosticRoute(route) ?? "/";
    const current = readJson<string[]>(ROUTE_STACK_KEY, []);
    const next = [routeForDiagnostics, ...current.filter((candidate) => candidate !== routeForDiagnostics)].slice(0, MAX_ROUTES);
    safeSetLocalItem(ROUTE_STACK_KEY, JSON.stringify(next));
    return next;
  } catch {
    return [sanitizeDiagnosticRoute(route) ?? "/"];
  }
}

export function readRouteStack(): string[] {
  return readJson<string[]>(ROUTE_STACK_KEY, []);
}

export interface PersistedRouteState {
  route: string;
  at: string;
  sessionId: string;
  stack: string[];
}

export function persistCurrentRoute(route = currentClientRoute()): PersistedRouteState | null {
  try {
    const routeForDiagnostics = sanitizeDiagnosticRoute(route) ?? "/";
    const previous = safeGetSessionItem(CURRENT_ROUTE_KEY);
    if (previous && previous !== routeForDiagnostics) safeSetSessionItem(PREVIOUS_ROUTE_KEY, previous);
    safeSetSessionItem(CURRENT_ROUTE_KEY, routeForDiagnostics);
    safeSetSessionItem(LAST_ROUTE_KEY, routeForDiagnostics);
    safeSetLocalItem(CURRENT_ROUTE_KEY, routeForDiagnostics);
    const stack = updateRouteStack(routeForDiagnostics);
    const state: PersistedRouteState = {
      route: routeForDiagnostics,
      at: new Date().toISOString(),
      sessionId: getDiagnosticSessionId(),
      stack,
    };
    safeSetSessionItem(`${CURRENT_ROUTE_KEY}:state`, JSON.stringify(state));
    safeSetLocalItem(`${CURRENT_ROUTE_KEY}:state`, JSON.stringify(state));
    return state;
  } catch {
    return null;
  }
}

export function readPersistedRouteState(): PersistedRouteState | null {
  const raw = safeGetSessionItem(`${CURRENT_ROUTE_KEY}:state`) ?? safeGetLocalItem(`${CURRENT_ROUTE_KEY}:state`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PersistedRouteState;
  } catch {
    return null;
  }
}
