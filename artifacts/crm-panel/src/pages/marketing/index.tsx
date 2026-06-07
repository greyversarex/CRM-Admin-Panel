/**
 * Маркетинг — единый хаб с табами.
 *
 * Раньше «Маркетинг» был раскрывающимся разделом в сайдбаре с подпунктами
 * (Smart Links, Плейлисты, Тренды, Промо-материалы, Pre-save). Теперь это
 * одна ссылка на /marketing, а подразделы доступны через табы внутри страницы —
 * по образцу хаба «Каталог». Набор табов зависит от роли пользователя.
 *
 * Старые прямые роуты (/marketing/links и т.д.) продолжают работать.
 */
import { useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { Megaphone } from "lucide-react";
import { Layout } from "@/components/layout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/auth";
import { PresavePanel } from "@/pages/marketing/presave";
import { SmartLinksPanel } from "@/pages/marketing/links";
import { PromoAssetsPanel } from "@/pages/marketing/assets";
import { PlaylistsPanel } from "@/pages/marketing/playlists";
import { MarketingTrendsPanel } from "@/pages/marketing/trends";

type TabKey = "presave" | "smart_links" | "playlists" | "trends" | "promo_assets";

const TAB_PANELS: Record<TabKey, React.ComponentType> = {
  presave: PresavePanel,
  smart_links: SmartLinksPanel,
  playlists: PlaylistsPanel,
  trends: MarketingTrendsPanel,
  promo_assets: PromoAssetsPanel,
};

// Набор и порядок табов по ролям (повторяет прежнюю структуру сайдбара).
const ROLE_TABS: Record<Role, TabKey[]> = {
  admin: ["presave", "smart_links", "playlists", "trends", "promo_assets"],
  manager: ["presave", "smart_links", "playlists", "trends", "promo_assets"],
  label: ["smart_links", "playlists", "trends", "promo_assets"],
  artist: ["presave", "smart_links", "promo_assets"],
};

function parseTab(search: string, allowed: TabKey[]): TabKey {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const t = params.get("tab") as TabKey | null;
  return t && allowed.includes(t) ? t : allowed[0];
}

export default function MarketingHub() {
  const { t } = useLang();
  const { user } = useAuth();
  const nav = t.nav as Record<string, string>;
  const search = useSearch();
  const [, setLocation] = useLocation();

  const tabs = useMemo<TabKey[]>(
    () => (user ? ROLE_TABS[user.role] ?? [] : []),
    [user?.role],
  );
  const tab = useMemo(() => parseTab(search, tabs), [search, tabs]);

  const onTabChange = (next: string) => {
    setLocation(`/marketing?tab=${next}`);
  };

  if (tabs.length === 0) {
    return (
      <Layout>
        <div className="py-20 text-center text-muted-foreground">
          {nav.marketing_group ?? "Маркетинг"}
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <span className="h-10 w-10 rounded-xl bg-pink-500/15 border border-pink-500/30 flex items-center justify-center">
            <Megaphone className="h-5 w-5 text-pink-300" />
          </span>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{nav.marketing_group ?? "Маркетинг"}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Smart Links, плейлисты, тренды и промо-материалы — в одном месте
            </p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={onTabChange} className="space-y-6">
          <TabsList className="bg-card/50 backdrop-blur flex-wrap h-auto justify-start">
            {tabs.map((key) => (
              <TabsTrigger key={key} value={key} data-testid={`marketing-tab-${key}`}>
                {nav[key] ?? key}
              </TabsTrigger>
            ))}
          </TabsList>

          {tabs.map((key) => {
            const Panel = TAB_PANELS[key];
            return (
              <TabsContent key={key} value={key} className="space-y-0">
                <Panel />
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    </Layout>
  );
}
