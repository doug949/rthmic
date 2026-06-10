"use client";

import { useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

const LOGIN_VIDEO_SRC = "https://cdn.pixabay.com/video/2021/02/16/65390-514139029_large.mp4";

function LoginForm() {
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [referralSource, setReferralSource] = useState("");
  const [website, setWebsite] = useState("");
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
      body: JSON.stringify({ firstName, email, referralSource, website, betaAgreementAccepted }),
    });

    if (res.ok) {
      setAccessRequested(true);
      setFirstName("");
      setEmail("");
      setReferralSource("");
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
    <main className="relative min-h-screen overflow-hidden flex flex-col items-center justify-center px-6 py-10">
      <video
        className="absolute inset-0 h-full w-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden="true"
        style={{
          filter: "saturate(0.82) contrast(1.08) brightness(0.54)",
          opacity: 0.68,
        }}
      >
        <source src={LOGIN_VIDEO_SRC} type="video/mp4" />
      </video>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(4,10,20,0.84) 0%, rgba(7,13,25,0.74) 44%, rgba(4,9,18,0.92) 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 14%, rgba(201,165,90,0.18), transparent 32%), radial-gradient(circle at 42% 82%, rgba(70,205,235,0.10), transparent 36%)",
        }}
      />
      <div className="relative z-10 flex w-full flex-col items-center">
      <div className="mb-9 w-full max-w-sm text-center">
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
          className="mt-2 text-[10px] uppercase leading-relaxed"
          style={{
            letterSpacing: "0.18em",
            color: "rgba(201,165,90,0.58)",
          }}
        >
          Music-Powered Personal Productivity.<br />
          An Entirely New Category
        </p>
        <div
          className="mt-5 rounded-2xl border px-4 py-3 text-left"
          style={{
            background: "rgba(201,165,90,0.07)",
            borderColor: "rgba(201,165,90,0.22)",
          }}
        >
          <p className="text-[11px] leading-relaxed text-white/58">
            RTHMIC is a private beta. Access codes are tied to one email address. Please keep your code secure and do not share screenshots, recordings, access codes, or copy the product experience.
          </p>
        </div>
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
        <label className="flex gap-3 rounded-2xl border px-4 py-3 text-left" style={{ background: "rgba(255,255,255,0.035)", borderColor: betaAgreementAccepted ? "rgba(201,165,90,0.34)" : "rgba(255,255,255,0.10)" }}>
          <input
            type="checkbox"
            checked={betaAgreementAccepted}
            onChange={(e) => setBetaAgreementAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[#c9a55a]"
          />
          <span className="text-xs leading-relaxed text-white/52">
            I understand the private beta terms above. My feedback may be used to improve RTHMIC.
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
          Need access? Enter your details and we&apos;ll be in touch.
        </p>
        <label className="flex flex-col gap-2">
          <span className="text-[10px] uppercase tracking-[0.24em] text-white/38 px-1">First name</span>
          <input
            type="text"
            value={firstName}
            onChange={(e) => { setFirstName(e.target.value); setAccessRequested(false); setAccessError(""); }}
            placeholder="First name"
            autoComplete="given-name"
            className="
              w-full bg-white/[0.07] border border-white/16 rounded-2xl px-5 py-4
              text-white placeholder-white/34 text-base tracking-wide
              outline-none focus:bg-white/[0.10] focus:border-white/36
              transition-all duration-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]
            "
          />
        </label>
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
        <label className="flex flex-col gap-2">
          <span className="text-[10px] uppercase tracking-[0.24em] text-white/38 px-1">Where did you find RTHMIC?</span>
          <textarea
            value={referralSource}
            onChange={(e) => { setReferralSource(e.target.value); setAccessRequested(false); setAccessError(""); }}
            placeholder="Friend, ADHD event, shared Rthm, LinkedIn, or anything useful..."
            rows={3}
            className="
              w-full bg-white/[0.07] border border-white/16 rounded-2xl px-5 py-4
              text-white placeholder-white/34 text-base tracking-wide
              outline-none focus:bg-white/[0.10] focus:border-white/36
              transition-all duration-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]
              resize-none leading-relaxed
            "
          />
        </label>
        <label className="hidden" aria-hidden="true">
          Website
          <input
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </label>
        <p className="rounded-2xl border px-4 py-3 text-[11px] leading-relaxed text-white/55" style={{ background: "rgba(255,255,255,0.035)", borderColor: "rgba(201,165,90,0.18)" }}>
          If approved, your access code will be emailed to you. Please check your spam or junk folder.
        </p>
        {accessRequested && (
          <p className="text-xs text-white/55 text-center">Request received. If approved, we&apos;ll email your code. Please check spam too.</p>
        )}
        {accessError && (
          <p className="text-xs text-red-400/75 text-center">{accessError}</p>
        )}
        <button
          type="submit"
          disabled={requestingAccess || !firstName.trim() || !email || !betaAgreementAccepted}
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
      </div>
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
