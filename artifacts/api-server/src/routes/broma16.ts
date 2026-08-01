/**
 * Роуты Broma16 (ROD API). Все — только для admin/manager с правом
 * "distribution": статус/тест интеграции, синхронизация словарей, статистика,
 * синхронизация артистов и пуш релиза на модерацию.
 */

import { Router, type IRouter, type Response } from "express";
import { z } from "zod/v4";
import { and, desc, eq } from "drizzle-orm";
import { db, releasesTable, broma16PushJobsTable } from "@workspace/db";
import { requireRole } from "../lib/auth";
import { requireManagerPermission } from "../lib/manager-permissions";
import { createBroma16Client } from "../services/broma16/client";
import { getBroma16Credentials, getStoredAccountId } from "../services/broma16/credentials";
import { Broma16ConfigError, Broma16ValidationError } from "../services/broma16/errors";
import {
  getDictionary,
  dictionaryCount,
  syncAllDictionaries,
  type DictionaryType,
} from "../services/broma16/dictionaries";
import { syncArtist } from "../services/broma16/artists";
import { checkReleaseModeration } from "../services/broma16/moderation";
import {
  requestStatisticsReport,
  checkReportStatus,
  getStatisticsOutlets,
  downloadAndParseReport,
  requestAndIngest,
} from "../services/broma16/statistics";
import { enqueueBroma16Push } from "../workers/broma16-push-worker";
import { logger } from "../lib/logger";

const broma16Router: IRouter = Router();
const staff = [requireRole("admin", "manager"), requireManagerPermission("distribution")];
// Сама отправка релиза на дистрибуцию — только администратор. Статус и проверку
// модерации по-прежнему видят и admin, и manager (staff).
const adminOnly = [requireRole("admin")];

const DICT_TYPES: DictionaryType[] = ["genre", "language", "release_type", "outlet", "country"];

/** Единый формат ответа об ошибке Broma16. */
export function sendBroma16Error(res: Response, e: unknown): void {
  if (e instanceof Broma16ConfigError) {
    res.status(400).json({ error: e.message, code: "not_configured" });
    return;
  }
  if (e instanceof Broma16ValidationError) {
    res.status(422).json({ error: e.message, code: "validation", fields: e.fields });
    return;
  }
  res.status(502).json({ error: e instanceof Error ? e.message : "Ошибка Broma16", code: "upstream" });
}

function parseId(raw: string | string[] | undefined): number | null {
  const s = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// ── Статус / тест ──────────────────────────────────────────────────

// GET /broma16/status — настроена ли интеграция (без секретов).
broma16Router.get("/broma16/status", ...staff, async (_req, res) => {
  const creds = await getBroma16Credentials();
  const accountId = await getStoredAccountId();
  const counts: Record<string, number> = {};
  for (const t of DICT_TYPES) counts[t] = await dictionaryCount(t);
  res.json({
    configured: Boolean(creds),
    credentialsSource: creds?.source ?? null,
    accountId,
    dictionaries: counts,
  });
});

// POST /broma16/test — реальный login + получение account_id.
broma16Router.post("/broma16/test", ...staff, async (_req, res) => {
  try {
    const client = await createBroma16Client();
    await client.login();
    const accountId = await client.getAccountId();
    res.json({ ok: true, accountId });
  } catch (e) {
    sendBroma16Error(res, e);
  }
});

// ── Словари ────────────────────────────────────────────────────────

// GET /broma16/dictionaries/:type — записи словаря из кэша.
broma16Router.get("/broma16/dictionaries/:type", ...staff, async (req, res) => {
  const type = req.params.type as DictionaryType;
  if (!DICT_TYPES.includes(type)) {
    res.status(400).json({ error: `Неизвестный тип словаря: ${req.params.type}` });
    return;
  }
  res.json({ type, items: await getDictionary(type) });
});

// POST /broma16/dictionaries/sync — синхронизировать все словари из Broma16.
broma16Router.post("/broma16/dictionaries/sync", ...staff, async (_req, res) => {
  try {
    const result = await syncAllDictionaries();
    res.json({ ok: true, result });
  } catch (e) {
    sendBroma16Error(res, e);
  }
});

// ── Артисты ────────────────────────────────────────────────────────

// POST /broma16/artists/:id/sync — найти/создать артиста в Broma16.
broma16Router.post("/broma16/artists/:id/sync", ...staff, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Некорректный id артиста" });
    return;
  }
  try {
    const result = await syncArtist(id);
    res.json({ ok: true, ...result });
  } catch (e) {
    sendBroma16Error(res, e);
  }
});

// ── Статистика ─────────────────────────────────────────────────────

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Дата должна быть в формате YYYY-MM-DD");
const statRequestSchema = z.object({
  dateFrom: dateStr,
  dateTo: dateStr,
  outlets: z.array(z.string()).optional(),
});

// GET /broma16/statistics/outlets — доступные витрины для отчётов.
broma16Router.get("/broma16/statistics/outlets", ...staff, async (_req, res) => {
  try {
    res.json({ outlets: await getStatisticsOutlets() });
  } catch (e) {
    sendBroma16Error(res, e);
  }
});

// POST /broma16/statistics/request — создать отчёт, вернуть reportId.
broma16Router.post("/broma16/statistics/request", ...staff, async (req, res) => {
  const parsed = statRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Некорректные параметры", details: parsed.error.issues });
    return;
  }
  try {
    const reportId = await requestStatisticsReport(
      parsed.data.dateFrom,
      parsed.data.dateTo,
      parsed.data.outlets,
    );
    res.json({ ok: true, reportId });
  } catch (e) {
    sendBroma16Error(res, e);
  }
});

// GET /broma16/statistics/status/:reportId — статус формирования отчёта.
broma16Router.get("/broma16/statistics/status/:reportId", ...staff, async (req, res) => {
  try {
    const st = await checkReportStatus(String(req.params.reportId));
    res.json({ status: st.status, ready: Boolean(st.outputFile) });
  } catch (e) {
    sendBroma16Error(res, e);
  }
});

// POST /broma16/statistics/ingest — скачать готовый отчёт и записать в usage_reports.
const ingestSchema = z.object({ reportId: z.string().min(1), period: dateStr });
broma16Router.post("/broma16/statistics/ingest", ...staff, async (req, res) => {
  const parsed = ingestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Некорректные параметры", details: parsed.error.issues });
    return;
  }
  try {
    const result = await downloadAndParseReport(parsed.data.reportId, parsed.data.period);
    res.json({ ok: true, ...result });
  } catch (e) {
    sendBroma16Error(res, e);
  }
});

// POST /broma16/statistics/sync — ручной запуск полного цикла (запрос → опрос →
// загрузка) в фоне. Опрос отчёта может занять минуты, поэтому не держим запрос
// открытым: запускаем в фоне и сразу отвечаем. По умолчанию — окно в 30 дней,
// как у ночного сбора: витрины досылают данные неделями, и «за вчера» пусто.
const SYNC_DEFAULT_DAYS = 30;
const syncSchema = z.object({ dateFrom: dateStr.optional(), dateTo: dateStr.optional() });
broma16Router.post("/broma16/statistics/sync", ...staff, async (req, res) => {
  const parsed = syncSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Некорректные параметры", details: parsed.error.issues });
    return;
  }
  const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const dateTo = parsed.data.dateTo ?? ymd(Date.now() - 24 * 60 * 60 * 1000);
  const dateFrom = parsed.data.dateFrom ?? ymd(Date.now() - SYNC_DEFAULT_DAYS * 24 * 60 * 60 * 1000);
  // Проверяем настроенность интеграции до фонового запуска, чтобы вернуть
  // читаемую ошибку, а не молча запустить нерабочий фон.
  const creds = await getBroma16Credentials();
  if (!creds) {
    res.status(400).json({ error: "Broma16 не настроен: укажите логин и пароль в настройках интеграций", code: "not_configured" });
    return;
  }
  void requestAndIngest(dateFrom, dateTo)
    .then((r) => logger.info({ dateFrom, dateTo, ...r }, "[broma16] ручная синхронизация статистики завершена"))
    .catch((e) => logger.error({ err: e, dateFrom, dateTo }, "[broma16] ручная синхронизация статистики не удалась"));
  res.json({ ok: true, started: true, dateFrom, dateTo });
});

// ── Пуш релиза ─────────────────────────────────────────────────────

// POST /broma16/releases/:id/push — поставить релиз в очередь на отправку.
// Необязательное тело { outlets: string[] } — выбранные витрины (коды из словаря
// outlet); сохраняем их в релиз перед постановкой в очередь, чтобы пушер взял
// именно их.
const pushBodySchema = z.object({ outlets: z.array(z.string()).optional() });
broma16Router.post("/broma16/releases/:id/push", ...adminOnly, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Некорректный id релиза" });
    return;
  }
  const parsed = pushBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Некорректные параметры", details: parsed.error.issues });
    return;
  }
  const [release] = await db
    .select({ id: releasesTable.id, status: releasesTable.status })
    .from(releasesTable)
    .where(eq(releasesTable.id, id))
    .limit(1);
  if (!release) {
    res.status(404).json({ error: "Релиз не найден" });
    return;
  }
  // Отправлять в Broma16 можно только одобренный релиз.
  if (release.status !== "approved") {
    res.status(409).json({
      error: "Релиз можно отправить в Broma16 только после одобрения (статус «approved»).",
    });
    return;
  }
  // Сохраняем витрины, если ключ outlets присутствует в теле (даже пустой
  // массив): пустой список явно сбрасывает ранее выбранные витрины, и пушер
  // тогда возьмёт базовый набор по умолчанию (resolveOutletCodes).
  if (parsed.data.outlets !== undefined) {
    await db
      .update(releasesTable)
      .set({ broma16DistributionOutlets: parsed.data.outlets })
      .where(eq(releasesTable.id, id));
  }
  const requestedBy = req.session?.user?.id ?? null;
  const jobId = await enqueueBroma16Push(id, requestedBy);
  res.json({ ok: true, jobId, status: "queued" });
});

// GET /broma16/releases/:id/push — статус пуша релиза (поля релиза + последний job).
broma16Router.get("/broma16/releases/:id/push", ...staff, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Некорректный id релиза" });
    return;
  }
  const [release] = await db
    .select({
      broma16ReleaseId: releasesTable.broma16ReleaseId,
      broma16ModerationStatus: releasesTable.broma16ModerationStatus,
      broma16PushedAt: releasesTable.broma16PushedAt,
      broma16LastError: releasesTable.broma16LastError,
      broma16DistributionOutlets: releasesTable.broma16DistributionOutlets,
    })
    .from(releasesTable)
    .where(eq(releasesTable.id, id))
    .limit(1);
  if (!release) {
    res.status(404).json({ error: "Релиз не найден" });
    return;
  }
  const [job] = await db
    .select({
      id: broma16PushJobsTable.id,
      status: broma16PushJobsTable.status,
      step: broma16PushJobsTable.step,
      attempts: broma16PushJobsTable.attempts,
      lastError: broma16PushJobsTable.lastError,
      updatedAt: broma16PushJobsTable.updatedAt,
    })
    .from(broma16PushJobsTable)
    .where(eq(broma16PushJobsTable.releaseId, id))
    .orderBy(desc(broma16PushJobsTable.createdAt))
    .limit(1);
  res.json({ release, job: job ?? null });
});

// POST /broma16/releases/:id/check-moderation — ручная проверка статуса модерации
// в Broma16 (та же логика, что у часового крона, но для одного релиза).
broma16Router.post("/broma16/releases/:id/check-moderation", ...staff, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Некорректный id релиза" });
    return;
  }
  const [release] = await db
    .select({
      id: releasesTable.id,
      broma16ReleaseId: releasesTable.broma16ReleaseId,
    })
    .from(releasesTable)
    .where(eq(releasesTable.id, id))
    .limit(1);
  if (!release) {
    res.status(404).json({ error: "Релиз не найден" });
    return;
  }
  if (!release.broma16ReleaseId) {
    res.status(409).json({ error: "Релиз ещё не отправлен в Broma16 — проверять модерацию нечего." });
    return;
  }
  try {
    const result = await checkReleaseModeration(id, { userId: req.session?.user?.id ?? null });
    res.json({ ok: true, ...result });
  } catch (e) {
    sendBroma16Error(res, e);
  }
});

export default broma16Router;
