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
        <div className="flex items-start justify-between gap-4 px-1">
          <p className="text-xs leading-relaxed text-white/40">
            Quick thoughts captured in the app for the next Codex session.
          </p>
          {!loading && notes.length > 0 && (
            <div className="flex-shrink-0 text-right">
              <p className="text-[10px] uppercase tracking-widest text-white/28">{openNotes.length} open</p>
              <p className="text-[10px] uppercase tracking-widest text-white/18">{doneNotes.length} addressed</p>
            </div>
          )}
        </div>

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
          <p className="text-[10px] uppercase tracking-widest text-white/25 px-1">Addressed</p>
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
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 mb-2">
            <p className="text-[10px] uppercase tracking-widest text-white/25 leading-relaxed">
              {fmt(note.createdAt)} · {note.source}
            </p>
            <button
              onClick={onToggleDone}
              className="flex-shrink-0 rounded-full border px-3 py-1.5 text-[10px] uppercase tracking-widest touch-manipulation active:scale-[0.98] transition-transform"
              style={{
                background: done ? "rgba(255,255,255,0.025)" : "rgba(201,165,90,0.10)",
                borderColor: done ? "rgba(255,255,255,0.08)" : "rgba(201,165,90,0.28)",
                color: done ? "rgba(255,255,255,0.30)" : "rgba(201,165,90,0.82)",
              }}
              aria-label={done ? "Reopen Codex note" : "Mark Codex note addressed"}
            >
              {done ? "Reopen" : "Mark addressed"}
            </button>
          </div>
          <p className="text-sm leading-relaxed text-white/72 whitespace-pre-wrap">{note.text}</p>
        </div>
      </div>
    </article>
  );
}
