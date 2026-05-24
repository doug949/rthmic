"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/app/components/AppHeader";
import { RevealBlock } from "@/app/components/RevealBlock";
import { CassetteIcon } from "@/app/components/HomeTileIcons";
import type { SavedRhythm } from "@/app/types/library";
import { useAudio, type AudioQueueTrack } from "@/app/contexts/AudioContext";
import { RhythmRow } from "@/app/library/_components";
import { groupRhythmPairs, sideLabelFor } from "@/app/lib/rhythmPairs";

const RTHMIX_CODE = "doug2026";
const CROATIAN_RTHMIX_ID = "croatian-starter-memory";
const CROATIAN_ALBUM_TITLE = "Croatian Starter";
const CROATIAN_ALBUM_ART_PROMPT = "Square album cover for Croatian Starter, a premium Rthmix memory album: Adriatic coastline at dusk, purple-gold moonlit water, six small glowing language tokens, subtle tamburica strings, modern minimal typography, cinematic but clean.";

const progressionTracks = [
  {
    title: "RTHMIX Album Generator",
    detail: "Turn a goal into track zero, ordered unlock tracks, and a reflective bonus track. Intended for gradual generation.",
    status: "Prototype next",
  },
  {
    title: "Track Zero",
    detail: "Explain the concept, the target, and how the listener should move through the album.",
    status: "Planned",
  },
  {
    title: "Ordered Unlocks",
    detail: "Each track revisits the previous unlock briefly, then introduces one new unlock.",
    status: "Planned",
  },
  {
    title: "Bonus Reflection",
    detail: "Close the Rthmix by acknowledging what has been achieved and giving it a moment to land.",
    status: "Planned",
  },
];

const croatianMemoryRthmix = [
  {
    number: "00",
    title: "Ground Zero: Six Words, Six Hooks",
    role: "ground-zero",
    unlock: "How to use this Memory Rthmix",
    detail: "One Croatian word per Rthm. Each track starts with the word, gives you one sticky sound hook, then ends on the word again.",
    hook: "Do not rush the set. Play a track until the hook brings the word back without effort, then move on.",
  },
  {
    number: "01",
    title: "Hvala: The First Door",
    role: "memory-hook",
    unlock: "hvala = thank you",
    detail: "Hvala sounds like 'voila'. Someone helps, the moment appears: voila, thank you, hvala.",
    hook: "Hvala at the start, voila in the middle, hvala at the end.",
  },
  {
    number: "02",
    title: "Molim: The Polite Ask",
    role: "memory-hook",
    unlock: "molim = please / you're welcome",
    detail: "Molim sounds like 'moll him'. Imagine asking softly, not pushing: molim, please.",
    hook: "The polite little ask is molim.",
  },
  {
    number: "03",
    title: "Da: The Door Opens",
    role: "memory-hook",
    unlock: "da = yes",
    detail: "Da is short like a door opening: da, yes, go through.",
    hook: "Da is the open door.",
  },
  {
    number: "04",
    title: "Ne: The Clean Boundary",
    role: "memory-hook",
    unlock: "ne = no",
    detail: "Ne sounds like 'nay'. The horse says nay, the answer says no: ne.",
    hook: "Nay means no. Ne means no.",
  },
  {
    number: "05",
    title: "Voda: The River Word",
    role: "memory-hook",
    unlock: "voda = water",
    detail: "Voda sounds like 'water' beginning with a V. Visualise a V-shaped stream pouring water.",
    hook: "V-shaped water becomes voda.",
  },
  {
    number: "06",
    title: "Kruh: Bread at the Table",
    role: "memory-hook",
    unlock: "kruh = bread",
    detail: "Kruh sounds like 'crust'. Bread has a crust; crust pulls you back to kruh.",
    hook: "Crust on bread, kruh for bread.",
  },
  {
    number: "07",
    title: "Bonus: You Have Six",
    role: "bonus",
    unlock: "Reflect on the full chain",
    detail: "The closing track runs the six-word chain and gives the achievement a moment to land.",
    hook: "Hvala, molim, da, ne, voda, kruh.",
  },
];

export default function RthmixPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [checked, setChecked] = useState(false);
  const [rhythms, setRhythms] = useState<SavedRhythm[]>([]);
  const [showLyricsId, setShowLyricsId] = useState<string | null>(null);
  const [shareToastId, setShareToastId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [selectedSideIds, setSelectedSideIds] = useState<Record<string, string>>({});
  const { currentTrackId, isPlaying, currentTime, duration, handlePlayUrl, playQueue } = useAudio();

  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)rthmic_code=([^;]+)/);
    const code = match ? decodeURIComponent(match[1]) : "";
    setAllowed(code === RTHMIX_CODE);
    setChecked(true);
  }, []);

  const fetchLibrary = useCallback(async () => {
    try {
      const res = await fetch("/api/library", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setRhythms(data.rhythms ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!allowed) return;
    fetchLibrary();
    const onMutated = () => fetchLibrary();
    window.addEventListener("library-mutated", onMutated);
    return () => window.removeEventListener("library-mutated", onMutated);
  }, [allowed, fetchLibrary]);

  const mutate = useCallback(async (body: Record<string, unknown>) => {
    await fetch("/api/library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await fetchLibrary();
    window.dispatchEvent(new CustomEvent("library-mutated"));
  }, [fetchLibrary]);

  const updateRhythm = (id: string, patch: Partial<SavedRhythm>) =>
    mutate({ action: "update", id, ...patch });

  const markActive = (rhythm: SavedRhythm) => {
    if (rhythm.status !== "new") return;
    updateRhythm(rhythm.id, { status: "active" });
    const alternate = rhythms.find((r) =>
      r.id === rhythm.alternateId ||
      (rhythm.pairId && r.pairId === rhythm.pairId && r.id !== rhythm.id)
    );
    if (alternate?.status === "new") updateRhythm(alternate.id, { status: "active" });
  };

  const queueTrackFor = (rhythm: SavedRhythm): AudioQueueTrack | null => {
    if (!rhythm.audioUrl && !rhythm.audioKey) return null;
    return {
      id: rhythm.id,
      url: `/api/proxy-audio?id=${encodeURIComponent(rhythm.id)}`,
      title: rhythm.title,
      meta: { rhythmId: rhythm.id },
    };
  };

  const handleShare = async (rhythm: SavedRhythm) => {
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rhythmId: rhythm.id }),
      });
      if (!res.ok) throw new Error("share failed");
      const { url } = await res.json();
      if (navigator.share) {
        await navigator.share({ title: rhythm.title, text: `Listen to "${rhythm.title}" on RTHMIC`, url });
      } else {
        await navigator.clipboard.writeText(url);
        setShareToastId(rhythm.id);
        setTimeout(() => setShareToastId((id) => id === rhythm.id ? null : id), 2500);
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") console.error("Share failed:", err);
    }
  };

  const albumRhythms = rhythms.filter((r) =>
    r.status !== "deleted" &&
    (
      r.rthmixId === CROATIAN_RTHMIX_ID ||
      croatianMemoryRthmix.some((track) => r.title === track.title || r.title === `${track.title} (Variation)`)
    )
  );

  const albumCards = croatianMemoryRthmix.map((track) => {
    const trackRhythms = albumRhythms.filter((r) =>
      r.rthmixTrackNumber === track.number ||
      r.title === track.title ||
      r.title === `${track.title} (Variation)`
    );
    const card = groupRhythmPairs(trackRhythms, selectedSideIds)[0];
    return { track, card };
  });
  const albumQueue = albumCards
    .map(({ card }) => card ? queueTrackFor(card.rhythm) : null)
    .filter((track): track is AudioQueueTrack => !!track);
  const readyTrackCount = albumCards.filter(({ card }) => !!card).length;

  const playAlbumFrom = (rhythm: SavedRhythm) => {
    const track = queueTrackFor(rhythm);
    if (!track) return;
    if (currentTrackId === rhythm.id) {
      handlePlayUrl(rhythm.id, track.url, rhythm.title, track.meta);
      return;
    }
    markActive(rhythm);
    playQueue(albumQueue, rhythm.id, { loopEach: true });
  };

  const playAlbum = () => {
    if (!albumQueue.length) return;
    const first = albumCards.find(({ card }) => card)?.card?.rhythm;
    if (first) markActive(first);
    playQueue(albumQueue, undefined, { loopEach: true });
  };

  if (!checked) {
    return (
      <main className="relative z-10 min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-white/15 border-t-white/50 animate-spin" />
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="relative z-10 min-h-screen flex flex-col px-6 pt-safe" style={{ animation: "page-enter 380ms ease forwards" }}>
        <RevealBlock delay={0}>
          <AppHeader title="Rthmix" titleIcon={<CassetteIcon />} />
        </RevealBlock>
        <section className="flex-1 flex flex-col items-center justify-center text-center pb-28">
          <p className="text-sm text-white/45">Rthmix is in private preview.</p>
          <button onClick={() => router.push("/")} className="mt-5 text-xs uppercase tracking-widest text-white/35">Return Home</button>
        </section>
      </main>
    );
  }

  return (
    <main className="relative z-10 min-h-screen flex flex-col px-6 pt-safe" style={{ animation: "page-enter 380ms ease forwards" }}>
      <RevealBlock delay={0}>
        <AppHeader title="Rthmix" titleIcon={<CassetteIcon />} />
      </RevealBlock>

      <section className="flex-1 flex flex-col gap-4 pb-28">
        <div className="rounded-2xl border px-5 py-5" style={{ background: "rgba(230,155,60,0.08)", borderColor: "rgba(230,155,60,0.28)" }}>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-[10px] uppercase tracking-[0.3em]" style={{ color: "rgba(240,170,80,0.9)" }}>Private preview</p>
            <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: "rgba(230,155,60,0.12)", color: "rgba(240,170,80,0.72)", border: "1px solid rgba(230,155,60,0.22)" }}>Soon</span>
          </div>
          <h1 className="text-2xl font-light text-white/90 leading-tight" style={{ fontFamily: "var(--font-display)" }}>
            Build albums that teach one unlock at a time.
          </h1>
          <p className="text-sm text-white/45 leading-relaxed mt-3">
            Rthmix is where a goal becomes track zero, ordered progress tracks, and a reflective bonus track.
          </p>
        </div>

        <RthmixSection
          label="Memory Rthmixes"
          intro="Kept separate because these are retrieval chains: one memory hook per track. Each track loops until it feels ready, then you skip forward."
        >
          <div className="rounded-2xl border overflow-hidden" style={{ background: "rgba(139,92,246,0.06)", borderColor: "rgba(139,92,246,0.22)" }}>
            <div className="px-5 py-4 border-b flex gap-4" style={{ borderColor: "rgba(139,92,246,0.16)" }}>
              <AlbumArt />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-[0.28em]" style={{ color: "rgba(167,139,250,0.82)" }}>Memory Album</p>
                <h2 className="text-lg font-light text-white/88 mt-1" style={{ fontFamily: "var(--font-display)" }}>
                  Croatian Starter
                </h2>
                <p className="text-xs text-white/42 leading-relaxed mt-2">
                  Ground zero plus six Memory Rthms and a bonus reflection. {readyTrackCount}/8 tracks available.
                </p>
                {albumQueue.length > 0 && (
                  <button
                    onClick={playAlbum}
                    className="mt-3 inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[11px] uppercase tracking-widest touch-manipulation active:scale-[0.98] transition-transform"
                    style={{ background: "rgba(139,92,246,0.16)", borderColor: "rgba(196,181,253,0.28)", color: "rgba(233,213,255,0.9)" }}
                  >
                    <PlayTinyIcon />
                    Start album
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-col">
              {albumCards.map(({ track, card }) => {
                if (!card) return <MemoryTrack key={track.number} {...track} />;
                const { key, rhythm, alternate, preferredSideId } = card;
                return (
                  <div key={track.number} className="px-0 py-0 border-b last:border-b-0" style={{ borderColor: "rgba(139,92,246,0.13)" }}>
                    <div className="px-5 pt-4 pb-2 flex items-start gap-3">
                      <TrackNumber number={track.number} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-white/78">{track.title}</p>
                          <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: "rgba(139,92,246,0.12)", color: "rgba(196,181,253,0.72)" }}>Memory</span>
                        </div>
                        <p className="text-xs mt-1" style={{ color: "rgba(196,181,253,0.74)" }}>{track.unlock}</p>
                      </div>
                    </div>
                    <div className="px-3 pb-3">
                      <RhythmRow
                        rhythm={rhythm}
                        playing={currentTrackId === rhythm.id && isPlaying}
                        currentTime={currentTrackId === rhythm.id ? currentTime : 0}
                        duration={currentTrackId === rhythm.id ? duration : 0}
                        showLyrics={showLyricsId === rhythm.id}
                        onToggleLyrics={() => setShowLyricsId(showLyricsId === rhythm.id ? null : rhythm.id)}
                        onPlay={() => playAlbumFrom(rhythm)}
                        favourite={rhythm.status === "favourite"}
                        isNew={rhythm.status === "new"}
                        onGraduate={rhythm.status === "active" ? () => updateRhythm(rhythm.id, { status: "favourite" }) : undefined}
                        onUngraduate={rhythm.status === "favourite" ? () => updateRhythm(rhythm.id, { status: "active" }) : undefined}
                        onArchive={() => updateRhythm(rhythm.id, { status: "archived" })}
                        onRemove={() => {
                          if (confirmRemoveId === rhythm.id) {
                            mutate({ action: "remove", id: rhythm.id });
                            setConfirmRemoveId(null);
                          } else {
                            setConfirmRemoveId(rhythm.id);
                            setTimeout(() => setConfirmRemoveId((id) => id === rhythm.id ? null : id), 3000);
                          }
                        }}
                        onRecreate={() => {}}
                        onBuildUpon={() => {}}
                        onShare={() => handleShare(rhythm)}
                        onTag={(tags) => updateRhythm(rhythm.id, { tags })}
                        onNote={(note) => updateRhythm(rhythm.id, { note })}
                        confirmingRemove={confirmRemoveId === rhythm.id}
                        shareToast={shareToastId === rhythm.id}
                        sideLabel={alternate ? sideLabelFor(rhythm) : undefined}
                        alternateLabel={alternate?.title}
                        onSwapSide={alternate ? () => setSelectedSideIds((prev) => ({ ...prev, [key]: alternate.id })) : undefined}
                        sidePreference={!preferredSideId ? "none" : preferredSideId === rhythm.id ? "current" : "other"}
                        onPreferSide={alternate ? () => mutate({ action: "preferSide", id: rhythm.id }) : undefined}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </RthmixSection>

        <RthmixSection
          label="Progression Rthmixes"
          intro="Goal-based albums where track zero explains the mission and each following track builds one conceptual unlock."
        >
          {progressionTracks.map((track) => (
            <RthmixAction key={track.title} {...track} />
          ))}
        </RthmixSection>
      </section>
    </main>
  );
}

function AlbumArt() {
  return (
    <div
      className="w-20 h-20 rounded-xl flex-shrink-0 overflow-hidden relative"
      title={CROATIAN_ALBUM_ART_PROMPT}
      style={{
        background:
          "radial-gradient(circle at 28% 22%, rgba(250,204,21,0.9), transparent 18%), radial-gradient(circle at 74% 34%, rgba(167,139,250,0.65), transparent 26%), linear-gradient(145deg, #172554 0%, #312e81 42%, #0f172a 100%)",
        border: "1px solid rgba(196,181,253,0.28)",
        boxShadow: "0 18px 40px rgba(15,23,42,0.45)",
      }}
    >
      <div style={{ position: "absolute", inset: "48% -20% auto -20%", height: 42, background: "repeating-linear-gradient(160deg, rgba(255,255,255,0.22) 0 2px, transparent 2px 9px)", opacity: 0.55 }} />
      <div style={{ position: "absolute", left: 10, right: 10, bottom: 10 }}>
        <p className="text-[8px] uppercase tracking-[0.22em] text-white/70">Croatian</p>
        <p className="text-[13px] leading-none text-white/90" style={{ fontFamily: "var(--font-display)" }}>Starter</p>
      </div>
    </div>
  );
}

function PlayTinyIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M3 1.8L10 6L3 10.2V1.8Z" fill="currentColor" />
    </svg>
  );
}

function TrackNumber({ number }: { number: string }) {
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] uppercase tracking-wider"
      style={{ background: "rgba(139,92,246,0.15)", color: "rgba(196,181,253,0.9)", border: "1px solid rgba(139,92,246,0.25)" }}
    >
      {number}
    </div>
  );
}

function RthmixSection({ label, intro, children }: { label: string; intro: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 mt-2">
      <div>
        <p className="text-[10px] uppercase tracking-[0.28em] text-white/35">{label}</p>
        <p className="text-xs text-white/35 leading-relaxed mt-1">{intro}</p>
      </div>
      {children}
    </section>
  );
}

function MemoryTrack({ number, title, unlock, detail, hook }: {
  number: string;
  title: string;
  unlock: string;
  detail: string;
  hook: string;
}) {
  return (
    <div className="px-5 py-4 border-b last:border-b-0" style={{ borderColor: "rgba(139,92,246,0.13)" }}>
      <div className="flex items-start gap-3">
        <TrackNumber number={number} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-white/78">{title}</p>
            <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: "rgba(139,92,246,0.12)", color: "rgba(196,181,253,0.72)" }}>Memory</span>
          </div>
          <p className="text-xs mt-1" style={{ color: "rgba(196,181,253,0.74)" }}>{unlock}</p>
          <p className="text-xs text-white/42 leading-relaxed mt-2">{detail}</p>
          <p className="text-[11px] text-white/32 leading-relaxed mt-2">{hook}</p>
        </div>
      </div>
    </div>
  );
}

function RthmixAction({ title, detail, status }: { title: string; detail: string; status: string }) {
  return (
    <div className="rounded-2xl border px-5 py-4" style={{ background: "rgba(255,255,255,0.045)", borderColor: "rgba(255,255,255,0.10)" }}>
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(230,155,60,0.14)", color: "rgba(240,170,80,0.9)" }}>
          +
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-white/78">{title}</p>
            <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.32)" }}>{status}</span>
          </div>
          <p className="text-xs text-white/40 leading-relaxed mt-1">{detail}</p>
        </div>
      </div>
    </div>
  );
}
