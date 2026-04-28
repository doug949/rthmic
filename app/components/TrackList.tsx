"use client";

import { useState, useRef, useCallback } from "react";
import { tracks } from "@/app/data/tracks";
import TrackItem from "./TrackItem";

export default function TrackList() {
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Incremented on every new play request — stale fetches check this before playing
  const generationRef = useRef(0);

  const stopCurrent = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current.load(); // Forces iOS to fully release the audio
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

      // Stamp this request — if another tap arrives before this fetch completes,
      // the generation will have moved on and we discard the stale result
      const generation = ++generationRef.current;

      setLoadingId(trackId);
      setCurrentTrackId(trackId);
      setIsPlaying(false);

      const res = await fetch(`/api/stream?key=${encodeURIComponent(audioKey)}`);
      const { url } = await res.json();

      if (generation !== generationRef.current) return; // Superseded by a newer tap

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
    <div className="w-full max-w-md mx-auto space-y-1">
      {tracks.map((track, index) => (
        <TrackItem
          key={track.id}
          track={track}
          index={index + 1}
          isPlaying={currentTrackId === track.id && isPlaying}
          isActive={currentTrackId === track.id}
          isLoading={loadingId === track.id}
          onPlay={handlePlay}
        />
      ))}
    </div>
  );
}
