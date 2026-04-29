/**
 * Тонкий fetch-обёртка для admin-панели: возвращает JSON или бросает ошибку
 * с текстом из тела ответа. Используется новыми вкладками (commissions,
 * payment-rules, ACR, UGC, alerts, conflicts, freeze, channels и т.д.).
 */
export async function adminApi<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    credentials: "same-origin",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  if (!r.ok) {
    let m = `HTTP ${r.status}`;
    try {
      const j = await r.json() as { error?: string; message?: string };
      m = j.message ?? j.error ?? m;
    } catch { /* keep status */ }
    throw new Error(m);
  }
  return r.json() as Promise<T>;
}

export function fmtMoney(n: number, currency = "USD"): string {
  if (!Number.isFinite(n)) return "0";
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
}

export function fmtDate(s: string | Date | null | undefined): string {
  if (!s) return "—";
  const d = typeof s === "string" ? new Date(s) : s;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}
