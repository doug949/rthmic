export interface Track {
  id: string;
  title: string;
  artist?: string;
  duration?: string;
  audioUrl: string;
}

// Update these URLs to point to your Wasabi bucket.
// Format: https://s3.wasabisys.com/YOUR-BUCKET/path/to/file.mp3
export const tracks: Track[] = [
  {
    id: "1",
    title: "Track 01",
    artist: "RTHM",
    audioUrl: "https://s3.wasabisys.com/rthm-audio/track-01.mp3",
  },
  {
    id: "2",
    title: "Track 02",
    artist: "RTHM",
    audioUrl: "https://s3.wasabisys.com/rthm-audio/track-02.mp3",
  },
  {
    id: "3",
    title: "Track 03",
    artist: "RTHM",
    audioUrl: "https://s3.wasabisys.com/rthm-audio/track-03.mp3",
  },
];
