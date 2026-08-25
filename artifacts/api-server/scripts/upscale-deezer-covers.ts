/**
 * Поднимает размер обложек, притянутых при переносе каталога с Deezer.
 *
 * Deezer отдаёт `cover_xl` как 1000×1000, а Broma16 требует минимум
 * 1500×1500 — релизы, перенесённые раньше, лежат с картинкой, которую она не
 * примет. Размер зашит прямо в адрес, поэтому чиним подменой ссылки.
 *
 * Каждую новую ссылку проверяем на месте: если CDN не отдал картинку большего
 * размера, оставляем как было. Гадать нельзя — ссылка на обложку это то, что
 * увидит слушатель.
 *
 * Запуск: pnpm --filter api-server exec tsx scripts/upscale-deezer-covers.ts [--apply]
 */
import { db, releasesTable } from "@workspace/db";
import { eq, isNotNull } from "drizzle-orm";
import { upscaleCoverUrl } from "../src/lib/cover-url";
import { imageSize } from "../src/lib/image-size";

async function measure(url: string): Promise<string> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return `недоступна (HTTP ${res.status})`;
    const size = imageSize(Buffer.from(await res.arrayBuffer()));
    return size ? `${size.width}×${size.height}` : "размер не прочитался";
  } catch (err) {
    return `ошибка: ${err instanceof Error ? err.message.slice(0, 40) : "неизвестно"}`;
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const rows = await db
    .select({ id: releasesTable.id, title: releasesTable.title, coverUrl: releasesTable.coverUrl })
    .from(releasesTable)
    .where(isNotNull(releasesTable.coverUrl));

  let changed = 0;
  for (const r of rows) {
    const current = r.coverUrl ?? "";
    const bigger = upscaleCoverUrl(current);
    if (!bigger || bigger === current) continue;

    const wasSize = await measure(current);
    const nowSize = await measure(bigger);
    const better = /^(\d+)×/.exec(nowSize) && /^(\d+)×/.exec(wasSize)
      ? Number(/^(\d+)×/.exec(nowSize)![1]) > Number(/^(\d+)×/.exec(wasSize)![1])
      : false;

    console.log(`#${r.id} «${r.title}»: ${wasSize} → ${nowSize}${better ? "" : "  (не лучше, пропускаем)"}`);
    if (!better) continue;

    changed += 1;
    if (apply) {
      await db.update(releasesTable).set({ coverUrl: bigger }).where(eq(releasesTable.id, r.id));
    }
  }

  console.log(
    `\nОбложек к замене: ${changed}.` + (apply ? " Изменения записаны." : " Это предпросмотр — запустите с --apply."),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Не удалось:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
