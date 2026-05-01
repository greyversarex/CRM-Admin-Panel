/**
 * UGC import — реальный импорт из Spotify (popularity) для треков, у которых
 * заполнен ISRC. Никаких scraper'ов и никаких фейковых TikTok данных.
 *
 * POST /api/analytics/ugc/import-spotify
 *   body: { releaseId?: number, limit?: number (default 100) }
 *
 * Алгоритм:
 *   1. Загружает треки (опционально — только для releaseId), у которых isrc IS NOT NULL.
 *   2. Для каждого трека делает GET /v1/search?q=isrc:XXX&type=track (Spotify не имеет
 *      прямого lookup по ISRC, но search-фильтр работает).
 *   3. Берёт первый track из результатов → popularity (0-100), preview_url.
 *   4. Пишет в ugc_metrics с platform="spotify", views=popularity (как аппроксимация спроса),
 *      externalContentId=track.id.
 *
 * Возвращает: { imported, skipped, errors }.
 *
 * Ошибки:
 *   - Нет creds → 503 spotify_not_configured.
 *   - Spotify rejected creds / network → 502 spotify_upstream.
 */
import { Router } from "express";
import { db, platformSettingsTable, releasesTable, tracksTable, ugcMetricsTable } from "@workspace/db";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { requireRole } from "../lib/auth";
import { auditMutation } from "../lib/audit";
import { logger } from "../lib/logger";
import { getIntegrationByCode, loadCredentials } from "../services/integrations-service";

const router = Router();

interface SpotifyConfig { clientId?: string; clientSecret?: string }

async function loadSpotifyConfig(): Promise<SpotifyConfig> {
  try {
    // Приоритет: интеграции (Настройки → Интеграции → Spotify for Artists)
    const integration = await getIntegrationByCode("spotify");
    if (integration && integration.status !== "disconnected") {
      const creds = await loadCredentials(integration.id);
      const clientId = creds["client_id"];
      const clientSecret = creds["client_secret"];
      if (clientId && clientSecret) return { clientId, clientSecret };
    }
  } catch { /* ignore */ }
  // Fallback: platformSettings
  try {
    const [row] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, "spotify"));
    return (row?.value ?? {}) as SpotifyConfig;
  } catch { return {}; }
}

let _token: { value: string; expiresAt: number } | null = null;
async function getToken(cfg: SpotifyConfig): Promise<string> {
  if (!cfg.clientId || !cfg.clientSecret) throw new Error("not_configured");
  if (_token && _token.expiresAt > Date.now() + 60_000) return _token.value;
  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
  const resp = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`upstream:${resp.status}:${txt.slice(0, 200)}`);
  }
  const json = await resp.json() as { access_token: string; expires_in: number };
  _token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return _token.value;
}

router.post("/analytics/ugc/import-spotify", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const cfg = await loadSpotifyConfig();
  if (!cfg.clientId || !cfg.clientSecret) {
    res.status(503).json({
      error: "spotify_not_configured",
      message: "Не настроены client_id/client_secret в Settings → Интеграции → Spotify",
    });
    return;
  }

  const releaseId = typeof req.body?.releaseId === "number" ? req.body.releaseId : null;
  const limit = Math.min(Math.max(Number(req.body?.limit ?? 100), 1), 500);

  let token: string;
  try { token = await getToken(cfg); }
  catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    res.status(msg.startsWith("upstream:") ? 502 : 500).json({ error: "spotify_token_failed", message: msg });
    return;
  }

  // Берём треки с isrc, опционально фильтр по releaseId
  const conds = [isNotNull(tracksTable.isrc)];
  if (releaseId !== null) conds.push(eq(tracksTable.releaseId, releaseId));
  const tracks = await db.select({
    id: tracksTable.id,
    isrc: tracksTable.isrc,
    releaseId: tracksTable.releaseId,
    title: tracksTable.title,
  }).from(tracksTable).where(and(...conds)).limit(limit);

  if (tracks.length === 0) {
    res.json({ imported: 0, skipped: 0, errors: 0, message: "Нет треков с заполненным ISRC" });
    return;
  }

  let imported = 0, skipped = 0, errors = 0;
  const errorDetails: Array<{ trackId: number; error: string }> = [];

  // Простой sequential — Spotify rate-limits довольно мягко (~30 req/s),
  // но 100 треков = 100 запросов, делаем паузу 50ms между ними.
  for (const t of tracks) {
    if (!t.isrc) { skipped++; continue; }
    try {
      const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(`isrc:${t.isrc}`)}&type=track&limit=1`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (r.status === 429) {
        // Rate limit — стопаемся, возвращаем что успели
        logger.warn({ trackId: t.id }, "[ugc-import-spotify] rate-limited, stopping");
        break;
      }
      if (!r.ok) {
        errors++;
        errorDetails.push({ trackId: t.id, error: `http_${r.status}` });
        continue;
      }
      const j = await r.json() as { tracks?: { items?: Array<{ id: string; popularity: number; name: string }> } };
      const item = j.tracks?.items?.[0];
      if (!item) { skipped++; continue; }

      await db.insert(ugcMetricsTable).values({
        platform: "spotify",
        externalContentId: item.id,
        releaseId: t.releaseId,
        trackId: t.id,
        views: item.popularity ?? 0, // Spotify popularity 0-100 как proxy
        likes: 0, shares: 0, videosCount: 0, revenueCents: 0,
        recordedAt: new Date(),
      });
      imported++;
      await new Promise((r) => setTimeout(r, 50));
    } catch (e) {
      errors++;
      errorDetails.push({ trackId: t.id, error: e instanceof Error ? e.message : "unknown" });
    }
  }

  void auditMutation(req, {
    action: "import", entityType: "ugc_spotify", entityId: releaseId ?? 0,
    before: null, after: { imported, skipped, errors },
  });

  res.json({ imported, skipped, errors, errorDetails: errorDetails.slice(0, 10) });
});

export default router;
