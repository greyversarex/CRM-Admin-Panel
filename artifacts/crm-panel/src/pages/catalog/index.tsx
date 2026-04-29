/**
 * Каталог — единый хаб с табами.
 *
 * Табы синхронизируются с query-параметром `?tab=`. Default — hub (сетка карточек
 * со ссылками на assets/duplicates/codes/bulk-edit). Старые URL /releases /artists
 * /labels продолжают работать через свои собственные роуты.
 */
import { Link, useLocation, useSearch } from "wouter";
import { useMemo } from "react";
import {
  Disc3, Music2, Mic2, Building2, FileBox, Clapperboard, Files, Hash, Layers, Library,
} from "lucide-react";
import { Layout } from "@/components/layout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { ReleasesPanel } from "@/pages/releases";
import { ArtistsPanel } from "@/pages/artists";
import { LabelsPanel } from "@/pages/labels";
import { CatalogAssetsPanel } from "@/pages/catalog/assets";

type LinkCard = {
  href: string;
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
};

const HUB_CARDS: LinkCard[] = [
  { href: "/catalog?tab=releases", title: "Релизы",      description: "Список и редактирование релизов",                  icon: Disc3,       color: "text-emerald-400" },
  { href: "/catalog?tab=artists",  title: "Исполнители", description: "Профили артистов",                                  icon: Mic2,        color: "text-emerald-400" },
  { href: "/catalog?tab=labels",   title: "Лейблы",      description: "Лейблы и их каталоги",                              icon: Building2,   color: "text-emerald-400" },
  { href: "/catalog?tab=videos",   title: "Видео",       description: "Видео-материалы (Music Video, Lyric Video)",       icon: Clapperboard, color: "text-amber-400" },
  { href: "/catalog/assets",       title: "Ассеты",      description: "Аудио, обложки, документы — все файлы",            icon: FileBox,     color: "text-blue-400" },
  { href: "/catalog/duplicates",   title: "Дубликаты",   description: "Поиск дублей по имени, ISRC, UPC, sha256",          icon: Files,       color: "text-rose-400" },
  { href: "/catalog/codes",        title: "Генератор кодов", description: "Получить новый ISRC или UPC код",              icon: Hash,        color: "text-violet-400" },
  { href: "/catalog/bulk-edit",    title: "Массовое редактирование", description: "Применить изменения к множеству объектов сразу", icon: Layers,      color: "text-cyan-400" },
  { href: "/releases?tab=tracks",  title: "Треки",       description: "Все треки в каталоге",                              icon: Music2,      color: "text-emerald-400" },
];

type CatalogTab = "hub" | "releases" | "artists" | "labels" | "videos";

const VALID_TABS: CatalogTab[] = ["hub", "releases", "artists", "labels", "videos"];

function parseTab(search: string): CatalogTab {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const t = params.get("tab");
  return (t && (VALID_TABS as string[]).includes(t) ? t : "hub") as CatalogTab;
}

export default function CatalogHub() {
  const { t } = useLang();
  const { user } = useAuth();
  const nav = t.nav as Record<string, string>;
  const search = useSearch();
  const [, setLocation] = useLocation();
  const tab = useMemo(() => parseTab(search), [search]);

  const onTabChange = (next: string) => {
    if (next === "hub") setLocation("/catalog");
    else setLocation(`/catalog?tab=${next}`);
  };

  // Для label/artist скрываем табы, недоступные им контентно: видео-ассеты и labels-лист
  // содержат данные за пределами их scope. Releases/Artists работают с фильтром по их id.
  const isAdminLike = user?.role === "admin" || user?.role === "manager";

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <Library className="h-7 w-7 text-emerald-400" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{nav.catalog_group ?? "Каталог"}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Единая точка входа во все каталожные сущности
            </p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={onTabChange} className="space-y-6">
          <TabsList className="bg-card/50 backdrop-blur flex-wrap h-auto justify-start">
            <TabsTrigger value="hub" data-testid="catalog-tab-hub">{nav.catalog_hub ?? "Главная"}</TabsTrigger>
            <TabsTrigger value="releases" data-testid="catalog-tab-releases">{nav.releases ?? "Релизы"}</TabsTrigger>
            <TabsTrigger value="artists" data-testid="catalog-tab-artists">{nav.artists ?? "Исполнители"}</TabsTrigger>
            {isAdminLike && (
              <TabsTrigger value="labels" data-testid="catalog-tab-labels">{nav.labels ?? "Лейблы"}</TabsTrigger>
            )}
            {isAdminLike && (
              <TabsTrigger value="videos" data-testid="catalog-tab-videos">{nav.videos ?? "Видео"}</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="hub" className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {HUB_CARDS.map((c) => {
                const Icon = c.icon;
                return (
                  <Link key={c.href + c.title} href={c.href}>
                    <a className="block rounded-lg border border-border/50 bg-card p-5 hover:border-primary/40 hover:bg-card/80 transition-colors cursor-pointer">
                      <Icon className={`h-7 w-7 ${c.color} mb-3`} />
                      <div className="font-medium">{c.title}</div>
                      <div className="text-xs text-muted-foreground mt-1">{c.description}</div>
                    </a>
                  </Link>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="releases" className="space-y-0">
            <ReleasesPanel />
          </TabsContent>

          <TabsContent value="artists" className="space-y-0">
            <ArtistsPanel />
          </TabsContent>

          {isAdminLike && (
            <TabsContent value="labels" className="space-y-0">
              <LabelsPanel />
            </TabsContent>
          )}

          {isAdminLike && (
            <TabsContent value="videos" className="space-y-0">
              <CatalogAssetsPanel initialKindOverride="video" />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </Layout>
  );
}
