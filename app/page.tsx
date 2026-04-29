import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] flex flex-col px-6 pt-safe">
      {/* Wordmark */}
      <header className="pt-14 pb-12">
        <h1 className="text-3xl font-semibold tracking-[0.25em] text-white/90 uppercase">
          RTHMIC
        </h1>
        <p className="text-xs text-white/25 mt-1.5 tracking-widest uppercase">
          Rhythm-based action
        </p>
      </header>

      {/* Mode cards */}
      <section className="flex-1 flex flex-col gap-4 pb-12">
        <ModeCard
          href="/understand"
          label="Understand"
          description="What is RTHMIC and when to use it"
          symbol="◎"
        />
        <ModeCard
          href="/explore"
          label="Explore"
          description="Browse all RTHMs in the Scape"
          symbol="◈"
        />
        <ModeCard
          href="/unlock"
          label="Unlock"
          description="Tap. Play. Go."
          symbol="▶"
          primary
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
        ${
          primary
            ? "bg-white/10 border-white/20 hover:bg-white/[0.14]"
            : "bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.07]"
        }
      `}
    >
      <span
        className={`text-2xl flex-shrink-0 ${primary ? "text-white" : "text-white/40"}`}
        aria-hidden
      >
        {symbol}
      </span>
      <div className="flex-1 min-w-0">
        <p
          className={`text-lg font-semibold tracking-wide ${
            primary ? "text-white" : "text-white/80"
          }`}
        >
          {label}
        </p>
        <p className="text-sm text-white/35 mt-0.5 leading-snug">{description}</p>
      </div>
      <span className="text-white/20 flex-shrink-0 text-lg">›</span>
    </Link>
  );
}
