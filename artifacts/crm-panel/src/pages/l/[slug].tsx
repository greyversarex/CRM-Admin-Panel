/**
 * Публичная страница смартлинка — `/l/:slug`.
 *
 * Единственный экран CRM, который открывают посторонние люди: ссылка расходится
 * по соцсетям, и у зрителя нет ни аккаунта, ни представления о том, что такое
 * дистрибуция. Поэтому здесь нет ни навигации, ни Layout — только обложка,
 * название и кнопки витрин.
 *
 * Тема (светлая/тёмная) задаётся в редакторе и не зависит от темы панели:
 * страницу оформляет лейбл под свой релиз, а не пользователь под свой браузер.
 */
import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Share2, ChevronDown, Check, Music2 } from "lucide-react";

type PublicDsp = {
  key: string;
  label: string;
  color: string;
  action: "listen" | "buy";
  url: string;
};

type PublicSmartLink = {
  title: string;
  artist: string;
  slug: string;
  theme: "light" | "dark";
  coverUrl: string | null;
  pageUrl: string;
  dsps: PublicDsp[];
  socials: { name: string; url: string }[];
};

/** Логотип витрины кружком её фирменного цвета — иконок площадок у нас нет. */
function OutletDot({ color, label }: { color: string; label: string }) {
  return (
    <span
      className="h-9 w-9 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold"
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {label.charAt(0).toUpperCase()}
    </span>
  );
}

export default function SmartLinkPage() {
  const [, params] = useRoute("/l/:slug");
  const slug = params?.slug ?? "";
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["public-smartlink", slug],
    queryFn: async (): Promise<PublicSmartLink> => {
      const r = await fetch(`/api/public/smartlinks/${encodeURIComponent(slug)}`);
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<PublicSmartLink>;
    },
    enabled: slug !== "",
    retry: false,
  });

  // Заголовок вкладки — то, чем страница подписывается в закладках и истории.
  useEffect(() => {
    if (data) document.title = `${data.artist} — ${data.title}`;
  }, [data]);

  const dark = data?.theme === "dark";

  /**
   * Переход на витрину.
   *
   * Клик сначала регистрируем через `sendBeacon` — он переживает уход со
   * страницы, в отличие от обычного fetch, который браузер отменит. Ссылка при
   * этом остаётся обычным <a>: переход не должен зависеть от того, дошла
   * ли аналитика.
   */
  function trackClick(dspKey: string) {
    const url = `/api/public/smartlinks/${encodeURIComponent(slug)}/click`;
    const payload = JSON.stringify({ dsp: dspKey });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
        return;
      }
    } catch { /* провалимся в fetch ниже */ }
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => undefined);
  }

  function share() {
    const url = data?.pageUrl ?? window.location.href;
    if (navigator.share) {
      void navigator.share({ title: `${data?.artist} — ${data?.title}`, url }).catch(() => undefined);
      return;
    }
    navigator.clipboard.writeText(url)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => undefined);
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-100">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-neutral-100 text-neutral-600 px-6 text-center">
        <Music2 className="h-10 w-10 text-neutral-300" />
        <h1 className="text-lg font-semibold text-neutral-800">Страница не найдена</h1>
        <p className="text-sm">Возможно, ссылка устарела или её удалили.</p>
      </div>
    );
  }

  const cover = data.coverUrl;

  return (
    <div className={`min-h-screen relative ${dark ? "bg-neutral-950" : "bg-neutral-100"}`}>
      {/* Размытая обложка фоном — как в референсе. */}
      {cover && (
        <div className="absolute inset-0 overflow-hidden">
          <img src={cover} alt="" aria-hidden className="w-full h-full object-cover scale-110 blur-2xl opacity-60" />
          <div className={`absolute inset-0 ${dark ? "bg-black/60" : "bg-white/40"}`} />
        </div>
      )}

      <div className="relative flex flex-col items-center px-4 py-8 min-h-screen">
        <div
          className={`w-full max-w-[420px] rounded-2xl overflow-hidden shadow-2xl ${
            dark ? "bg-neutral-900 text-neutral-100" : "bg-white text-neutral-900"
          }`}
        >
          {cover ? (
            <img src={cover} alt={`${data.title} — обложка`} className="w-full aspect-square object-cover" />
          ) : (
            <div className={`w-full aspect-square flex items-center justify-center ${dark ? "bg-neutral-800" : "bg-neutral-200"}`}>
              <Music2 className="h-16 w-16 opacity-30" />
            </div>
          )}

          <div className={`flex items-center justify-between gap-3 px-5 py-4 border-b ${dark ? "border-white/10" : "border-black/5"}`}>
            <div className="min-w-0">
              <div className="text-lg font-semibold truncate">{data.artist}</div>
              <div className={`text-sm truncate ${dark ? "text-neutral-400" : "text-neutral-500"}`}>{data.title}</div>
            </div>
            <button
              onClick={share}
              title="Поделиться"
              aria-label="Поделиться"
              className={`h-9 w-9 rounded-full shrink-0 flex items-center justify-center transition-colors ${
                dark ? "bg-white/10 hover:bg-white/20" : "bg-black/5 hover:bg-black/10"
              }`}
            >
              {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Share2 className="h-4 w-4" />}
            </button>
          </div>

          {data.dsps.length === 0 ? (
            <div className={`px-5 py-8 text-center text-sm ${dark ? "text-neutral-400" : "text-neutral-500"}`}>
              Витрины ещё не добавлены.
            </div>
          ) : (
            <div className={`divide-y ${dark ? "divide-white/10" : "divide-black/5"}`}>
              {data.dsps.map((d) => (
                <a
                  key={d.key}
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackClick(d.key)}
                  data-testid={`smartlink-outlet-${d.key}`}
                  className={`flex items-center gap-3 px-5 py-3 transition-colors ${
                    dark ? "hover:bg-white/5" : "hover:bg-black/[0.03]"
                  }`}
                >
                  <OutletDot color={d.color} label={d.label} />
                  <span className="flex-1 text-sm font-medium truncate">{d.label}</span>
                  <span className="px-4 py-1.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shrink-0 transition-colors">
                    {d.action === "buy" ? "Купить" : "Слушать"}
                  </span>
                </a>
              ))}
            </div>
          )}

          {data.socials.length > 0 && (
            <div className={`px-5 py-4 border-t flex flex-wrap gap-2 ${dark ? "border-white/10" : "border-black/5"}`}>
              {data.socials.map((s) => (
                <a
                  key={s.url}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    dark ? "bg-white/10 hover:bg-white/20" : "bg-black/5 hover:bg-black/10"
                  }`}
                >
                  {s.name}
                </a>
              ))}
            </div>
          )}

          <button
            onClick={() => setQrOpen((v) => !v)}
            className={`w-full flex items-center justify-between px-5 py-4 border-t text-sm font-medium transition-colors ${
              dark ? "border-white/10 hover:bg-white/5" : "border-black/5 hover:bg-black/[0.03]"
            }`}
            aria-expanded={qrOpen}
          >
            QR-код
            <ChevronDown className={`h-4 w-4 transition-transform ${qrOpen ? "rotate-180" : ""}`} />
          </button>
          {qrOpen && (
            <div className="px-5 pb-5 flex flex-col items-center gap-2">
              <img
                src={`/api/public/smartlinks/${encodeURIComponent(slug)}/qr.svg`}
                alt="QR-код на эту страницу"
                className="w-44 h-44 rounded-lg bg-white p-2"
              />
              <p className={`text-[11px] text-center ${dark ? "text-neutral-400" : "text-neutral-500"}`}>
                Наведите камеру телефона — откроется эта страница.
                Годится для афиш и сторис.
              </p>
            </div>
          )}
        </div>

        <p className={`mt-6 text-[11px] ${dark ? "text-neutral-500" : "text-neutral-400"}`}>
          Tajik Music
        </p>
      </div>
    </div>
  );
}
