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
    return {
      current: parsed.current ?? null,
      stack: Array.isArray(parsed.stack) ? parsed.stack.slice(-30) : [],
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

  const body = await request.json() as { action?: string; task?: string };
  const action = body.action;
  const task = cleanTask(body.task);
  if (!REDIS_AVAILABLE) return NextResponse.json({ state: EMPTY_STATE, message: "Attention Stack storage is unavailable." });

  try {
    const result = await withRedis(async client => {
      const key = stateKey(uid);
      const state = readState(await client.get(key));
      let message = "";

      if (action === "set") {
        if (!task) throw new Error("task required");
        state.current = newEntry(task);
        message = `Got it. You are working on ${task}.`;
      } else if (action === "pause") {
        if (!task) throw new Error("task required");
        if (!state.current) {
          state.current = newEntry(task);
          message = `I did not have a previous task saved, so I have set your current focus to ${task}.`;
        } else {
          state.stack.push({ ...state.current, pausedFor: task, pausedAt: Date.now() });
          state.current = newEntry(task);
          message = `Paused. You were working on ${state.stack[state.stack.length - 1].task}.`;
        }
      } else if (action === "resume") {
        if (state.current) state.completed.unshift({ ...state.current, pausedAt: Date.now() });
        const previous = state.stack.pop() ?? null;
        state.current = previous ? { ...previous, pausedFor: undefined, pausedAt: undefined } : null;
        message = state.current
          ? `You were working on ${state.current.task}.`
          : "That was the last saved task. Your attention stack is clear.";
      } else if (action === "clear") {
        state.current = null;
        state.stack = [];
        message = "Attention stack cleared.";
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
    const message = error instanceof Error && error.message === "task required" ? "Task required" : "Storage error";
    console.error("[attention-stack] write error:", error);
    return NextResponse.json({ error: message }, { status: message === "Task required" ? 400 : 500 });
  }
}

