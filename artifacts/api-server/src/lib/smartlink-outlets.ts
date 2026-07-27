/**
 * Справочник витрин для смартлинков.
 *
 * Один источник правды для трёх мест: пресет площадок при создании ссылки,
 * подписи в редакторе и оформление кнопок на публичной странице. Ключи
 * совпадают с теми, что приходят от ACRCloud (`spotify`, `deezer`, …), чтобы
 * ссылки, найденные при модерации, можно было подставлять без переименований.
 */

export type OutletAction = "listen" | "buy";

export type OutletInfo = {
  key: string;
  label: string;
  /** Цвет бренда — фон иконки на публичной странице. */
  color: string;
  action: OutletAction;
  /** Как распознать площадку по вставленной ссылке. */
  hosts: string[];
};

export const SMARTLINK_OUTLETS: OutletInfo[] = [
  { key: "spotify",      label: "Spotify",        color: "#1DB954", action: "listen", hosts: ["open.spotify.com", "spotify.com"] },
  { key: "apple_music",  label: "Apple Music",    color: "#FA243C", action: "listen", hosts: ["music.apple.com"] },
  { key: "itunes",       label: "iTunes",         color: "#FB5BC5", action: "buy",    hosts: ["itunes.apple.com"] },
  { key: "youtube_music",label: "YouTube Music",  color: "#FF0000", action: "listen", hosts: ["music.youtube.com"] },
  { key: "youtube",      label: "YouTube",        color: "#FF0000", action: "listen", hosts: ["youtube.com", "youtu.be"] },
  { key: "yandex_music", label: "Яндекс Музыка",  color: "#FFCC00", action: "listen", hosts: ["music.yandex.ru", "music.yandex.com"] },
  { key: "vk_music",     label: "VK Музыка",      color: "#0077FF", action: "listen", hosts: ["music.vk.com", "vk.com"] },
  { key: "zvuk",         label: "Звук",           color: "#000000", action: "listen", hosts: ["zvuk.com", "sber-zvuk.com"] },
  { key: "mts_music",    label: "МТС Музыка",     color: "#E30611", action: "listen", hosts: ["music.mts.ru"] },
  { key: "deezer",       label: "Deezer",         color: "#A238FF", action: "listen", hosts: ["deezer.com"] },
  { key: "tidal",        label: "Tidal",          color: "#00FFFF", action: "listen", hosts: ["tidal.com"] },
  { key: "amazon_music", label: "Amazon Music",   color: "#00A8E1", action: "listen", hosts: ["music.amazon.com", "amazon.com"] },
  { key: "soundcloud",   label: "SoundCloud",     color: "#FF5500", action: "listen", hosts: ["soundcloud.com"] },
  { key: "boomplay",     label: "Boomplay",       color: "#F25822", action: "listen", hosts: ["boomplay.com"] },
  { key: "anghami",      label: "Anghami",        color: "#8E24AA", action: "listen", hosts: ["anghami.com"] },
  { key: "shazam",       label: "Shazam",         color: "#0088FF", action: "listen", hosts: ["shazam.com"] },
];

const BY_KEY = new Map(SMARTLINK_OUTLETS.map((o) => [o.key, o]));

/** Площадка по ключу. Неизвестный ключ описывается сам собой — своё название и серый цвет. */
export function outletInfo(key: string): OutletInfo {
  const found = BY_KEY.get(key.toLowerCase());
  if (found) return found;
  return {
    key,
    label: key.charAt(0).toUpperCase() + key.slice(1).replace(/[_-]+/g, " "),
    color: "#8b8b8b",
    action: "listen",
    hosts: [],
  };
}

/**
 * Угадывает витрину по вставленной ссылке.
 *
 * В редакторе оператор чаще всего просто вставляет URL — определять площадку
 * руками для полутора десятков витрин утомительно и легко ошибиться.
 * Неизвестный домен возвращает null: тогда оператор подписывает площадку сам.
 */
export function detectOutlet(url: string): OutletInfo | null {
  let host: string;
  try {
    host = new URL(url.trim()).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  // Сначала самые длинные хосты: music.apple.com должен победить apple.com.
  const candidates = SMARTLINK_OUTLETS
    .flatMap((o) => o.hosts.map((h) => ({ outlet: o, host: h })))
    .sort((a, b) => b.host.length - a.host.length);

  for (const c of candidates) {
    if (host === c.host || host.endsWith(`.${c.host}`)) return c.outlet;
  }
  return null;
}

/** Пресет площадок для новой ссылки — пустые поля, которые оператор заполняет. */
export function defaultOutlets(): Array<{ name: string; url: string; active: boolean; action: OutletAction }> {
  return ["spotify", "apple_music", "youtube_music", "yandex_music", "vk_music", "deezer"].map((key) => {
    const o = outletInfo(key);
    return { name: o.key, url: "", active: false, action: o.action };
  });
}
