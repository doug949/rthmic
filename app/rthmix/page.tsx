"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "@/app/components/AppHeader";
import { RevealBlock } from "@/app/components/RevealBlock";
import { CassetteIcon } from "@/app/components/HomeTileIcons";
import type { SavedRhythm } from "@/app/types/library";
import { useAudio, type AudioQueueOptions, type AudioQueueTrack } from "@/app/contexts/AudioContext";
import { RhythmRow } from "@/app/library/_components";
import { groupRhythmPairs, sideLabelFor } from "@/app/lib/rhythmPairs";

const CROATIAN_RTHMIX_ID = "croatian-starter-memory";
const CROATIAN_ALBUM_ART_PROMPT = "Square album cover for Croatian Starter, a premium Rthmix memory album: Adriatic coastline at dusk, purple-gold moonlit water, six small glowing language tokens, subtle tamburica strings, modern minimal typography, cinematic but clean.";

const RTHMIX_SUGGESTIONS = [
  "How compound interest works",
  "Croatian for a weekend trip",
  "The basics of ADHD time blindness",
  "How to think in first principles",
  "A beginner guide to wine tasting",
  "The story of the Roman Empire",
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
  const [topic, setTopic] = useState("");
  const [building, setBuilding] = useState(false);
  const [voicePhase, setVoicePhase] = useState<"idle" | "recording" | "transcribing">("idle");
  const [buildError, setBuildError] = useState<string | null>(null);
  const [queuedPlan, setQueuedPlan] = useState<{ title: string; tracks: Array<{ number: string; title: string; unlock: string }> } | null>(null);
  const [rhythms, setRhythms] = useState<SavedRhythm[]>([]);
  const [showLyricsId, setShowLyricsId] = useState<string | null>(null);
  const [shareToastId, setShareToastId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [selectedSideIds, setSelectedSideIds] = useState<Record<string, string>>({});
  const [viewMode, setViewMode] = useState<"home" | "collection" | "create">("home");
  const { currentTrackId, isPlaying, currentTime, duration, handlePlayUrl, playQueue } = useAudio();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef("");
  const streamRef = useRef<MediaStream | null>(null);

  const fetchLibrary = useCallback(async () => {
    try {
      const res = await fetch("/api/library", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setRhythms(data.rhythms ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchLibrary(); }, 0);
    const onMutated = () => { void fetchLibrary(); };
    window.addEventListener("library-mutated", onMutated);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("library-mutated", onMutated);
    };
  }, [fetchLibrary]);

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

  const handleBuildRthmix = async (overrideTopic?: string) => {
    const cleanTopic = (overrideTopic ?? topic).trim();
    if (!cleanTopic || building) return;
    setBuilding(true);
    setBuildError(null);
    setQueuedPlan(null);
    try {
      const res = await fetch("/api/rthmix/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: cleanTopic }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Rthmix build failed");
      setQueuedPlan({
        title: data.plan.title,
        tracks: (data.plan.tracks ?? []).map((track: { number: string; title: string; unlock: string }) => ({
          number: track.number,
          title: track.title,
          unlock: track.unlock,
        })),
      });
      setTopic("");
      await fetchLibrary();
    } catch (error) {
      setBuildError(error instanceof Error ? error.message : "Rthmix build failed");
    } finally {
      setBuilding(false);
    }
  };

  const startRecording = async () => {
    if (building || voicePhase !== "idle") return;
    setBuildError(null);
    setQueuedPlan(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const preferredTypes = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
      let recorder: MediaRecorder | null = null;
      let chosenMime = "";
      for (const type of preferredTypes) {
        if (!MediaRecorder.isTypeSupported(type)) continue;
        try {
          recorder = new MediaRecorder(stream, { mimeType: type, audioBitsPerSecond: 32000 });
          chosenMime = type;
          break;
        } catch { /* try next */ }
      }
      if (!recorder) {
        recorder = new MediaRecorder(stream, { audioBitsPerSecond: 32000 });
        chosenMime = recorder.mimeType || "audio/webm";
      }

      mimeTypeRef.current = chosenMime;
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current || "audio/webm" });
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        mediaRecorderRef.current = null;
        transcribeAndBuild(blob).catch((error) => {
          setBuildError(error instanceof Error ? error.message : "Could not transcribe topic");
          setVoicePhase("idle");
        });
      };
      recorder.start(250);
      setVoicePhase("recording");
    } catch (error) {
      const raw = error instanceof Error ? error.message : "";
      setBuildError(/denied|not allowed/i.test(raw) ? "Microphone access denied. Please allow microphone access and try again." : "Could not start recording. Please try again.");
      setVoicePhase("idle");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      setVoicePhase("transcribing");
      mediaRecorderRef.current.stop();
    }
  };

  const transcribeAndBuild = async (audio: Blob) => {
    setVoicePhase("transcribing");
    const mimeType = audio.type || "audio/webm";
    const ext = mimeType.includes("mp4") ? "m4a" : "webm";
    const form = new FormData();
    form.append("audio", audio, `rthmix-topic.${ext}`);
    const res = await fetch("/api/transcribe", { method: "POST", body: form });
    if (!res.ok) throw new Error("Could not transcribe topic");
    const data = await res.json();
    const transcript = typeof data.transcript === "string" ? data.transcript.trim() : "";
    if (!transcript) throw new Error("No topic heard. Please try again.");
    setTopic(transcript);
    setVoicePhase("idle");
    await handleBuildRthmix(transcript);
  };

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
      meta: {
        rhythmId: rhythm.id,
        sunoTaskId: rhythm.sunoTaskId,
        genre: rhythm.genre,
        createdAt: rhythm.savedAt,
      },
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

  const rthmixAlbums = useMemo(() => {
    const groups = new Map<string, SavedRhythm[]>();
    for (const rhythm of rhythms) {
      if (rhythm.status === "deleted" || !rhythm.rthmixId || rhythm.rthmixId === CROATIAN_RTHMIX_ID) continue;
      const current = groups.get(rhythm.rthmixId) ?? [];
      current.push(rhythm);
      groups.set(rhythm.rthmixId, current);
    }
    return Array.from(groups.entries()).map(([id, items]) => ({
      id,
      title: items[0]?.rthmixTitle ?? "Rthmix",
      rhythms: items.sort((a, b) => (a.rthmixTrackNumber ?? "").localeCompare(b.rthmixTrackNumber ?? "")),
    }));
  }, [rhythms]);

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

  return (
    <main className="relative z-10 min-h-screen flex flex-col px-6 pt-safe" style={{ animation: "page-enter 380ms ease forwards" }}>
      <RevealBlock delay={0}>
        <AppHeader title="Rthmixes" titleIcon={<CassetteIcon />} />
      </RevealBlock>

      <section className="flex-1 flex flex-col gap-4 pb-28">
        <div className="rounded-2xl border px-5 py-5" style={{ background: "rgba(255,255,255,0.035)", borderColor: "rgba(255,255,255,0.09)" }}>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-[10px] uppercase tracking-[0.3em]" style={{ color: "rgba(240,170,80,0.9)" }}>Rthmixes</p>
          </div>
          <h1 className="text-2xl font-light text-white/90 leading-tight" style={{ fontFamily: "var(--font-display)" }}>
            Listen to your Rthmix collection or create a new one.
          </h1>
          <p className="text-sm text-white/45 leading-relaxed mt-3">
            Rthmixes are multi-track Rthm albums for learning, remembering, or building one unlock at a time.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
            <RthmixChoiceCard
              title="Listen to Rthmixes"
              detail="Browse your existing Rthmix collection, start an album, or jump into a track."
              eyebrow={`${rthmixAlbums.length + 1} collection${rthmixAlbums.length + 1 === 1 ? "" : "s"}`}
              active={viewMode === "collection"}
              onClick={() => setViewMode("collection")}
            />
            <RthmixChoiceCard
              title="Create a new Rthmix"
              detail="Pick a suggested topic or speak your own idea and let Rthmic build the album."
              eyebrow="Suggestions + voice"
              active={viewMode === "create"}
              onClick={() => setViewMode("create")}
            />
          </div>
        </div>

        {viewMode === "home" && (
          <div className="rounded-2xl border px-5 py-4" style={{ background: "rgba(255,255,255,0.025)", borderColor: "rgba(255,255,255,0.07)" }}>
            <p className="text-[10px] uppercase tracking-[0.28em] text-white/35">Choose a path</p>
            <p className="text-xs text-white/38 leading-relaxed mt-2">
              Start by listening to what you already have, or create a fresh Rthmix from a topic that is on your mind.
            </p>
          </div>
        )}

        {viewMode === "create" && (
          <div className="rounded-2xl border px-5 py-5" style={{ background: "rgba(255,255,255,0.035)", borderColor: "rgba(255,255,255,0.09)" }}>
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="text-[10px] uppercase tracking-[0.3em]" style={{ color: "rgba(240,170,80,0.9)" }}>Create Rthmix</p>
              <button onClick={() => setViewMode("home")} className="text-[10px] uppercase tracking-widest text-white/35 touch-manipulation active:text-white/60 transition-colors">
                Back
              </button>
            </div>
            <h2 className="text-xl font-light text-white/90 leading-tight" style={{ fontFamily: "var(--font-display)" }}>
              Turn a topic into a new album.
            </h2>
            <p className="text-sm text-white/45 leading-relaxed mt-3">
              Use a suggestion if one sparks something, or speak the thing you want transformed into a Rthmix.
            </p>
            <div className="mt-5 flex flex-col gap-3">
              <button
                onClick={voicePhase === "recording" ? stopRecording : startRecording}
                disabled={building || voicePhase === "transcribing"}
                className="w-full min-h-36 rounded-2xl border flex flex-col items-center justify-center gap-3 touch-manipulation active:scale-[0.99] transition disabled:opacity-55 disabled:active:scale-100"
                style={{
                  background: voicePhase === "recording" ? "rgba(239,68,68,0.10)" : "rgba(255,255,255,0.035)",
                  borderColor: voicePhase === "recording" ? "rgba(252,165,165,0.30)" : "rgba(255,255,255,0.10)",
                  color: "rgba(255,245,230,0.92)",
                }}
                aria-label={voicePhase === "recording" ? "Stop recording Rthmix topic" : "Record Rthmix topic"}
              >
                <span
                  className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{
                    background: voicePhase === "recording" ? "rgba(239,68,68,0.18)" : "rgba(255,255,255,0.07)",
                    boxShadow: voicePhase === "recording" ? "0 0 24px rgba(239,68,68,0.14)" : "none",
                  }}
                >
                  {voicePhase === "recording" ? <StopIcon /> : <MicTopicIcon />}
                </span>
                <span className="text-sm font-medium text-white/82">
                  {building
                    ? "Building your Rthmix"
                    : voicePhase === "recording"
                      ? "Tap to finish"
                      : voicePhase === "transcribing"
                        ? "Listening back..."
                        : "Say the topic"}
                </span>
                <span className="text-xs text-white/38">
                  {voicePhase === "recording" ? "Rthmix will build from what you say." : "One sentence is enough."}
                </span>
              </button>

              <div>
                <p className="text-[10px] uppercase tracking-[0.24em] text-white/30 mb-2">Suggested Rthmixes</p>
                <div className="flex flex-wrap gap-2">
                  {RTHMIX_SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => {
                        setTopic(suggestion);
                        handleBuildRthmix(suggestion);
                      }}
                      disabled={building || voicePhase !== "idle"}
                      className="rounded-full border px-3 py-2 text-[11px] text-white/58 touch-manipulation active:scale-[0.98] transition disabled:opacity-35"
                      style={{ background: "rgba(255,255,255,0.045)", borderColor: "rgba(255,255,255,0.10)" }}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder="Or type/edit the topic before building"
                className="w-full min-h-24 rounded-xl border bg-black/20 px-4 py-3 text-sm text-white/86 placeholder:text-white/25 outline-none resize-none"
                style={{ borderColor: "rgba(255,255,255,0.10)" }}
              />
              <button
                onClick={() => handleBuildRthmix()}
                disabled={building || !topic.trim()}
                className="inline-flex items-center justify-center rounded-full border px-4 py-3 text-[11px] uppercase tracking-widest touch-manipulation active:scale-[0.98] transition disabled:opacity-40 disabled:active:scale-100"
                style={{ background: "rgba(255,255,255,0.055)", borderColor: "rgba(240,170,80,0.24)", color: "rgba(255,235,205,0.92)" }}
              >
                {building ? "Building Rthmix..." : "Build Rthmix"}
              </button>
              {buildError && <p className="text-xs text-red-200/70">{buildError}</p>}
              {queuedPlan && (
                <div className="rounded-xl border px-4 py-3" style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.09)" }}>
                  <p className="text-xs text-white/65">{queuedPlan.title} queued</p>
                  <p className="text-[11px] text-white/35 mt-1">{queuedPlan.tracks.length} tracks are generating. They will appear in your collection as they complete.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {viewMode === "collection" && (
          <>
            <div className="flex items-center justify-between gap-3 px-1">
              <div>
                <p className="text-[10px] uppercase tracking-[0.28em] text-white/35">Rthmix collection</p>
                <p className="text-xs text-white/35 leading-relaxed mt-1">Listen through existing Rthmixes and browse the album tracks.</p>
              </div>
              <button onClick={() => setViewMode("home")} className="text-[10px] uppercase tracking-widest text-white/35 touch-manipulation active:text-white/60 transition-colors">
                Back
              </button>
            </div>

            {rthmixAlbums.length > 0 ? (
              <RthmixSection
                label="Your Rthmixes"
                intro="Generated albums appear here as each track completes. Start from track zero, then move through the ordered unlocks."
              >
                {rthmixAlbums.map((album) => (
                  <GeneratedRthmixAlbum
                    key={album.id}
                    title={album.title}
                    rhythms={album.rhythms}
                    currentTrackId={currentTrackId}
                    isPlaying={isPlaying}
                    currentTime={currentTime}
                    duration={duration}
                    showLyricsId={showLyricsId}
                    setShowLyricsId={setShowLyricsId}
                    playQueue={playQueue}
                    handlePlayUrl={handlePlayUrl}
                    updateRhythm={updateRhythm}
                    handleShare={handleShare}
                    shareToastId={shareToastId}
                    confirmRemoveId={confirmRemoveId}
                    setConfirmRemoveId={setConfirmRemoveId}
                    mutate={mutate}
                  />
                ))}
              </RthmixSection>
            ) : (
              <div className="rounded-2xl border px-5 py-4" style={{ background: "rgba(255,255,255,0.025)", borderColor: "rgba(255,255,255,0.07)" }}>
                <p className="text-sm text-white/68">No generated Rthmixes yet.</p>
                <p className="text-xs text-white/35 leading-relaxed mt-1">Create one from a suggested topic or by speaking your own idea.</p>
                <button
                  onClick={() => setViewMode("create")}
                  className="mt-3 inline-flex items-center justify-center rounded-full border px-4 py-2.5 text-[10px] uppercase tracking-widest touch-manipulation active:scale-[0.98] transition"
                  style={{ background: "rgba(255,255,255,0.055)", borderColor: "rgba(240,170,80,0.24)", color: "rgba(255,235,205,0.92)" }}
                >
                  Create one
                </button>
              </div>
            )}

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
          </>
        )}
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

function GeneratedRthmixAlbum({
  title,
  rhythms,
  currentTrackId,
  isPlaying,
  currentTime,
  duration,
  showLyricsId,
  setShowLyricsId,
  playQueue,
  handlePlayUrl,
  updateRhythm,
  handleShare,
  shareToastId,
  confirmRemoveId,
  setConfirmRemoveId,
  mutate,
}: {
  title: string;
  rhythms: SavedRhythm[];
  currentTrackId: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  showLyricsId: string | null;
  setShowLyricsId: (id: string | null) => void;
  playQueue: (tracks: AudioQueueTrack[], startId?: string, options?: AudioQueueOptions) => Promise<void>;
  handlePlayUrl: (id: string, url: string, title?: string, meta?: AudioQueueTrack["meta"]) => Promise<void>;
  updateRhythm: (id: string, patch: Partial<SavedRhythm>) => void;
  handleShare: (rhythm: SavedRhythm) => Promise<void>;
  shareToastId: string | null;
  confirmRemoveId: string | null;
  setConfirmRemoveId: Dispatch<SetStateAction<string | null>>;
  mutate: (body: Record<string, unknown>) => Promise<void>;
}) {
  const queue = rhythms
    .filter((rhythm) => rhythm.audioUrl || rhythm.audioKey)
    .map((rhythm) => ({
      id: rhythm.id,
      url: `/api/proxy-audio?id=${encodeURIComponent(rhythm.id)}`,
      title: rhythm.title,
      meta: {
        rhythmId: rhythm.id,
        sunoTaskId: rhythm.sunoTaskId,
        genre: rhythm.genre,
        createdAt: rhythm.savedAt,
      },
    }));

  const playFrom = (rhythm: SavedRhythm) => {
    const url = `/api/proxy-audio?id=${encodeURIComponent(rhythm.id)}`;
    if (currentTrackId === rhythm.id) {
      handlePlayUrl(rhythm.id, url, rhythm.title, {
        rhythmId: rhythm.id,
        sunoTaskId: rhythm.sunoTaskId,
        genre: rhythm.genre,
        createdAt: rhythm.savedAt,
      });
      return;
    }
    playQueue(queue, rhythm.id, { loopEach: true });
  };

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ background: "rgba(255,255,255,0.045)", borderColor: "rgba(255,255,255,0.10)" }}>
      <div className="px-5 py-4 border-b flex items-center justify-between gap-3" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.28em] text-white/35">Progression Album</p>
          <h2 className="text-lg font-light text-white/88 mt-1 truncate" style={{ fontFamily: "var(--font-display)" }}>{title}</h2>
          <p className="text-xs text-white/35 mt-1">{rhythms.length} generated track{rhythms.length === 1 ? "" : "s"}</p>
        </div>
        {queue.length > 0 && (
          <button
            onClick={() => playQueue(queue, undefined, { loopEach: true })}
            className="flex-shrink-0 inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[11px] uppercase tracking-widest touch-manipulation active:scale-[0.98] transition-transform"
            style={{ background: "rgba(230,155,60,0.14)", borderColor: "rgba(240,170,80,0.28)", color: "rgba(255,235,205,0.9)" }}
          >
            <PlayTinyIcon />
            Start
          </button>
        )}
      </div>
      <div className="flex flex-col">
        {rhythms.map((rhythm) => (
          <div key={rhythm.id} className="border-b last:border-b-0" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
            <div className="px-5 pt-4 pb-2 flex items-start gap-3">
              <TrackNumber number={rhythm.rthmixTrackNumber ?? "--"} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white/78">{rhythm.title}</p>
                {rhythm.rthmixUnlock && <p className="text-xs mt-1" style={{ color: "rgba(240,170,80,0.72)" }}>{rhythm.rthmixUnlock}</p>}
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
                onPlay={() => playFrom(rhythm)}
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
              />
            </div>
          </div>
        ))}
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

function MicTopicIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 14.5c1.8 0 3-1.35 3-3.15V6.65c0-1.8-1.2-3.15-3-3.15S9 4.85 9 6.65v4.7c0 1.8 1.2 3.15 3 3.15Z" stroke="currentColor" strokeWidth="1.7" />
      <path d="M6.5 10.8c0 3.35 2.25 5.7 5.5 5.7s5.5-2.35 5.5-5.7M12 16.5v3.7M9 20.2h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
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

function RthmixChoiceCard({ title, detail, eyebrow, active, onClick }: {
  title: string;
  detail: string;
  eyebrow: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-2xl border px-5 py-4 text-left touch-manipulation active:scale-[0.99] transition"
      style={{
        background: active ? "rgba(230,155,60,0.10)" : "rgba(255,255,255,0.045)",
        borderColor: active ? "rgba(240,170,80,0.34)" : "rgba(255,255,255,0.10)",
        boxShadow: active ? "0 0 28px rgba(230,155,60,0.08)" : "none",
      }}
    >
      <span className="text-[9px] uppercase tracking-[0.24em]" style={{ color: active ? "rgba(255,224,180,0.78)" : "rgba(255,255,255,0.32)" }}>
        {eyebrow}
      </span>
      <span className="block text-sm font-semibold text-white/82 mt-2">{title}</span>
      <span className="block text-xs text-white/40 leading-relaxed mt-1">{detail}</span>
    </button>
  );
}
