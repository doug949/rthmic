"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "@/app/components/AppHeader";
import { RevealBlock } from "@/app/components/RevealBlock";
import type { CodexNote } from "@/app/api/codex-notes/route";

function fmt(ts: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ts));
}

export default function CodexNotesPage() {
  const [notes, setNotes] = useState<CodexNote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/codex-notes", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setNotes(data.notes ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const openNotes = notes.filter((note) => !note.done);
  const doneNotes = notes.filter((note) => note.done);

  const setDone = async (id: string, done: boolean) => {
    setNotes((prev) => prev.map((note) => note.id === id ? { ...note, done, doneAt: done ? Date.now() : undefined } : note));
    try {
      const res = await fetch("/api/codex-notes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, done }),
      });
      if (!res.ok) throw new Error("update failed");
    } catch {
      setNotes((prev) => prev.map((note) => note.id === id ? { ...note, done: !done, doneAt: !done ? Date.now() : undefined } : note));
    }
  };

  return (
    <main className="relative z-10 min-h-screen flex flex-col px-6 pt-safe" style={{ animation: "page-enter 380ms ease forwards" }}>
      <RevealBlock delay={0}>
        <AppHeader title="Codex Notes" />
      </RevealBlock>

      <section className="flex-1 flex flex-col gap-3 pb-28">
        <p className="text-xs leading-relaxed text-white/40 px-1">
          Quick thoughts captured in the app for the next Codex session.
        </p>

        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 rounded-full border-2 border-white/15 border-t-white/40 animate-spin" />
          </div>
        )}

        {!loading && notes.length === 0 && (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-10 text-center">
            <p className="text-sm text-white/45">No notes yet. Use the floating note button anywhere in the app.</p>
          </div>
        )}

        {openNotes.map((note) => (
          <NoteCard key={note.id} note={note} onToggleDone={() => setDone(note.id, true)} />
        ))}

        {doneNotes.length > 0 && (
          <div className="flex flex-col gap-2 pt-3">
            <p className="text-[10px] uppercase tracking-widest text-white/25 px-1">Done</p>
            {doneNotes.map((note) => (
              <NoteCard key={note.id} note={note} done onToggleDone={() => setDone(note.id, false)} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function NoteCard({
  note,
  done,
  onToggleDone,
}: {
  note: CodexNote;
  done?: boolean;
  onToggleDone: () => void;
}) {
  return (
    <article
      className="rounded-2xl border px-5 py-4 transition-opacity"
      style={{
        background: done ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.045)",
        borderColor: done ? "rgba(255,255,255,0.055)" : "rgba(255,255,255,0.10)",
        opacity: done ? 0.56 : 1,
      }}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={onToggleDone}
          className="mt-0.5 w-6 h-6 rounded-full border flex items-center justify-center flex-shrink-0 touch-manipulation active:scale-95 transition-transform"
          style={{
            background: done ? "rgba(201,165,90,0.18)" : "rgba(255,255,255,0.035)",
            borderColor: done ? "rgba(201,165,90,0.42)" : "rgba(255,255,255,0.18)",
            color: done ? "rgba(201,165,90,0.9)" : "rgba(255,255,255,0.28)",
          }}
          aria-label={done ? "Mark note as not done" : "Mark note as done"}
        >
          {done ? "✓" : ""}
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-white/25 mb-2">
            {fmt(note.createdAt)} · {note.source}
          </p>
          <p className="text-sm leading-relaxed text-white/72 whitespace-pre-wrap">{note.text}</p>
        </div>
      </div>
    </article>
  );
}
