import type { ParseResult, SupportedDsp } from "./types";
import { parseSpotify } from "./spotify";
import { parseApple } from "./apple";
import { parseYouTube } from "./youtube";
import { parseTikTok } from "./tiktok";

export const SUPPORTED_DSPS: readonly SupportedDsp[] = ["spotify", "apple_music", "youtube_music", "tiktok"] as const;

export function isSupportedDsp(s: string): s is SupportedDsp {
  return (SUPPORTED_DSPS as readonly string[]).includes(s);
}

/** Парсит CSV/TSV-файл с диска для нужного DSP. Все парсеры — async streaming
 * (см. ./streaming.ts). Не держим raw-буфер в RAM, только распарсенные records. */
export async function parseByDsp(dsp: SupportedDsp, filePath: string): Promise<ParseResult> {
  switch (dsp) {
    case "spotify":       return parseSpotify(filePath);
    case "apple_music":   return parseApple(filePath);
    case "youtube_music": return parseYouTube(filePath);
    case "tiktok":        return parseTikTok(filePath);
  }
}

export type { ParsedRow, ParseResult, SupportedDsp } from "./types";
