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
  currentTime: number;
  duration: number;
  handlePlay: (trackId: string, audioKey: string) => Promise<void>;
  restart: () => void;
  seek: (time: number) => void;
}

const AudioCtx = createContext<AudioContextValue | null>(null);

export function AudioProvider({ children }: { children: ReactNode }) {
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const generationRef = useRef(0);

  const stopCurrent = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current.load();
      audioRef.current = null;
    }
    setCurrentTime(0);
    setDuration(0);
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

      audio.addEventListener("timeupdate", () => setCurrentTime(audio.currentTime));
      audio.addEventListener("durationchange", () => setDuration(isFinite(audio.duration) ? audio.duration : 0));
      audio.addEventListener("loadedmetadata", () => setDuration(isFinite(audio.duration) ? audio.duration : 0));
      audio.addEventListener("ended", () => {
        setIsPlaying(false);
        setCurrentTrackId(null);
        setCurrentTime(0);
        setDuration(0);
      });

      audio.play().catch(console.error);
      setIsPlaying(true);
    },
    [currentTrackId, isPlaying, stopCurrent]
  );

  const restart = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(console.error);
      setIsPlaying(true);
    }
  }, []);

  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  return (
    <AudioCtx.Provider value={{ currentTrackId, isPlaying, loadingId, currentTime, duration, handlePlay, restart, seek }}>
      {children}
    </AudioCtx.Provider>
  );
}

export function useAudio() {
  const ctx = useContext(AudioCtx);
  if (!ctx) throw new Error("useAudio must be used within AudioProvider");
  return ctx;
}
