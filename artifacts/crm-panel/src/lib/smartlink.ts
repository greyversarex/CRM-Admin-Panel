/**
 * Общие типы и помощники смартлинков для панели управления.
 *
 * Справочник витрин (подписи, цвета, домены) НЕ дублируется здесь: он живёт на
 * сервере и приходит через `/api/marketing/smartlink-outlets`. Иначе таблица
 * брендов расходится между редактором и публичной страницей, и площадка
 * называется по-разному в двух местах.
 */
import { useQuery } from "@tanstack/react-query";

export type OutletAction = "listen" | "buy";

export type OutletInfo = {
  key: string;
  label: string;
  color: string;
  action: OutletAction;
  hosts: string[];
};

export type Dsp = {
  name: string;
  url: string;
  active: boolean;
  action?: OutletAction;
};

export type Social = { name: string; url: string };

export type SmartLinkDto = {
  id: number;
  title: string;
  artist: string;
  slug: string;
  clicks: number;
  views: number;
  clicksByDsp: Record<string, number>;
  topPlatform: string;
  dsps: Dsp[];
  socials: Social[];
  socialsEnabled: boolean;
  theme: string;
  isActive: boolean;
  releaseId: number | null;
  coverUrl: string | null;
  releaseDate: string | null;
  createdAt: string;
};

/** Справочник витрин. Кэшируется надолго — он меняется только с релизом кода. */
export function useSmartlinkOutlets() {
  return useQuery({
    queryKey: ["smartlink-outlets"],
    queryFn: async (): Promise<OutletInfo[]> => {
      const r = await fetch("/api/marketing/smartlink-outlets", { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<OutletInfo[]>;
    },
    staleTime: 60 * 60 * 1000,
  });
}

/** Описание витрины по ключу. Незнакомая площадка описывает себя сама. */
export function outletInfo(outlets: OutletInfo[], key: string): OutletInfo {
  const found = outlets.find((o) => o.key === key.toLowerCase());
  if (found) return found;
  return {
    key,
    label: key ? key.charAt(0).toUpperCase() + key.slice(1).replace(/[_-]+/g, " ") : "Площадка",
    color: "#8b8b8b",
    action: "listen",
    hosts: [],
  };
}

/**
 * Угадывает витрину по вставленному адресу.
 *
 * Сначала сверяем самые длинные домены, иначе `music.apple.com` совпал бы
 * с `apple.com` и Apple Music стал бы iTunes.
 */
export function detectOutlet(outlets: OutletInfo[], url: string): OutletInfo | null {
  let host: string;
  try {
    host = new URL(url.trim()).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  const candidates = outlets
    .flatMap((o) => o.hosts.map((h) => ({ outlet: o, host: h })))
    .sort((a, b) => b.host.length - a.host.length);

  for (const c of candidates) {
    if (host === c.host || host.endsWith(`.${c.host}`)) return c.outlet;
  }
  return null;
}
