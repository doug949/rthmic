"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

const LOGIN_VIDEO_SRC = "/login-vinyl.mp4";

function LoginForm() {
  const [openPanel, setOpenPanel] = useState<"login" | "request" | null>(null);
  const [videoReady, setVideoReady] = useState(false);
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
  const [loginAgreementAccepted, setLoginAgreementAccepted] = useState(false);
  const [requestAgreementAccepted, setRequestAgreementAccepted] = useState(false);
  const [loginAttempted, setLoginAttempted] = useState(false);
  const [requestAttempted, setRequestAttempted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || "/";

  useEffect(() => {
    if (openPanel === "login") inputRef.current?.focus();
  }, [openPanel]);

  function togglePanel(panel: "login" | "request") {
    setOpenPanel((current) => current === panel ? (panel === "login" ? "request" : "login") : panel);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoginAttempted(true);
    if (!password.trim() || !loginAgreementAccepted) return;
    await loginWith(password.trim());
  }

  async function loginWith(code: string) {
    setLoading(true);
    setError(false);

    const res = await fetch(`/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: code, betaAgreementAccepted: loginAgreementAccepted }),
    });

    if (res.ok) {
      const data = await res.json() as { firstLogin?: boolean; onboardingRequired?: boolean };
      router.replace(data.onboardingRequired ? "/understand?welcome=1" : from);
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
    setRequestAttempted(true);
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    if (!firstName.trim() || !validEmail || !referralSource.trim() || !requestAgreementAccepted) return;
    setRequestingAccess(true);
    setAccessError("");
    setAccessRequested(false);

    const res = await fetch("/api/request-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName, email, referralSource, website, betaAgreementAccepted: requestAgreementAccepted }),
    });

    if (res.ok) {
      setAccessRequested(true);
      setFirstName("");
      setEmail("");
      setReferralSource("");
      setRequestAgreementAccepted(false);
      setRequestAttempted(false);
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
    <main
      className="relative z-10 min-h-screen overflow-x-hidden flex flex-col items-center justify-start px-6 py-10"
      style={{ background: "#02050a" }}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center"
        aria-hidden="true"
        style={{
          backgroundImage: "url('/vinyl.jpg')",
          filter: "saturate(0.72) contrast(1.12) brightness(0.32)",
          transform: "scale(1.01)",
        }}
      />
      <video
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        controls={false}
        disablePictureInPicture
        preload="auto"
        poster="/vinyl.jpg"
        onCanPlay={() => setVideoReady(true)}
        aria-hidden="true"
        style={{
          filter: "saturate(0.76) contrast(1.12) brightness(0.42)",
          opacity: videoReady ? 0.62 : 0,
          transition: "opacity 1400ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <source src={LOGIN_VIDEO_SRC} type="video/mp4" />
      </video>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(2,6,13,0.91) 0%, rgba(5,10,20,0.82) 44%, rgba(2,6,13,0.96) 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 14%, rgba(201,165,90,0.18), transparent 32%), radial-gradient(circle at 42% 82%, rgba(70,205,235,0.10), transparent 36%)",
        }}
      />
      <div className="login-content-enter relative z-10 flex w-full flex-col items-center">
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
        <p className="mt-4 text-xs leading-relaxed text-white/48">
          Choose one path below: enter an access code you already have, or complete every field to request one.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-3xl overflow-hidden"
        style={{
          background: "rgba(8,14,26,0.78)",
          border: "1px solid rgba(255,255,255,0.22)",
          boxShadow: "0 20px 70px rgba(0,0,0,0.62)",
          backdropFilter: "blur(18px)",
        }}
      >
        <button
          type="button"
          onClick={() => togglePanel("login")}
          aria-expanded={openPanel === "login"}
          aria-controls="login-code-panel"
          className="flex w-full items-center gap-3 px-5 py-5 text-left touch-manipulation"
        >
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-[#c9a55a]/35 text-xs font-semibold text-[#c9a55a]">1</span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-white">I have a code</h2>
            <p className="mt-1 text-xs leading-relaxed text-white/42">Enter your access code to open RTHMIC.</p>
          </div>
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            aria-hidden="true"
            className={`flex-shrink-0 text-white/45 transition-transform duration-200 ${openPanel === "login" ? "rotate-180" : ""}`}
          >
            <path d="M4 7L9 12L14 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div
          id="login-code-panel"
          aria-hidden={openPanel !== "login"}
          inert={openPanel !== "login"}
          className="grid transition-[grid-template-rows] duration-300 ease-out"
          style={{ gridTemplateRows: openPanel === "login" ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">
            <div className="flex flex-col gap-4 px-5 pb-5">
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
            onChange={(e) => { setPassword(e.target.value); setError(false); }}
            placeholder="Type code here"
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
              border: error || (loginAttempted && !password.trim()) ? "3px solid #f87171" : "3px solid #ffffff",
              color: "#08090b",
              caretColor: "#08090b",
              minHeight: "64px",
              boxShadow: "0 12px 36px rgba(0,0,0,0.48)",
            }}
          />
        </label>
        {loginAttempted && !password.trim() && (
          <p className="-mt-2 px-1 text-xs text-red-300">Enter your access code.</p>
        )}
        {error && (
          <p className="text-xs text-red-400/80 text-center">Access code not recognised</p>
        )}
        <label className="flex gap-3 rounded-2xl border px-4 py-3 text-left" style={{ background: "rgba(255,255,255,0.035)", borderColor: loginAgreementAccepted ? "rgba(201,165,90,0.34)" : "rgba(255,255,255,0.10)" }}>
          <input
            type="checkbox"
            checked={loginAgreementAccepted}
            onChange={(e) => setLoginAgreementAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[#c9a55a]"
          />
          <span className="text-xs leading-relaxed text-white/52">
            I understand the private beta terms above. My feedback may be used to improve RTHMIC.
          </span>
        </label>
        {loginAttempted && !loginAgreementAccepted && (
          <p className="-mt-2 px-1 text-xs text-red-300">Accept the private beta terms to continue.</p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full font-semibold text-base tracking-wide rounded-xl py-4 transition-opacity duration-200 active:scale-[0.98]"
          style={{
            background: password.trim() && loginAgreementAccepted ? "#ffffff" : "rgba(255,255,255,0.62)",
            color: "#08090b",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "…" : "Enter RTHMIC"}
        </button>
            </div>
          </div>
        </div>
      </form>

      <form
        onSubmit={requestAccess}
        noValidate
        className="mt-4 w-full max-w-sm rounded-3xl overflow-hidden"
        style={{
          background: "rgba(8,14,26,0.72)",
          border: "1px solid rgba(255,255,255,0.14)",
          boxShadow: "0 20px 70px rgba(0,0,0,0.48)",
          backdropFilter: "blur(16px)",
        }}
      >
        <button
          type="button"
          onClick={() => togglePanel("request")}
          aria-expanded={openPanel === "request"}
          aria-controls="request-code-panel"
          className="flex w-full items-center gap-3 px-5 py-5 text-left touch-manipulation"
        >
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-[#78d2d2]/35 text-xs font-semibold text-[#78d2d2]">2</span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-white">Request a code</h2>
            <p className="mt-1 text-xs leading-relaxed text-white/42">Request personal access to the private beta.</p>
          </div>
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            aria-hidden="true"
            className={`flex-shrink-0 text-white/45 transition-transform duration-200 ${openPanel === "request" ? "rotate-180" : ""}`}
          >
            <path d="M4 7L9 12L14 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div
          id="request-code-panel"
          aria-hidden={openPanel !== "request"}
          inert={openPanel !== "request"}
          className="grid transition-[grid-template-rows] duration-300 ease-out"
          style={{ gridTemplateRows: openPanel === "request" ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">
            <div className="flex flex-col gap-3 px-5 pb-5">
        <label className="flex flex-col gap-2">
          <span className="flex justify-between px-1 text-[10px] uppercase tracking-[0.24em] text-white/48"><span>First name</span><span className="tracking-normal text-white/28">Required</span></span>
          <input
            type="text"
            value={firstName}
            onChange={(e) => { setFirstName(e.target.value); setAccessRequested(false); setAccessError(""); }}
            placeholder="First name"
            autoComplete="given-name"
            aria-invalid={requestAttempted && !firstName.trim()}
            className={`
              w-full bg-white/[0.07] border rounded-2xl px-5 py-4
              text-white placeholder-white/34 text-base tracking-wide
              outline-none focus:bg-white/[0.10] focus:border-white/36
              transition-all duration-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]
              ${requestAttempted && !firstName.trim() ? "border-red-400/70" : "border-white/16"}
            `}
          />
          {requestAttempted && !firstName.trim() && <span className="px-1 text-xs text-red-300">Enter your first name.</span>}
        </label>
        <label className="flex flex-col gap-2">
          <span className="flex justify-between px-1 text-[10px] uppercase tracking-[0.24em] text-white/48"><span>Email</span><span className="tracking-normal text-white/28">Required</span></span>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setAccessRequested(false); setAccessError(""); }}
            placeholder="you@example.com"
            autoComplete="email"
            aria-invalid={requestAttempted && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())}
            className={`
              w-full bg-white/[0.07] border rounded-2xl px-5 py-4
              text-white placeholder-white/34 text-base tracking-wide
              outline-none focus:bg-white/[0.10] focus:border-white/36
              transition-all duration-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]
              ${requestAttempted && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? "border-red-400/70" : "border-white/16"}
            `}
          />
          {requestAttempted && !email.trim() && <span className="px-1 text-xs text-red-300">Enter your email address.</span>}
          {requestAttempted && email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && <span className="px-1 text-xs text-red-300">Enter a valid email address.</span>}
        </label>
        <label className="flex flex-col gap-2">
          <span className="flex justify-between px-1 text-[10px] uppercase tracking-[0.24em] text-white/48"><span>Where did you find RTHMIC?</span><span className="tracking-normal text-white/28">Required</span></span>
          <textarea
            value={referralSource}
            onChange={(e) => { setReferralSource(e.target.value); setAccessRequested(false); setAccessError(""); }}
            placeholder="Friend, ADHD event, shared Rthm, LinkedIn, or anything useful..."
            rows={3}
            aria-invalid={requestAttempted && !referralSource.trim()}
            className={`
              w-full bg-white/[0.07] border rounded-2xl px-5 py-4
              text-white placeholder-white/34 text-base tracking-wide
              outline-none focus:bg-white/[0.10] focus:border-white/36
              transition-all duration-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]
              resize-none leading-relaxed
              ${requestAttempted && !referralSource.trim() ? "border-red-400/70" : "border-white/16"}
            `}
          />
          {requestAttempted && !referralSource.trim() && <span className="px-1 text-xs text-red-300">Tell us briefly where you found RTHMIC.</span>}
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
        <label className="flex gap-3 rounded-2xl border px-4 py-3 text-left" style={{ background: "rgba(255,255,255,0.035)", borderColor: requestAttempted && !requestAgreementAccepted ? "rgba(248,113,113,0.68)" : requestAgreementAccepted ? "rgba(201,165,90,0.34)" : "rgba(255,255,255,0.10)" }}>
          <input
            type="checkbox"
            checked={requestAgreementAccepted}
            onChange={(e) => setRequestAgreementAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[#c9a55a]"
          />
          <span className="text-xs leading-relaxed text-white/52">
            I understand the private beta terms above. My feedback may be used to improve RTHMIC.
          </span>
        </label>
        {requestAttempted && !requestAgreementAccepted && <span className="px-1 text-xs text-red-300">Accept the private beta terms before requesting access.</span>}
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
          disabled={requestingAccess}
          className="
            w-full border border-white/10 text-white/55 font-medium text-sm tracking-wide
            rounded-xl py-4
            disabled:opacity-50 transition-all duration-200
            active:scale-[0.98] bg-white/[0.07]
          "
        >
          {requestingAccess ? "…" : "Request access"}
        </button>
            </div>
          </div>
        </div>
      </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginBackdropFallback />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginBackdropFallback() {
  return (
    <main className="fixed inset-0 z-10 overflow-hidden" style={{ background: "#02050a" }} aria-hidden="true">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: "url('/vinyl.jpg')",
          filter: "saturate(0.72) contrast(1.12) brightness(0.32)",
          transform: "scale(1.01)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(180deg, rgba(2,6,13,0.91), rgba(2,6,13,0.96))" }}
      />
    </main>
  );
}
