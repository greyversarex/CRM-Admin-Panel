import { db, platformSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireDigit: boolean;
  requireSpecial: boolean;
}

const DEFAULT_POLICY: PasswordPolicy = {
  minLength: 8,
  requireUppercase: false,
  requireLowercase: false,
  requireDigit: false,
  requireSpecial: false,
};

let cachedPolicy: { v: PasswordPolicy; at: number } | null = null;
const TTL_MS = 60_000;

export async function getPasswordPolicy(): Promise<PasswordPolicy> {
  if (cachedPolicy && Date.now() - cachedPolicy.at < TTL_MS) return cachedPolicy.v;
  try {
    const [row] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, "security"));
    const v = (row?.value ?? {}) as Record<string, unknown>;
    const policy: PasswordPolicy = {
      minLength: Number(v.passwordMinLength ?? DEFAULT_POLICY.minLength),
      requireUppercase: Boolean(v.passwordRequireUppercase ?? false),
      requireLowercase: Boolean(v.passwordRequireLowercase ?? false),
      requireDigit: Boolean(v.passwordRequireDigit ?? v.passwordRequireNumbers ?? false),
      requireSpecial: Boolean(v.passwordRequireSpecial ?? false),
    };
    cachedPolicy = { v: policy, at: Date.now() };
    return policy;
  } catch {
    return DEFAULT_POLICY;
  }
}

export function invalidatePasswordPolicyCache(): void {
  cachedPolicy = null;
}

export function validatePassword(pw: string, policy: PasswordPolicy): string | null {
  if (typeof pw !== "string" || pw.length < policy.minLength) {
    return `Пароль должен быть не короче ${policy.minLength} символов`;
  }
  if (policy.requireUppercase && !/[A-ZА-Я]/.test(pw)) return "Пароль должен содержать заглавную букву";
  if (policy.requireLowercase && !/[a-zа-я]/.test(pw)) return "Пароль должен содержать строчную букву";
  if (policy.requireDigit && !/[0-9]/.test(pw)) return "Пароль должен содержать цифру";
  if (policy.requireSpecial && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~]/.test(pw)) return "Пароль должен содержать спец-символ";
  return null;
}
