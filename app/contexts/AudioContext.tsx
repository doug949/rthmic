"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface AudioContextValue {
  currentTrackId: string | null;
  isPlaying: boolean;
  loadingId: string | null;
  handlePlay: (trackId: string, audioKey: string) => Promise<void>;
}

const AudioCtx = createContext<AudioContextValue | null>(null);

export function AudioProvider({ children }: { children: ReactNode }) {
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const generationRef = useRef(0);

  const stopCurrent = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current.load();
      audioRef.current = null;
    }
  }, []);

  const handlePlay = useCallback(
    async (trackId: string, audioKey: string) => {
      if (currentTrackId === trackId) {
        if (isPlaying) {
          audioRef.current?.pause();
          setIsPlaying(false);
        } else {
          audioRef.current?.play().catch(console.error);
          setIsPlaying(true);
        }
        return;
      }

      stopCurrent();
      const generation = ++generationRef.current;
      setLoadingId(trackId);
      setCurrentTrackId(trackId);
      setIsPlaying(false);

      const res = await fetch(`/api/stream?key=${encodeURIComponent(audioKey)}`);
      const { url } = await res.json();

      if (generation !== generationRef.current) return;

      setLoadingId(null);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.play().catch(console.error);
      setIsPlaying(true);

      audio.addEventListener("ended", () => {
        setIsPlaying(false);
        setCurrentTrackId(null);
      });
    },
    [currentTrackId, isPlaying, stopCurrent]
  );

  return (
    <AudioCtx.Provider value={{ currentTrackId, isPlaying, loadingId, handlePlay }}>
      {children}
    </AudioCtx.Provider>
  );
}

export function useAudio() {
  const ctx = useContext(AudioCtx);
  if (!ctx) throw new Error("useAudio must be used within AudioProvider");
  return ctx;
}
