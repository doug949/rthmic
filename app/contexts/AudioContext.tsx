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
  currentTitle: string | null;
  isPlaying: boolean;
  loadingId: string | null;
  currentTime: number;
  duration: number;
  /** Play a library track via signed URL fetch from /api/stream */
  handlePlay: (trackId: string, audioKey: string) => Promise<void>;
  /** Play any song via a direct audio URL (Suno-generated, share page, etc.) */
  handlePlayUrl: (id: string, url: string, title?: string) => Promise<void>;
  /** Stop playback and clear state */
  stop: () => void;
  restart: () => void;
  seek: (time: number) => void;
  skip: (seconds: number) => void;
  setLoop: (enabled: boolean) => void;
}

const AudioCtx = createContext<AudioContextValue | null>(null);

export function AudioProvider({ children }: { children: ReactNode }) {
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [currentTitle, setCurrentTitle] = useState<string | null>(null);
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

  const stop = useCallback(() => {
    stopCurrent();
    setCurrentTrackId(null);
    setCurrentTitle(null);
    setIsPlaying(false);
    setLoadingId(null);
  }, [stopCurrent]);

  // Shared setup for any audio element after URL is resolved
  const attachAndPlay = useCallback(
    (id: string, url: string, generation: number) => {
      if (generation !== generationRef.current) return;

      setLoadingId(null);
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.addEventListener("timeupdate", () => setCurrentTime(audio.currentTime));
      audio.addEventListener("durationchange", () =>
        setDuration(isFinite(audio.duration) ? audio.duration : 0)
      );
      audio.addEventListener("loadedmetadata", () =>
        setDuration(isFinite(audio.duration) ? audio.duration : 0)
      );
      audio.addEventListener("ended", () => {
        setIsPlaying(false);
        setCurrentTrackId(null);
        setCurrentTime(0);
        setDuration(0);
      });

      // play() returns a promise — set isPlaying optimistically, revert on block
      const playPromise = audio.play();
      setIsPlaying(true);
      playPromise?.catch((err) => {
        // Autoplay blocked (rare in PWA with user gesture, but handle gracefully)
        console.warn("Autoplay blocked:", err.message);
        setIsPlaying(false);
      });
    },
    []
  );

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

      attachAndPlay(trackId, url, generation);
    },
    [currentTrackId, isPlaying, stopCurrent, attachAndPlay]
  );

  const handlePlayUrl = useCallback(
    async (id: string, url: string, title?: string) => {
      if (currentTrackId === id) {
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
      setLoadingId(id);
      setCurrentTrackId(id);
      setCurrentTitle(title ?? null);
      setIsPlaying(false);

      attachAndPlay(id, url, generation);
    },
    [currentTrackId, isPlaying, stopCurrent, attachAndPlay]
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

  const skip = useCallback((seconds: number) => {
    if (audioRef.current) {
      const next = Math.min(
        audioRef.current.duration || 0,
        Math.max(0, (audioRef.current.currentTime || 0) + seconds)
      );
      audioRef.current.currentTime = next;
      setCurrentTime(next);
    }
  }, []);

  const setLoop = useCallback((enabled: boolean) => {
    if (audioRef.current) audioRef.current.loop = enabled;
  }, []);

  return (
    <AudioCtx.Provider
      value={{
        currentTrackId,
        currentTitle,
        isPlaying,
        loadingId,
        currentTime,
        duration,
        handlePlay,
        handlePlayUrl,
        stop,
        restart,
        seek,
        skip,
        setLoop,
      }}
    >
      {children}
    </AudioCtx.Provider>
  );
}

export function useAudio() {
  const ctx = useContext(AudioCtx);
  if (!ctx) throw new Error("useAudio must be used within AudioProvider");
  return ctx;
}
