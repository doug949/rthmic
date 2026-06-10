import type { PillarType } from "@/app/types/pipeline";

export interface PodcastEpisode {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  duration?: string;
  audioUrl?: string;
}

export interface PodcastFeaturedTrack {
  id: string;
  title: string;
  creatorName?: string;
  description?: string;
  pillar: PillarType;
  audioUrl?: string;
  audioKey?: string;
  lyrics?: string;
  tags?: string[];
}

export interface PodcastContent {
  episodes: PodcastEpisode[];
  featuredTracks: PodcastFeaturedTrack[];
}

export const EMPTY_PODCAST_CONTENT: PodcastContent = {
  episodes: [],
  featuredTracks: [],
};

export function parsePodcastContent(raw: string | null | undefined): PodcastContent {
  if (!raw) return EMPTY_PODCAST_CONTENT;
  try {
    const content = JSON.parse(raw) as Partial<PodcastContent>;
    return {
      episodes: Array.isArray(content.episodes) ? content.episodes : [],
      featuredTracks: Array.isArray(content.featuredTracks) ? content.featuredTracks : [],
    };
  } catch {
    return EMPTY_PODCAST_CONTENT;
  }
}
