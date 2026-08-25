/**
 * Разносит идентификаторы Broma16 по своим колонкам.
 *
 * Импорт каталога раньше писал идентификатор записи каталога
 * (/accounts/{id}/assets) в broma16_release_id — туда же, где лежит номер
 * черновика репертуара. Из-за этого повторная отправка такого релиза уходила
 * PUT'ом на несуществующий черновик и получала 404.
 *
 * Скрипт спрашивает саму Broma16: если по идентификатору есть черновик
 * репертуара — оставляем как есть; если нет — это запись каталога, переносим
 * в broma16_asset_id. Гадать по виду числа нельзя, пространства номеров
 * пересекаются.
 *
 * Запуск: pnpm --filter api-server exec tsx scripts/repair-broma16-ids.ts [--apply]
 * Без --apply только показывает, что сделал бы.
 */
import { db, releasesTable } from "@workspace/db";
import { eq, isNotNull } from "drizzle-orm";
import { createBroma16Client } from "../src/services/broma16/client";

async function main() {
  const apply = process.argv.includes("--apply");
  const rows = await db
    .select({
      id: releasesTable.id,
      title: releasesTable.title,
      releaseId: releasesTable.broma16ReleaseId,
      assetId: releasesTable.broma16AssetId,
    })
    .from(releasesTable)
    .where(isNotNull(releasesTable.broma16ReleaseId));

  if (rows.length === 0) {
    console.log("Релизов с идентификатором Broma16 нет — чинить нечего.");
    return;
  }

  const client = await createBroma16Client();
  let moved = 0;
  let kept = 0;

  for (const r of rows) {
    let isDraft = false;
    try {
      await client.request("GET", `/repertoire/release/${r.releaseId}/data`, {});
      isDraft = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!/404/.test(message)) {
        console.log(`#${r.id} «${r.title}»: Broma16 ответила «${message.slice(0, 60)}» — пропускаем, чтобы не гадать.`);
        continue;
      }
    }

    if (isDraft) {
      kept += 1;
      console.log(`#${r.id} «${r.title}»: ${r.releaseId} — черновик репертуара, оставляем.`);
      continue;
    }

    moved += 1;
    console.log(`#${r.id} «${r.title}»: ${r.releaseId} — запись каталога, переносим в broma16_asset_id.`);
    if (apply) {
      await db
        .update(releasesTable)
        .set({ broma16AssetId: r.assetId ?? r.releaseId, broma16ReleaseId: null })
        .where(eq(releasesTable.id, r.id));
    }
  }

  console.log(
    `\nИтого: черновиков ${kept}, записей каталога ${moved}.` +
    (apply ? " Изменения записаны." : " Это предпросмотр — запустите с --apply."),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Не удалось:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
