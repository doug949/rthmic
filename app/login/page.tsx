"use client";

import { useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginForm() {
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [requestingAccess, setRequestingAccess] = useState(false);
  const [accessRequested, setAccessRequested] = useState(false);
  const [accessError, setAccessError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || "/";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await loginWith(password);
  }

  async function loginWith(code: string) {
    setLoading(true);
    setError(false);

    const res = await fetch(`/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: code }),
    });

    if (res.ok) {
      router.push(from);
      router.refresh();
    } else {
      setError(true);
      setPassword("");
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  async function requestAccess(e: React.FormEvent) {
    e.preventDefault();
    setRequestingAccess(true);
    setAccessError("");
    setAccessRequested(false);

    const res = await fetch("/api/request-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (res.ok) {
      setAccessRequested(true);
      setEmail("");
    } else {
      let message = "Could not request access";
      try {
        const data = await res.json();
        if (data.error) message = data.error;
      } catch { /* ignore */ }
      setAccessError(message);
    }
    setRequestingAccess(false);
  }

  return (
    <main className="min-h-screen bg-[#08090b] flex flex-col items-center justify-center px-6">
      <h1
        className="text-2xl font-semibold tracking-[0.22em] uppercase mb-12"
        style={{ color: "rgba(255,255,255,0.9)" }}
      >
        RTHMIC
      </h1>

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm flex flex-col gap-3 rounded-3xl p-4"
        style={{
          background: "rgba(0,0,0,0.28)",
          border: "1px solid rgba(255,255,255,0.14)",
          boxShadow: "0 18px 60px rgba(0,0,0,0.38)",
        }}
      >
        <label className="flex flex-col gap-2">
          <span
            className="text-[11px] uppercase tracking-[0.24em] px-1"
            style={{ color: "rgba(255,255,255,0.72)" }}
          >
            Access code
          </span>
          <input
            ref={inputRef}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your access code"
            autoFocus
            autoComplete="current-password"
            className="w-full rounded-2xl px-5 py-4 text-base tracking-wide outline-none transition-all duration-200"
            aria-label="Access code"
            style={{
              WebkitAppearance: "none",
              appearance: "none",
              background: "rgba(255,255,255,0.92)",
              border: error ? "2px solid rgba(248,113,113,0.95)" : "2px solid rgba(255,255,255,0.92)",
              color: "#08090b",
              caretColor: "#08090b",
              boxShadow: "0 10px 30px rgba(0,0,0,0.34)",
            }}
          />
        </label>
        {error && (
          <p className="text-xs text-red-400/80 text-center">Access code not recognised</p>
        )}
        <button
          type="submit"
          disabled={loading || !password}
          className="w-full font-semibold text-sm tracking-wide rounded-xl py-4 mt-1 transition-opacity duration-200 active:scale-[0.98]"
          style={{
            background: password ? "#ffffff" : "rgba(255,255,255,0.42)",
            color: "#08090b",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "…" : "Enter"}
        </button>
      </form>

      <form onSubmit={requestAccess} className="w-full max-w-sm flex flex-col gap-3 mt-8">
        <p className="text-xs text-white/35 text-center leading-relaxed">
          Need access? Enter your email and we&apos;ll be in touch.
        </p>
        <label className="flex flex-col gap-2">
          <span className="text-[10px] uppercase tracking-[0.24em] text-white/38 px-1">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setAccessRequested(false); setAccessError(""); }}
            placeholder="you@example.com"
            autoComplete="email"
            className="
              w-full bg-white/[0.07] border border-white/16 rounded-2xl px-5 py-4
              text-white placeholder-white/34 text-base tracking-wide
              outline-none focus:bg-white/[0.10] focus:border-white/36
              transition-all duration-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]
            "
          />
        </label>
        {accessRequested && (
          <p className="text-xs text-white/55 text-center">Request received. We&apos;ll email you about access.</p>
        )}
        {accessError && (
          <p className="text-xs text-red-400/75 text-center">{accessError}</p>
        )}
        <button
          type="submit"
          disabled={requestingAccess || !email}
          className="
            w-full border border-white/10 text-white/55 font-medium text-sm tracking-wide
            rounded-xl py-4
            disabled:opacity-30 transition-all duration-200
            active:scale-[0.98] bg-white/[0.03]
          "
        >
          {requestingAccess ? "…" : "Request access"}
        </button>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
