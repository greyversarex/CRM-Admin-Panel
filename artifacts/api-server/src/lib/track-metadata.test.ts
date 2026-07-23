import assert from "node:assert/strict";
import test from "node:test";
import { resolveTrackMetadata } from "./track-metadata";

test("new tracks inherit release metadata", () => {
  assert.deepEqual(
    resolveTrackMetadata({}, { language: "Tajik", genre: "Pop", subgenre: "Dance Pop" }),
    { language: "Tajik", genre: "Pop", subgenre: "Dance Pop" },
  );
});

test("explicit track metadata wins and blank values do not block inheritance", () => {
  assert.deepEqual(
    resolveTrackMetadata(
      { language: "Russian", genre: " ", subgenre: "Alternative Pop" },
      { language: "Tajik", genre: "Pop", subgenre: "Dance Pop" },
    ),
    { language: "Russian", genre: "Pop", subgenre: "Alternative Pop" },
  );
});

test("English is the final language default", () => {
  assert.deepEqual(resolveTrackMetadata({}, null), {
    language: "English",
    genre: undefined,
    subgenre: undefined,
  });
});
