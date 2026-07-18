import { db, artistsTable, releasesTable } from "@workspace/db";
import { eq, inArray, or } from "drizzle-orm";
import type { getDataScope } from "./auth";

type Scope = ReturnType<typeof getDataScope>;

/**
 * Единая проверка видимости релиза для текущего пользователя (fail-closed).
 * Для лейбла релиз «свой», если он привязан к лейблу напрямую (labelId) ИЛИ
 * принадлежит артисту этого лейбла — лейбл может выпускать релиз под чужим
 * импринтом (labelId другого лейбла), не теряя к нему доступ.
 */
export async function releaseInScope(
  scope: Scope,
  r: { artistId: number; labelId: number | null },
): Promise<boolean> {
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

/** ID артистов, принадлежащих лейблу. */
export async function labelArtistIds(labelId: number): Promise<number[]> {
  const rows = await db.select({ id: artistsTable.id }).from(artistsTable).where(eq(artistsTable.labelId, labelId));
  return rows.map((r) => r.id);
}

/**
 * drizzle-условие «релиз в scope лейбла»: прямой labelId ИЛИ артист лейбла.
 * Использовать в list/counts-запросах (AND-ится с остальными фильтрами).
 */
export async function labelReleaseScopeCondition(labelId: number) {
  const artistIds = await labelArtistIds(labelId);
  const parts: any[] = [eq(releasesTable.labelId, labelId)];
  if (artistIds.length > 0) parts.push(inArray(releasesTable.artistId, artistIds));
  return or(...parts);
}
