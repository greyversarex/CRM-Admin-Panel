const GTIN_LENGTHS = new Set([8, 12, 13, 14]);

export type UpcValidationCode =
  | "invalid_format"
  | "invalid_length"
  | "invalid_check_digit";

export type UpcValidationResult =
  | { ok: true; value: string }
  | { ok: false; code: UpcValidationCode };

/**
 * UPC/EAN values are commonly pasted with spaces or hyphens. Strip only those
 * presentation separators; every other non-digit remains an explicit error.
 */
export function normalizeUpcInput(raw: string): string {
  return raw.trim().replace(/[-\s]/g, "");
}

/**
 * Validates the GS1 check digit for GTIN-8, UPC-A/GTIN-12, EAN-13 and GTIN-14.
 */
export function validateUpc(raw: string): UpcValidationResult {
  const value = normalizeUpcInput(raw);
  if (!/^\d+$/.test(value)) return { ok: false, code: "invalid_format" };
  if (!GTIN_LENGTHS.has(value.length)) return { ok: false, code: "invalid_length" };
  if (/^0+$/.test(value)) return { ok: false, code: "invalid_format" };

  const digits = [...value].map(Number);
  const suppliedCheckDigit = digits.pop()!;
  let sum = 0;

  for (let index = digits.length - 1, position = 0; index >= 0; index--, position++) {
    sum += digits[index] * (position % 2 === 0 ? 3 : 1);
  }

  const expectedCheckDigit = (10 - (sum % 10)) % 10;
  if (suppliedCheckDigit !== expectedCheckDigit) {
    return { ok: false, code: "invalid_check_digit" };
  }

  return { ok: true, value };
}

/**
 * A 12-digit UPC-A and the same code represented as EAN-13 with a leading zero
 * identify the same product. Query both forms to prevent duplicate transfers.
 */
export function equivalentUpcValues(upc: string): string[] {
  const values = new Set([upc]);
  if (upc.length === 12) values.add(`0${upc}`);
  if (upc.length === 13 && upc.startsWith("0")) values.add(upc.slice(1));
  return [...values];
}
