import { Link } from "wouter";
import { Disc3, Music2, Mic2, Building2, FileBox, Clapperboard, Files, Hash } from "lucide-react";
import { Layout } from "@/components/layout";

type Card = {
  href: string;
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
};

const CARDS: Card[] = [
  { href: "/releases",          title: "Релизы",      description: "Список и редактирование релизов",                  icon: Disc3,       color: "text-emerald-400" },
  { href: "/releases?tab=tracks", title: "Треки",     description: "Все треки в каталоге",                              icon: Music2,      color: "text-emerald-400" },
  { href: "/artists",           title: "Артисты",     description: "Профили артистов",                                  icon: Mic2,        color: "text-emerald-400" },
  { href: "/labels",            title: "Лейблы",      description: "Лейблы и их каталоги",                              icon: Building2,   color: "text-emerald-400" },
  { href: "/catalog/assets",    title: "Ассеты",      description: "Аудио, обложки, документы — все файлы",            icon: FileBox,     color: "text-blue-400" },
  { href: "/catalog/assets?kind=video", title: "Видео", description: "Видео-материалы (Music Video, Lyric Video)",     icon: Clapperboard, color: "text-amber-400" },
  { href: "/catalog/duplicates", title: "Дубликаты",  description: "Поиск дублей по имени, ISRC, UPC, sha256",          icon: Files,       color: "text-rose-400" },
  { href: "/catalog/codes",     title: "Генератор кодов", description: "Получить новый ISRC или UPC код",              icon: Hash,        color: "text-violet-400" },
];

export default function CatalogHub() {
  return (
    <Layout>
      <div className="space-y-6 p-6 max-w-7xl mx-auto">
        <div>
          <h1 className="text-2xl font-semibold">Каталог</h1>
          <p className="text-sm text-muted-foreground mt-1">Единая точка входа во все каталожные сущности</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {CARDS.map((c) => {
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
      </div>
    </Layout>
  );
}
