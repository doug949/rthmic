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
          Rhythm-based action
        </p>
      </header>

      <section className="flex-1 flex flex-col gap-4 pb-12">
        <ModeCard
          href="/speak"
          label="Speak"
          description="Tell RTHMIC your state. Get a rhythm built for you."
          symbol="◉"
          primary
        />
        <ModeCard
          href="/library"
          label="Library"
          description="Your generated rhythms and the curated collection."
          symbol="▤"
        />
        <ModeCard
          href="/understand"
          label="Understand"
          description="What is RTHMIC and when to use it"
          symbol="◎"
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
}: {
  href: string;
  label: string;
  description: string;
  symbol: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`
        flex items-center gap-5 px-6 py-7 rounded-2xl border transition-all duration-150
        active:scale-[0.98] touch-manipulation
        ${primary ? "" : "bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.07]"}
      `}
      style={primary ? { background: "rgba(201,165,90,0.08)", borderColor: "rgba(201,165,90,0.35)" } : {}}
    >
      <span
        className="text-2xl flex-shrink-0"
        style={{ color: primary ? "#c9a55a" : "rgba(255,255,255,0.4)" }}
        aria-hidden
      >
        {symbol}
      </span>
      <div className="flex-1 min-w-0">
        <p
          className="text-lg font-semibold tracking-wide"
          style={{ color: primary ? "#c9a55a" : "rgba(255,255,255,0.8)" }}
        >
          {label}
        </p>
        <p className="text-sm text-white/35 mt-0.5 leading-snug">{description}</p>
      </div>
      <span className="flex-shrink-0 text-lg" style={{ color: primary ? "rgba(201,165,90,0.4)" : "rgba(255,255,255,0.2)" }}>›</span>
    </Link>
  );
}
