"use client";

import { useState, useRef } from "react";

interface BatchResult {
  done: boolean;
  uploaded: number;
  failed: number;
  remaining: number;
  uploadedTracks: string[];
  failedTracks: { id: string; reason: string }[];
}

interface RepairResult {
  done: boolean;
  repaired: number;
  failed: number;
  remaining: number;
  checked: number;
  healthy: number;
  badTotal: number;
  repairedTracks: { id: string; title: string; source: string }[];
  failedTracks: { id: string; title: string; reason: string }[];
}

export default function BackfillPage() {
  const [running, setRunning] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [done, setDone] = useState(false);
  const [totalUploaded, setTotalUploaded] = useState(0);
  const [totalFailed, setTotalFailed] = useState(0);
  const [totalRepaired, setTotalRepaired] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  const addLog = (msg: string) =>
    setLog((l) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...l]);

  const run = async () => {
    setRunning(true);
    setDone(false);
    setError(null);
    abortRef.current = false;

    let batchNum = 0;
    while (!abortRef.current) {
      batchNum++;
      addLog(`Batch ${batchNum} — sending request…`);
      let res: Response;
      try {
        res = await fetch("/api/admin/backfill-wasabi?batch=10");
      } catch (e) {
        setError(`Network error: ${e}`);
        break;
      }

      if (!res.ok) {
        const text = await res.text();
        setError(`HTTP ${res.status}: ${text}`);
        break;
      }

      const data: BatchResult = await res.json();
      setTotalUploaded((n) => n + data.uploaded);
      setTotalFailed((n) => n + data.failed);
      setRemaining(data.remaining);

      addLog(
        `Batch ${batchNum} done — ↑${data.uploaded} uploaded, ✗${data.failed} failed, ${data.remaining} remaining`
      );

      if (data.uploadedTracks.length > 0)
        addLog(`  Uploaded: ${data.uploadedTracks.join(", ")}`);
      if (data.failedTracks.length > 0)
        addLog(`  Failed: ${data.failedTracks.map((f) => f.id).join(", ")}`);

      if (data.done) {
        setDone(true);
        addLog("All tracks uploaded. Backfill complete.");
        break;
      }

      // Small pause between batches to avoid hammering
      await new Promise((r) => setTimeout(r, 500));
    }

    setRunning(false);
  };

  const repair = async () => {
    setRepairing(true);
    setDone(false);
    setError(null);
    abortRef.current = false;

    let batchNum = 0;
    while (!abortRef.current) {
      batchNum++;
      addLog(`Repair batch ${batchNum} — checking Wasabi objects…`);
      let res: Response;
      try {
        res = await fetch("/api/admin/repair-wasabi?batch=10");
      } catch (e) {
        setError(`Network error: ${e}`);
        break;
      }

      if (!res.ok) {
        const text = await res.text();
        setError(`HTTP ${res.status}: ${text}`);
        break;
      }

      const data: RepairResult = await res.json();
      setTotalRepaired((n) => n + data.repaired);
      setTotalFailed((n) => n + data.failed);
      setRemaining(data.remaining);

      addLog(
        `Repair batch ${batchNum} done — checked ${data.checked}, healthy ${data.healthy}, bad ${data.badTotal}, repaired ${data.repaired}, failed ${data.failed}, ${data.remaining} remaining`
      );
      if (data.repairedTracks.length > 0)
        addLog(`  Repaired: ${data.repairedTracks.map((t) => `${t.title} (${t.source})`).join(", ")}`);
      if (data.failedTracks.length > 0)
        addLog(`  Failed: ${data.failedTracks.map((f) => `${f.title || f.id}: ${f.reason}`).join(" | ")}`);

      if (data.done) {
        setDone(true);
        addLog("Wasabi repair complete — no zero-byte/missing audioKey objects remain.");
        break;
      }

      await new Promise((r) => setTimeout(r, 500));
    }

    setRepairing(false);
  };

  const stop = () => {
    abortRef.current = true;
    addLog("Stopping after current batch…");
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#050508",
        color: "#e2e8f0",
        fontFamily: "monospace",
        padding: "2rem",
      }}
    >
      <h1 style={{ color: "rgb(167,139,250)", marginBottom: "0.5rem" }}>
        Wasabi Backfill
      </h1>
      <p style={{ color: "rgba(255,255,255,0.4)", marginBottom: "2rem", fontSize: "0.85rem" }}>
        Auto-runs batches of 10 uploads until all tracks are on Wasabi.
      </p>

      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem" }}>
        <button
          onClick={run}
          disabled={running || repairing}
          style={{
            background: running ? "rgba(109,40,217,0.3)" : "rgba(109,40,217,0.8)",
            color: "white",
            border: "none",
            borderRadius: "8px",
            padding: "0.6rem 1.4rem",
            cursor: running ? "default" : "pointer",
            fontSize: "0.9rem",
          }}
        >
          {running ? "Running…" : done ? "Run Again" : "Start Backfill"}
        </button>
        <button
          onClick={repair}
          disabled={running || repairing}
          style={{
            background: repairing ? "rgba(14,165,233,0.3)" : "rgba(14,165,233,0.75)",
            color: "white",
            border: "none",
            borderRadius: "8px",
            padding: "0.6rem 1.4rem",
            cursor: running || repairing ? "default" : "pointer",
            fontSize: "0.9rem",
          }}
        >
          {repairing ? "Repairing…" : "Repair Wasabi"}
        </button>
        {(running || repairing) && (
          <button
            onClick={stop}
            style={{
              background: "rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.6)",
              border: "none",
              borderRadius: "8px",
              padding: "0.6rem 1.4rem",
              cursor: "pointer",
              fontSize: "0.9rem",
            }}
          >
            Stop
          </button>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "1rem",
          marginBottom: "1.5rem",
          maxWidth: "480px",
        }}
      >
        {[
          { label: "Uploaded", value: totalUploaded, color: "rgb(167,139,250)" },
          { label: "Repaired", value: totalRepaired, color: "rgb(125,211,252)" },
          { label: "Failed", value: totalFailed, color: "rgb(252,165,165)" },
          { label: "Remaining", value: remaining ?? "—", color: "rgba(255,255,255,0.5)" },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            style={{
              background: "rgba(255,255,255,0.04)",
              borderRadius: "8px",
              padding: "0.8rem",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color }}>{value}</div>
            <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.4)", marginTop: "2px" }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {done && (
        <p style={{ color: "rgb(134,239,172)", marginBottom: "1rem", fontWeight: 600 }}>
          ✓ Backfill complete — all tracks on Wasabi.
        </p>
      )}

      {error && (
        <p style={{ color: "rgb(252,165,165)", marginBottom: "1rem" }}>Error: {error}</p>
      )}

      <div
        style={{
          background: "rgba(0,0,0,0.4)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: "8px",
          padding: "1rem",
          maxHeight: "400px",
          overflowY: "auto",
          fontSize: "0.78rem",
          lineHeight: "1.6",
          color: "rgba(255,255,255,0.6)",
        }}
      >
        {log.length === 0 ? (
          <span style={{ color: "rgba(255,255,255,0.2)" }}>Log output will appear here…</span>
        ) : (
          log.map((line, i) => <div key={i}>{line}</div>)
        )}
      </div>
    </div>
  );
}
