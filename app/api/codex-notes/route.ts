import { NextRequest, NextResponse } from "next/server";
import { createClient } from "redis";

export interface CodexNote {
  id: string;
  text: string;
  createdAt: number;
  source: "voice" | "text";
  done?: boolean;
  doneAt?: number;
}

function requireAuth(request: NextRequest): string | null {
  const session = request.cookies.get("rthmic_session");
  if (session?.value !== process.env.RTHMIC_SESSION_TOKEN) return null;
  return request.cookies.get("rthmic_uid")?.value ?? null;
}

function notesKey(uid: string) {
  return `codex-notes:${uid}`;
}

function isAppDiagnosticNote(note: CodexNote) {
  return note.text.trim().startsWith("[App diagnostic]");
}

async function withRedis<T>(
  fn: (client: ReturnType<typeof createClient>) => Promise<T>
): Promise<T> {
  const client = createClient({ url: process.env.REDIS_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.disconnect();
  }
}

export async function GET(request: NextRequest) {
  const uid = requireAuth(request);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.REDIS_URL) return NextResponse.json({ notes: [] });

  try {
    const notes = await withRedis(async (client) => {
      const raw = await client.get(notesKey(uid));
      const current = raw ? JSON.parse(raw) as CodexNote[] : [];
      const visible = current.filter((note) => !isAppDiagnosticNote(note));
      if (visible.length !== current.length) {
        await client.set(notesKey(uid), JSON.stringify(visible));
      }
      return visible;
    });
    return NextResponse.json({ notes });
  } catch (err) {
    console.error("[codex-notes] get error:", err);
    return NextResponse.json({ notes: [] });
  }
}

export async function POST(request: NextRequest) {
  const uid = requireAuth(request);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.REDIS_URL) return NextResponse.json({ ok: true });

  const body = await request.json();
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const source = body.source === "text" ? "text" : "voice";
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  const note: CodexNote = {
    id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    source,
    createdAt: Date.now(),
  };

  try {
    await withRedis(async (client) => {
      const key = notesKey(uid);
      const raw = await client.get(key);
      const current: CodexNote[] = raw ? JSON.parse(raw) : [];
      await client.set(key, JSON.stringify([note, ...current].slice(0, 200)));
    });
    return NextResponse.json({ ok: true, note });
  } catch (err) {
    console.error("[codex-notes] write error:", err);
    return NextResponse.json({ error: "Storage error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const uid = requireAuth(request);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.REDIS_URL) return NextResponse.json({ ok: true });

  const body = await request.json();
  const id = typeof body.id === "string" ? body.id : "";
  const done = typeof body.done === "boolean" ? body.done : undefined;
  if (!id || done === undefined) return NextResponse.json({ error: "id and done required" }, { status: 400 });

  try {
    const note = await withRedis(async (client) => {
      const key = notesKey(uid);
      const raw = await client.get(key);
      const current: CodexNote[] = raw ? JSON.parse(raw) : [];
      let updatedNote: CodexNote | null = null;
      const updated = current.map((n) => {
        if (n.id !== id) return n;
        updatedNote = {
          ...n,
          done,
          ...(done ? { doneAt: Date.now() } : { doneAt: undefined }),
        };
        if (!done) delete updatedNote.doneAt;
        return updatedNote;
      });
      await client.set(key, JSON.stringify(updated));
      return updatedNote;
    });
    if (!note) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true, note });
  } catch (err) {
    console.error("[codex-notes] patch error:", err);
    return NextResponse.json({ error: "Storage error" }, { status: 500 });
  }
}
