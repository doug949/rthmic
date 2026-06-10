"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "@/app/components/AppHeader";
import { AmbientBackground } from "@/app/components/AmbientBackground";

interface AccessRequestEntry {
  email: string;
  requestedAt?: number;
  source?: string;
}

function formatRequestedAt(value?: number) {
  if (!value) return "Unknown time";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function AccessRequestsPage() {
  const [requests, setRequests] = useState<AccessRequestEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [approving, setApproving] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/access-requests", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load requests");
        if (!cancelled) setRequests(data.requests || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load requests");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function approveRequest(email: string) {
    setApproving(email);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not approve request");

      setRequests((current) => current.filter((entry) => entry.email !== email));
      setMessage(data.sent ? `Approved ${email} and emailed their code.` : `Approved ${email}. Code: ${data.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not approve request");
    } finally {
      setApproving("");
    }
  }

  return (
    <main className="min-h-screen relative overflow-hidden text-white">
      <AmbientBackground />
      <div className="relative z-10 min-h-screen px-6 pt-10 pb-24 max-w-3xl mx-auto">
        <AppHeader title="Beta Requests" />
        <p className="text-sm text-white/45 mb-8">People who requested a tester access code from the login screen.</p>

        {loading && <p className="text-sm text-white/40">Loading requests...</p>}
        {error && <p className="text-sm text-red-300/70">{error}</p>}
        {message && <p className="mb-4 text-sm text-[#c9a55a]/80">{message}</p>}
        {!loading && !error && requests.length === 0 && (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-5">
            <p className="text-sm text-white/50">No beta requests yet.</p>
          </div>
        )}

        <div className="space-y-3">
          {requests.map((entry) => (
            <div key={entry.email} className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-base font-medium text-white/82 break-all">{entry.email}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-widest">
                    <span className="rounded-full border border-[#c9a55a]/25 bg-[#c9a55a]/10 px-3 py-1 text-[#c9a55a]/80">
                      {formatRequestedAt(entry.requestedAt)}
                    </span>
                    <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-white/38">
                      Requested from {entry.source || "login"}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => approveRequest(entry.email)}
                  disabled={approving === entry.email}
                  className="rounded-full border border-[#c9a55a]/35 bg-[#c9a55a]/10 px-5 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#c9a55a] disabled:opacity-50"
                >
                  {approving === entry.email ? "Approving..." : "Approve"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
