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
}

interface GenerationContextValue {
  genPhase: GenPhase;
  genSongs: Song[];
  genPillar: PillarType | null;
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
  const [genLyrics, setGenLyrics] = useState("");
  const [genError, setGenError] = useState("");
  const generationRef = useRef(0);

  const startGeneration = useCallback(async (params: StartParams) => {
    const gen = ++generationRef.current;
    setGenPhase("generating");
    setGenSongs([]);
    setGenPillar(params.pillar);
    setGenLyrics(params.lyrics);
    setGenError("");

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

      const MAX_POLLS = 48;
      for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        if (gen !== generationRef.current) return; // superseded by a newer generation

        const pollRes = await fetch(
          `/api/poll-generation?taskId=${encodeURIComponent(taskId)}&t=${Date.now()}`,
          { cache: "no-store" }
        );
        if (!pollRes.ok) continue;
        const poll = await pollRes.json();

        if (poll.status === "ready" && poll.songs) {
          if (gen !== generationRef.current) return;
          const songs = poll.songs as Song[];
          setGenSongs(songs);
          setGenPhase("ready");

          // Auto-save to library sequentially to avoid Redis read-write race,
          // then background-fetch timed lyrics and attach them.
          const saveAll = async () => {
            for (const song of songs) {
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
                  },
                }),
              });
            }

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
          };
          saveAll().catch(console.error);
          return;
        }

        if (poll.status === "failed") {
          throw new Error(poll.error || "Music generation failed");
        }
      }

      throw new Error("Rthms took too long to generate — please try again");
    } catch (e) {
      if (gen !== generationRef.current) return;
      setGenError(e instanceof Error ? e.message : "Generation failed");
      setGenPhase("failed");
    }
  }, []);

  const clearGeneration = useCallback(() => {
    generationRef.current++; // cancel any in-flight poll loop
    setGenPhase("idle");
    setGenSongs([]);
    setGenPillar(null);
    setGenLyrics("");
    setGenError("");
  }, []);

  return (
    <GenerationCtx.Provider
      value={{ genPhase, genSongs, genPillar, genLyrics, genError, startGeneration, clearGeneration }}
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
