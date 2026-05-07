"use client";

import { useState, useEffect } from "react";

interface FeedbackEntry {
  id: string;
  uid: string;
  transcript: string;
  submittedAt: number;
}

export default function AdminPage() {
  const [key, setKey] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [entries, setEntries] = useState<FeedbackEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchFeedback = async (adminKey: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/feedback?key=${encodeURIComponent(adminKey)}`);
      if (res.status === 401) { setError("Invalid key"); setSubmitted(false); return; }
      if (!res.ok) throw new Error("Server error");
      const data = await res.json();
      setEntries(data.entries ?? []);
      setSubmitted(true);
    } catch {
      setError("Could not load feedback");
    } finally {
      setLoading(false);
    }
  };

  const fmtDate = (ms: number) =>
    new Date(ms).toLocaleString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

  if (!submitted) {
    return (
      <main className="min-h-screen bg-[#0d1628] flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm flex flex-col gap-6">
          <div>
            <h1 className="text-xl font-light text-white tracking-wide" style={{ fontFamily: "var(--font-display)" }}>
              RTHMIC Admin
            </h1>
            <p className="text-xs text-white/25 mt-1 tracking-widest uppercase">Beta feedback</p>
          </div>

          {error && <p className="text-sm text-red-400/60">{error}</p>}

          <input
            type="password"
            placeholder="Admin key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && key && fetchFeedback(key)}
            className="w-full px-5 py-4 rounded-2xl text-sm text-white bg-white/[0.04] border border-white/[0.08] outline-none placeholder:text-white/20 focus:border-white/20"
            autoComplete="off"
          />

          <button
            onClick={() => key && fetchFeedback(key)}
            disabled={!key || loading}
            className="w-full py-4 rounded-2xl text-sm font-semibold tracking-wide transition-all disabled:opacity-30"
            style={{ background: "rgba(201,165,90,0.08)", border: "1px solid rgba(201,165,90,0.35)", color: "#c9a55a" }}
          >
            {loading ? "Loading…" : "View feedback"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0d1628] flex flex-col px-6 pb-16">
      <header className="flex items-center justify-between pt-12 pb-8">
        <div>
          <h1 className="text-xl font-light text-white tracking-wide" style={{ fontFamily: "var(--font-display)" }}>
            Beta Feedback
          </h1>
          <p className="text-xs text-white/25 mt-1">{entries.length} {entries.length === 1 ? "entry" : "entries"}</p>
        </div>
        <button
          onClick={() => fetchFeedback(key)}
          className="text-xs text-white/30 hover:text-white/60 transition-colors tracking-widest uppercase"
        >
          Refresh
        </button>
      </header>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3">
          <p className="text-white/20 text-sm">No feedback yet</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="rounded-2xl px-5 py-5 flex flex-col gap-3"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <div className="flex items-center justify-between gap-4">
                <p className="text-[10px] text-white/20 tracking-widest uppercase font-mono">
                  {fmtDate(entry.submittedAt)}
                </p>
                <p className="text-[10px] text-white/15 font-mono truncate max-w-[120px]">
                  {entry.uid.slice(0, 8)}…
                </p>
              </div>
              <p className="text-sm text-white/70 leading-relaxed">{entry.transcript}</p>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
