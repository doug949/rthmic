"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { PillarType, Song } from "@/app/types/pipeline";
import type { StyleChoice } from "@/app/services/llmService";

export type GenPhase = "idle" | "generating" | "ready" | "failed";

export interface StartParams {
  lyrics: string;
  style: StyleChoice;
  title: string;
  pillar: PillarType;
  genre: string;
  menuSlug?: string;
  note?: string;
}

interface GenerationContextValue {
  genPhase: GenPhase;
  genSongs: Song[];
  genPillar: PillarType | null;
  genMenuSlug: string | null;
  genLyrics: string;
  genError: string;
  startGeneration: (params: StartParams) => void;
  clearGeneration: () => void;
}

const GenerationCtx = createContext<GenerationContextValue | null>(null);

export function GenerationProvider({ children }: { children: ReactNode }) {
  const [genPhase, setGenPhase] = useState<GenPhase>("idle");
  const [genSongs, setGenSongs] = useState<Song[]>([]);
  const [genPillar, setGenPillar] = useState<PillarType | null>(null);
  const [genMenuSlug, setGenMenuSlug] = useState<string | null>(null);
  const [genLyrics, setGenLyrics] = useState("");
  const [genError, setGenError] = useState("");
  const generationRef = useRef(0);

  const startGeneration = useCallback(async (params: StartParams) => {
    const gen = ++generationRef.current;
    setGenPhase("generating");
    setGenSongs([]);
    setGenPillar(params.pillar);
    setGenMenuSlug(params.menuSlug ?? null);
    setGenLyrics(params.lyrics);
    setGenError("");

    const genStart = Date.now();
    try {
      const startRes = await fetch("/api/start-generation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lyrics: params.lyrics,
          style: params.style,
          title: params.title,
          genre: params.genre,
        }),
      });
      if (!startRes.ok) {
        const err = await startRes.json();
        throw new Error(err.error || "Failed to start generation");
      }
      const { taskId } = await startRes.json();
      console.log(`[gen] task started: ${taskId} (${Date.now() - genStart}ms to start)`);

      const MAX_POLLS = 150; // 150 × 2s = 5 minutes
      for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        if (gen !== generationRef.current) return; // superseded by a newer generation

        const elapsed = ((Date.now() - genStart) / 1000).toFixed(1);
        const pollRes = await fetch(
          `/api/poll-generation?taskId=${encodeURIComponent(taskId)}&t=${Date.now()}`,
          { cache: "no-store" }
        );
        if (!pollRes.ok) { console.log(`[gen] poll ${i + 1} failed (${elapsed}s elapsed)`); continue; }
        const poll = await pollRes.json();
        console.log(`[gen] poll ${i + 1} → ${poll.status} (${elapsed}s elapsed)`);

        if (poll.status === "ready" && poll.songs) {
          if (gen !== generationRef.current) return;
          const songs = poll.songs as Song[];
          console.log(`[gen] ready after ${((Date.now() - genStart) / 1000).toFixed(1)}s total`);

          // Log generation success
          fetch("/api/genlog", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: crypto.randomUUID(),
              timestamp: genStart,
              title: params.title,
              pillar: params.pillar,
              genre: params.genre,
              style: params.style,
              status: "success",
              durationMs: Date.now() - genStart,
              songs: songs.map((s: { id: string; title: string }) => ({ id: s.id, title: s.title })),
            }),
          }).catch(() => {});

          // Persist the core records before flipping to ready, so menus/library
          // refresh against data that actually exists. Timed lyrics stay async.
          const saveCore = async () => {
            const pairId = songs.length > 1 ? crypto.randomUUID() : undefined;
            if (params.menuSlug) {
              const menuSongs = songs.map((song) => ({
                id: song.id,
                title: params.title,
                pillar: params.pillar,
                audioUrl: song.audioUrl,
                lyrics: params.lyrics,
                sunoClipId: song.sunoClipId,
                sunoTaskId: song.sunoTaskId,
                genre: params.genre,
                ...(pairId ? {
                  pairId,
                  side: (songs.indexOf(song) === 0 ? "A" : "B") as "A" | "B",
                  alternateId: songs[songs.indexOf(song) === 0 ? 1 : 0]?.id,
                } : {}),
                savedAt: Date.now(),
                status: "active" as const,
              }));
              await fetch("/api/menu", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ slug: params.menuSlug, songs: menuSongs }),
              });
            } else {
              for (let i = 0; i < songs.length; i++) {
                const song = songs[i];
                await fetch("/api/library", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "save",
                    rhythm: {
                      id: song.id,
                      title: song.title,
                      pillar: params.pillar,
                      audioUrl: song.audioUrl,
                      lyrics: params.lyrics,
                      sunoClipId: song.sunoClipId,
                      sunoTaskId: song.sunoTaskId,
                      ...(pairId ? {
                        pairId,
                        side: (i === 0 ? "A" : "B") as "A" | "B",
                        alternateId: songs[i === 0 ? 1 : 0]?.id,
                      } : {}),
                      ...(params.note ? { note: params.note } : {}),
                    },
                  }),
                });
              }
            }
          };

          const attachTimedLyrics = async () => {
            if (params.menuSlug) {
              // Background: fetch timed lyrics and re-save the full menu slot

              for (let i = 0; i < songs.length; i++) {
                const song = songs[i];
                if (!song.sunoClipId || !song.sunoTaskId) continue;
                try {
                  const lr = await fetch(
                    `/api/timed-lyrics?taskId=${encodeURIComponent(song.sunoTaskId)}&audioId=${encodeURIComponent(song.sunoClipId)}`
                  );
                  if (!lr.ok) continue;
                  const ld = await lr.json() as { timedWords?: unknown };
                  if (!ld.timedWords) continue;

                  await fetch("/api/menu", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ slug: params.menuSlug, action: "updateSong", id: song.id, timedLyrics: ld.timedWords }),
                  });
                  console.log(`[gen] attached timed lyrics for menu ${params.menuSlug} song ${song.id}`);
                } catch { /* non-critical */ }
              }
            } else {
              // Background: fetch word-level timed lyrics for each clip and patch into library.
              // Requires both taskId and audioId (clipId). Non-blocking — failures are silently swallowed.
              for (const song of songs) {
                if (!song.sunoClipId || !song.sunoTaskId) continue;
                try {
                  const lr = await fetch(
                    `/api/timed-lyrics?taskId=${encodeURIComponent(song.sunoTaskId)}&audioId=${encodeURIComponent(song.sunoClipId)}`
                  );
                  if (!lr.ok) continue;
                  const ld = await lr.json() as { timedWords?: unknown };
                  if (!ld.timedWords) continue;

                  await fetch("/api/library", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      action: "update",
                      id: song.id,
                      timedLyrics: ld.timedWords,
                    }),
                  });
                  console.log(`[gen] attached timed lyrics for ${song.id}`);
                } catch { /* non-critical */ }
              }
            }
          };

          await saveCore();
          if (gen !== generationRef.current) return;
          setGenSongs(songs);
          setGenPhase("ready");
          attachTimedLyrics().catch(console.error);
          return;
        }

        if (poll.status === "failed") {
          throw new Error(poll.error || "Music generation failed");
        }
      }

      throw new Error("Rthms took too long to generate — please try again");
    } catch (e) {
      if (gen !== generationRef.current) return;

      // Log generation failure
      fetch("/api/genlog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          timestamp: genStart,
          title: params.title ?? "",
          pillar: params.pillar ?? "",
          genre: params.genre ?? "",
          style: params.style ?? "",
          status: (e instanceof Error && e.message.includes("too long")) ? "timeout" : "failed",
          durationMs: Date.now() - genStart,
          error: e instanceof Error ? e.message : "Unknown error",
        }),
      }).catch(() => {});

      setGenError(e instanceof Error ? e.message : "Generation failed");
      setGenPhase("failed");
    }
  }, []);

  const clearGeneration = useCallback(() => {
    generationRef.current++; // cancel any in-flight poll loop
    setGenPhase("idle");
    setGenSongs([]);
    setGenPillar(null);
    setGenMenuSlug(null);
    setGenLyrics("");
    setGenError("");
  }, []);

  return (
    <GenerationCtx.Provider
      value={{ genPhase, genSongs, genPillar, genMenuSlug, genLyrics, genError, startGeneration, clearGeneration }}
    >
      {children}
    </GenerationCtx.Provider>
  );
}

export function useGeneration() {
  const ctx = useContext(GenerationCtx);
  if (!ctx) throw new Error("useGeneration must be used within GenerationProvider");
  return ctx;
}
