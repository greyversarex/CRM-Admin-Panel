import assert from "node:assert/strict";
import test from "node:test";
import { metadataLanguageToCode } from "./metadata-language-code";

test("converts priority metadata languages to delivery codes", () => {
  assert.equal(metadataLanguageToCode("English"), "en");
  assert.equal(metadataLanguageToCode("Russian"), "ru");
  assert.equal(metadataLanguageToCode("Tajik"), "tg");
  assert.equal(metadataLanguageToCode("Persian"), "fa");
  assert.equal(metadataLanguageToCode("Dari"), "prs");
});

test("supports script variants, existing codes and unknown language fallback", () => {
  assert.equal(metadataLanguageToCode("Chinese (Simplified)"), "zh-Hans");
  assert.equal(metadataLanguageToCode("Chinese (Traditional)"), "zh-Hant");
  assert.equal(metadataLanguageToCode("EN"), "en");
  assert.equal(metadataLanguageToCode("Other"), "und");
  assert.equal(metadataLanguageToCode("legacy custom value"), "und");
});

test("supports product names that differ from Intl display names", () => {
  assert.equal(metadataLanguageToCode("Bengali"), "bn");
  assert.equal(metadataLanguageToCode("Hawaiian"), "haw");
  assert.equal(metadataLanguageToCode("Slovene"), "sl");
  assert.equal(metadataLanguageToCode("Tonga"), "to");
});
