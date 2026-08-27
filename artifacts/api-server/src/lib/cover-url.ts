/**
 * Приводит ссылку на обложку к размеру, который примет Broma16.
 *
 * Deezer в поле `cover_xl` отдаёт 1000×1000, а Broma16 требует минимум
 * 1500×1500 — из-за этого перенесённые с Deezer релизы получали отказ
 * «file: rule: image_dimensions» (так споткнулся релиз #30). Размер зашит
 * прямо в адрес картинки, поэтому его достаточно подменить.
 *
 * Проверено на их CDN: 1400, 1800 и 1920 отдаются, 3000 — уже 403. Берём
 * 1800: с запасом проходит требование и остаётся квадратом.
 */

/** Размер, который просим у Deezer вместо стандартного 1000×1000. */
export const DEEZER_COVER_SIDE = 1800;

const DEEZER_SIZE_IN_URL = /\/(\d{3,4})x(\d{3,4})-/;

/**
 * Возвращает ссылку на обложку покрупнее, если её размер задан прямо в адресе.
 * Чужие ссылки возвращаются без изменений.
 */
export function upscaleCoverUrl(url: string | null | undefined, side = DEEZER_COVER_SIDE): string | null {
  if (!url) return null;
  if (!/dzcdn\.net|deezer\.com/i.test(url)) return url;
  const match = url.match(DEEZER_SIZE_IN_URL);
  if (!match) return url;
  // Уменьшать не будем: если там уже больше запрошенного, оставляем как есть.
  if (Number(match[1]) >= side) return url;
  return url.replace(DEEZER_SIZE_IN_URL, `/${side}x${side}-`);
}

/**
 * Обложка нужного размера по штрихкоду релиза.
 *
 * У Spotify максимум 640×640 — больше их API не отдаёт, проверено на живом
 * релизе «Jano Janan»: 640, 300 и 64, всё. Для Broma16 нужно минимум 1500×1500,
 * поэтому перенесённые оттуда релизы приходили с негодной обложкой.
 *
 * Deezer по тому же UPC отдаёт 1800×1800 — берём картинку у него. Возвращает
 * null, если релиза там нет: тогда остаётся то, что было.
 */
export async function coverByUpcFromDeezer(upc: string | null | undefined): Promise<string | null> {
  const code = (upc ?? "").replace(/\D/g, "");
  if (!code) return null;
  try {
    const res = await fetch(`https://api.deezer.com/album/upc:${code}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const album = await res.json() as { cover_xl?: string; error?: unknown };
    if (album?.error || !album?.cover_xl) return null;
    return upscaleCoverUrl(album.cover_xl);
  } catch {
    return null;
  }
}
