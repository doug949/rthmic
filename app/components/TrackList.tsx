"use client";

import { useState, useRef, useCallback } from "react";
import { tracks } from "@/app/data/tracks";
import TrackItem from "./TrackItem";

export default function TrackList() {
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlay = useCallback(
    (trackId: string, audioUrl: string) => {
      if (currentTrackId === trackId) {
        // Toggle play/pause on same track
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

      // Start new track
      const audio = new Audio(audioUrl);
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
          onPlay={handlePlay}
        />
      ))}
    </div>
  );
}
