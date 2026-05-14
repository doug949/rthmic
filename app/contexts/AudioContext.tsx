"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
  /** Full-screen player visibility */
  playerOpen: boolean;
  openPlayer: () => void;
  closePlayer: () => void;
  /** Play a library track via signed URL fetch from /api/stream */
  handlePlay: (trackId: string, audioKey: string) => Promise<void>;
  /** Play any song via a direct audio URL (Suno-generated, share page, etc.) */
  handlePlayUrl: (id: string, url: string, title?: string) => Promise<void>;
  /** Toggle play/pause for the currently loaded track (no URL needed) */
  togglePlayPause: () => void;
  /** Stop playback and clear state */
  stop: () => void;
  restart: () => void;
  seek: (time: number) => void;
  skip: (seconds: number) => void;
  isLoop: boolean;
  setLoop: (enabled: boolean) => void;
}

const AudioCtx = createContext<AudioContextValue | null>(null);

export function AudioProvider({ children }: { children: ReactNode }) {
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [currentTitle, setCurrentTitle]     = useState<string | null>(null);
  const [isPlaying, setIsPlaying]           = useState(false);
  const [loadingId, setLoadingId]           = useState<string | null>(null);
  const [currentTime, setCurrentTime]       = useState(0);
  const [duration, setDuration]             = useState(0);
  const [playerOpen, setPlayerOpen]         = useState(false);

  const audioRef      = useRef<HTMLAudioElement | null>(null);
  const generationRef = useRef(0);
  const rafRef        = useRef<number | null>(null);

  const openPlayer  = useCallback(() => setPlayerOpen(true),  []);
  const closePlayer = useCallback(() => setPlayerOpen(false), []);

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

  const attachAndPlay = useCallback(
    (id: string, url: string, generation: number) => {
      if (generation !== generationRef.current) return;

      setLoadingId(null);
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.addEventListener("durationchange", () => setDuration(isFinite(audio.duration) ? audio.duration : 0));
      audio.addEventListener("loadedmetadata", () => setDuration(isFinite(audio.duration) ? audio.duration : 0));
      audio.addEventListener("pause", () => setIsPlaying(false));
      audio.addEventListener("play", () => setIsPlaying(true));
      audio.addEventListener("ended", () => {
        setIsPlaying(false);
        setCurrentTrackId(null);
        setCurrentTime(0);
        setDuration(0);
      });

      const playPromise = audio.play();
      setIsPlaying(true);
      playPromise?.catch((err) => {
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
        // Re-open player if it was dismissed
        setPlayerOpen(true);
        return;
      }

      stopCurrent();
      const generation = ++generationRef.current;
      setLoadingId(trackId);
      setCurrentTrackId(trackId);
      setIsPlaying(false);
      setPlayerOpen(true); // auto-open full-screen player

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
        // Re-open player if dismissed
        setPlayerOpen(true);
        return;
      }

      stopCurrent();
      const generation = ++generationRef.current;
      setLoadingId(id);
      setCurrentTrackId(id);
      setCurrentTitle(title ?? null);
      setIsPlaying(false);
      setPlayerOpen(true); // auto-open full-screen player

      attachAndPlay(id, url, generation);
    },
    [currentTrackId, isPlaying, stopCurrent, attachAndPlay]
  );

  const togglePlayPause = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(console.error);
      setIsPlaying(true);
    }
  }, [isPlaying]);

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

  const [isLoop, setIsLoop] = useState(false);

  const setLoop = useCallback((enabled: boolean) => {
    setIsLoop(enabled);
    if (audioRef.current) audioRef.current.loop = enabled;
  }, []);

  // ── Media Session API — keeps Rthmic as the active audio source ──────────
  // Without this, a paused Rthmic loses audio focus to other apps (e.g. YouTube)
  // and the next AirPod tap resumes the wrong app.
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    if (!currentTrackId) {
      navigator.mediaSession.metadata = null;
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTitle ?? "RTHM",
      artist: "RTHMIC",
    });
    navigator.mediaSession.setActionHandler("play", () => {
      audioRef.current?.play().catch(console.error);
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      audioRef.current?.pause();
    });
    navigator.mediaSession.setActionHandler("stop", () => {
      audioRef.current?.pause();
    });
    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("stop", null);
    };
  }, [currentTrackId, currentTitle]);

  // Keep the OS playback state in sync so the lock screen shows the right icon
  useEffect(() => {
    if (!("mediaSession" in navigator) || !currentTrackId) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying, currentTrackId]);

  // ── requestAnimationFrame loop for smooth currentTime (60fps while playing) ─
  // Replaces the coarse timeupdate event (~250ms) so karaoke sync is frame-accurate.
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const tick = () => {
      if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying]);

  return (
    <AudioCtx.Provider
      value={{
        currentTrackId,
        currentTitle,
        isPlaying,
        loadingId,
        currentTime,
        duration,
        playerOpen,
        openPlayer,
        closePlayer,
        togglePlayPause,
        handlePlay,
        handlePlayUrl,
        stop,
        restart,
        seek,
        skip,
        isLoop,
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
