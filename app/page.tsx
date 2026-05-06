"use client";

import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0d1628] flex flex-col px-6 pt-safe">
      {/* Wordmark */}
      <header className="pt-14 pb-12">
        <h1 className="text-3xl tracking-[0.4em] uppercase" style={{ fontFamily: "var(--font-display)", fontWeight: 300, color: "#c9a55a" }}>
          RTHMIC
        </h1>
        <p className="text-xs mt-1.5 tracking-widest uppercase" style={{ color: "#c9a55a", opacity: 0.45 }}>
          Rthm-based action
        </p>
      </header>

      <section className="flex-1 flex flex-col gap-4 pb-6">
        <ModeCard
          href="/speak"
          label="Speak"
          description="Tell Rthmic your state. Get a Rthm built for you."
          symbol="◉"
          primary
        />
        <ModeCard
          href="/library"
          label="Library"
          description="Your generated Rthms and the curated collection."
          symbol="▤"
        />
        <ModeCard
          href="/understand"
          label="Understand"
          description="What is RTHMIC and when to use it"
          symbol="◎"
        />
        <ModeCard
          href="/settings"
          label="RTHMIC Styles"
          description="Configure your genre map and preferences"
          symbol="⊙"
        />
      </section>
    </main>
  );
}

function ModeCard({
  href,
  label,
  description,
  symbol,
  primary,
  subtle,
}: {
  href: string;
  label: string;
  description: string;
  symbol: string;
  primary?: boolean;
  subtle?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`
        flex items-center gap-5 px-6 rounded-2xl border transition-all duration-150
        active:scale-[0.98] touch-manipulation
        ${primary ? "py-7" : subtle ? "py-4" : "py-7"}
        ${primary ? "" : "bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.07]"}
      `}
      style={primary ? { background: "rgba(201,165,90,0.08)", borderColor: "rgba(201,165,90,0.35)" } : {}}
    >
      <span
        className={`flex-shrink-0 ${subtle ? "text-lg" : "text-2xl"}`}
        style={{ color: primary ? "#c9a55a" : subtle ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.4)" }}
        aria-hidden
      >
        {symbol}
      </span>
      <div className="flex-1 min-w-0">
        <p
          className={`font-semibold tracking-wide ${subtle ? "text-base" : "text-lg"}`}
          style={{ color: primary ? "#c9a55a" : subtle ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.8)" }}
        >
          {label}
        </p>
        <p className={`mt-0.5 leading-snug ${subtle ? "text-xs text-white/20" : "text-sm text-white/35"}`}>{description}</p>
      </div>
      <span className="flex-shrink-0 text-lg" style={{ color: primary ? "rgba(201,165,90,0.4)" : subtle ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.2)" }}>›</span>
    </Link>
  );
}
