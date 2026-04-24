import type { ParseResult, SupportedDsp } from "./types";
import { parseSpotify } from "./spotify";
import { parseApple } from "./apple";
import { parseYouTube } from "./youtube";
import { parseTikTok } from "./tiktok";

export const SUPPORTED_DSPS: readonly SupportedDsp[] = ["spotify", "apple_music", "youtube_music", "tiktok"] as const;

export function isSupportedDsp(s: string): s is SupportedDsp {
  return (SUPPORTED_DSPS as readonly string[]).includes(s);
}

export function parseByDsp(dsp: SupportedDsp, buffer: Buffer): ParseResult {
  switch (dsp) {
    case "spotify":       return parseSpotify(buffer);
    case "apple_music":   return parseApple(buffer);
    case "youtube_music": return parseYouTube(buffer);
    case "tiktok":        return parseTikTok(buffer);
  }
}

export type { ParsedRow, ParseResult, SupportedDsp } from "./types";
