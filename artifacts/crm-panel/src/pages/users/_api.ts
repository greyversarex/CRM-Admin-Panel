// Локальная fetch-обёртка для эндпоинтов, которых нет в OpenAPI:
// /api/signup-requests, /api/admin/kyc/*, /api/audit, ...
//
// Тот же паттерн, что и в pages/crm/index.tsx — credentials: same-origin,
// JSON по умолчанию, кидает ошибку с серверным message.
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      msg = j?.error ?? j?.message ?? msg;
    } catch { /* noop */ }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
