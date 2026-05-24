"use client";

export const DIAGNOSTIC_SESSION_KEY = "rthmic:diagnostic-session-id";
export const DIAGNOSTIC_EVENTS_KEY = "rthmic:diagnostic-events-v1";
export const ROUTE_STACK_KEY = "rthmic:route-stack-v1";

export interface DiagnosticEvent {
  id: string;
  at: string;
  type: string;
  route: string;
  sessionId: string;
  detail?: Record<string, unknown>;
}

export function currentClientRoute(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function getDiagnosticSessionId(): string {
  try {
    const existing = sessionStorage.getItem(DIAGNOSTIC_SESSION_KEY);
    if (existing) return existing;
    const next = randomId("session");
    sessionStorage.setItem(DIAGNOSTIC_SESSION_KEY, next);
    return next;
  } catch {
    return "session-unavailable";
  }
}

export function readDiagnosticEvents(): DiagnosticEvent[] {
  return readJson<DiagnosticEvent[]>(DIAGNOSTIC_EVENTS_KEY, []);
}

export function recordDiagnosticEvent(
  type: string,
  detail?: Record<string, unknown>
): DiagnosticEvent | null {
  try {
    const event: DiagnosticEvent = {
      id: randomId("event"),
      at: new Date().toISOString(),
      type,
      route: currentClientRoute(),
      sessionId: getDiagnosticSessionId(),
      detail,
    };
    const next = [event, ...readDiagnosticEvents()].slice(0, 80);
    localStorage.setItem(DIAGNOSTIC_EVENTS_KEY, JSON.stringify(next));
    return event;
  } catch {
    return null;
  }
}

export function updateRouteStack(route: string): string[] {
  try {
    const current = readJson<string[]>(ROUTE_STACK_KEY, []);
    const next = [route, ...current.filter((candidate) => candidate !== route)].slice(0, 12);
    localStorage.setItem(ROUTE_STACK_KEY, JSON.stringify(next));
    return next;
  } catch {
    return [route];
  }
}

export function readRouteStack(): string[] {
  return readJson<string[]>(ROUTE_STACK_KEY, []);
}
