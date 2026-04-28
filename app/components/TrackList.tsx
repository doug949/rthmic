"use client";

import { useState, useRef, useCallback } from "react";
import { tracks } from "@/app/data/tracks";
import TrackItem from "./TrackItem";

export default function TrackList() {
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

      // Stop current track
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }

      setLoadingId(trackId);

      // Fetch a signed URL from our API
      const res = await fetch(`/api/stream?key=${encodeURIComponent(audioKey)}`);
      const { url } = await res.json();

      setLoadingId(null);

      const audio = new Audio(url);
      audio.preload = "none";
      audioRef.current = audio;

      audio.play().catch(console.error);
      setCurrentTrackId(trackId);
      setIsPlaying(true);

      audio.addEventListener("ended", () => {
        setIsPlaying(false);
        setCurrentTrackId(null);
      });
    },
    [currentTrackId, isPlaying]
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
