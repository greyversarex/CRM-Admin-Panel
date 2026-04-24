// ─── KYC / Bank / Tax утилиты ─────────────────────────────────────────────
// Маскирование чувствительных полей перед отдачей не-админам, генерация
// временных паролей, базовая валидация IBAN/SWIFT.
import { randomFillSync } from "crypto";

const SAFE_PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/**
 * 12-значный буквенно-цифровой пароль без двусмысленных символов (0/O, 1/l/I).
 * Используется при approve заявки signup — пользователь сменит его при первом входе.
 */
export function generateTempPassword(length = 12): string {
  const bytes = new Uint8Array(length);
  randomFillSync(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += SAFE_PASSWORD_CHARS[bytes[i] % SAFE_PASSWORD_CHARS.length];
  }
  return out;
}

/**
 * Маска для номера счёта: оставляем последние 4 цифры, остальное скрываем.
 *   "12345678901234" → "**********1234"
 *   "1234"           → "****1234"
 *   ""/null          → null
 */
export function maskAccount(s: string | null | undefined): string | null {
  if (!s) return null;
  const trimmed = s.replace(/\s+/g, "");
  if (trimmed.length <= 4) return `****${trimmed}`;
  return `${"*".repeat(Math.min(trimmed.length - 4, 12))}${trimmed.slice(-4)}`;
}

// Базовая валидация IBAN: 15-34 alphanumeric, начинается с 2 буквенных символов
// (ISO-3166 код страны) + 2 контрольные цифры. Полную mod-97 проверку не делаем
// — это всё равно ловит большинство опечаток и подходит для MVP.
export function isValidIban(s: string): boolean {
  const cleaned = s.replace(/\s+/g, "").toUpperCase();
  return /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(cleaned);
}

// SWIFT/BIC: 8 или 11 символов, формат AAAA BB CC [DDD]
export function isValidSwift(s: string): boolean {
  const cleaned = s.replace(/\s+/g, "").toUpperCase();
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(cleaned);
}

/**
 * Очистка bank-полей пользователя для отдачи в API.
 *   - админ/менеджер: возвращаем всё как есть
 *   - сам юзер / другие роли: account_number и iban маскируются
 */
export interface BankInfoFields {
  bankName: string | null;
  bankAccountNumber: string | null;
  bankSwift: string | null;
  bankIban: string | null;
  bankHolderName: string | null;
  bankCountry: string | null;
}

export function maskBankInfoFor(
  bank: BankInfoFields,
  viewerRole: "admin" | "manager" | "label" | "artist",
): BankInfoFields {
  if (viewerRole === "admin" || viewerRole === "manager") return bank;
  return {
    ...bank,
    bankAccountNumber: maskAccount(bank.bankAccountNumber),
    bankIban: maskAccount(bank.bankIban),
  };
}
