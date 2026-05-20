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

        {notes.map((note) => (
          <article
            key={note.id}
            className="rounded-2xl border px-5 py-4"
            style={{ background: "rgba(255,255,255,0.045)", borderColor: "rgba(255,255,255,0.10)" }}
          >
            <p className="text-[10px] uppercase tracking-widest text-white/25 mb-2">
              {fmt(note.createdAt)} · {note.source}
            </p>
            <p className="text-sm leading-relaxed text-white/72 whitespace-pre-wrap">{note.text}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
