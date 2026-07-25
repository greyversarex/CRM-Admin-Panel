/**
 * SSRF-guard для внешних audio_url.
 *
 * Мы качаем аудио по URL, который лежит в БД, а значит его в принципе можно
 * подменить на внутренний адрес VPS. Поэтому любой исходящий запрос за аудио
 * обязан пройти через assertSafeAudioUrl.
 *
 * Важно: проверка делается ПЕРЕД КАЖДЫМ запросом, а не один раз на трек.
 * Между двумя запросами DNS может смениться (DNS-rebinding / TOCTOU), поэтому
 * повторная валидация — не паранойя, а необходимость.
 */

/** 10/8, 127/8, 0/8, 169.254/16, 172.16/12, 192.168/16, 100.64/10 + мусор. */
export function isPrivateIPv4(ip: string): boolean {
  const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const o = m.slice(1).map((s) => parseInt(s, 10));
  if (o.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  if (o[0] === 10) return true;
  if (o[0] === 127) return true;
  if (o[0] === 0) return true;
  if (o[0] === 169 && o[1] === 254) return true;
  if (o[0] === 172 && (o[1] ?? 0) >= 16 && (o[1] ?? 0) <= 31) return true;
  if (o[0] === 192 && o[1] === 168) return true;
  if (o[0] === 100 && (o[1] ?? 0) >= 64 && (o[1] ?? 0) <= 127) return true;
  return false;
}

/** Бросает Error при любом подозрении. Возвращает разобранный URL. */
export async function assertSafeAudioUrl(audioUrl: string): Promise<URL> {
  let u: URL;
  try { u = new URL(audioUrl); } catch { throw new Error("invalid_audio_url"); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`scheme_not_allowed:${u.protocol}`);
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("internal_host_not_allowed");
  }
  if (host.includes(":")) throw new Error("ipv6_not_allowed");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    if (isPrivateIPv4(host)) throw new Error(`private_ip_not_allowed:${host}`);
  } else {
    const { lookup } = await import("dns/promises");
    const records = await lookup(host, { all: true }).catch(() => [] as Array<{ address: string; family: number }>);
    if (records.length === 0) throw new Error("dns_resolve_failed");
    for (const r of records) {
      if (r.family === 6) throw new Error("ipv6_resolution_not_allowed");
      if (isPrivateIPv4(r.address)) throw new Error(`private_ip_not_allowed:${r.address}`);
    }
  }
  return u;
}
