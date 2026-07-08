/**
 * Клиент генерации отраслевых кодов.
 *
 * Раньше ISRC генерировался клиентским Math.random() (коллизии, коды не
 * registry-safe). Теперь запрашиваем настоящий sequential код у сервера
 * (POST /api/catalog/codes/isrc). Эндпоинт доступен всем аутентифицированным
 * ролям, поэтому подходит и для мастера релиза (артист/лейбл).
 */
export async function generateIsrcCode(): Promise<{ code: string; warning?: string }> {
  const r = await fetch("/api/catalog/codes/isrc", { method: "POST", credentials: "same-origin" });
  const j = await r.json().catch(() => ({} as { message?: string; error?: string }));
  if (!r.ok) {
    throw new Error(j?.message || j?.error || `Не удалось сгенерировать ISRC (HTTP ${r.status})`);
  }
  return j as { code: string; warning?: string };
}
