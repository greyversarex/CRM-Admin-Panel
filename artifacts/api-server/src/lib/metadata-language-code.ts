const languageNames = new Intl.DisplayNames(["en"], { type: "language" });

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const languageCodeByName = new Map<string, string>();
for (let first = 97; first <= 122; first++) {
  for (let second = 97; second <= 122; second++) {
    const code = String.fromCharCode(first, second);
    try {
      const name = languageNames.of(code);
      if (name && name.toLowerCase() !== code && !name.startsWith("Unknown language")) {
        languageCodeByName.set(normalize(name), code);
      }
    } catch {
      // Not every two-letter combination is an ISO-639 language code.
    }
  }
}

const aliases: Record<string, string> = {
  bengali: "bn",
  bihari: "bh",
  "chinese simplified": "zh-Hans",
  "chinese traditional": "zh-Hant",
  dari: "prs",
  "fula fulah pulaar pular": "ff",
  hawaiian: "haw",
  kirundi: "rn",
  kwanyama: "kj",
  lemko: "rue",
  luganda: "lg",
  maldivian: "dv",
  nuer: "nus",
  ojibwe: "oj",
  "old church slavonic": "cu",
  ossetian: "os",
  other: "und",
  slovene: "sl",
  tagalog: "tl",
  tonga: "to",
};
for (const [name, code] of Object.entries(aliases)) languageCodeByName.set(name, code);

/** Converts product-facing English language names to DDEX ISO/BCP-47 codes. */
export function metadataLanguageToCode(value?: string | null, fallback = "en"): string {
  const raw = value?.trim();
  if (!raw) return fallback;
  if (/^[a-z]{2,3}(?:-[A-Za-z]{4})?$/i.test(raw)) return raw.toLowerCase().replace(/-([a-z])/i, (_, c: string) => `-${c.toUpperCase()}`);
  return languageCodeByName.get(normalize(raw)) ?? "und";
}
