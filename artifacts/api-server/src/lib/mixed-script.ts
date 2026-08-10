/**
 * Поиск смешанных алфавитов в названиях.
 *
 * Кириллические «с о е а р х у» неотличимы на вид от латинских «c o e a p x y»,
 * и одна такая буква, случайно набранная не в той раскладке, делает два
 * одинаковых на вид названия разными для любой системы. Живой случай: релиз
 * «Oсhai Khushruyum» с кириллической «с» во второй позиции — Broma16 отклонила
 * отправку с «title: does not match», и увидеть причину глазами было нельзя.
 *
 * Мы не запрещаем смешение вообще: «Дуня feat. DJ Smash» — нормальное название.
 * Подозрительно другое — когда буквы разных алфавитов стоят внутри одного слова.
 */

const CYRILLIC = /\p{Script=Cyrillic}/u;
const LATIN = /\p{Script=Latin}/u;

export type MixedScriptFinding = {
  /** Слово, в котором смешаны алфавиты. */
  word: string;
  /** Номер слова в строке, чтобы человек нашёл его глазами. */
  position: number;
  /** Буквы-нарушители: те, что в меньшинстве внутри слова. */
  chars: string[];
};

/**
 * Возвращает слова, где кириллица и латиница смешаны внутри одного слова.
 * Пустой массив — всё чисто.
 */
export function findMixedScriptWords(value: string | null | undefined): MixedScriptFinding[] {
  const text = (value ?? "").trim();
  if (!text) return [];

  const findings: MixedScriptFinding[] = [];

  text.split(/\s+/).forEach((word, index) => {
    const letters = [...word].filter((ch) => CYRILLIC.test(ch) || LATIN.test(ch));
    if (letters.length === 0) return;
    const cyrillic = letters.filter((ch) => CYRILLIC.test(ch));
    const latin = letters.filter((ch) => LATIN.test(ch));
    if (cyrillic.length === 0 || latin.length === 0) return;

    // Нарушители — буквы того алфавита, которых меньше: именно они, скорее
    // всего, набраны по ошибке.
    const minority = cyrillic.length <= latin.length ? cyrillic : latin;
    findings.push({ word, position: index + 1, chars: [...new Set(minority)] });
  });

  return findings;
}

/** Готовое сообщение для оператора, или null если смешения нет. */
export function describeMixedScript(label: string, value: string | null | undefined): string | null {
  const findings = findMixedScriptWords(value);
  if (findings.length === 0) return null;
  const parts = findings.map((f) => `«${f.word}» (${f.chars.map((c) => `«${c}»`).join(", ")})`);
  return (
    `${label}: в одном слове смешаны кириллица и латиница — ${parts.join(", ")}. ` +
    `Такие буквы выглядят одинаково, но для площадок это разные символы. ` +
    `Наберите слово заново в одной раскладке.`
  );
}
