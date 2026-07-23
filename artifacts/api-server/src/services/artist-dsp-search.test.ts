import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeArtworkUrl,
  rankArtistCandidates,
  type DspArtistCandidate,
} from "./artist-dsp-search";

function candidate(id: string, name: string): DspArtistCandidate {
  return {
    id,
    name,
    imageUrl: null,
    followers: null,
    url: null,
    genre: null,
  };
}

test("puts an exact artist-name match before Deezer's fuzzy results", () => {
  const results = rankArtistCandidates([
    candidate("1", "Alisher Nazirov"),
    candidate("2", "Alisher Alimatov"),
    candidate("3", "Alastair Lane"),
    candidate("4", "Alisher Ans"),
  ], "Alisher Ans");

  assert.equal(results[0]?.id, "4");
  assert.deepEqual(results.map((item) => item.id), ["4", "1", "2", "3"]);
});

test("matches artist names case-insensitively and ignores punctuation", () => {
  const results = rankArtistCandidates([
    candidate("1", "Another artist"),
    candidate("2", "ÁLISHER-ANS"),
  ], "alisher ans");

  assert.equal(results[0]?.id, "2");
});

test("keeps a bounded result list after ranking", () => {
  const candidates = Array.from({ length: 20 }, (_, index) =>
    candidate(String(index), `Artist ${index}`),
  );

  assert.equal(rankArtistCandidates(candidates, "Artist", 12).length, 12);
});

test("normalizes catalog artwork and rejects Deezer's empty placeholder", () => {
  assert.equal(
    normalizeArtworkUrl("https://is1-ssl.mzstatic.com/image/thumb/Music/100x100bb.jpg"),
    "https://is1-ssl.mzstatic.com/image/thumb/Music/300x300bb.jpg",
  );
  assert.equal(
    normalizeArtworkUrl("https://cdn-images.dzcdn.net/images/artist//250x250-000000-80-0-0.jpg"),
    null,
  );
});
