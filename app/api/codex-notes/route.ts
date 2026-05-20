import { NextRequest, NextResponse } from "next/server";
import { createClient } from "redis";

export interface CodexNote {
  id: string;
  text: string;
  createdAt: number;
  source: "voice" | "text";
}

function requireAuth(request: NextRequest): string | null {
  const session = request.cookies.get("rthmic_session");
  if (session?.value !== process.env.RTHMIC_SESSION_TOKEN) return null;
  return request.cookies.get("rthmic_uid")?.value ?? null;
}

function notesKey(uid: string) {
  return `codex-notes:${uid}`;
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
      return raw ? JSON.parse(raw) as CodexNote[] : [];
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
