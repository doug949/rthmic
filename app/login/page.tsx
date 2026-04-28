"use client";

import { useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || "/";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(false);

    const res = await fetch(`/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
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

  return (
    <main className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-6">
      <h1 className="text-2xl font-semibold tracking-[0.2em] text-white/90 uppercase mb-2">
        RTHMIC
      </h1>
      <p className="text-xs text-white/25 tracking-widest uppercase mb-12">
        Private
      </p>

      <form onSubmit={handleSubmit} className="w-full max-w-xs flex flex-col gap-3">
        <input
          ref={inputRef}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          autoComplete="current-password"
          className={`
            w-full bg-white/[0.05] border rounded-xl px-5 py-4
            text-white placeholder-white/20 text-sm tracking-wide
            outline-none focus:bg-white/[0.08]
            transition-all duration-200
            ${error ? "border-red-500/50" : "border-white/10 focus:border-white/25"}
          `}
        />
        {error && (
          <p className="text-xs text-red-400/80 text-center">Incorrect password</p>
        )}
        <button
          type="submit"
          disabled={loading || !password}
          className="
            w-full bg-white text-black font-medium text-sm tracking-wide
            rounded-xl py-4 mt-1
            disabled:opacity-30 transition-opacity duration-200
            active:scale-[0.98]
          "
        >
          {loading ? "…" : "Enter"}
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
