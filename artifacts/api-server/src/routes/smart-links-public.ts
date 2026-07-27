/**
 * Публичная страница смартлинка — единственная часть CRM без авторизации.
 *
 * Смартлинк по своей природе открывают слушатели: ссылка расходится по соцсетям
 * и должна работать у человека без аккаунта. Поэтому роутер монтируется ДО
 * `requireAuth` и отдаёт строго ограниченный набор данных: название, артист,
 * обложка, витрины. Ничего из внутренней кухни каталога сюда не попадает.
 *
 * Эндпоинты:
 *   GET  /public/smartlinks/:slug          — данные страницы (+1 просмотр)
 *   GET  /public/smartlinks/:slug/cover    — обложка картинкой
 *   GET  /public/smartlinks/:slug/qr.svg   — QR-код на саму страницу
 *   POST /public/smartlinks/:slug/click    — учёт перехода на витрину
 */

import { Router, type IRouter } from "express";
import QRCode from "qrcode";
import { sql, eq } from "drizzle-orm";
import { db, smartLinksTable } from "@workspace/db";
import type { SmartLinkDsp, SmartLinkSocial } from "@workspace/db";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { outletInfo } from "../lib/smartlink-outlets";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const storage = new ObjectStorageService();

/** Активная ссылка по slug. Выключенной для публики не существует. */
async function findPublic(slug: string) {
  const [row] = await db.select().from(smartLinksTable).where(eq(smartLinksTable.slug, slug));
  if (!row || !row.isActive) return null;
  return row;
}

/** Полный адрес страницы — нужен и QR-коду, и кнопке «поделиться». */
function publicUrl(req: { protocol: string; get(h: string): string | undefined }, slug: string): string {
  const proto = req.get("x-forwarded-proto")?.split(",")[0]?.trim() || req.protocol;
  const host = req.get("x-forwarded-host")?.split(",")[0]?.trim() || req.get("host") || "";
  return `${proto}://${host}/l/${encodeURIComponent(slug)}`;
}

router.get("/public/smartlinks/:slug", async (req, res): Promise<void> => {
  const row = await findPublic(req.params.slug);
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  // Счётчик просмотров не должен ломать выдачу страницы, поэтому не ждём его
  // и глушим ошибку: слушателю важна страница, а не наша аналитика.
  void db.update(smartLinksTable)
    .set({ views: sql`${smartLinksTable.views} + 1` })
    .where(eq(smartLinksTable.id, row.id))
    .catch((err) => logger.warn({ err, slug: row.slug }, "[smartlink] view counter failed"));

  const dsps = ((row.dsps ?? []) as SmartLinkDsp[])
    .filter((d) => d.active && /^https?:\/\//i.test(d.url))
    .map((d) => {
      const info = outletInfo(d.name);
      return {
        key: d.name,
        label: info.label,
        color: info.color,
        action: d.action ?? info.action,
        url: d.url,
      };
    });

  res.set("Cache-Control", "public, max-age=60");
  res.json({
    title: row.title,
    artist: row.artistName,
    slug: row.slug,
    theme: row.theme === "dark" ? "dark" : "light",
    coverUrl: row.coverUrl ? `/api/public/smartlinks/${encodeURIComponent(row.slug)}/cover` : null,
    pageUrl: publicUrl(req, row.slug),
    dsps,
    socials: row.socialsEnabled ? ((row.socials ?? []) as SmartLinkSocial[]) : [],
  });
});

router.get("/public/smartlinks/:slug/cover", async (req, res): Promise<void> => {
  const row = await findPublic(req.params.slug);
  if (!row?.coverUrl) { res.status(404).json({ error: "Not found" }); return; }

  try {
    const file = await storage.getObjectEntityFile(row.coverUrl);
    const [meta] = await file.getMetadata();
    res.setHeader("Content-Type", (meta.contentType as string) || "image/jpeg");
    // Обложка неизменна для конкретной ссылки — пусть кэшируется надолго.
    res.setHeader("Cache-Control", "public, max-age=86400");
    file.createReadStream().on("error", () => res.destroy()).pipe(res);
  } catch (err) {
    if (err instanceof ObjectNotFoundError) { res.status(404).json({ error: "Cover missing" }); return; }
    throw err;
  }
});

router.get("/public/smartlinks/:slug/qr.svg", async (req, res): Promise<void> => {
  const row = await findPublic(req.params.slug);
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  const svg = await QRCode.toString(publicUrl(req, row.slug), {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#000000ff", light: "#ffffffff" },
  });

  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(svg);
});

router.post("/public/smartlinks/:slug/click", async (req, res): Promise<void> => {
  const row = await findPublic(req.params.slug);
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  const dsp = typeof req.body?.dsp === "string" ? req.body.dsp.trim().slice(0, 64) : "";
  // Считаем только витрины, которые реально есть на странице: иначе счётчик
  // накручивается любым POST'ом с произвольным названием.
  const known = ((row.dsps ?? []) as SmartLinkDsp[]).some((d) => d.name === dsp && d.active);
  if (!dsp || !known) { res.status(400).json({ error: "Unknown outlet" }); return; }

  const byDsp = { ...((row.clicksByDsp ?? {}) as Record<string, number>) };
  byDsp[dsp] = (byDsp[dsp] ?? 0) + 1;

  await db.update(smartLinksTable)
    .set({
      clicks: sql`${smartLinksTable.clicks} + 1`,
      clicksByDsp: byDsp,
      topPlatform: Object.entries(byDsp).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    })
    .where(eq(smartLinksTable.id, row.id));

  res.json({ ok: true });
});

export default router;
