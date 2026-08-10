/**
 * Проверка имени автора произведения.
 *
 * Авторов регистрируют в авторских обществах, а те работают с юридическими
 * именами: «Austin Post», а не «Post Malone». Одного слова недостаточно —
 * общество не отличит одного «Иванова» от другого и не сможет начислить
 * отчисления. К исполнителям это не относится: «Yasmina» как сценическое имя
 * абсолютно нормально.
 *
 * Что мы поймать не можем: псевдоним из двух слов («Rain 104») выглядит как
 * обычное имя. Проверка ловит только явный случай — одно слово.
 */

/**
 * Отраслевые обозначения вместо конкретного автора. Ставятся, когда автор
 * неизвестен или произведение перешло в общественное достояние, и являются
 * законными значениями — блокировать их нельзя.
 */
const PLACEHOLDERS = new Set([
  "copyright control",
  "traditional",
  "trad",
  "public domain",
  "d.p.",
  "dp",
  "unknown",
  "народная",
  "фольклор",
]);

export type WriterNameCheck = { ok: true } | { ok: false; reason: string };

export function checkWriterName(rawName: string | null | undefined): WriterNameCheck {
  const name = (rawName ?? "").trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, reason: "имя не указано" };

  if (PLACEHOLDERS.has(name.toLowerCase())) return { ok: true };

  // Дефис соединяет части одного имени («Жан-Клод»), поэтому считаем слова
  // по пробелам, а не по любым разделителям.
  const parts = name.split(" ").filter((p) => /\p{Letter}/u.test(p));
  if (parts.length < 2) {
    return {
      ok: false,
      reason:
        `«${name}» — только одно слово. Автора нужно указывать настоящими именем и фамилией ` +
        `(например «Austin Post», а не «Post Malone»): под этим именем произведение регистрируется ` +
        `в авторском обществе. Если автор неизвестен, укажите «Traditional» или «Copyright Control».`,
    };
  }

  return { ok: true };
}
