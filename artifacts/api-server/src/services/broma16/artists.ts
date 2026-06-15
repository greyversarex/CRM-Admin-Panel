/**
 * Синхронизация артистов с Broma16 (ROD API).
 *
 * Перед созданием релиза каждый исполнитель должен существовать в Broma16.
 * Логика: сначала ищем по имени (searche), при точном совпадении берём его id,
 * иначе создаём нового. Полученный UUID сохраняем в artists.broma16_artist_id,
 * чтобы не дублировать при повторных пушах.
 */

import { db } from "@workspace/db";
import { artistsTable, type Artist } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../../lib/logger";
import { Broma16ApiError } from "./errors";
import { createBroma16Client, type Broma16Client } from "./client";

function normName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function extractList(data: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(data)) return data as Array<Record<string, unknown>>;
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of ["items", "data", "list", "results", "artists"]) {
      if (Array.isArray(obj[key])) return obj[key] as Array<Record<string, unknown>>;
    }
  }
  return [];
}

function pickArtistId(item: Record<string, unknown>): string | null {
  const id = item.id ?? item.artist_id ?? item.artistId ?? item.uuid ?? item.h11 ?? item.artist_h11;
  return id != null ? String(id) : null;
}

function pickArtistName(item: Record<string, unknown>): string {
  return String(item.name ?? item.title ?? item.artist_name ?? "");
}

/** Ищет артиста по имени; возвращает id при точном совпадении. */
async function searchArtist(
  accountId: string,
  name: string,
  client: Broma16Client,
): Promise<string | null> {
  const data = await client.request<unknown>("GET", `/account/${accountId}/artist/searche`, {
    query: { searche: name },
  });
  const list = extractList(data);
  const target = normName(name);
  const exact = list.find((it) => normName(pickArtistName(it)) === target);
  if (exact) return pickArtistId(exact);
  return null;
}

/** Создаёт артиста в Broma16, возвращает его id. */
async function createArtist(accountId: string, artist: Artist, client: Broma16Client): Promise<string> {
  const parts = artist.name.trim().split(/\s+/);
  const body: Record<string, unknown> = { name: artist.name.trim() };
  if (parts.length > 1) {
    body.first_name = parts[0];
    body.last_name = parts.slice(1).join(" ");
  }
  if (artist.ipiNameNumber) body.ipi_name_number = artist.ipiNameNumber;
  if (artist.isni) body.isni = artist.isni;
  const data = await client.request<unknown>("POST", `/account/${accountId}/artist/`, { body });
  const id =
    (data && typeof data === "object" ? pickArtistId(data as Record<string, unknown>) : null) ??
    (typeof data === "string" || typeof data === "number" ? String(data) : null);
  if (!id) throw new Broma16ApiError(0, `Broma16: не удалось получить id созданного артиста «${artist.name}»`);
  return id;
}

/**
 * Гарантирует наличие артиста в Broma16 и возвращает его id.
 * Идемпотентно: если broma16_artist_id уже сохранён — сразу возвращает его.
 */
export async function ensureArtistSynced(
  artist: Artist,
  accountId: string,
  client: Broma16Client,
): Promise<string> {
  if (artist.broma16ArtistId) return artist.broma16ArtistId;

  let broma16Id = await searchArtist(accountId, artist.name, client);
  if (broma16Id) {
    logger.info({ artistId: artist.id, name: artist.name }, "[broma16] артист найден поиском");
  } else {
    broma16Id = await createArtist(accountId, artist, client);
    logger.info({ artistId: artist.id, name: artist.name }, "[broma16] артист создан");
  }

  await db
    .update(artistsTable)
    .set({ broma16ArtistId: broma16Id })
    .where(eq(artistsTable.id, artist.id));
  return broma16Id;
}

/** Синхронизирует артиста по нашему id (для роутов/ручного запуска). */
export async function syncArtist(artistId: number): Promise<{ artistId: number; broma16ArtistId: string }> {
  const [artist] = await db.select().from(artistsTable).where(eq(artistsTable.id, artistId)).limit(1);
  if (!artist) throw new Broma16ApiError(404, `Артист #${artistId} не найден`);
  const client = await createBroma16Client();
  const accountId = await client.getAccountId();
  const broma16ArtistId = await ensureArtistSynced(artist, accountId, client);
  return { artistId, broma16ArtistId };
}
