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
  const [betaAgreementAccepted, setBetaAgreementAccepted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || "/";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await loginWith(password.trim());
  }

  async function loginWith(code: string) {
    setLoading(true);
    setError(false);

    const res = await fetch(`/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: code, betaAgreementAccepted }),
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
      body: JSON.stringify({ email, betaAgreementAccepted }),
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
    <main className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 py-10">
      <div className="mb-9 text-center">
        <h1
          className="text-4xl uppercase"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 300,
            letterSpacing: "0.22em",
            color: "#c9a55a",
            textShadow: "0 0 28px rgba(201,165,90,0.18)",
          }}
        >
          RTHMIC
        </h1>
        <p
          className="mt-2 text-[10px] uppercase"
          style={{
            letterSpacing: "0.32em",
            color: "rgba(201,165,90,0.58)",
          }}
        >
          music to live by
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm flex flex-col gap-4 rounded-3xl p-5"
        style={{
          background: "rgba(8,14,26,0.78)",
          border: "1px solid rgba(255,255,255,0.22)",
          boxShadow: "0 20px 70px rgba(0,0,0,0.62)",
          backdropFilter: "blur(18px)",
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
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Type code here"
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            className="block w-full rounded-2xl px-5 py-5 text-lg tracking-wide outline-none transition-all duration-200"
            aria-label="Access code"
            style={{
              WebkitAppearance: "none",
              appearance: "none",
              backgroundColor: "#ffffff",
              border: error ? "3px solid #f87171" : "3px solid #ffffff",
              color: "#08090b",
              caretColor: "#08090b",
              minHeight: "64px",
              boxShadow: "0 12px 36px rgba(0,0,0,0.48)",
            }}
          />
        </label>
        {error && (
          <p className="text-xs text-red-400/80 text-center">Access code not recognised</p>
        )}
        <label
          className="flex gap-3 rounded-2xl border px-4 py-3 text-left"
          style={{
            background: "rgba(255,255,255,0.035)",
            borderColor: betaAgreementAccepted ? "rgba(201,165,90,0.34)" : "rgba(255,255,255,0.10)",
          }}
        >
          <input
            type="checkbox"
            checked={betaAgreementAccepted}
            onChange={(e) => setBetaAgreementAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[#c9a55a]"
          />
          <span className="text-xs leading-relaxed text-white/52">
            I understand RTHMIC is a private beta. I won&apos;t share screenshots, recordings, access codes, or copy the product experience, and my feedback may be used to improve RTHMIC.
          </span>
        </label>
        <button
          type="submit"
          disabled={loading || !password.trim() || !betaAgreementAccepted}
          className="w-full font-semibold text-base tracking-wide rounded-xl py-4 transition-opacity duration-200 active:scale-[0.98]"
          style={{
            background: password.trim() && betaAgreementAccepted ? "#ffffff" : "rgba(255,255,255,0.72)",
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
          disabled={requestingAccess || !email || !betaAgreementAccepted}
          className="
            w-full border border-white/10 text-white/55 font-medium text-sm tracking-wide
            rounded-xl py-4
            disabled:opacity-30 transition-all duration-200
            active:scale-[0.98] bg-white/[0.03]
          "
        >
          {requestingAccess ? "…" : "Request access"}
        </button>
        {!betaAgreementAccepted && email && (
          <p className="text-[11px] text-white/30 text-center leading-relaxed">
            Please accept the private beta agreement above before requesting access.
          </p>
        )}
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
