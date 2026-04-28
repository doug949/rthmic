import TrackList from "@/app/components/TrackList";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] flex flex-col">
      {/* Header */}
      <header className="px-6 pt-12 pb-6">
        <h1 className="text-2xl font-semibold tracking-[0.2em] text-white/90 uppercase">
          RTHMIC
        </h1>
        <p className="text-xs text-white/25 mt-1 tracking-widest uppercase">
          Audio
        </p>
      </header>

      {/* Divider */}
      <div className="mx-6 h-px bg-white/[0.06]" />

      {/* Track list */}
      <section className="flex-1 px-4 py-6">
        <TrackList />
      </section>
    </main>
  );
}
