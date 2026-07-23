export type InheritableTrackMetadata = {
  language?: string | null;
  genre?: string | null;
  subgenre?: string | null;
};

function nonBlank(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export function resolveTrackMetadata(
  track: InheritableTrackMetadata,
  release: InheritableTrackMetadata | null,
): { language: string; genre?: string; subgenre?: string } {
  return {
    language: nonBlank(track.language) ?? nonBlank(release?.language) ?? "English",
    genre: nonBlank(track.genre) ?? nonBlank(release?.genre),
    subgenre: nonBlank(track.subgenre) ?? nonBlank(release?.subgenre),
  };
}
