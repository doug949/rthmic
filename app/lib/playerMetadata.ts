export type AudioTrackMeta = {
  sunoTaskId?: string;
  rhythmId?: string;
  genre?: string;
  createdAt?: number;
};

const TRACK_DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatTrackDate(createdAt?: number | null): string {
  if (!createdAt || !Number.isFinite(createdAt)) return "Date not recorded";
  return TRACK_DATE_FORMATTER.format(new Date(createdAt));
}

export function trackMetadataLabel(genre?: string | null, createdAt?: number | null): string {
  return `Genre: ${genre?.trim() || "Not recorded"} · Created: ${formatTrackDate(createdAt)}`;
}
