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
  handlePlayUrl: (id: string, url: string, title?: string, meta?: { sunoTaskId?: string; rhythmId?: string }) => Promise<void>;
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

  const audioRef         = useRef<HTMLAudioElement | null>(null);
  const generationRef    = useRef(0);
  const rafRef           = useRef<number | null>(null);
  const attachAndPlayRef = useRef<((id: string, url: string, generation: number, meta?: { sunoTaskId?: string; rhythmId?: string }) => void) | null>(null);

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
    (id: string, url: string, generation: number, meta?: { sunoTaskId?: string; rhythmId?: string }) => {
      if (generation !== generationRef.current) return;

      setLoadingId(null);
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.addEventListener("durationchange", () => setDuration(isFinite(audio.duration) ? audio.duration : 0));
      audio.addEventListener("loadedmetadata", () => setDuration(isFinite(audio.duration) ? audio.duration : 0));
      audio.addEventListener("pause", () => setIsPlaying(false));
      audio.addEventListener("play",  () => setIsPlaying(true));
      audio.addEventListener("ended", () => {
        setIsPlaying(false);
        setCurrentTrackId(null);
        setCurrentTime(0);
        setDuration(0);
      });

      // Stall detection via currentTime polling — the only reliable approach on iOS Safari.
      // iOS keeps audio.paused = false even when buffering has stopped, so event-based
      // approaches (waiting/stalled) either don't fire or can't distinguish a real stall.
      let lastTime = -1;
      let lastAdvanceAt = Date.now();
      let recoverRetries = 0;
      let stallInterval: ReturnType<typeof setInterval> | null = null;

      const startStallCheck = () => {
        if (stallInterval) return;
        lastTime = audio.currentTime;
        lastAdvanceAt = Date.now();
        stallInterval = setInterval(() => {
          if (audio.paused || audio.ended || generation !== generationRef.current) {
            clearInterval(stallInterval!); stallInterval = null; return;
          }
          if (audio.currentTime !== lastTime) {
            lastTime = audio.currentTime;
            lastAdvanceAt = Date.now();
            recoverRetries = 0;
          } else if (Date.now() - lastAdvanceAt > 2500) {
            // currentTime hasn't moved in 5s while supposedly playing — genuinely stalled
            if (recoverRetries >= 3) {
              clearInterval(stallInterval!); stallInterval = null;
              setIsPlaying(false); return;
            }
            recoverRetries++;
            lastAdvanceAt = Date.now();
            audio.currentTime = Math.max(0, audio.currentTime - 0.5);
            audio.play().catch(() => setIsPlaying(false));
          }
        }, 1000);
      };

      audio.addEventListener("playing", startStallCheck);
      audio.addEventListener("pause",   () => { if (stallInterval) { clearInterval(stallInterval); stallInterval = null; } });
      audio.addEventListener("ended",   () => { if (stallInterval) { clearInterval(stallInterval); stallInterval = null; } });

      // Error handler — stop stall detector first, then attempt recovery
      audio.addEventListener("error", async () => {
        if (generation !== generationRef.current) return;

        // Always kill the stall interval — don't keep calling play() on a broken element
        if (stallInterval) { clearInterval(stallInterval); stallInterval = null; }

        const code = audio.error?.code;
        console.warn("Audio error code:", code, audio.error?.message);

        // MEDIA_ERR_NETWORK (2) — transient; retry with same URL once
        if (code === 2 && recoverRetries < 2) {
          recoverRetries++;
          audio.load();
          audio.play().catch(() => setIsPlaying(false));
          return;
        }

        // MEDIA_ERR_SRC_NOT_SUPPORTED (4) — Wasabi object missing; fall back to proxy-audio
        if (code === 4 && meta?.rhythmId && !audio.src.includes("/api/proxy-audio")) {
          const freshGen = ++generationRef.current;
          attachAndPlayRef.current?.(id, `/api/proxy-audio?id=${encodeURIComponent(meta.rhythmId)}`, freshGen, meta);
          return;
        }

        // MEDIA_ERR_SRC_NOT_SUPPORTED (4) or repeated failure — URL likely expired; refresh via Suno
        if (meta?.sunoTaskId && meta?.rhythmId) {
          try {
            const res = await fetch(
              `/api/refresh-audio?taskId=${encodeURIComponent(meta.sunoTaskId)}&id=${encodeURIComponent(meta.rhythmId)}`
            );
            if (res.ok) {
              const { url: freshUrl } = await res.json();
              const freshGen = ++generationRef.current;
              attachAndPlayRef.current?.(id, freshUrl, freshGen, meta);
              return;
            }
          } catch {
            console.warn("Audio refresh failed");
          }
        }

        setIsPlaying(false);
        setLoadingId(null);
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

  // Keep the ref current so the error handler can call attachAndPlay without a stale closure
  attachAndPlayRef.current = attachAndPlay;

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

      let url: string;
      if (audioKey) {
        const res = await fetch(`/api/stream?key=${encodeURIComponent(audioKey)}`);
        const data = await res.json();
        url = data.url;
      } else {
        url = `/api/proxy-audio?id=${encodeURIComponent(trackId)}`;
      }

      attachAndPlay(trackId, url, generation, { rhythmId: trackId });
    },
    [currentTrackId, isPlaying, stopCurrent, attachAndPlay]
  );

  const handlePlayUrl = useCallback(
    async (id: string, url: string, title?: string, meta?: { sunoTaskId?: string; rhythmId?: string }) => {
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

      attachAndPlay(id, url, generation, meta);
    },
    [currentTrackId, isPlaying, stopCurrent, attachAndPlay]
  );

  const togglePlayPause = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play()
        .then(() => setIsPlaying(true))
        .catch((err) => {
          console.warn("Resume failed:", err.message);
          setIsPlaying(false);
        });
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
