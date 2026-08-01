import assert from "node:assert/strict";
import test from "node:test";
import { isZip, readZipEntries } from "./zip";

/**
 * Настоящий ZIP, собранный сторонним архиватором (PowerShell Compress-Archive),
 * а не нашим же кодом — иначе тест проверял бы сам себя. Внутри два файла:
 * week1.csv со шапкой отчёта Broma16 и пустой week2.csv (в реальных выгрузках
 * большинство недельных файлов пустые).
 */
const FIXTURE_BASE64 =
  "UEsDBBQAAAAIAPWkAV1C5iWgowAAAN4AAAAJAAAAd2VlazEuY3N2bczNCoJQEAXgfdA7+AAj6DWVloWr" +
  "iCCwRW1k1IkGf27MHQmfrUWP1CskBOGi3eEczvd+vmpUAjtoSwqCj0J5iqAkwmplLCpbE9xJrlY6EgdC" +
  "LaGjoseOgJ1U4FQIO7cwgUn8IPXDGMYJHEqCDMXLscWSvYxr7NnLB9ic4Iyu4x7/78fLPj6YZB2tTAzR" +
  "nFVu1DawxZsVyHc/5lvMfgmE6XLxAVBLAwQUAAAACAD1pAFd9kCsPQcAAAAFAAAACQAAAHdlZWsyLmNz" +
  "dnu/ez8vFwBQSwECFAAUAAAACAD1pAFdQuYloKMAAADeAAAACQAAAAAAAAAAAAAAAAAAAAAAd2VlazEu" +
  "Y3N2UEsBAhQAFAAAAAgA9aQBXfZArD0HAAAABQAAAAkAAAAAAAAAAAAAAAAAygAAAHdlZWsyLmNzdlBL" +
  "BQYAAAAAAgACAG4AAAD4AAAAAAA=";

const fixture = Buffer.from(FIXTURE_BASE64, "base64");

test("isZip распознаёт архив и отвергает всё остальное", () => {
  assert.equal(isZip(fixture), true);
  assert.equal(isZip(Buffer.from("date,outlet,streams\n")), false);
  assert.equal(isZip(Buffer.alloc(0)), false);
});

test("readZipEntries достаёт все файлы архива с их содержимым", () => {
  const entries = readZipEntries(fixture);
  assert.deepEqual(
    entries.map((e) => e.name).sort(),
    ["week1.csv", "week2.csv"],
  );

  const week1 = entries.find((e) => e.name === "week1.csv");
  assert.ok(week1);
  const raw = week1.data.toString("utf8");
  // Broma16 отдаёт CSV с BOM — он остаётся в данных, срезать его должен вызывающий.
  assert.ok(raw.startsWith("﻿"), "ожидался BOM в начале файла");
  const text = raw.replace(/^﻿/, "");
  assert.match(text, /^date,outlet,raw_title,territory_code,performers,release_name,isrc,streams/);
  assert.match(text, /QZL5N2693425/);
  // Deflate распакован корректно: содержимое длиннее сжатой записи.
  assert.ok(week1.data.length > 200);
});

test("readZipEntries не падает на данных, которые не являются архивом", () => {
  assert.throws(() => readZipEntries(Buffer.from("PK totally not a zip")), /ZIP/);
});
