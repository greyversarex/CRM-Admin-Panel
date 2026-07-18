import { Router } from "express";
import { db, releasesTable, tracksTable, artistsTable, labelsTable, deliveriesTable, transferImportsTable, platformSettingsTable, releaseArtistsTable, releaseDspsTable, metadataCacheTable, type TransferImportItem } from "@workspace/db";
import { count, eq, desc, and, sql, ilike, or, inArray, asc } from "drizzle-orm";
import {
  CreateReleaseBody, UpdateReleaseBody, GetReleaseParams, UpdateReleaseParams,
  DeleteReleaseParams, UpdateReleaseStatusParams, UpdateReleaseStatusBody,
  CreateTransferImportBody, SpotifySearchReleasesQueryParams,
  DeliverReleaseParams, DeliverReleaseBody,
} from "@workspace/api-zod";
import { getDataScope, requireRole, resolveScopeFilter } from "../lib/auth";
import { auditMutation } from "../lib/audit";
import { getIntegrationByCode, loadCredentials } from "../services/integrations-service";
import { notifyByArtistId, notifyByLabelId, notifyAdmins } from "../services/notifications";
import { fireTriggerAndForget } from "../services/triggers";
import { fireWebhookAndForget } from "../services/webhook-dispatcher";
import { assessAndPersist, LABEL_STRIKE_BLOCK_THRESHOLD } from "../services/risk-engine";
import { lookupReleaseByBarcode } from "../services/musicbrainz";
import { itunesLookupByUpc, itunesHighResCover, parseItunesCopyright } from "../services/itunes";
import { logger } from "../lib/logger";

const router = Router();

// Verifies a release row is visible to the current session user. Fail-closed
// when the session user has no linked artist/label record.
// Для лейбла релиз «свой», если он привязан к лейблу напрямую (labelId) ИЛИ
// принадлежит артисту этого лейбла — лейбл может выпускать релиз под чужим
// импринтом (labelId другого лейбла), не теряя к нему доступ.
async function releaseInScope(scope: ReturnType<typeof getDataScope>, r: { artistId: number; labelId: number | null }): Promise<boolean> {
  if (scope.fullAccess) return true;
  if (scope.role === "artist") return scope.artistId != null && r.artistId === scope.artistId;
  if (scope.role === "label") {
    if (scope.labelId == null) return false;
    if (r.labelId === scope.labelId) return true;
    const [a] = await db.select({ labelId: artistsTable.labelId }).from(artistsTable).where(eq(artistsTable.id, r.artistId));
    return a?.labelId === scope.labelId;
  }
  return false;
}

// Релиз можно редактировать (артист/лейбл) только в статусах draft и rejected.
// Admin/manager обходят это правило (полный доступ).
// Возвращает null если можно править, иначе строку-причину для 409.
export function releaseEditableReason(
  scope: ReturnType<typeof getDataScope>,
  status: string,
): string | null {
  if (scope.fullAccess) return null;
  if (status === "draft" || status === "rejected") return null;
  return `Релиз в статусе «${status}» закрыт для редактирования. Дождитесь решения модератора или снимите релиз с витрин (Take Down), чтобы вносить правки.`;
}

// ─── Catalog number generation ──────────────────────────────────────────────
// Внутренний каталожный номер в формате TM + 6 цифр (TM260001, TM260002…).
// Следующий = максимальный существующий + 1; старт с TM260001. Broma16 принимает
// строку до 50 символов, поэтому короткий числовой код всегда валиден.
const CATALOG_PREFIX = "TM";
const CATALOG_START = 260001;

async function generateCatalogNumber(): Promise<string> {
  const rows = await db
    .select({ catalogNumber: releasesTable.catalogNumber })
    .from(releasesTable)
    .where(sql`${releasesTable.catalogNumber} ~ '^TM[0-9]{6}$'`);
  let maxSeq = CATALOG_START - 1;
  for (const row of rows) {
    if (!row.catalogNumber) continue;
    const seq = Number(row.catalogNumber.slice(CATALOG_PREFIX.length));
    if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
  }
  return `${CATALOG_PREFIX}${String(maxSeq + 1).padStart(6, "0")}`;
}

// ─── Transfer import storage ────────────────────────────────────────────────
// Persistent (DB-backed) catalog-import jobs. Admin/manager only.
function serializeTransferImport(row: typeof transferImportsTable.$inferSelect) {
  return {
    id: row.id,
    status: row.status as "in_progress" | "complete" | "error",
    spotifyArtistId: row.spotifyArtistId,
    spotifyArtistName: row.spotifyArtistName,
    importedCount: row.importedCount,
    failedCount: row.failedCount,
    createdAt: row.createdAt.toISOString(),
    createdById: row.createdById,
    createdByName: row.createdByName,
    items: (row.items ?? []) as TransferImportItem[],
  };
}

async function enrichRelease(r: typeof releasesTable.$inferSelect) {
  let artistName = "Unknown";
  const [artist] = await db.select({ name: artistsTable.name }).from(artistsTable).where(eq(artistsTable.id, r.artistId));
  if (artist) artistName = artist.name;

  let labelName = null;
  if (r.labelId) {
    const [label] = await db.select({ name: labelsTable.name }).from(labelsTable).where(eq(labelsTable.id, r.labelId));
    labelName = label?.name ?? null;
  }

  const [trackCount] = await db.select({ count: count() }).from(tracksTable).where(eq(tracksTable.releaseId, r.id));

  // Multi-primary contributors на уровне релиза. Пустой если есть только legacy
  // artistId (например, импорт из Spotify не заполнял join-table).
  const artistsRows = await db.select({
    artistId: releaseArtistsTable.artistId,
    role: releaseArtistsTable.role,
    position: releaseArtistsTable.position,
    name: artistsTable.name,
  }).from(releaseArtistsTable)
    .innerJoin(artistsTable, eq(artistsTable.id, releaseArtistsTable.artistId))
    .where(eq(releaseArtistsTable.releaseId, r.id))
    .orderBy(asc(releaseArtistsTable.position), asc(releaseArtistsTable.id));

  const artists = artistsRows.map((a) => ({
    artistId: a.artistId,
    name: a.name,
    role: a.role,
    position: a.position,
  }));

  // Выбранные DSP — список кодов из release_dsps.
  const dspRows = await db.select({ code: releaseDspsTable.dspCode })
    .from(releaseDspsTable)
    .where(eq(releaseDspsTable.releaseId, r.id))
    .orderBy(asc(releaseDspsTable.id));
  const dsps = dspRows.map((d) => d.code);

  const EDITABLE_STATUSES = new Set(["draft", "rejected"]);
  return {
    ...r,
    artistName,
    labelName,
    totalTracks: trackCount.count,
    artists,
    dsps,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    // ── Флаги единого источника истины (используются фронтендом) ──────────
    // Список допустимых переходов для PATCH /releases/:id/status.
    allowedTransitions: RELEASE_STATUS_TRANSITIONS[r.status] ?? [] as readonly string[],
    // Можно редактировать поля/треки/ассеты (совпадает с releaseEditableReason).
    isEditable: EDITABLE_STATUSES.has(r.status),
    // Можно нажать «Send to Moderation» (POST /releases/:id/submit).
    canSubmit: EDITABLE_STATUSES.has(r.status),
    // Можно запустить отгрузку в DSP (POST /releases/:id/deliver).
    canDeliver: r.status === "approved",
    // Risk-engine: composite оценка + список факторов.
    // Гарантируем явные значения (не undefined), даже если в БД старые строки.
    riskScore: r.riskScore ?? 0,
    riskFactors: r.riskFactors ?? [],
  };
}

router.get("/releases", async (req, res): Promise<void> => {
  const page = parseInt(req.query.page as string ?? "1", 10) || 1;
  const limit = parseInt(req.query.limit as string ?? "20", 10) || 20;
  const offset = (page - 1) * limit;
  const status = req.query.status as string | undefined;
  let artistId = req.query.artist_id ? parseInt(req.query.artist_id as string, 10) : undefined;
  let labelId = req.query.label_id ? parseInt(req.query.label_id as string, 10) : undefined;
  const releaseType = req.query.release_type as string | undefined;
  const search = (req.query.search as string | undefined)?.trim();

  // Override scope: artist/label users may only see their own data; query overrides ignored.
  const scope = getDataScope(req);
  if (!scope.fullAccess) {
    if (scope.role === "artist") {
      if (scope.artistId == null) { res.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } }); return; }
      if (artistId !== undefined && artistId !== scope.artistId) { res.status(403).json({ error: "Forbidden" }); return; }
      artistId = scope.artistId; labelId = undefined;
    } else if (scope.role === "label") {
      if (scope.labelId == null) { res.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } }); return; }
      // Фильтр по label_id из query оставляем (он ANDуется со scope-условием ниже,
      // так что чужие данные не утекут).
    }
  }

  const conditions: any[] = [];
  // Scope-условие лейбла: релиз виден, если привязан к лейблу напрямую ИЛИ
  // принадлежит артисту лейбла (лейбл может выпускать под чужим импринтом).
  if (!scope.fullAccess && scope.role === "label" && scope.labelId != null) {
    const ownArtistIds = (
      await db.select({ id: artistsTable.id }).from(artistsTable).where(eq(artistsTable.labelId, scope.labelId))
    ).map((r) => r.id);
    const scopeParts: any[] = [eq(releasesTable.labelId, scope.labelId)];
    if (ownArtistIds.length > 0) scopeParts.push(inArray(releasesTable.artistId, ownArtistIds));
    conditions.push(or(...scopeParts));
  }
  if (status) {
    const statuses = status.split(",").map((s) => s.trim()).filter(Boolean);
    if (statuses.length === 1) conditions.push(eq(releasesTable.status, statuses[0]));
    else if (statuses.length > 1) conditions.push(inArray(releasesTable.status, statuses));
  }
  if (releaseType) conditions.push(eq(releasesTable.releaseType, releaseType));
  if (artistId) conditions.push(eq(releasesTable.artistId, artistId));
  if (labelId) conditions.push(eq(releasesTable.labelId, labelId));
  if (search) {
    const pattern = `%${search}%`;
    // Match against title, UPC, and joined artist/label names
    const matchingArtistIds = (
      await db.select({ id: artistsTable.id }).from(artistsTable).where(ilike(artistsTable.name, pattern))
    ).map((r) => r.id);
    const matchingLabelIds = (
      await db.select({ id: labelsTable.id }).from(labelsTable).where(ilike(labelsTable.name, pattern))
    ).map((r) => r.id);

    const orParts: any[] = [
      ilike(releasesTable.title, pattern),
      ilike(releasesTable.upc, pattern),
    ];
    if (matchingArtistIds.length > 0) orParts.push(inArray(releasesTable.artistId, matchingArtistIds));
    if (matchingLabelIds.length > 0) orParts.push(inArray(releasesTable.labelId, matchingLabelIds));
    const orCond = or(...orParts);
    if (orCond) conditions.push(orCond);
  }
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const releases = await db.select().from(releasesTable)
    .where(whereClause)
    .limit(limit).offset(offset).orderBy(desc(releasesTable.createdAt));
  const [totalResult] = await db.select({ count: count() }).from(releasesTable).where(whereClause);

  const data = await Promise.all(releases.map(enrichRelease));

  res.json({
    data,
    pagination: {
      page,
      limit,
      total: totalResult.count,
      totalPages: Math.ceil(totalResult.count / limit),
    },
  });
});

// Counts grouped by status (must be declared before /:id)
router.get("/releases/counts", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  let where: any = undefined;
  if (!scope.fullAccess) {
    if (scope.role === "artist") {
      if (scope.artistId == null) {
        res.json({ all: 0, draft: 0, pending_review: 0, approved: 0, scheduled: 0, live: 0, takedown: 0, unfinished: 0, readyToSubmit: 0 });
        return;
      }
      where = eq(releasesTable.artistId, scope.artistId);
    } else if (scope.role === "label") {
      if (scope.labelId == null) {
        res.json({ all: 0, draft: 0, pending_review: 0, approved: 0, scheduled: 0, live: 0, takedown: 0, unfinished: 0, readyToSubmit: 0 });
        return;
      }
      // Прямой labelId ИЛИ релизы артистов лейбла (свой релиз под чужим импринтом).
      const ownArtistIds = (
        await db.select({ id: artistsTable.id }).from(artistsTable).where(eq(artistsTable.labelId, scope.labelId))
      ).map((r) => r.id);
      const scopeParts: any[] = [eq(releasesTable.labelId, scope.labelId)];
      if (ownArtistIds.length > 0) scopeParts.push(inArray(releasesTable.artistId, ownArtistIds));
      where = or(...scopeParts);
    }
  }

  const rows = await db
    .select({ status: releasesTable.status, c: count() })
    .from(releasesTable)
    .where(where)
    .groupBy(releasesTable.status);

  const byStatus: Record<string, number> = {};
  let all = 0;
  for (const r of rows) {
    byStatus[r.status] = r.c;
    all += r.c;
  }

  const draft = byStatus["draft"] ?? 0;
  const pending_review = byStatus["pending_review"] ?? 0;
  const approved = byStatus["approved"] ?? 0;
  const delivering = byStatus["delivering"] ?? 0;
  const delivered = byStatus["delivered"] ?? 0;
  const live = byStatus["live"] ?? 0;
  const takedown = (byStatus["takedown_requested"] ?? 0) + (byStatus["removed"] ?? 0);

  res.json({
    all,
    draft,
    pending_review,
    approved,
    scheduled: approved + delivering + delivered,
    live,
    takedown,
    unfinished: draft,
    readyToSubmit: pending_review + approved,
  });
});

// ─── Transfer Imports ───────────────────────────────────────────────────────
// Global catalog-import jobs (back-catalog ingestion via Spotify lookup).
// Admin/manager only. Persistent in DB; every create writes audit_log + actually
// inserts artist/label/release/tracks rows so the catalog gets real data.

interface SpotifyConfig { clientId?: string; clientSecret?: string }
export async function loadSpotifyConfig(): Promise<SpotifyConfig> {
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
  // Fallback: platformSettings (старый путь через Настройки → Spotify)
  try {
    const [row] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, "spotify"));
    return (row?.value ?? {}) as SpotifyConfig;
  } catch { return {}; }
}

// Distinguishes config errors (missing creds → 503) from upstream/auth/network
// failures (Spotify rejected creds or DNS error → 502). Throwing typed errors
// lets the route map cleanly to HTTP status without conflating cases.
class SpotifyNotConfiguredError extends Error { constructor() { super("spotify_not_configured"); } }
class SpotifyUpstreamError extends Error { constructor(msg: string) { super(msg); } }

let _spotifyToken: { value: string; expiresAt: number } | null = null;
export async function getSpotifyToken(cfg: SpotifyConfig): Promise<string> {
  if (!cfg.clientId || !cfg.clientSecret) throw new SpotifyNotConfiguredError();
  if (_spotifyToken && _spotifyToken.expiresAt > Date.now() + 60_000) return _spotifyToken.value;
  // Убираем лишние пробелы/переводы строк при копировании ключей (иначе 400 invalid_client).
  const clientId = cfg.clientId.trim();
  const clientSecret = cfg.clientSecret.trim();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  let resp: Response;
  try {
    resp = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Authorization": `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
  } catch (e: any) {
    throw new SpotifyUpstreamError(`network: ${e?.message ?? "unknown"}`);
  }
  if (!resp.ok) {
    let detail = "";
    try { detail = (await resp.text()).slice(0, 200); } catch { /* ignore */ }
    throw new SpotifyUpstreamError(`token ${resp.status}${detail ? ": " + detail : ""}`);
  }
  const json = await resp.json() as { access_token: string; expires_in: number };
  _spotifyToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return _spotifyToken.value;
}

router.get("/releases/transfer-imports", requireRole("admin", "manager", "label", "artist"), async (_req, res): Promise<void> => {
  const rows = await db.select().from(transferImportsTable).orderBy(desc(transferImportsTable.id));
  res.json(rows.map(serializeTransferImport));
});

// Lookup-or-create helpers (case-insensitive). Run inside a transaction so
// partial state cannot leak if a downstream insert fails.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function findOrCreateArtist(tx: Tx, name: string, labelId: number | null): Promise<{ id: number; created: boolean; row: typeof artistsTable.$inferSelect | null }> {
  const trimmed = name.trim();
  const [existing] = await tx.select().from(artistsTable).where(ilike(artistsTable.name, trimmed)).limit(1);
  if (existing) return { id: existing.id, created: false, row: existing };
  const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `artist-${Date.now()}`;
  const [created] = await tx.insert(artistsTable).values({ name: trimmed, slug, labelId, status: "active" }).returning();
  return { id: created.id, created: true, row: created };
}

async function findOrCreateLabel(tx: Tx, name: string): Promise<{ id: number; created: boolean; row: typeof labelsTable.$inferSelect | null }> {
  const trimmed = name.trim();
  const [existing] = await tx.select().from(labelsTable).where(ilike(labelsTable.name, trimmed)).limit(1);
  if (existing) return { id: existing.id, created: false, row: existing };
  const [created] = await tx.insert(labelsTable).values({ name: trimmed, status: "active" }).returning();
  return { id: created.id, created: true, row: created };
}

// Postgres unique-violation SQLSTATE. Drizzle wraps DB errors and pushes the
// pg error onto `cause`, so we walk the cause chain to find the original code.
function isUniqueViolation(e: any): boolean {
  let cur = e;
  for (let i = 0; i < 5 && cur; i++) {
    if (cur?.code === "23505") return true;
    if (/duplicate key|unique constraint|23505/i.test(String(cur?.message ?? ""))) return true;
    cur = cur.cause;
  }
  return false;
}

router.post("/releases/transfer-imports", requireRole("admin", "manager", "label", "artist"), async (req, res): Promise<void> => {
  const parsed = CreateTransferImportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Pending audits: collected during transactions so we only persist them
  // (and only fire-and-forget) after the parent tx commits successfully.
  type PendingAudit = Parameters<typeof auditMutation>[1];
  const pendingAudits: PendingAudit[] = [];

  // Resolve a single labelId for the whole batch if labelName given (own tx so
  // that label is reusable across items without rollback churn).
  let batchLabelId: number | null = null;
  if (parsed.data.labelName?.trim()) {
    const audits: PendingAudit[] = [];
    batchLabelId = await db.transaction(async (tx) => {
      const r = await findOrCreateLabel(tx, parsed.data.labelName!);
      if (r.created && r.row) audits.push({ action: "create", entityType: "label", entityId: r.id, before: null, after: r.row });
      return r.id;
    });
    pendingAudits.push(...audits);
  }

  // Best-effort: подтягиваем реальные треки (с оригинальными ISRC) из Spotify для
  // каждого импортируемого релиза. Если Spotify не настроен/недоступен — импорт
  // продолжается с плейсхолдерами (импорт НЕ должен падать из-за Spotify).
  const realTracksByUpc = new Map<string, { title: string; trackNumber: number; isrc: string | null; explicit: boolean }[]>();
  try {
    const spotifyToken = await getSpotifyToken(await loadSpotifyConfig());
    for (const i of parsed.data.items) {
      if (!i.upc || realTracksByUpc.has(i.upc)) continue;
      try {
        const tracks = await fetchTransferTracks(spotifyToken, i.upc);
        if (tracks && tracks.length > 0) realTracksByUpc.set(i.upc, tracks);
      } catch { /* пропускаем этот релиз — будут плейсхолдеры */ }
    }
  } catch { /* Spotify не настроен — плейсхолдеры */ }

  // Process each item: each item is its own transaction. If release+tracks
  // insert fails midway, the entire item rolls back and we record the error.
  const items: TransferImportItem[] = [];
  for (const i of parsed.data.items) {
    const baseItem: TransferImportItem = {
      upc: i.upc, title: i.title, artist: i.artist,
      label: i.label ?? parsed.data.labelName ?? null,
      tracks: i.tracks, coverUrl: i.coverUrl ?? null,
      success: false, releaseId: null, errorReason: null,
    };
    const itemAudits: PendingAudit[] = [];
    try {
      const releaseId = await db.transaction(async (tx) => {
        const labelId = i.label?.trim()
          ? await findOrCreateLabel(tx, i.label).then((r) => {
              if (r.created && r.row) itemAudits.push({ action: "create", entityType: "label", entityId: r.id, before: null, after: r.row });
              return r.id;
            })
          : batchLabelId;

        const artist = await findOrCreateArtist(tx, i.artist, labelId);
        if (artist.created && artist.row) itemAudits.push({ action: "create", entityType: "artist", entityId: artist.id, before: null, after: artist.row });

        // Реальные треки (с оригинальными ISRC) из Spotify, если удалось получить;
        // иначе — плейсхолдеры по количеству треков.
        const realTracks = realTracksByUpc.get(i.upc);
        const isUpcReal = !!i.upc && !i.upc.startsWith("SPOTIFY-");
        const releaseType = ((realTracks?.length ?? i.tracks ?? 1) > 1) ? "album" : "single";
        const [release] = await tx.insert(releasesTable).values({
          title: i.title,
          releaseType,
          status: "draft",
          // Сохраняем оригинальный UPC (только настоящий штрихкод, не синтетический SPOTIFY-*).
          upc: isUpcReal ? i.upc : null,
          artistId: artist.id,
          labelId,
          coverUrl: i.coverUrl ?? null,
          // Дата релиза из Spotify (text-колонка, частичные даты «2020» допустимы).
          // Без неё авто-QC даёт ошибку «дата не указана».
          releaseDate: i.releaseDate ?? null,
          // Explicit на уровне релиза — true, если хотя бы один трек explicit.
          isExplicit: (realTracks?.some((t) => t.explicit)) ?? false,
          // Помечаем как перенос каталога → в Broma16 уйдёт isTransferRelease=true.
          isTransfer: true,
          statusNote: parsed.data.spotifyArtistName
            ? `Импортировано из Spotify (${parsed.data.spotifyArtistName})`
            : "Импортировано через перенос трека",
        }).returning();
        itemAudits.push({ action: "create", entityType: "release", entityId: release.id, before: null, after: release });

        let trackRows: { title: string; releaseId: number; artistId: number; trackNumber: number; isrc?: string | null; isExplicit?: boolean }[];
        if (realTracks && realTracks.length > 0) {
          trackRows = realTracks.slice(0, 100).map((t, idx) => ({
            title: t.title,
            releaseId: release.id,
            artistId: artist.id,
            trackNumber: t.trackNumber ?? idx + 1,
            isrc: t.isrc ?? null,
            isExplicit: t.explicit ?? false,
          }));
        } else {
          const trackCount = Math.max(1, Math.min(i.tracks ?? 1, 50));
          trackRows = Array.from({ length: trackCount }, (_, idx) => ({
            title: trackCount === 1 ? i.title : `${i.title} — ${idx + 1}`,
            releaseId: release.id,
            artistId: artist.id,
            trackNumber: idx + 1,
          }));
        }
        const inserted = await tx.insert(tracksTable).values(trackRows).returning({ id: tracksTable.id });
        for (const t of inserted) {
          itemAudits.push({ action: "create", entityType: "track", entityId: t.id, before: null, after: { releaseId: release.id } });
        }
        return release.id;
      });

      baseItem.success = true;
      baseItem.releaseId = releaseId;
      pendingAudits.push(...itemAudits);
    } catch (e: any) {
      // Item-level rollback: nothing was committed. Map UPC unique violation to
      // a clear Russian message so the user knows why this item was skipped.
      if (isUniqueViolation(e) && i.upc) {
        baseItem.errorReason = `Релиз с UPC ${i.upc} уже существует`;
      } else {
        baseItem.errorReason = e?.message ?? "unknown error";
      }
    }
    items.push(baseItem);
  }

  const importedCount = items.filter((i) => i.success).length;
  const failedCount = items.length - importedCount;
  const status = failedCount > 0 && importedCount === 0 ? "error" : "complete";
  const sessionUser = req.session.user;

  const [inserted] = await db.insert(transferImportsTable).values({
    status,
    spotifyArtistId: parsed.data.spotifyArtistId ?? null,
    spotifyArtistName: parsed.data.spotifyArtistName ?? null,
    importedCount,
    failedCount,
    items,
    createdById: sessionUser?.id ?? null,
    createdByName: sessionUser?.name ?? null,
  }).returning();

  // Flush all collected audit entries now that every transaction has committed.
  // Done after the parent insert so audit ordering reflects logical sequence.
  for (const a of pendingAudits) void auditMutation(req, a);
  void auditMutation(req, {
    action: "create",
    entityType: "transfer_import",
    entityId: inserted.id,
    before: null,
    after: inserted,
  });

  res.status(201).json(serializeTransferImport(inserted));
});

router.get("/releases/transfer-imports/spotify-search", requireRole("admin", "manager", "label", "artist"), async (req, res): Promise<void> => {
  const parsed = SpotifySearchReleasesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const query = parsed.data.query.trim();
  const cfg = await loadSpotifyConfig();
  let token: string;
  try {
    token = await getSpotifyToken(cfg);
  } catch (e: any) {
    if (e instanceof SpotifyNotConfiguredError) {
      res.status(503).json({
        error: "spotify_not_configured",
        message: "Интеграция со Spotify не настроена. Заполните Настройки → Spotify (Client ID и Client Secret).",
      });
    } else {
      res.status(502).json({
        error: "spotify_upstream_error",
        message: `Spotify недоступен или отклонил запрос: ${e?.message ?? "unknown"}`,
      });
    }
    return;
  }

  // Resolve artistId either from /artist/<id> URL or by searching by name
  const artistIdMatch = query.match(/artist\/([A-Za-z0-9]+)/);
  let artistId = artistIdMatch ? artistIdMatch[1] : null;

  try {
    if (!artistId) {
      const sr = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=artist&limit=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!sr.ok) { res.status(502).json({ error: "spotify_error", message: `Spotify ${sr.status}` }); return; }
      const sj = await sr.json() as { artists?: { items: { id: string }[] } };
      artistId = sj.artists?.items?.[0]?.id ?? null;
      if (!artistId) { res.status(404).json({ error: "artist_not_found", message: "Исполнитель не найден в Spotify." }); return; }
    }

    const ar = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!ar.ok) { res.status(502).json({ error: "spotify_error", message: `Spotify ${ar.status}` }); return; }
    const aj = await ar.json() as { name: string; images?: { url: string }[] };

    const albr = await fetch(`https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album,single&limit=30`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!albr.ok) { res.status(502).json({ error: "spotify_error", message: `Spotify ${albr.status}` }); return; }
    const albj = await albr.json() as { items: { id: string; name: string; release_date: string; total_tracks: number; images?: { url: string }[]; artists: { name: string }[]; external_ids?: { upc?: string }; label?: string }[] };

    // Spotify /albums doesn't always include UPC — fetch each album's full payload to extract external_ids.upc and label.
    const releases = await Promise.all(
      albj.items.map(async (alb) => {
        let upc = ""; let label: string | null = null;
        try {
          const dr = await fetch(`https://api.spotify.com/v1/albums/${alb.id}`, { headers: { Authorization: `Bearer ${token}` } });
          if (dr.ok) {
            const dj = await dr.json() as { external_ids?: { upc?: string }; label?: string };
            upc = dj.external_ids?.upc ?? "";
            label = dj.label ?? null;
          }
        } catch { /* fall back to defaults */ }
        return {
          upc: upc || `SPOTIFY-${alb.id}`,
          title: alb.name,
          artist: alb.artists?.[0]?.name ?? aj.name,
          label,
          tracks: alb.total_tracks,
          coverUrl: alb.images?.[0]?.url ?? null,
          releaseDate: alb.release_date,
        };
      })
    );

    // Дедупликация (spec: не показывать релизы, уже существующие в нашем каталоге).
    // Помечаем релизы, чей РЕАЛЬНЫЙ UPC уже есть в базе, флагом alreadyInCatalog,
    // чтобы фронтенд не выбирал их автоматически и подсветил как дубликат.
    const realUpcs = releases.map((r) => r.upc).filter((u): u is string => !!u && !u.startsWith("SPOTIFY-"));
    const existingUpcs = new Set<string>();
    if (realUpcs.length > 0) {
      const existRows = await db.select({ upc: releasesTable.upc }).from(releasesTable).where(inArray(releasesTable.upc, realUpcs));
      for (const row of existRows) if (row.upc) existingUpcs.add(row.upc);
    }
    const releasesWithDedup = releases.map((r) => ({ ...r, alreadyInCatalog: existingUpcs.has(r.upc) }));

    res.json({
      artistId,
      artistName: aj.name,
      artistImage: aj.images?.[0]?.url ?? null,
      releases: releasesWithDedup,
    });
  } catch (e: any) {
    res.status(502).json({ error: "spotify_error", message: e?.message ?? "Spotify request failed" });
  }
});

router.post("/releases", async (req, res): Promise<void> => {
  const parsed = CreateReleaseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Scope: artist can only create releases under their own artistId; label only under their labelId.
  const scope = getDataScope(req);
  if (!scope.fullAccess) {
    if (scope.role === "artist") {
      if (scope.artistId == null || parsed.data.artistId !== scope.artistId) { res.status(403).json({ error: "Forbidden" }); return; }
      // If a labelId is supplied by an artist user, it must equal their artist's actual label.
      // Otherwise, derive labelId server-side to prevent cross-tenant pollution.
      const [own] = await db.select({ labelId: artistsTable.labelId }).from(artistsTable).where(eq(artistsTable.id, scope.artistId));
      const ownLabelId = own?.labelId ?? null;
      if (parsed.data.labelId != null && parsed.data.labelId !== ownLabelId) {
        res.status(403).json({ error: "labelId mismatch" }); return;
      }
      parsed.data.labelId = ownLabelId ?? undefined;
    } else if (scope.role === "label") {
      // Лейбл может выбрать ЛЮБОЙ labelId (в т.ч. чужой импринт) — доступ к
      // релизу сохраняется через принадлежность артиста лейблу (см. releaseInScope).
      if (scope.labelId == null) { res.status(403).json({ error: "Forbidden" }); return; }
      // Label users must also assign an artist that belongs to their label.
      const [a] = await db.select({ labelId: artistsTable.labelId }).from(artistsTable).where(eq(artistsTable.id, parsed.data.artistId));
      if (!a || a.labelId !== scope.labelId) { res.status(403).json({ error: "Artist does not belong to your label" }); return; }
    }
  }

  // Каталожный номер не задаётся вручную: он присваивается автоматически
  // (TM######, по порядку) в момент одобрения релиза модератором
  // (PATCH /releases/:id/status → approved). Присланное клиентом значение игнорируем.
  delete (parsed.data as Record<string, unknown>).catalogNumber;

  let release;
  try {
    [release] = await db.insert(releasesTable).values(parsed.data).returning();
  } catch (e) {
    if (isUniqueViolation(e)) {
      res.status(409).json({ error: "Конфликт уникальности при создании релиза. Попробуйте ещё раз." });
      return;
    }
    throw e;
  }

  // Сразу заносим главного артиста в release_artists (primary, position=0),
  // чтобы multi-primary join-table не был пустой для свежесозданных релизов.
  // ON CONFLICT DO NOTHING — на случай повторной отправки запроса.
  await db.insert(releaseArtistsTable).values({
    releaseId: release.id,
    artistId: release.artistId,
    role: "primary",
    position: 0,
  }).onConflictDoNothing();

  // Task #3: пишем только в audit_log, в activity_log больше не дублируем.
  // Старые записи activity_log остаются для дашборд-виджета «Recent activity».
  void auditMutation(req, { action: "create", entityType: "release", entityId: release.id, before: null, after: release });

  const enriched = await enrichRelease(release);
  res.status(201).json(enriched);
});

router.get("/releases/:id", async (req, res): Promise<void> => {
  const params = GetReleaseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [release] = await db.select().from(releasesTable).where(eq(releasesTable.id, params.data.id));
  if (!release) {
    res.status(404).json({ error: "Release not found" });
    return;
  }
  if (!(await releaseInScope(getDataScope(req), release))) { res.status(403).json({ error: "Forbidden" }); return; }

  const tracks = await db.select().from(tracksTable).where(eq(tracksTable.releaseId, release.id));
  const enriched = await enrichRelease(release);

  res.json({
    ...enriched,
    tracks: tracks.map(t => ({ ...t, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString() })),
  });
});

router.put("/releases/:id", async (req, res): Promise<void> => {
  const params = UpdateReleaseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateReleaseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Pre-flight scope check: load existing row before mutating.
  const [existing] = await db.select().from(releasesTable).where(eq(releasesTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Release not found" }); return; }
  const scope = getDataScope(req);
  if (!(await releaseInScope(scope, existing))) { res.status(403).json({ error: "Forbidden" }); return; }

  // Non-privileged users cannot edit a release that is past 'draft' / 'rejected'.
  // Admin/manager bypass via scope.fullAccess.
  const lockReason = releaseEditableReason(scope, existing.status);
  if (lockReason) { res.status(409).json({ error: lockReason }); return; }

  // Non-privileged users cannot reassign ownership (artistId/labelId).
  if (!scope.fullAccess) {
    const body = parsed.data as Record<string, unknown>;
    if (body.artistId !== undefined && body.artistId !== existing.artistId) {
      res.status(403).json({ error: "Cannot change artistId" }); return;
    }
    // Лейбл может менять labelId (выпуск под другим импринтом) — доступ
    // остаётся через артиста; артист менять labelId по-прежнему не может.
    if (scope.role !== "label" && body.labelId !== undefined && body.labelId !== existing.labelId) {
      res.status(403).json({ error: "Cannot change labelId" }); return;
    }
  }

  // Каталожный номер системный: присваивается автоматически при одобрении
  // релиза и вручную не редактируется — присланное значение игнорируем.
  delete (parsed.data as Record<string, unknown>).catalogNumber;

  let release;
  try {
    [release] = await db.update(releasesTable).set(parsed.data).where(eq(releasesTable.id, params.data.id)).returning();
  } catch (e) {
    if (isUniqueViolation(e)) {
      res.status(409).json({ error: "Конфликт уникальности при обновлении релиза. Попробуйте ещё раз." });
      return;
    }
    throw e;
  }
  if (!release) {
    res.status(404).json({ error: "Release not found" });
    return;
  }
  void auditMutation(req, { action: "update", entityType: "release", entityId: release.id, before: existing, after: release });

  const enriched = await enrichRelease(release);
  res.json(enriched);
});

router.delete("/releases/:id", async (req, res): Promise<void> => {
  const params = DeleteReleaseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db.select().from(releasesTable).where(eq(releasesTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Release not found" }); return; }
  const scope = getDataScope(req);
  if (!(await releaseInScope(scope, existing))) { res.status(403).json({ error: "Forbidden" }); return; }

  // Удалять разрешено только черновики и отклонённые релизы. Релиз на модерации /
  // одобренный / живой защищён жизненным циклом: его сначала нужно отозвать
  // (Cancel Submission) или снять с публикации (Take Down). Модераторам
  // (fullAccess) оставляем право удалить любой статус — например, чтобы вычистить
  // ошибочные данные.
  //
  // Удаление выполняем условным DELETE (а не delete-by-id), чтобы статус-гард был
  // атомарным: если параллельный запрос успеет перевести черновик в pending_review/
  // approved до выполнения нашего DELETE, условие WHERE status IN (...) не совпадёт
  // и защищённый релиз не будет удалён (вернём 409). Для fullAccess условие по
  // статусу не накладываем.
  const deleteWhere = scope.fullAccess
    ? eq(releasesTable.id, params.data.id)
    : and(eq(releasesTable.id, params.data.id), inArray(releasesTable.status, ["draft", "rejected"]));

  const [release] = await db.delete(releasesTable).where(deleteWhere).returning();
  if (!release) {
    // 0 строк: для owner это значит, что релиз сменил статус между проверкой и
    // удалением (гонка) — релиз ещё существует, но больше не удаляем.
    const [stillThere] = await db.select({ status: releasesTable.status })
      .from(releasesTable).where(eq(releasesTable.id, params.data.id));
    if (stillThere) {
      res.status(409).json({
        error: `Release in status '${stillThere.status}' cannot be deleted. Withdraw the submission or take it down first.`,
      });
      return;
    }
    res.status(404).json({ error: "Release not found" });
    return;
  }
  void auditMutation(req, { action: "delete", entityType: "release", entityId: release.id, before: existing, after: null });

  res.sendStatus(204);
});

// POST /releases/:id/submit — артист или лейбл (или admin/manager) отправляет релиз
// на модерацию. Допустимо только из статусов 'draft' или 'rejected'.
// Перед отправкой проверяем, что релиз заполнен (обложка, дата, треки + аудио).
router.post("/releases/:id/submit", async (req, res): Promise<void> => {
  const params = UpdateReleaseStatusParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [existing] = await db.select().from(releasesTable).where(eq(releasesTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Release not found" }); return; }

  const scope = getDataScope(req);
  if (!(await releaseInScope(scope, existing))) { res.status(403).json({ error: "Forbidden" }); return; }

  // Допустимые исходные статусы. Из live/delivering/approved/etc нельзя «пере-отправить».
  if (existing.status !== "draft" && existing.status !== "rejected") {
    res.status(409).json({
      error: `Release in status '${existing.status}' cannot be submitted for review. Only 'draft' or 'rejected' releases are submittable.`,
    });
    return;
  }

  // ─── Readiness validation ──────────────────────────────────────────────
  // Минимальный набор полей, без которого модератору нечего проверять.
  // Whitespace-only тоже отклоняем — чтобы артист не подсовывал «   » в genre.
  const nonBlank = (s: string | null | undefined): boolean => !!(s && s.trim().length > 0);
  const missing: string[] = [];
  if (!nonBlank(existing.title))       missing.push("title");
  if (!nonBlank(existing.coverUrl))    missing.push("coverUrl");
  if (!nonBlank(existing.releaseDate)) missing.push("releaseDate");
  if (!nonBlank(existing.genre))       missing.push("genre");

  const tracks = await db.select().from(tracksTable).where(eq(tracksTable.releaseId, existing.id));
  if (tracks.length === 0) {
    missing.push("tracks");
  } else {
    const tracksWithoutAudio = tracks.filter((t) => !nonBlank(t.audioUrl)).length;
    if (tracksWithoutAudio > 0) missing.push(`audio (${tracksWithoutAudio} of ${tracks.length} tracks)`);
  }

  if (missing.length > 0) {
    res.status(409).json({
      error: "Release is not ready for submission. Required fields are missing.",
      missing,
    });
    return;
  }

  // ─── Atomic update ─────────────────────────────────────────────────────
  // Условный UPDATE: применяется только если status всё ещё draft|rejected.
  // Это защищает от гонки: два параллельных submit'а — один пройдёт, второй
  // получит 0 строк и 409. statusNote сбрасываем (старая причина отказа неактуальна).
  const updated = await db.update(releasesTable)
    .set({ status: "pending_review", statusNote: null })
    .where(and(
      eq(releasesTable.id, params.data.id),
      inArray(releasesTable.status, ["draft", "rejected"]),
    ))
    .returning();

  const release = updated[0];
  if (!release) {
    // Кто-то успел сменить статус между нашим SELECT и UPDATE.
    res.status(409).json({
      error: "Release status changed concurrently. Reload and try again.",
    });
    return;
  }

  // Audit: action='submit' — отдельный action для отчётов «кто и когда отправил».
  void auditMutation(req, { action: "submit", entityType: "release", entityId: release.id, before: existing, after: release });

  // Уведомляем модераторов (admin + manager).
  const sessionUser = req.session?.user;
  const submitterName = sessionUser?.name ?? sessionUser?.email ?? "артист";
  void notifyAdmins({
    type: "release_pending_review",
    title: `📤 Новый релиз на модерацию: «${release.title}»`,
    body: `Отправил: ${submitterName}. Откройте очередь модерации, чтобы проверить.`,
    entityType: "release",
    entityId: release.id,
    link: `/distribution`,
  });

  // Пересчитываем risk-score сразу после submit — модератор увидит факторы
  // ещё до того, как откроет карточку (в списке очереди их можно потом тоже
  // подсветить). Fire-and-forget: ошибка тут не валит submit.
  void assessAndPersist(release.id);

  // Уведомляем самого автора и его лейбл — подтверждение приёма заявки.
  void notifyByArtistId(release.artistId, {
    type: "release_submitted",
    title: `Релиз «${release.title}» отправлен на модерацию`,
    body: "Мы сообщим, как только модератор примет решение.",
    entityType: "release",
    entityId: release.id,
    link: `/releases/${release.id}`,
  });
  if (release.labelId) {
    void notifyByLabelId(release.labelId, {
      type: "release_submitted",
      title: `Релиз «${release.title}» отправлен на модерацию`,
      body: `Отправил: ${submitterName}.`,
      entityType: "release",
      entityId: release.id,
      link: `/releases/${release.id}`,
    });
  }

  const enriched = await enrichRelease(release);
  res.json(enriched);
});

// POST /releases/:id/cancel-submission — владелец релиза (артист/лейбл) или
// admin/manager отзывает релиз с модерации обратно в черновик. Это нужно, чтобы
// автор мог снова отредактировать релиз (в pending_review редактирование закрыто)
// или удалить его. Допустимо только из статуса 'pending_review'.
// Отдельный от PATCH /status эндпоинт: тот доступен только модераторам, а отзыв
// собственной заявки должен быть доступен и владельцу.
router.post("/releases/:id/cancel-submission", async (req, res): Promise<void> => {
  const params = UpdateReleaseStatusParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [existing] = await db.select().from(releasesTable).where(eq(releasesTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Release not found" }); return; }

  const scope = getDataScope(req);
  if (!(await releaseInScope(scope, existing))) { res.status(403).json({ error: "Forbidden" }); return; }

  if (existing.status !== "pending_review") {
    res.status(409).json({
      error: `Release in status '${existing.status}' has no active submission to cancel. Only 'pending_review' releases can be withdrawn.`,
    });
    return;
  }

  // Атомарный условный UPDATE: применяется только если статус всё ещё
  // pending_review. Защита от гонки с решением модератора (approve/reject):
  // если модератор успел сменить статус — наш UPDATE вернёт 0 строк и 409.
  const updated = await db.update(releasesTable)
    .set({ status: "draft", statusNote: null })
    .where(and(
      eq(releasesTable.id, params.data.id),
      eq(releasesTable.status, "pending_review"),
    ))
    .returning();

  const release = updated[0];
  if (!release) {
    res.status(409).json({
      error: "Release status changed concurrently. Reload and try again.",
    });
    return;
  }

  void auditMutation(req, { action: "cancel_submit", entityType: "release", entityId: release.id, before: existing, after: release });

  // Уведомляем модераторов, что заявку отозвали — чтобы её убрали из очереди.
  const sessionUser = req.session?.user;
  const byName = sessionUser?.name ?? sessionUser?.email ?? "владелец";
  void notifyAdmins({
    type: "release_submission_cancelled",
    title: `↩️ Релиз снят с модерации: «${release.title}»`,
    body: `Заявку отозвал: ${byName}. Релиз вернулся в черновики.`,
    entityType: "release",
    entityId: release.id,
    link: `/distribution`,
  });

  const enriched = await enrichRelease(release);
  res.json(enriched);
});

// POST /releases/:id/reopen — владелец релиза (артист/лейбл) или admin/manager
// возвращает релиз в черновик для редактирования. Доступно из 'approved' (откатить
// одобрение и поправить метаданные перед повторной отправкой) и из 'rejected'
// (начать исправление). Отдельный от PATCH /status эндпоинт: тот только для
// модераторов, а редактировать свой релиз вправе и владелец.
router.post("/releases/:id/reopen", async (req, res): Promise<void> => {
  const params = UpdateReleaseStatusParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [existing] = await db.select().from(releasesTable).where(eq(releasesTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Release not found" }); return; }

  const scope = getDataScope(req);
  if (!(await releaseInScope(scope, existing))) { res.status(403).json({ error: "Forbidden" }); return; }

  if (existing.status !== "approved" && existing.status !== "rejected") {
    res.status(409).json({
      error: `Release in status '${existing.status}' cannot be reopened for editing. Only 'approved' or 'rejected' releases can be reverted to draft.`,
    });
    return;
  }

  // Атомарный условный UPDATE: применяется только если статус не изменился —
  // защита от гонки с решением модератора (deliver / takedown и т.п.).
  const updated = await db.update(releasesTable)
    .set({ status: "draft", statusNote: null })
    .where(and(
      eq(releasesTable.id, params.data.id),
      eq(releasesTable.status, existing.status),
    ))
    .returning();

  const release = updated[0];
  if (!release) {
    res.status(409).json({ error: "Release status changed concurrently. Reload and try again." });
    return;
  }

  void auditMutation(req, { action: "reopen", entityType: "release", entityId: release.id, before: existing, after: release });

  // Если откатили уже одобренный релиз — уведомляем модераторов: релиз снова
  // правится, после повторной отправки его придётся проверить заново.
  if (existing.status === "approved") {
    const sessionUser = req.session?.user;
    const byName = sessionUser?.name ?? sessionUser?.email ?? "владелец";
    void notifyAdmins({
      type: "release_reopened",
      title: `✏️ Одобренный релиз вернули в редактирование: «${release.title}»`,
      body: `Релиз вернул в черновик: ${byName}. Потребуется повторная модерация после отправки.`,
      entityType: "release",
      entityId: release.id,
      link: `/distribution`,
    });
  }

  const enriched = await enrichRelease(release);
  res.json(enriched);
});

// POST /releases/:id/request-takedown — владелец релиза (артист/лейбл) или
// admin/manager запрашивает снятие релиза с публикации. Доступно из 'approved'
// (отменить ещё не отгруженный релиз) и из 'live' (снять с DSP). Переводит релиз
// в 'takedown_requested'; финальное удаление с площадок подтверждает модератор.
// Отдельный от PATCH /status эндпоинт: тот только для модераторов, а запросить
// снятие своего релиза вправе и владелец.
router.post("/releases/:id/request-takedown", async (req, res): Promise<void> => {
  const params = UpdateReleaseStatusParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";

  const [existing] = await db.select().from(releasesTable).where(eq(releasesTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Release not found" }); return; }

  const scope = getDataScope(req);
  if (!(await releaseInScope(scope, existing))) { res.status(403).json({ error: "Forbidden" }); return; }

  if (existing.status !== "approved" && existing.status !== "live") {
    res.status(409).json({
      error: `Release in status '${existing.status}' cannot be taken down. Only 'approved' or 'live' releases can be taken down.`,
    });
    return;
  }

  const updated = await db.update(releasesTable)
    .set({ status: "takedown_requested", statusNote: note || null })
    .where(and(
      eq(releasesTable.id, params.data.id),
      eq(releasesTable.status, existing.status),
    ))
    .returning();

  const release = updated[0];
  if (!release) {
    res.status(409).json({ error: "Release status changed concurrently. Reload and try again." });
    return;
  }

  void auditMutation(req, { action: "update", entityType: "release", entityId: release.id, before: existing, after: release });

  const sessionUser = req.session?.user;
  const byName = sessionUser?.name ?? sessionUser?.email ?? "владелец";
  void notifyAdmins({
    type: "release_takedown_requested",
    title: `⚠️ Запрос на снятие релиза: «${release.title}»`,
    body: `Снятие запросил: ${byName}.${note ? ` Причина: ${note}` : ""}`,
    entityType: "release",
    entityId: release.id,
    link: `/distribution`,
  });

  // Уведомляем владельца (артист/лейбл), что релиз поставлен в очередь на снятие.
  const ownerPayload = {
    type: "release_takedown_requested",
    title: `⚠️ Релиз «${release.title}» снят с публикации`,
    body: note ? `Причина: ${note}` : "",
    entityType: "release" as const,
    entityId: release.id,
    link: `/releases/${release.id}`,
  };
  void notifyByArtistId(release.artistId, ownerPayload);
  if (release.labelId) void notifyByLabelId(release.labelId, ownerPayload);

  const enriched = await enrichRelease(release);
  res.json(enriched);
});

// State-machine допустимых переходов для админ/manager PATCH /releases/:id/status.
// Submit (артист draft|rejected → pending_review) идёт через POST /releases/:id/submit.
// Delivery (approved/error → delivering) ставит сам POST /releases/:id/deliver.
// Здесь — только то, что вправе сделать модератор/менеджер вручную.
export const RELEASE_STATUS_TRANSITIONS: Record<string, readonly string[]> = {
  draft:              ["pending_review"],
  pending_review:     ["approved", "rejected", "draft", "parked"],
  // approved → delivering и error → delivering сюда НЕ входят: переход в
  // 'delivering' возможен только через POST /releases/:id/deliver, который
  // одновременно создаёт записи в deliveries (иначе статус был бы без job'ов).
  // takedown_requested: владелец/модератор может запросить снятие одобренного
  // релиза (кнопка «Take Down»). draft: владелец/модератор может вернуть релиз
  // в редактирование (кнопка «Edit Release») ещё до отгрузки в DSP. Оба перехода
  // также доступны владельцу через POST /reopen и /request-takedown.
  approved:           ["rejected", "takedown_requested", "draft"],
  rejected:           ["draft", "pending_review"],
  // parked (Park/Hide): модератор откладывает релиз на потом, не принимая решение.
  // Из parked можно вернуть в очередь (pending_review) или сразу отклонить.
  parked:             ["pending_review", "rejected"],
  delivering:         ["delivered", "error"],
  delivered:          ["live", "error"],
  live:               ["takedown_requested"],
  error:              ["rejected", "draft"],
  takedown_requested: ["removed", "live"],
  removed:            [],
};

router.patch("/releases/:id/status", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const params = UpdateReleaseStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateReleaseStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // При отказе модератора комментарий обязателен — артист должен понимать причину.
  if (parsed.data.status === "rejected" && !parsed.data.note?.trim()) {
    res.status(400).json({ error: "Rejection reason (note) is required when status='rejected'." });
    return;
  }

  const [existing] = await db.select().from(releasesTable).where(eq(releasesTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Release not found" }); return; }

  // ─── Проверка перехода ────────────────────────────────────────────────
  // Same-status явно отклоняем — иначе админ дважды нажмёт «Approve» и
  // дважды отправит уведомление артисту/лейблу.
  if (existing.status === parsed.data.status) {
    res.status(409).json({
      error: `Release is already in status '${existing.status}'.`,
    });
    return;
  }
  const allowed = RELEASE_STATUS_TRANSITIONS[existing.status] ?? [];
  if (!allowed.includes(parsed.data.status)) {
    res.status(409).json({
      error: `Invalid status transition: '${existing.status}' → '${parsed.data.status}'.`,
      from: existing.status,
      to: parsed.data.status,
      allowed,
    });
    return;
  }

  // Атомарный UPDATE с проверкой исходного статуса (оптимистичная блокировка):
  // если параллельный запрос (например, submit или другой админ) успел сменить
  // статус — наш UPDATE вернёт 0 строк и мы скажем клиенту перезагрузиться.
  const updated = await db.update(releasesTable)
    .set({ status: parsed.data.status, statusNote: parsed.data.note ?? null })
    .where(and(
      eq(releasesTable.id, params.data.id),
      eq(releasesTable.status, existing.status),
    ))
    .returning();

  const release = updated[0];
  if (!release) {
    res.status(409).json({
      error: "Release status changed concurrently. Reload and try again.",
    });
    return;
  }

  // ── Присвоение каталожного номера при одобрении ──────────────────────
  // Правило: TM###### (по порядку, старт TM260001) присваивается автоматически
  // в момент approve и больше не меняется. Уникальный индекс на catalog_number
  // защищает от гонок: при конфликте повторяем с новым номером.
  if (parsed.data.status === "approved" && (!release.catalogNumber || !release.catalogNumber.trim())) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const candidate = await generateCatalogNumber();
      try {
        const [withCatalog] = await db.update(releasesTable)
          .set({ catalogNumber: candidate })
          .where(eq(releasesTable.id, release.id))
          .returning();
        if (withCatalog) release.catalogNumber = withCatalog.catalogNumber;
        break;
      } catch (e) {
        if (isUniqueViolation(e) && attempt < 5) continue;
        throw e;
      }
    }
  }

  // Audit: на одобрении/отказе используем отдельные actions для отчётов.
  const auditAction: "approve" | "reject" | "update" =
    parsed.data.status === "approved" ? "approve" :
    parsed.data.status === "rejected" ? "reject" : "update";
  void auditMutation(req, { action: auditAction, entityType: "release", entityId: release.id, before: existing, after: release });

  // Risk-engine: пересчитываем при approve/reject — модератор должен видеть
  // актуальную оценку при следующем открытии карточки. Fire-and-forget.
  if (parsed.data.status === "approved" || parsed.data.status === "rejected") {
    void assessAndPersist(release.id);
  }

  // Уведомляем артиста и (если есть) лейбл о смене статуса релиза.
  const statusEmoji: Record<string, string> = {
    approved: "✅", rejected: "❌", pending_review: "📤", live: "🎵",
    takedown_requested: "⚠️", draft: "📝", delivering: "📦", removed: "🚫",
  };
  const statusLabel: Record<string, string> = {
    approved: "одобрен", rejected: "отклонён модератором", pending_review: "отправлен на модерацию",
    live: "вышел в эфир", takedown_requested: "снят с публикации", draft: "возвращён в черновик",
    delivering: "отправляется на платформы", removed: "удалён",
  };
  const statusTitle = `${statusEmoji[parsed.data.status] ?? "🔔"} Релиз «${release.title}» ${statusLabel[parsed.data.status] ?? parsed.data.status}`;
  const body = parsed.data.note ? `Примечание: ${parsed.data.note}` : "";
  void notifyByArtistId(release.artistId, {
    type: `release_${parsed.data.status}`,
    title: statusTitle,
    body,
    entityType: "release",
    entityId: release.id,
    link: `/releases/${release.id}`,
  });
  if (release.labelId) {
    void notifyByLabelId(release.labelId, {
      type: `release_${parsed.data.status}`,
      title: statusTitle,
      body,
      entityType: "release",
      entityId: release.id,
      link: `/releases/${release.id}`,
    });
  }

  // Триггеры автоматизации + outbound webhooks для смены статуса релиза
  fireTriggerAndForget(`release_${parsed.data.status}`, {
    artistId: release.artistId,
    labelId: release.labelId ?? null,
    vars: {
      release_title: release.title,
      release_id: String(release.id),
      status: parsed.data.status,
      note: parsed.data.note ?? "",
      platform_name: "Tajik Music Distribution",
    },
    link: `/releases/${release.id}`,
    entityType: "release",
    entityId: release.id,
  });
  fireWebhookAndForget("release.status_changed", {
    releaseId: release.id,
    title: release.title,
    artistId: release.artistId,
    labelId: release.labelId,
    fromStatus: existing.status,
    toStatus: parsed.data.status,
    note: parsed.data.note ?? null,
  });

  const enriched = await enrichRelease(release);
  res.json(enriched);
});

// POST /releases/:id/deliver — поставить релиз в очередь на отгрузку в DSP.
// Требования: admin/manager + релиз прошёл модерацию (approved/delivering/live).
// Тело: { targets: ['spotify','vk_music',...], ddexVersion: '4.3' }
// Ответ: { releaseId, jobs: [Delivery,...] } — по одному job'у на target.
router.post("/releases/:id/deliver", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const params = DeliverReleaseParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = DeliverReleaseBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [release] = await db.select().from(releasesTable).where(eq(releasesTable.id, params.data.id));
  if (!release) { res.status(404).json({ error: "Release not found" }); return; }

  // Спец постановки: только approved релизы можно ставить в очередь.
  // Это страхует от двойной постановки одного и того же таргета пока релиз
  // уже находится в 'delivering' (предыдущий запуск ещё в обработке).
  if (release.status !== "approved") {
    res.status(409).json({
      error: `Release must be approved before delivery. Current status: '${release.status}'.`,
    });
    return;
  }

  // ── Risk gate: лейбл с накопленными копирайт-страйками от DSP ──────────
  // При threshold+ (см. LABEL_STRIKE_BLOCK_THRESHOLD) автоматическая отгрузка
  // блокируется. Только АДМИН может пробить с явным force=true в body — это
  // уйдёт в audit-log как ручное подтверждение риска. Менеджер пытаясь
  // обойти получит 403, чтобы решение фиксировалось на уровне админа.
  const force = body.data.force === true;
  if (force && req.session?.user?.role !== "admin") {
    res.status(403).json({
      error: "force_requires_admin",
      message: "Override блокировки лейбла доступен только администратору.",
    });
    return;
  }
  if (release.labelId && !force) {
    const [label] = await db.select().from(labelsTable).where(eq(labelsTable.id, release.labelId));
    if (label && label.copyrightStrikes >= LABEL_STRIKE_BLOCK_THRESHOLD) {
      res.status(409).json({
        error: "label_blocked_too_many_strikes",
        message: `У лейбла «${label.name}» ${label.copyrightStrikes} копирайт-страйков от DSP. ` +
          "Доставка требует ручного подтверждения. Передайте force=true чтобы пробить блок.",
        labelId: label.id,
        labelName: label.name,
        copyrightStrikes: label.copyrightStrikes,
        threshold: LABEL_STRIKE_BLOCK_THRESHOLD,
      });
      return;
    }
  }

  // De-dup внутри запроса: ['spotify','spotify','vk_music'] → ['spotify','vk_music']
  const requestedTargets = Array.from(new Set(body.data.targets));

  // De-dup против БД: если для этого релиза уже существует non-failed/non-cancelled
  // delivery на target — не создаём дубль. (failed/cancelled можно повторить.)
  const existing = await db.select({ target: deliveriesTable.target, status: deliveriesTable.status })
    .from(deliveriesTable)
    .where(eq(deliveriesTable.releaseId, release.id));
  const blockedTargets = new Set(
    existing
      .filter((d) => d.status !== "failed" && d.status !== "cancelled")
      .map((d) => d.target),
  );
  const uniqueTargets = requestedTargets.filter((t) => !blockedTargets.has(t));

  const created: typeof deliveriesTable.$inferSelect[] = [];
  for (const target of uniqueTargets) {
    const [job] = await db.insert(deliveriesTable).values({
      releaseId: release.id,
      target,
      status: "queued",
      ddexVersion: body.data.ddexVersion ?? "4.3",
      nextRetryAt: new Date(), // воркер заберёт на ближайшем тике
    }).returning();
    created.push(job);
    void auditMutation(req, {
      action: "create",
      entityType: "delivery",
      entityId: job.id,
      before: null,
      after: job,
    });
  }

  // Перевод релиза в 'delivering' если хотя бы один job создан.
  // Optimistic guard: WHERE status='approved' защищает от гонки с PATCH —
  // если пока мы создавали jobs, модератор успел отозвать в 'rejected', мы НЕ
  // должны затирать его решение. Jobs создались — пусть отработают/отменятся
  // отдельно (фоновый воркер увидит, что релиз больше не approved).
  if (created.length > 0) {
    await db.update(releasesTable)
      .set({ status: "delivering" })
      .where(and(eq(releasesTable.id, release.id), eq(releasesTable.status, "approved")));

    // Уведомляем артиста и лейбл, что доставка началась.
    const targetsList = uniqueTargets.join(", ");
    void notifyByArtistId(release.artistId, {
      type: "release_delivering",
      title: `🚀 Релиз «${release.title}» отправляется в DSP`,
      body: `Поставили в очередь: ${targetsList}. Статус доставки можно отслеживать в карточке релиза.`,
      entityType: "release",
      entityId: release.id,
      link: `/releases/${release.id}`,
    });
    if (release.labelId) {
      void notifyByLabelId(release.labelId, {
        type: "release_delivering",
        title: `🚀 Релиз «${release.title}» отправляется в DSP`,
        body: `Поставили в очередь: ${targetsList}.`,
        entityType: "release",
        entityId: release.id,
        link: `/releases/${release.id}`,
      });
    }
  }

  res.status(201).json({
    releaseId: release.id,
    jobs: created.map((j) => ({
      ...j,
      releaseName: release.title,
      nextRetryAt: j.nextRetryAt?.toISOString() ?? null,
      acknowledgedAt: j.acknowledgedAt?.toISOString() ?? null,
      deliveredAt: j.deliveredAt?.toISOString() ?? null,
      createdAt: j.createdAt.toISOString(),
      updatedAt: j.updatedAt.toISOString(),
      xmlPayload: undefined, // не светим в API
    })),
  });
});

// Нормализованные метаданные одного релиза, извлечённые из внешнего источника
// (Spotify или MusicBrainz). Источники имеют разный формат — приводим к одному.
interface ImportedReleaseData {
  upc: string;
  title: string;
  artist: string;
  label: string | null;
  coverUrl: string | null;
  releaseDate: string | null;
  /** Жанр, приведённый к списку жанров CRM (или null, если сопоставить не удалось). */
  genre: string | null;
  /** Поджанр из иерархии CRM (если источник дал распознаваемый поджанр), иначе null. */
  subgenre: string | null;
  /** Тип релиза из источника (single/album/ep/compilation), если он его сообщает. */
  releaseType: "single" | "album" | "ep" | "compilation" | null;
  tracks: { title: string; trackNumber: number; isrc: string | null; explicit: boolean }[];
  source: "spotify" | "musicbrainz" | "deezer";
  /** ℗ фонографический копирайт — из iTunes Search API. */
  pLine: string | null;
  /** © авторский копирайт — из iTunes Search API. */
  cLine: string | null;
  /** Идентификаторы внешних источников (для записи в кэш). */
  _ids?: {
    spotifyAlbumId?: string;
    spotifyArtistId?: string;
    deezerAlbumId?: string;
    musicbrainzMbid?: string;
    itunesCollectionId?: string;
  };
  _rawSource?: unknown;
  _rawItunes?: unknown;
}

// Жанры CRM (должны совпадать с GENRES в crm-panel/.../release-wizard/types.ts).
// Значение genre в БД должно быть ИМЕННО из этого списка, иначе выпадающий список
// в мастере покажет пусто. Импорт сопоставляет названия жанров из источника
// (Deezer/Spotify) к этому списку; при неуверенном совпадении жанр не выставляется.
const CRM_GENRES: string[] = [
  "Pop", "Rock", "Hip-Hop / Rap", "R&B / Soul", "Dance", "Electronic",
  "House", "Techno", "Trance", "Drum & Bass", "Dubstep", "Lo-Fi",
  "Indie", "Alternative", "Jazz", "Blues", "Country", "Folk",
  "Classical", "Opera", "Instrumental", "New Age", "Ambient", "Easy Listening",
  "Funk", "Disco", "Punk", "Metal", "Reggae", "Ska",
  "Latin", "Afrobeat", "Afrobeats", "Gospel", "Religious", "Christian",
  "Traditional", "World Music", "Soundtrack", "Anime", "Bollywood", "Experimental",
  "Vocal", "Singer/Songwriter", "Audiobook", "Spoken Word", "Comedy", "Karaoke",
  "Children's Music", "Holiday", "Arabic", "African", "Indian", "Punjabi",
  "Chinese", "Japanese", "Korean", "Brazilian", "Persian", "Afghan",
  "Tajik", "Uzbek", "Kazakh", "Kyrgyz", "Turkmen", "Turkish",
  "Central Asian", "Other",
];

// Псевдонимы жанров внешних каталогов → жанр CRM. Ключи в нижнем регистре.
const GENRE_ALIASES: Record<string, string> = {
  "rap/hip hop": "Hip-Hop / Rap",
  "rap": "Hip-Hop / Rap",
  "hip hop": "Hip-Hop / Rap",
  "hip-hop": "Hip-Hop / Rap",
  "r&b": "R&B / Soul",
  "rnb": "R&B / Soul",
  "soul & funk": "R&B / Soul",
  "soul": "R&B / Soul",
  "electro": "Electronic",
  "electronic": "Electronic",
  "films/games": "Soundtrack",
  "film/games": "Soundtrack",
  "soundtracks": "Soundtrack",
  "latin music": "Latin",
  "latino": "Latin",
  "world": "World Music",
  "world music": "World Music",
  "african music": "African",
  "asian music": "World Music",
  "brazilian music": "Brazilian",
  "kids": "Children's Music",
  "children": "Children's Music",
  "traditional mexicano": "Latin",
  "singer & songwriter": "Singer/Songwriter",
  "singer-songwriter": "Singer/Songwriter",
};

// Канонизация названия жанра: нижний регистр + удаление всех разделителей и
// пунктуации, чтобы "R&B", "R & B", "Hip-Hop / Rap", "hip hop rap" и т.п.
// сопоставлялись стабильно, независимо от пробелов/дефисов/слэшей/амперсандов.
function canonicalGenre(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const CRM_GENRE_BY_CANON = new Map(CRM_GENRES.map((g) => [canonicalGenre(g), g]));
const GENRE_ALIAS_BY_CANON = new Map(
  Object.entries(GENRE_ALIASES).map(([k, v]) => [canonicalGenre(k), v]),
);

// Поджанры CRM (должны совпадать с SUBGENRES в crm-panel/.../release-wizard/types.ts).
// Импорт сопоставляет названия жанров из источника (Deezer/Spotify) к этой иерархии:
// если строка источника — это поджанр, выставляем и жанр-родитель, и сам поджанр.
const CRM_SUBGENRES: Record<string, string[]> = {
  "Pop": ["Dance Pop", "Teen Pop", "Synth Pop", "Electropop", "Indie Pop", "Dream Pop", "Art Pop", "Pop Rock", "Pop Folk", "Pop Funk", "Acoustic Pop", "Europop", "French Pop", "German Pop", "Russian Pop", "Korean Pop", "Japanese Pop"],
  "Rock": ["Alternative Rock", "Hard Rock", "Soft Rock", "Classic Rock", "Progressive Rock", "Indie Rock", "Garage Rock", "Folk Rock", "Symphonic Rock", "Space Rock", "Blues Rock", "Rap Rock", "Slow Rock", "Arena Rock", "Southern Rock"],
  "Hip-Hop / Rap": ["Rap", "Hip-Hop", "Trap", "Drill", "Gangsta Rap", "Conscious Rap", "Alternative Rap", "Underground Rap", "Boom Bap", "East Coast Rap", "West Coast Rap", "Latin Rap", "Christian Rap", "Russian Rap", "Trap Soul", "Mumble Rap"],
  "R&B / Soul": ["Contemporary R&B", "Soul", "Neo Soul", "Rhythmic Soul", "Funk", "Motown", "Afro Soul"],
  "Dance": ["Dance Pop", "Eurodance", "Club Dance", "Electronic Dance", "Progressive Dance", "Vocal Dance", "Latin Dance", "Disco Dance", "Freestyle", "Hi-NRG", "Italo Dance", "Big Room", "Tropical Dance", "Electro Dance", "Urban Dance", "Dancehall", "Deep Dance", "Afro Dance", "Pop Dance", "Remix Dance", "Dance EDM", "EDM", "House Dance", "Tech Dance"],
  "Electronic": ["EDM", "Electro", "Electronica", "Electro House", "Electropop", "Electro Folk", "Breakbeat", "Acid Techno", "Techno", "House", "Trance", "Dubstep", "Drum & Bass", "Pop", "Jungle", "Drumstep", "Progressive House", "Deep House", "Tech House", "Future House", "Bass House", "Hardstyle", "Electro Pop", "Electro Rock", "IDM", "Experimental Electronic", "Digital Pop", "Synthwave", "Future Bass", "Chill Electronic"],
  "House": ["Deep House", "Tech House", "Progressive House", "Bass House", "Afro House", "Club House", "Vocal House", "French House", "Euro House", "Future House", "Tropical House"],
  "Techno": ["Minimal Techno", "Detroit Techno", "Acid Techno", "Industrial Techno", "Hard Techno", "Melodic Techno", "Peak Time Techno", "Progr"],
  "Trance": ["Hard Trance", "Progressive Trance", "Psytrance", "Uplifting Trance", "Vocal Trance"],
  "Drum & Bass": ["Liquid DnB", "Neurofunk", "Jungle", "Jump Up", "Darkstep", "Drumstep", "Atmospheric DnB"],
  "Dubstep": ["Brostep", "Melodic Dubstep", "Chill Dubstep", "Heavy Dubstep", "Future Dubstep", "Experimental Dubstep"],
  "Lo-Fi": ["Lo-Fi Hip-Hop", "Chillhop", "Study Beats", "Jazzhop", "Ambient Lo-Fi", "Lo-Fi Chill"],
  "Indie": ["Indie Pop", "Indie Rock", "Indie Folk", "Indie Dance", "Indie Electronic", "Indie Alternative", "Bedroom Pop", "Lo-Fi Indie"],
  "Alternative": ["Alternative Rock", "Alternative Pop", "Alternative Hip-Hop", "Alternative Metal", "Indie Alternative", "Experimental Alternative", "Post Alternative"],
  "Jazz": ["Smooth Jazz", "Vocal Jazz", "Bebop", "Swing", "Big Band", "Acid Jazz", "Latin Jazz", "Jazz Fusion", "Contemporary Jazz", "Free Jazz"],
  "Blues": ["Blues Rock", "Delta Blues", "Chicago Blues", "Acoustic Blues", "Modern Blues", "Electric Blues"],
  "Country": ["Country Pop", "Country Rock", "Traditional Country", "Bluegrass", "Modern Country", "Folk Country", "Americana Country"],
  "Folk": ["Folk Rock", "Indie Folk", "Traditional Folk", "Acoustic Folk", "Celtic Folk", "Modern Folk", "World Folk"],
  "Classical": ["Baroque", "Romantic Classical", "Modern Classical", "Orchestral", "Chamber Music", "Piano Classical", "Symphony", "Minimal Classical"],
  "Opera": ["Classical Opera", "Modern Opera", "Crossover Opera", "Vocal Opera", "Symphonic Opera"],
  "Instrumental": ["Instrumental Pop", "Instrumental Rock", "Piano Instrumental", "Cinematic Instrumental", "Acoustic Instrumental", "Ambient Instrumental"],
  "New Age": ["Meditation Music", "Healing Music", "Spiritual New Age", "Nature Sounds", "Relaxation Music", "Yoga Music"],
  "Ambient": ["Dark Ambient", "Space Ambient", "Drone Ambient", "Cinematic Ambient", "Chill Ambient", "Minimal Ambient"],
  "Easy Listening": ["Soft Pop", "Lounge Music", "Background Music", "Romantic Easy Listening", "Acoustic Easy Listening"],
  "Funk": ["Funk Rock", "Jazz Funk", "Disco Funk", "Pop Funk", "Afro Funk", "Electro Funk"],
  "Disco": ["Classic Disco", "Nu Disco", "Disco Pop", "Funk Disco", "Italo Disco"],
  "Punk": ["Punk Rock", "Pop Punk", "Hardcore Punk", "Post Punk", "Ska Punk", "Indie Punk"],
  "Metal": ["Heavy Metal", "Death Metal", "Black Metal", "Power Metal", "Progressive Metal", "Nu Metal", "Alternative Metal"],
  "Reggae": ["Roots Reggae", "Dub Reggae", "Dancehall", "Reggae Fusion", "Lovers Rock"],
  "Ska": ["Traditional Ska", "Ska Punk", "2 Tone Ska", "Reggae Ska Fusion"],
  "Latin": ["Latin Pop", "Latin Urban", "Latin Trap", "Latin Rock", "Salsa", "Bachata", "Reggaeton", "Latin Jazz", "Merengue"],
  "Afrobeat": ["Afro Pop", "Afro House", "Afro Fusion", "Afro Dance", "Afro Trap", "Afro Soul", "Afro Hip-Hop"],
  "Afrobeats": ["Afro Pop", "Afro House", "Afro Fusion", "Afro Dance", "Afro Trap", "Afro Soul", "Afro Hip-Hop"],
  "Gospel": ["Contemporary Gospel", "Traditional Gospel", "Gospel Choir", "Urban Gospel", "Christian Gospel"],
  "Religious": ["Spiritual Music", "Devotional Music", "Islamic Nasheed", "Mantra Music", "Sacred Music"],
  "Christian": ["Christian Pop", "Christian Rock", "Christian Rap", "Worship Music", "Praise Music"],
  "Traditional": ["Ethnic Traditional", "Regional Traditional", "Folk Traditional", "Ceremonial Music", "Heritage Music"],
  "World Music": ["World Fusion", "Ethnic Fusion", "Global Beats", "Traditional World", "Modern World Fusion"],
  "Soundtrack": ["Film Score", "TV Soundtrack", "Trailer Music", "Game Soundtrack", "Cinematic Score", "Background Score"],
  "Anime": ["Anime OST", "Anime Pop", "Anime Rock", "Anime Instrumental", "J-Anime Fusion"],
  "Bollywood": ["Bollywood Pop", "Bollywood Soundtrack", "Bollywood Dance", "Bollywood Romantic", "Bollywood Classical Fusion"],
  "Experimental": ["Avant-Garde", "Noise Music", "Experimental Electronic", "Experimental Rock", "Sound Art", "Minimal Experimental"],
  "Vocal": ["Male Vocal", "Female Vocal", "Duet", "Choir", "A Cappella", "Vocal Pop", "Vocal Jazz", "Vocal House", "Opera Vocal"],
  "Singer/Songwriter": ["Acoustic Singer/Songwriter", "Indie Singer/Songwriter", "Folk Singer/Songwriter", "Pop Singer/Songwriter", "Emotional Ballads", "Storytelling Songs"],
  "Audiobook": ["Fiction Audiobook", "Non-Fiction Audiobook", "Educational Audiobook", "Self-Help Audiobook", "Biography Audiobook", "Story Audiobook"],
  "Spoken Word": ["Poetry", "Speech", "Storytelling", "Performance Poetry", "Political Speech", "Motivational Speech"],
  "Comedy": ["Stand-up Comedy", "Sketch Comedy", "Satire", "Parody", "Comedy Story", "Improvisation"],
  "Karaoke": ["Pop Karaoke", "Rock Karaoke", "Classic Karaoke", "Instrumental Karaoke", "Party Karaoke", "Regional Karaoke"],
  "Children's Music": ["Nursery Rhymes", "Educational Songs", "Lullabies", "Cartoon Songs", "Kids Pop", "Kids Folk"],
  "Holiday": ["Christmas Music", "New Year Music", "Ramadan Music", "Eid Music", "Easter Music", "Valentine’s Day Music", "Halloween Music", "National Holiday Music"],
  "Arabic": ["Arabic Pop", "Arabic Folk", "Arabic Traditional", "Arabic Classical", "Arabic Dance", "Arabic Rock", "Arabic Hip-Hop", "Arabic Rap", "Arabic R&B", "Arabic Electronic", "Khaliji", "Levantine", "Egyptian Pop", "Egyptian Rap", "Egyptian Hip-Hop", "Egyptian Rock", "Maghrebi", "Rai", "Bedouin", "Mahraganat"],
  "African": ["Afrobeat", "Afrobeats", "Afro Pop", "Afro House", "Afro Soul", "Highlife", "Amapiano", "Soukous", "Afro Jazz", "Afro Fusion"],
  "Indian": ["Bollywood", "Indian Pop", "Indian Classical", "Bhangra", "Tamil Pop", "Telugu Pop", "Punjabi Folk", "Filmi", "Devotional", "Indian Fusion"],
  "Punjabi": ["Punjabi Pop", "Punjabi Folk", "Bhangra", "Punjabi Rap", "Punjabi Romantic", "Punjabi Hip-Hop", "Gurbani", "Punjabi Remix"],
  "Chinese": ["C-Pop", "Mandopop", "Cantopop", "Chinese Folk", "Chinese Classical", "Chinese Hip-Hop", "Chinese Rock", "Chinese Indie", "Chinese Traditional", "Chinese EDM"],
  "Japanese": ["J-Pop", "J-Rock", "Anime Music", "Vocaloid", "Japanese Hip-Hop", "City Pop", "Japanese Folk", "Enka", "Japanese EDM", "Japanese Indie"],
  "Korean": ["K-Pop", "K-Hip-Hop", "K-R&B", "K-Indie", "K-Rock", "K-Ballad", "Korean EDM", "Korean Folk", "Korean Trap", "Korean Dance"],
  "Brazilian": ["Sertanejo", "Funk Carioca", "MPB (Música Popular Brasileira)", "Brazilian Pop", "Samba", "Bossa Nova", "Pagode", "Brazilian Hip-Hop", "Brazilian Funk", "Forró"],
  "Persian": ["Persian Pop", "Persian Traditional", "Persian Classical", "Persian Folk", "Persian Rock", "Persian Rap", "Persian Dance", "Persian Instrumental", "Persian Dari", "Persian Hip-Hop", "Persian R&B"],
  "Afghan": ["Afghan Pop", "Afghan Traditional", "Afghan Folk", "Dari Music", "Pashto Music", "Afghan Rap", "Afghan Rock", "Afghan Dance", "Afghan Classical", "Afghan Hip-Hop", "Afghan Instrumental"],
  "Tajik": ["Tajik Pop", "Tajik Folk", "Tajik Traditional", "Falak", "Shashmaqom", "Pamiri", "Badakhshani", "Tajik Dance", "Tajik Rap", "Tajik Hip-Hop", "Tajik Rock", "Tajik Instrumental", "Tajik Classical", "Tajik Wedding", "Tajik Modern", "Tajik Acoustic", "Tajik Vocal", "Tajik Duet", "Tajik Children's", "Tajik Music"],
  "Uzbek": ["Uzbek Pop", "Uzbek Folk", "Uzbek Traditional", "Uzbek Classical", "Uzbek Dance", "Uzbek Rock", "Uzbek Rap", "Uzbek Hip-Hop", "Uzbek Trap", "Uzbek Modern", "Uzbek Indie", "Uzbek Instrumental", "Uzbek Wedding Music", "Uzbek Religious", "Uzbek Spiritual"],
  "Kazakh": ["Kazakh Pop", "Kazakh Folk", "Kazakh Traditional", "Kazakh Dance", "Kazakh Rock", "Kazakh Hip-Hop", "Kazakh Rap", "Kazakh Instrumental", "Kazakh Modern Folk", "Kazakh Classical Folk"],
  "Kyrgyz": ["Kyrgyz Pop", "Kyrgyz Folk", "Kyrgyz Traditional", "Kyrgyz Dance", "Kyrgyz Rock", "Kyrgyz Hip-Hop", "Kyrgyz Rap", "Kyrgyz Instrumental", "Kyrgyz Modern Folk", "Kyrgyz Ethnic"],
  "Turkmen": ["Turkmen Pop", "Turkmen Folk", "Turkmen Traditional", "Turkmen Dance", "Turkmen Rock", "Turkmen Instrumental", "Turkmen Modern Folk", "Turkmen Ethnic", "Turkmen Classical Folk", "Turkmen Spiritual"],
  "Turkish": ["Turkish Pop", "Turkish Folk", "Turkish Rock", "Turkish Classical", "Turkish Dance", "Turkish Rap", "Turkish Hip-Hop", "Turkish Trap", "Turkish Drill", "Turkish Arabesque", "Turkish Alternative", "Turkish Indie", "Turkish Electronic", "Turkish House", "Turkish Deep House", "Turkish Techno", "Turkish Trance", "Turkish Rap Pop (Hybrid)", "Turkish Instrumental", "Turkish Traditional", "Turkish Wedding Music", "Anatolian Rock", "Anatolian Folk", "Sufi Music"],
  "Central Asian": ["Central Asian Pop", "Central Asian Folk", "Central Asian Traditional", "Central Asian Dance", "Central Asian Rock", "Central Asian Hip-Hop", "Central Asian Rap", "Central Asian Electronic", "Central Asian House", "Central Asian Instrumental", "Central Asian Classical", "Central Asian Jazz", "Central Asian Fusion", "Central Asian Modern", "Central Asian Spiritual", "Central Asian Wedding Music", "Central Asian Chill", "Central Asian Experimental"],
  "Other": [],
};

// Обратный индекс поджанр → {жанр, поджанр}. Один поджанр может встречаться под
// несколькими жанрами (напр. "Deep House" в House и Electronic) — берём первый
// по порядку CRM_SUBGENRES, чтобы результат был детерминированным.
const SUBGENRE_BY_CANON = (() => {
  const m = new Map<string, { genre: string; subgenre: string }>();
  for (const [genre, subs] of Object.entries(CRM_SUBGENRES)) {
    for (const sub of subs) {
      const c = canonicalGenre(sub);
      if (c && !m.has(c)) m.set(c, { genre, subgenre: sub });
    }
  }
  return m;
})();

// Сопоставляет список названий жанров из источника с жанром + поджанром CRM.
// Идёт по названиям в порядке релевантности (источник отдаёт самое точное первым)
// и берёт первое, что удалось распознать. Внутри одного названия приоритет у
// родительского жанра; если это не жанр, а поджанр — возвращаем жанр + поджанр.
function mapSourceGenre(names: (string | null | undefined)[]): { genre: string | null; subgenre: string | null } {
  for (const raw of names) {
    const n = (raw ?? "").trim();
    if (!n) continue;
    const c = canonicalGenre(n);
    if (!c) continue;
    if (CRM_GENRE_BY_CANON.has(c)) return { genre: CRM_GENRE_BY_CANON.get(c)!, subgenre: null };
    if (GENRE_ALIAS_BY_CANON.has(c)) return { genre: GENRE_ALIAS_BY_CANON.get(c)!, subgenre: null };
    if (SUBGENRE_BY_CANON.has(c)) return SUBGENRE_BY_CANON.get(c)!;
  }
  return { genre: null, subgenre: null };
}

// Приводит строку типа релиза из источника к enum CRM.
function normalizeReleaseType(raw: string | null | undefined): ImportedReleaseData["releaseType"] {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "single" || v === "album" || v === "ep" || v === "compilation") return v;
  return null;
}

// Поиск релиза в Spotify по UPC: search?q=upc:<upc>&type=album → /albums/<id>.
// Возвращает null, если по UPC ничего не найдено (тогда пробуем другой источник).
async function fetchReleaseFromSpotifyByUpc(token: string, upc: string): Promise<ImportedReleaseData | null> {
  const sr = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(`upc:${upc}`)}&type=album&limit=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!sr.ok) throw new SpotifyUpstreamError(`search ${sr.status}`);
  const sj = await sr.json() as { albums?: { items: { id: string }[] } };
  const albumId = sj.albums?.items?.[0]?.id;
  if (!albumId) return null;

  const ar = await fetch(`https://api.spotify.com/v1/albums/${albumId}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!ar.ok) throw new SpotifyUpstreamError(`album ${ar.status}`);
  const aj = await ar.json() as {
    name: string;
    label?: string;
    release_date?: string;
    album_type?: string;
    genres?: string[];
    external_ids?: { upc?: string };
    images?: { url: string }[];
    artists?: { name: string }[];
    tracks?: { items?: { id?: string; name: string; track_number: number; explicit?: boolean; external_ids?: { isrc?: string } }[] };
  };

  // Simplified-треки из /albums/{id} НЕ содержат ISRC — догружаем батчами
  // по 50 через /tracks?ids= (та же стратегия, что в fetchTransferTracks).
  const items = aj.tracks?.items ?? [];
  const metaById = new Map<string, { isrc: string | null; explicit: boolean }>();
  const ids = items.map((t) => t.id).filter((id): id is string => !!id);
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const tr = await fetch(`https://api.spotify.com/v1/tracks?ids=${chunk.join(",")}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!tr.ok) continue; // частичная неудача — isrc=null для этого батча
    const tj = await tr.json() as { tracks?: { id: string; explicit?: boolean; external_ids?: { isrc?: string } }[] };
    for (const t of tj.tracks ?? []) metaById.set(t.id, { isrc: t.external_ids?.isrc ?? null, explicit: !!t.explicit });
  }

  const tracks = items.map((tr, idx) => {
    const meta = tr.id ? metaById.get(tr.id) : undefined;
    return {
      title: tr.name,
      trackNumber: tr.track_number ?? idx + 1,
      isrc: meta?.isrc ?? tr.external_ids?.isrc ?? null,
      explicit: meta?.explicit ?? !!tr.explicit,
    };
  });

  return {
    upc: aj.external_ids?.upc ?? upc,
    title: aj.name,
    artist: aj.artists?.[0]?.name ?? "Unknown artist",
    label: aj.label ?? null,
    coverUrl: aj.images?.[0]?.url ?? null,
    releaseDate: aj.release_date ?? null,
    ...mapSourceGenre(aj.genres ?? []),
    releaseType: normalizeReleaseType(aj.album_type),
    tracks: tracks.length > 0 ? tracks : [{ title: aj.name, trackNumber: 1, isrc: null, explicit: false }],
    source: "spotify",
    pLine: null,
    cLine: null,
    _ids: { spotifyAlbumId: albumId, spotifyArtistId: aj.artists?.[0] ? undefined : undefined },
    _rawSource: aj,
  };
}

// Определяет Spotify album id по UPC. Синтетический UPC вида "SPOTIFY-<id>"
// (когда у Spotify нет реального штрихкода) содержит id напрямую; для настоящего
// UPC ищем альбом через поиск.
async function resolveSpotifyAlbumId(token: string, upc: string): Promise<string | null> {
  const synthetic = upc.match(/^SPOTIFY-(.+)$/);
  if (synthetic) return synthetic[1];
  const sr = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(`upc:${upc}`)}&type=album&limit=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!sr.ok) return null;
  const sj = await sr.json() as { albums?: { items: { id: string }[] } };
  return sj.albums?.items?.[0]?.id ?? null;
}

// Возвращает ВСЕ треки альбома с оригинальными ISRC для Transfer Track.
// Simplified-объекты треков (из /albums/{id}/tracks) не содержат ISRC, поэтому
// ISRC догружаем батчем через /tracks?ids=. Возвращает null при любой неудаче
// (тогда импорт использует плейсхолдеры).
async function fetchTransferTracks(
  token: string,
  upc: string,
): Promise<{ title: string; trackNumber: number; isrc: string | null; explicit: boolean }[] | null> {
  const albumId = await resolveSpotifyAlbumId(token, upc);
  if (!albumId) return null;

  // Пагинация: собираем ВСЕ треки альбома (не только первые 50).
  const authHeader = { Authorization: `Bearer ${token}` };
  const simplified: { id: string; name: string; track_number: number }[] = [];
  let nextUrl: string | null = `https://api.spotify.com/v1/albums/${albumId}/tracks?limit=50`;
  while (nextUrl) {
    const ar: Response = await fetch(nextUrl, { headers: authHeader });
    if (!ar.ok) return simplified.length > 0 ? finalizeTransferTracks(simplified, new Map<string, { isrc: string | null; explicit: boolean }>()) : null;
    const aj = await ar.json() as {
      items?: { id: string; name: string; track_number: number }[];
      next?: string | null;
    };
    for (const it of aj.items ?? []) simplified.push(it);
    nextUrl = aj.next ?? null;
  }
  if (simplified.length === 0) return null;

  // ISRC + explicit догружаем батчами по 50 через /tracks?ids= для ВСЕХ треков.
  const metaById = new Map<string, { isrc: string | null; explicit: boolean }>();
  const allIds = simplified.map((t) => t.id).filter(Boolean);
  for (let i = 0; i < allIds.length; i += 50) {
    const chunk = allIds.slice(i, i + 50);
    const tr = await fetch(`https://api.spotify.com/v1/tracks?ids=${chunk.join(",")}`, { headers: authHeader });
    if (!tr.ok) continue; // частичная неудача — оставляем isrc=null для этого батча
    const tj = await tr.json() as { tracks?: { id: string; explicit?: boolean; external_ids?: { isrc?: string } }[] };
    for (const t of tj.tracks ?? []) metaById.set(t.id, { isrc: t.external_ids?.isrc ?? null, explicit: !!t.explicit });
  }
  return finalizeTransferTracks(simplified, metaById);
}

function finalizeTransferTracks(
  simplified: { id: string; name: string; track_number: number }[],
  metaById: Map<string, { isrc: string | null; explicit: boolean }>,
): { title: string; trackNumber: number; isrc: string | null; explicit: boolean }[] {
  return simplified.map((t, idx) => {
    const meta = metaById.get(t.id);
    return {
      title: t.name,
      trackNumber: t.track_number ?? idx + 1,
      isrc: meta?.isrc ?? null,
      explicit: meta?.explicit ?? false,
    };
  });
}

// Поиск релиза в MusicBrainz по штрихкоду (публичный API, без авторизации).
async function fetchReleaseFromMusicBrainzByUpc(upc: string): Promise<ImportedReleaseData | null> {
  const result = await lookupReleaseByBarcode(upc);
  if (result.kind === "error") throw new Error(result.message);
  if (result.kind === "not_found") return null;
  const r = result.release;
  return {
    upc,
    title: r.title,
    artist: r.artistName,
    label: r.label,
    coverUrl: null,
    releaseDate: r.releaseDate,
    genre: null,
    subgenre: null,
    releaseType: null,
    tracks: r.tracks.length > 0
      ? r.tracks.map((t) => ({ title: t.title, trackNumber: t.trackNumber, isrc: t.isrc, explicit: false }))
      : [{ title: r.title, trackNumber: 1, isrc: null, explicit: false }],
    source: "musicbrainz",
    pLine: null,
    cLine: null,
    _ids: { musicbrainzMbid: r.mbid },
    _rawSource: r,
  };
}

// Поиск релиза в Deezer по UPC (публичный API, без ключей и без Premium).
// Deezer отдаёт ISRC прямо в /album/{id}/tracks, поэтому N+1 запросов не нужно.
async function fetchReleaseFromDeezerByUpc(upc: string): Promise<ImportedReleaseData | null> {
  const albRes = await fetch(`https://api.deezer.com/album/upc:${encodeURIComponent(upc)}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!albRes.ok) throw new Error(`Deezer album ${albRes.status}`);
  const alb = await albRes.json() as {
    id?: number;
    title?: string;
    upc?: string;
    label?: string;
    release_date?: string;
    record_type?: string;
    cover_xl?: string;
    cover_big?: string;
    artist?: { name?: string };
    genres?: { data?: { name?: string }[] };
    error?: { type?: string; message?: string };
  };
  // Deezer возвращает HTTP 200 с телом {error:{...}}, когда релиз не найден.
  if (!alb || alb.error || !alb.id) return null;

  const tracks: { title: string; trackNumber: number; isrc: string | null; explicit: boolean }[] = [];
  let next: string | null = `https://api.deezer.com/album/${alb.id}/tracks?limit=100`;
  let guard = 0;
  while (next && guard < 10) {
    guard++;
    // SSRF-защита: следуем только по next-ссылкам самого Deezer, ничего иного.
    if (!next.startsWith("https://api.deezer.com/")) break;
    const tRes: Response = await fetch(next, { signal: AbortSignal.timeout(15_000) });
    if (!tRes.ok) break;
    const tj = await tRes.json() as {
      data?: { title?: string; track_position?: number; isrc?: string; explicit_lyrics?: boolean }[];
      next?: string;
    };
    for (const t of tj.data ?? []) {
      tracks.push({
        title: t.title ?? "",
        trackNumber: t.track_position ?? tracks.length + 1,
        isrc: t.isrc ?? null,
        explicit: !!t.explicit_lyrics,
      });
    }
    next = tj.next ?? null;
  }

  return {
    upc: alb.upc || upc,
    title: alb.title ?? "Unknown release",
    artist: alb.artist?.name ?? "Unknown artist",
    label: alb.label ?? null,
    coverUrl: alb.cover_xl ?? alb.cover_big ?? null,
    releaseDate: alb.release_date ?? null,
    ...mapSourceGenre((alb.genres?.data ?? []).map((g) => g.name)),
    releaseType: normalizeReleaseType(alb.record_type),
    tracks: tracks.length > 0 ? tracks : [{ title: alb.title ?? "Unknown release", trackNumber: 1, isrc: null, explicit: false }],
    source: "deezer",
    pLine: null,
    cLine: null,
    _ids: { deezerAlbumId: alb.id != null ? String(alb.id) : undefined },
    _rawSource: alb,
  };
}

// Импорт релиза по UPC из внешних каталогов (Spotify / MusicBrainz). Создаёт
// в БД реальные записи artist/label/release/tracks в одной транзакции. Источник
// "apple" не поддерживается (требует Apple Music API partner-токена) и
// прозрачно деградирует на MusicBrainz.
/** TTL кэша метаданных — 30 дней. */
const METADATA_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Нормализует название трека для сопоставления между источниками
 * (разные каталоги пишут "feat."/скобки/регистр по-разному).
 */
function normalizeTrackTitle(title: string): string {
  return title.toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .replace(/feat\.?|ft\.?/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

/**
 * Режим «Все сервисы»: параллельно запрашивает Spotify (если настроен),
 * Deezer и MusicBrainz и сливает лучшие данные по полям:
 *
 *   - база: Spotify > Deezer > MusicBrainz (полнота треков и explicit-флагов)
 *   - ISRC треков: недостающие добираются из остальных источников
 *     (сопоставление по номеру трека, затем по нормализованному названию)
 *   - обложка: Spotify (640px) > Deezer (1000px XL) > iTunes 600px (позже)
 *   - label/genre/releaseDate/releaseType: первый непустой по приоритету
 *   - _ids: объединяются от всех источников (для кэша)
 *
 * iTunes-обогащение (pLine/cLine) выполняется отдельно в общем потоке хендлера.
 */
async function fetchReleaseFromAllSources(upc: string): Promise<ImportedReleaseData | null> {
  // Spotify: пропускаем молча, если не настроен или упал — остальные источники бесплатны.
  const spotifyPromise: Promise<ImportedReleaseData | null> = (async () => {
    try {
      const cfg = await loadSpotifyConfig();
      const token = await getSpotifyToken(cfg);
      return await fetchReleaseFromSpotifyByUpc(token, upc);
    } catch {
      return null;
    }
  })();
  const deezerPromise = fetchReleaseFromDeezerByUpc(upc).catch(() => null);
  const mbPromise = fetchReleaseFromMusicBrainzByUpc(upc).catch(() => null);

  const [spotify, deezer, musicbrainz] = await Promise.all([spotifyPromise, deezerPromise, mbPromise]);

  // Приоритет базы: Spotify даёт максимально полные данные, затем Deezer, затем MB.
  const ordered = [spotify, deezer, musicbrainz].filter((d): d is ImportedReleaseData => d !== null);
  if (ordered.length === 0) return null;
  const base = ordered[0];

  // Добираем недостающие ISRC из остальных источников.
  const others = ordered.slice(1);
  const tracks = base.tracks.map((t) => {
    if (t.isrc) return t;
    for (const src of others) {
      const byNumber = src.tracks.find((s) => s.trackNumber === t.trackNumber && s.isrc);
      if (byNumber?.isrc) return { ...t, isrc: byNumber.isrc };
      const norm = normalizeTrackTitle(t.title);
      const byTitle = norm ? src.tracks.find((s) => s.isrc && normalizeTrackTitle(s.title) === norm) : undefined;
      if (byTitle?.isrc) return { ...t, isrc: byTitle.isrc };
    }
    return t;
  });

  const firstNonNull = <K extends keyof ImportedReleaseData>(key: K): ImportedReleaseData[K] =>
    ordered.map((d) => d[key]).find((v) => v !== null && v !== undefined) ?? base[key];

  return {
    ...base,
    tracks,
    label: firstNonNull("label"),
    coverUrl: firstNonNull("coverUrl"),
    genre: firstNonNull("genre"),
    subgenre: firstNonNull("subgenre"),
    releaseDate: firstNonNull("releaseDate"),
    releaseType: firstNonNull("releaseType"),
    _ids: ordered.reduce((acc, d) => ({ ...acc, ...d._ids }), {} as NonNullable<ImportedReleaseData["_ids"]>),
    _rawSource: base._rawSource,
  };
}

/**
 * Обогащает ImportedReleaseData данными из iTunes Search API:
 *   - pLine / cLine (copyright)
 *   - обложка высокого разрешения (600×600), если у источника нет или низкое качество
 *   - жанр (резервный вариант)
 *
 * Никогда не бросает и не блокирует основной поток — при ошибке iTunes
 * data остаётся без изменений.
 */
async function enrichWithItunes(
  data: ImportedReleaseData,
  upc: string,
): Promise<{ enriched: ImportedReleaseData; itunesRaw: unknown }> {
  const result = await itunesLookupByUpc(upc);
  if (result.kind !== "found") return { enriched: data, itunesRaw: null };

  const it = result.data;
  const { pLine, cLine } = parseItunesCopyright(it.copyright);

  // Обложка: Deezer уже даёт 500px (cover_xl), Spotify — ~640px. iTunes 600px.
  // Используем iTunes только если источник не дал обложку.
  const cover = data.coverUrl ?? itunesHighResCover(it.artworkUrl100);

  // Жанр: только если источник его не распознал.
  let genre = data.genre;
  if (!genre && it.primaryGenreName) {
    const mapped = mapSourceGenre([it.primaryGenreName]);
    genre = mapped.genre;
  }

  return {
    enriched: {
      ...data,
      pLine: pLine ?? data.pLine,
      cLine: cLine ?? data.cLine,
      coverUrl: cover,
      genre,
      _ids: {
        ...data._ids,
        itunesCollectionId: it.collectionId != null ? String(it.collectionId) : undefined,
      },
      _rawItunes: result.raw,
    } as ImportedReleaseData,
    itunesRaw: result.raw,
  };
}

/**
 * Сохраняет метаданные релиза в кэш (upsert). Неблокирующий вызов —
 * ошибки логируются, но не прерывают основной поток.
 */
/**
 * Минимальный порог качества для кэширования/использования кэша:
 * есть треки и (хотя бы один ISRC ИЛИ обложка). Деградированные результаты
 * (например, MusicBrainz-only без ISRC при недоступном Spotify) не кэшируем,
 * чтобы не «заморозить» плохие метаданные на 30 дней.
 */
function metadataQualityOk(d: { tracks?: { isrc: string | null }[] | null; coverUrl?: string | null }): boolean {
  const tracks = d.tracks ?? [];
  if (tracks.length === 0) return false;
  return tracks.some((t) => t.isrc) || !!d.coverUrl;
}

function writeMetadataCache(data: ImportedReleaseData, upc: string): void {
  if (!metadataQualityOk(data)) return; // не фиксируем деградированный результат
  db.insert(metadataCacheTable).values({
    upc,
    spotifyAlbumId: data._ids?.spotifyAlbumId,
    spotifyArtistId: data._ids?.spotifyArtistId,
    deezerAlbumId: data._ids?.deezerAlbumId,
    musicbrainzMbid: data._ids?.musicbrainzMbid,
    itunesCollectionId: data._ids?.itunesCollectionId,
    artistName: data.artist,
    albumName: data.title,
    labelName: data.label,
    pLine: data.pLine,
    cLine: data.cLine,
    coverUrl: data.coverUrl,
    genre: data.genre,
    subgenre: data.subgenre,
    releaseDate: data.releaseDate,
    releaseType: data.releaseType,
    tracks: data.tracks,
    sourceUsed: data.source,
    rawSource: data._rawSource ?? null,
    rawItunes: data._rawItunes ?? null,
    fetchedAt: new Date(),
  }).onConflictDoUpdate({
    target: metadataCacheTable.upc,
    set: {
      spotifyAlbumId: data._ids?.spotifyAlbumId,
      spotifyArtistId: data._ids?.spotifyArtistId,
      deezerAlbumId: data._ids?.deezerAlbumId,
      musicbrainzMbid: data._ids?.musicbrainzMbid,
      itunesCollectionId: data._ids?.itunesCollectionId,
      artistName: data.artist,
      albumName: data.title,
      labelName: data.label,
      pLine: data.pLine,
      cLine: data.cLine,
      coverUrl: data.coverUrl,
      genre: data.genre,
      subgenre: data.subgenre,
      releaseDate: data.releaseDate,
      releaseType: data.releaseType,
      tracks: data.tracks,
      sourceUsed: data.source,
      rawSource: data._rawSource ?? null,
      rawItunes: data._rawItunes ?? null,
      fetchedAt: new Date(),
    },
  }).catch((e) => {
    logger.warn({ err: e, upc }, "[metadata-cache] write failed");
  });
}

router.post("/releases/import-upc", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const upcRaw = typeof req.body?.upc === "string" ? req.body.upc.trim() : "";
  const sourceRaw = typeof req.body?.source === "string" ? req.body.source : undefined;
  const upc = upcRaw.replace(/[-\s]/g, "");
  if (!/^\d{8,14}$/.test(upc)) {
    res.status(400).json({ error: "invalid_upc", message: "Укажите корректный UPC/EAN (8–14 цифр)." });
    return;
  }
  // По умолчанию — «все сервисы»: параллельный запрос ко всем каталогам
  // и слияние лучших данных по полям. Конкретный источник можно выбрать явно.
  const source: "all" | "spotify" | "apple" | "musicbrainz" | "deezer" =
    sourceRaw === "spotify" || sourceRaw === "apple" || sourceRaw === "musicbrainz" || sourceRaw === "deezer" ? sourceRaw : "all";

  // Idempotency: не создаём дубль, если релиз с таким UPC уже есть.
  const [existing] = await db.select({ id: releasesTable.id, title: releasesTable.title })
    .from(releasesTable).where(eq(releasesTable.upc, upc)).limit(1);
  if (existing) {
    res.status(409).json({ error: "already_exists", message: `Релиз с UPC ${upc} уже существует в каталоге.`, releaseId: existing.id });
    return;
  }

  // ── 1. Проверяем кэш метаданных ──────────────────────────────────────────
  // Если в кэше есть свежие данные (< 30 дней) — используем их и не ходим
  // во внешние API. Это экономит время и квоты.
  const [cachedRow] = await db.select().from(metadataCacheTable)
    .where(eq(metadataCacheTable.upc, upc)).limit(1);
  // Кэш используем только если он свежий И проходит порог качества —
  // иначе перезапрашиваем внешние API (и перезапишем кэш лучшим результатом).
  const cacheIsFresh = cachedRow
    && (Date.now() - cachedRow.fetchedAt.getTime()) < METADATA_CACHE_TTL_MS
    && metadataQualityOk({ tracks: cachedRow.tracks, coverUrl: cachedRow.coverUrl });

  let data: ImportedReleaseData | null = null;

  if (cacheIsFresh) {
    data = {
      upc,
      title: cachedRow.albumName ?? "Unknown release",
      artist: cachedRow.artistName ?? "Unknown artist",
      label: cachedRow.labelName,
      coverUrl: cachedRow.coverUrl,
      releaseDate: cachedRow.releaseDate,
      genre: cachedRow.genre,
      subgenre: cachedRow.subgenre,
      releaseType: (cachedRow.releaseType as ImportedReleaseData["releaseType"]) ?? null,
      pLine: cachedRow.pLine,
      cLine: cachedRow.cLine,
      tracks: (cachedRow.tracks as ImportedReleaseData["tracks"]) ??
        [{ title: cachedRow.albumName ?? "Track 1", trackNumber: 1, isrc: null, explicit: false }],
      source: (cachedRow.sourceUsed as ImportedReleaseData["source"]) ?? "musicbrainz",
      _ids: {
        spotifyAlbumId: cachedRow.spotifyAlbumId ?? undefined,
        spotifyArtistId: cachedRow.spotifyArtistId ?? undefined,
        deezerAlbumId: cachedRow.deezerAlbumId ?? undefined,
        musicbrainzMbid: cachedRow.musicbrainzMbid ?? undefined,
        itunesCollectionId: cachedRow.itunesCollectionId ?? undefined,
      },
    };
  } else {
    // ── 2. Запрашиваем первичный источник и iTunes параллельно ──────────────
    // iTunes всегда запускаем параллельно — он не зависит от токена Spotify.
    const itunesPromise = itunesLookupByUpc(upc);

    try {
      if (source === "all") {
        // Все сервисы параллельно + слияние лучших данных.
        data = await fetchReleaseFromAllSources(upc);
      } else if (source === "spotify") {
        const cfg = await loadSpotifyConfig();
        let token: string;
        try {
          token = await getSpotifyToken(cfg);
        } catch (e: any) {
          if (e instanceof SpotifyNotConfiguredError) {
            data = await fetchReleaseFromMusicBrainzByUpc(upc);
          } else {
            throw e;
          }
          token = "";
        }
        if (token) {
          data = await fetchReleaseFromSpotifyByUpc(token, upc);
          if (!data) data = await fetchReleaseFromMusicBrainzByUpc(upc);
        }
      } else if (source === "deezer") {
        data = await fetchReleaseFromDeezerByUpc(upc);
        if (!data) data = await fetchReleaseFromMusicBrainzByUpc(upc);
      } else {
        // musicbrainz / apple → MusicBrainz
        data = await fetchReleaseFromMusicBrainzByUpc(upc);
      }
    } catch (e: any) {
      if (e instanceof SpotifyUpstreamError) {
        res.status(502).json({ error: "spotify_upstream_error", message: `Spotify недоступен или отклонил запрос: ${e.message}` });
        return;
      }
      res.status(502).json({ error: "lookup_failed", message: `Не удалось получить данные по UPC: ${e?.message ?? "unknown"}` });
      return;
    }

    if (!data) {
      res.status(404).json({ error: "not_found", message: `Релиз с UPC ${upc} не найден ни в одном из доступных каталогов.` });
      return;
    }

    // ── 3. Обогащаем данными из iTunes ────────────────────────────────────
    // Ждём iTunes (он уже выполнялся параллельно с первичным источником).
    const itunesResult = await itunesPromise;
    if (itunesResult.kind === "found") {
      const it = itunesResult.data;
      const { pLine, cLine } = parseItunesCopyright(it.copyright);
      if (pLine && !data.pLine) data.pLine = pLine;
      if (cLine && !data.cLine) data.cLine = cLine;
      if (!data.coverUrl) data.coverUrl = itunesHighResCover(it.artworkUrl100);
      if (!data.genre && it.primaryGenreName) {
        const mapped = mapSourceGenre([it.primaryGenreName]);
        if (mapped.genre) data.genre = mapped.genre;
      }
      data._rawItunes = itunesResult.raw;
      if (it.collectionId != null) {
        data._ids = { ...data._ids, itunesCollectionId: String(it.collectionId) };
      }
    }

    // ── 4. Пишем в кэш (неблокирующий upsert) ─────────────────────────────
    writeMetadataCache(data, upc);
  }

  // ── 5. Создаём записи в БД (транзакция) ───────────────────────────────────
  type PendingAudit = Parameters<typeof auditMutation>[1];
  const pendingAudits: PendingAudit[] = [];
  const found = data;
  let createdRelease: typeof releasesTable.$inferSelect;
  try {
    createdRelease = await db.transaction(async (tx) => {
      const labelId = found.label?.trim()
        ? await findOrCreateLabel(tx, found.label).then((r) => {
            if (r.created && r.row) pendingAudits.push({ action: "create", entityType: "label", entityId: r.id, before: null, after: r.row });
            return r.id;
          })
        : null;

      const artist = await findOrCreateArtist(tx, found.artist, labelId);
      if (artist.created && artist.row) pendingAudits.push({ action: "create", entityType: "artist", entityId: artist.id, before: null, after: artist.row });

      const releaseType = found.releaseType ?? (found.tracks.length > 1 ? "album" : "single");
      const releaseExplicit = found.tracks.some((t) => t.explicit);

      // Метка источника с учётом iTunes-обогащения.
      const sourceLabel = found.source === "spotify" ? "Spotify"
        : found.source === "deezer" ? "Deezer" : "MusicBrainz";
      const itunesNote = found.pLine || found.cLine ? " + iTunes" : "";

      const [release] = await tx.insert(releasesTable).values({
        title: found.title,
        releaseType,
        status: "draft",
        upc: found.upc || upc,
        artistId: artist.id,
        labelId,
        coverUrl: found.coverUrl,
        releaseDate: found.releaseDate,
        genre: found.genre ?? undefined,
        subgenre: found.subgenre ?? undefined,
        isExplicit: releaseExplicit,
        pLine: found.pLine ?? undefined,
        cLine: found.cLine ?? undefined,
        statusNote: `Импортировано по UPC из ${sourceLabel}${itunesNote}`,
      }).returning();
      pendingAudits.push({ action: "create", entityType: "release", entityId: release.id, before: null, after: release });

      const trackRows = found.tracks.slice(0, 100).map((t, idx) => ({
        title: t.title,
        releaseId: release.id,
        artistId: artist.id,
        trackNumber: t.trackNumber ?? idx + 1,
        isrc: t.isrc,
        genre: found.genre ?? undefined,
        subgenre: found.subgenre ?? undefined,
        isExplicit: t.explicit,
        explicitStatus: t.explicit ? "explicit" : "non_explicit",
      }));
      const inserted = await tx.insert(tracksTable).values(trackRows).returning({ id: tracksTable.id });
      for (const tr of inserted) {
        pendingAudits.push({ action: "create", entityType: "track", entityId: tr.id, before: null, after: { releaseId: release.id } });
      }

      if (!release.catalogNumber || !release.catalogNumber.trim()) {
        const candidate = await generateCatalogNumber();
        const [updated] = await tx.update(releasesTable)
          .set({ catalogNumber: candidate })
          .where(eq(releasesTable.id, release.id))
          .returning();
        if (updated) return updated;
      }
      return release;
    });
  } catch (e: any) {
    if (isUniqueViolation(e)) {
      res.status(409).json({ error: "already_exists", message: `Релиз с UPC ${upc} уже существует в каталоге.` });
      return;
    }
    res.status(500).json({ error: "import_failed", message: e?.message ?? "Не удалось сохранить релиз." });
    return;
  }

  for (const a of pendingAudits) void auditMutation(req, a);

  res.status(201).json(createdRelease);
});

export default router;
