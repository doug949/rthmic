"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "@/app/components/AppHeader";
import { RevealBlock } from "@/app/components/RevealBlock";
import { useAudio } from "@/app/contexts/AudioContext";
import type { PodcastContent, PodcastEpisode, PodcastFeaturedTrack } from "@/app/lib/podcast";

const EMPTY_CONTENT: PodcastContent = { episodes: [], featuredTracks: [] };

export default function PodcastPage() {
  const { currentTrackId, isPlaying, handlePlayUrl, handlePlay } = useAudio();
  const [content, setContent] = useState<PodcastContent>(EMPTY_CONTENT);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/podcast", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : EMPTY_CONTENT)
      .then((next) => setContent(next))
      .catch(() => setContent(EMPTY_CONTENT))
      .finally(() => setLoading(false));
  }, []);

  const playEpisode = (episode: PodcastEpisode) => {
    if (episode.audioUrl) handlePlayUrl(`podcast-episode-${episode.id}`, episode.audioUrl, episode.title);
  };

  const playTrack = (track: PodcastFeaturedTrack) => {
    if (track.audioKey) handlePlay(`podcast-${track.id}`, track.audioKey, track.title);
    else if (track.audioUrl) handlePlayUrl(`podcast-${track.id}`, track.audioUrl, track.title);
  };

  const addTrack = async (trackId: string) => {
    if (addingId || addedIds.has(trackId)) return;
    setAddingId(trackId);
    try {
      const response = await fetch("/api/podcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "addFeaturedTrack", trackId }),
      });
      if (!response.ok) throw new Error();
      setAddedIds((current) => new Set(current).add(trackId));
      window.dispatchEvent(new CustomEvent("library-mutated"));
    } finally {
      setAddingId(null);
    }
  };

  return (
    <main className="relative z-10 min-h-screen flex flex-col px-6 pt-safe" style={{ animation: "page-enter 380ms ease forwards" }}>
      <RevealBlock delay={0}><AppHeader title="RTHMIC Podcast" /></RevealBlock>

      <section className="flex-1 flex flex-col gap-8 pb-24">
        <RevealBlock delay={30}>
          <div className="relative overflow-hidden rounded-2xl min-h-[220px] border border-white/[0.09]">
            <img src="/images/tiles/optimized/podcast.webp" alt="Podcast microphone in a recording studio" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#08101f] via-[#08101f]/50 to-transparent" />
            <div className="relative min-h-[220px] flex flex-col justify-end p-6">
              <p className="text-[10px] uppercase tracking-[0.26em] text-[#78d2d2]">Listen. Discover. Keep.</p>
              <h1 className="mt-2 text-3xl font-light text-white" style={{ fontFamily: "var(--font-display)" }}>RTHMIC Podcast</h1>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/58">Conversations about music-powered personal productivity, with featured Rthms you can add directly to your own catalog.</p>
            </div>
          </div>
        </RevealBlock>

        <PodcastSection title="Episodes" count={content.episodes.length}>
          {loading ? <LoadingRows /> : content.episodes.length ? content.episodes.map((episode) => (
            <article key={episode.id} className="rounded-xl border border-white/[0.08] bg-white/[0.035] p-4 flex gap-4">
              <button onClick={() => playEpisode(episode)} disabled={!episode.audioUrl} className="h-11 w-11 shrink-0 rounded-full border border-[#78d2d2]/30 bg-[#78d2d2]/10 text-[#78d2d2] disabled:opacity-25" aria-label={`Play ${episode.title}`}>
                {currentTrackId === `podcast-episode-${episode.id}` && isPlaying ? "Ⅱ" : "▶"}
              </button>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-white/88">{episode.title}</h2>
                <p className="mt-1 text-xs leading-relaxed text-white/42">{episode.description}</p>
                <p className="mt-2 text-[10px] uppercase tracking-widest text-white/24">{episode.publishedAt}{episode.duration ? ` · ${episode.duration}` : ""}</p>
              </div>
            </article>
          )) : <EmptyState text="The first RTHMIC Podcast episode is being prepared." />}
        </PodcastSection>

        <PodcastSection title="Featured Tracks" count={content.featuredTracks.length}>
          {loading ? <LoadingRows /> : content.featuredTracks.length ? content.featuredTracks.map((track) => {
            const added = addedIds.has(track.id);
            return (
              <article key={track.id} className="rounded-xl border border-[#78d2d2]/15 bg-[#78d2d2]/[0.035] p-4">
                <div className="flex items-start gap-4">
                  <button onClick={() => playTrack(track)} disabled={!track.audioUrl && !track.audioKey} className="h-11 w-11 shrink-0 rounded-full border border-[#78d2d2]/30 bg-[#78d2d2]/10 text-[#78d2d2] disabled:opacity-25" aria-label={`Play ${track.title}`}>
                    {currentTrackId === `podcast-${track.id}` && isPlaying ? "Ⅱ" : "▶"}
                  </button>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-semibold text-white/88">{track.title}</h2>
                    {track.creatorName && <p className="mt-1 text-[10px] uppercase tracking-widest text-[#78d2d2]/65">Created by {track.creatorName}</p>}
                    {track.description && <p className="mt-2 text-xs leading-relaxed text-white/42">{track.description}</p>}
                  </div>
                </div>
                <button onClick={() => addTrack(track.id)} disabled={added || addingId === track.id} className="mt-4 w-full rounded-xl border border-[#c9a55a]/30 bg-[#c9a55a]/10 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#c9a55a] disabled:opacity-55">
                  {added ? "Added to Favourites" : addingId === track.id ? "Adding…" : "Add to My Library"}
                </button>
              </article>
            );
          }) : <EmptyState text="Featured Rthms from the community will appear here." />}
        </PodcastSection>
      </section>
    </main>
  );
}

function PodcastSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <RevealBlock delay={60}>
      <section>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.22em] text-white/55">{title}</h2>
          {count > 0 && <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/35">{count}</span>}
        </div>
        <div className="flex flex-col gap-3">{children}</div>
      </section>
    </RevealBlock>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-white/[0.09] px-5 py-8 text-center text-sm leading-relaxed text-white/34">{text}</div>;
}

function LoadingRows() {
  return <div className="h-24 animate-pulse rounded-xl bg-white/[0.035]" />;
}
