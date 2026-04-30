import { Layout } from "@/components/layout";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ImagePlay, Download, Wand2, Share2, Instagram, Youtube } from "lucide-react";

type Asset = {
  id: number;
  release: string;
  artist: string;
  type: "instagram_square" | "instagram_story" | "youtube_banner" | "press_kit";
  format: string;
  size: string;
  generatedAt: string;
};

const TYPE_META = {
  instagram_square: { label: "Instagram Пост",   icon: Instagram, color: "text-pink-400",    bg: "bg-pink-500/10"  },
  instagram_story:  { label: "Instagram Story",  icon: Instagram, color: "text-purple-400",  bg: "bg-purple-500/10" },
  youtube_banner:   { label: "YouTube Banner",   icon: Youtube,   color: "text-red-400",     bg: "bg-red-500/10"   },
  press_kit:        { label: "Пресс-кит",        icon: Share2,    color: "text-blue-400",    bg: "bg-blue-500/10"  },
};

const DEMO: Asset[] = [
  { id: 1, release: "Дил Дил",    artist: "Jahongir Ortiqov", type: "instagram_square", format: "JPG", size: "1080×1080", generatedAt: "2025-04-28" },
  { id: 2, release: "Дил Дил",    artist: "Jahongir Ortiqov", type: "instagram_story",  format: "JPG", size: "1080×1920", generatedAt: "2025-04-28" },
  { id: 3, release: "Дил Дил",    artist: "Jahongir Ortiqov", type: "youtube_banner",   format: "PNG", size: "2560×1440", generatedAt: "2025-04-28" },
  { id: 4, release: "Шаби Мехр",  artist: "Navo Ensemble",   type: "instagram_square", format: "JPG", size: "1080×1080", generatedAt: "2025-04-15" },
  { id: 5, release: "Шаби Мехр",  artist: "Navo Ensemble",   type: "press_kit",        format: "PDF", size: "A4",        generatedAt: "2025-04-15" },
];

const RELEASES = ["Все релизы", "Дил Дил", "Шаби Мехр", "Осмон"];

export default function PromoAssets() {
  const { toast } = useToast();
  const [assets] = useState<Asset[]>(DEMO);
  const [filterRelease, setFilterRelease] = useState("Все релизы");
  const [generating, setGenerating] = useState(false);

  const filtered = filterRelease === "Все релизы" ? assets : assets.filter(a => a.release === filterRelease);

  const handleGenerate = () => {
    setGenerating(true);
    setTimeout(() => {
      setGenerating(false);
      toast({ title: "Промо-материалы созданы", description: "Все форматы готовы к скачиванию" });
    }, 2000);
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ImagePlay className="w-6 h-6 text-pink-400" />
              Промо-материалы
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Авто-генерация баннеров, Stories и пресс-китов на основе обложки релиза
            </p>
          </div>
          <div className="flex gap-2">
            <Select value={filterRelease} onValueChange={setFilterRelease}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RELEASES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={handleGenerate} disabled={generating} className="gap-2">
              <Wand2 className="w-4 h-4" />
              {generating ? "Генерация..." : "Авто-генерация"}
            </Button>
          </div>
        </div>

        {/* Format cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(asset => {
            const meta = TYPE_META[asset.type];
            const Icon = meta.icon;
            return (
              <Card key={asset.id} className="group hover:border-border/80 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${meta.bg}`}>
                      <Icon className={`w-4 h-4 ${meta.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm">{meta.label}</CardTitle>
                      <p className="text-xs text-muted-foreground truncate">{asset.release} — {asset.artist}</p>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">{asset.format}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="rounded-lg bg-muted/40 h-28 flex items-center justify-center">
                    <div className="text-center">
                      <Icon className={`w-8 h-8 mx-auto mb-1 ${meta.color} opacity-30`} />
                      <p className="text-xs text-muted-foreground">{asset.size}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {new Date(asset.generatedAt).toLocaleDateString("ru-RU")}
                    </p>
                    <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs"
                      onClick={() => toast({ title: "Скачивание...", description: `${asset.release} — ${meta.label}` })}>
                      <Download className="w-3 h-3" /> Скачать
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            <ImagePlay className="w-12 h-12 text-muted-foreground/30" />
            <p className="text-muted-foreground">Нет материалов для выбранного релиза</p>
            <Button onClick={handleGenerate} className="gap-2">
              <Wand2 className="w-4 h-4" /> Сгенерировать материалы
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
