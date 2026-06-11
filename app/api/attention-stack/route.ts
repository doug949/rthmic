import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/access";
import { REDIS_AVAILABLE, withRedis } from "@/app/lib/redis";

interface AttentionEntry {
  id: string;
  task: string;
  pausedFor?: string;
  startedAt: number;
  pausedAt?: number;
}

interface AttentionState {
  current: AttentionEntry | null;
  stack: AttentionEntry[];
  completed: AttentionEntry[];
}

const EMPTY_STATE: AttentionState = { current: null, stack: [], completed: [] };

function requireAuth(request: NextRequest): string | null {
  if (!requireAdmin(request)) return null;
  return request.cookies.get("rthmic_uid")?.value ?? null;
}

function stateKey(uid: string) {
  return `attention-stack:${uid}`;
}

function cleanTask(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 500) : "";
}

function readState(raw: string | null): AttentionState {
  if (!raw) return { ...EMPTY_STATE, stack: [], completed: [] };
  try {
    const parsed = JSON.parse(raw) as Partial<AttentionState>;
    const current = parsed.current ?? null;
    const stack = Array.isArray(parsed.stack) ? parsed.stack.slice(-30) : [];
    const last = stack.at(-1);
    if (current && last && (last.id === current.id || cleanTask(last.task).toLowerCase() === cleanTask(current.task).toLowerCase())) {
      stack.pop();
    }
    return {
      current,
      stack,
      completed: Array.isArray(parsed.completed) ? parsed.completed.slice(0, 50) : [],
    };
  } catch {
    return { ...EMPTY_STATE, stack: [], completed: [] };
  }
}

function newEntry(task: string): AttentionEntry {
  return {
    id: `focus-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    task,
    startedAt: Date.now(),
  };
}

export async function GET(request: NextRequest) {
  const uid = requireAuth(request);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!REDIS_AVAILABLE) return NextResponse.json({ state: EMPTY_STATE });

  try {
    const state = await withRedis(async client => readState(await client.get(stateKey(uid))));
    return NextResponse.json({ state });
  } catch (error) {
    console.error("[attention-stack] read error:", error);
    return NextResponse.json({ state: EMPTY_STATE });
  }
}

export async function POST(request: NextRequest) {
  const uid = requireAuth(request);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { action?: string; task?: string; pausedTask?: string; entryId?: string; direction?: string };
  const action = body.action;
  const task = cleanTask(body.task);
  const pausedTask = cleanTask(body.pausedTask);
  if (!REDIS_AVAILABLE) return NextResponse.json({ state: EMPTY_STATE, message: "Attention Stack storage is unavailable." });

  try {
    const result = await withRedis(async client => {
      const key = stateKey(uid);
      const state = readState(await client.get(key));
      let message = "";

      if (action === "set") {
        if (!task) throw new Error("task required");
        state.current = newEntry(task);
      } else if (action === "transition") {
        if (!pausedTask || !task) throw new Error("task required");
        const pausedEntry = newEntry(pausedTask);
        state.stack.push({ ...pausedEntry, pausedFor: task, pausedAt: Date.now() });
        state.current = newEntry(task);
      } else if (action === "pause") {
        if (!task) throw new Error("task required");
        if (!state.current) {
          state.current = newEntry(task);
        } else {
          state.stack.push({ ...state.current, pausedFor: task, pausedAt: Date.now() });
          state.current = newEntry(task);
        }
      } else if (action === "resume") {
        if (state.current) state.completed.unshift({ ...state.current, pausedAt: Date.now() });
        const previous = state.stack.pop() ?? null;
        state.current = previous ? { ...previous, pausedFor: undefined, pausedAt: undefined } : null;
        message = state.current
          ? `You were working on ${state.current.task}.`
          : "That was the last saved task. Your attention stack is clear.";
      } else if (action === "clear") {
        state.stack = [];
        message = "Saved attention stack cleared.";
      } else if (action === "delete") {
        const index = state.stack.findIndex(entry => entry.id === body.entryId);
        if (index < 0) throw new Error("entry required");
        state.stack.splice(index, 1);
      } else if (action === "move") {
        const index = state.stack.findIndex(entry => entry.id === body.entryId);
        if (index < 0) throw new Error("entry required");
        const target = body.direction === "toward-current" ? index + 1 : index - 1;
        if (target >= 0 && target < state.stack.length) {
          [state.stack[index], state.stack[target]] = [state.stack[target], state.stack[index]];
        }
      } else if (action === "status") {
        message = state.current
          ? `You are working on ${state.current.task}.`
          : "There is no current task saved.";
      } else {
        return { error: "Unknown action", status: 400 } as const;
      }

      state.completed = state.completed.slice(0, 50);
      await client.set(key, JSON.stringify(state));
      return { state, message };
    });

    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error && error.message === "task required"
      ? "Task required"
      : error instanceof Error && error.message === "entry required"
        ? "Stack item not found"
        : "Storage error";
    console.error("[attention-stack] write error:", error);
    return NextResponse.json({ error: message }, { status: message === "Storage error" ? 500 : 400 });
  }
}
