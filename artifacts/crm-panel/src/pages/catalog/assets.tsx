import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Layout } from "@/components/layout";
import { toast } from "@/hooks/use-toast";

type Asset = {
  id: number;
  kind: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  releaseId: number | null;
  trackId: number | null;
  artistId: number | null;
  labelId: number | null;
  createdAt: string;
};

function formatSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function CatalogAssets() {
  const [location] = useLocation();
  const initialKind = (() => {
    const m = location.match(/[?&]kind=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : "all";
  })();

  const [items, setItems] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [kind, setKind] = useState(initialKind);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (kind !== "all") params.set("kind", kind);
      const r = await fetch(`/api/assets?${params}`, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setItems(j.assets ?? j.items ?? []);
    } catch (e) {
      toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" });
    } finally { setLoading(false); }
  }, [kind]);

  useEffect(() => { void load(); }, [load]);

  const filtered = items.filter((a) =>
    !search || a.filename.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Layout>
      <div className="space-y-4 p-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => history.back()}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Назад
          </Button>
          <h1 className="text-xl font-semibold">Ассеты каталога</h1>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-52">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input className="pl-8 h-8 text-sm" placeholder="Поиск по имени файла..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger className="h-8 w-44 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все типы</SelectItem>
              <SelectItem value="audio">Аудио</SelectItem>
              <SelectItem value="cover">Обложки</SelectItem>
              <SelectItem value="video">Видео</SelectItem>
              <SelectItem value="document">Документы</SelectItem>
              <SelectItem value="avatar">Аватары</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> Обновить
          </Button>
        </div>

        <div className="rounded-lg border border-border/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-card/50 border-b border-border/50">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Файл</th>
                <th className="px-3 py-2">Тип</th>
                <th className="px-3 py-2">MIME</th>
                <th className="px-3 py-2">Размер</th>
                <th className="px-3 py-2">Связан с</th>
                <th className="px-3 py-2">Создан</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-xs text-muted-foreground">
                  {loading ? "Загрузка..." : "Нет ассетов"}
                </td></tr>
              )}
              {filtered.map((a) => (
                <tr key={a.id} className="border-t border-border/30 hover:bg-card/30">
                  <td className="px-3 py-2 font-mono text-xs">{a.id}</td>
                  <td className="px-3 py-2 truncate max-w-xs" title={a.filename}>{a.filename}</td>
                  <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{a.kind}</Badge></td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{a.mimeType}</td>
                  <td className="px-3 py-2 text-xs">{formatSize(a.sizeBytes)}</td>
                  <td className="px-3 py-2 text-xs">
                    {a.releaseId && <span>Релиз #{a.releaseId} </span>}
                    {a.trackId && <span>Трек #{a.trackId} </span>}
                    {a.artistId && <span>Артист #{a.artistId} </span>}
                    {a.labelId && <span>Лейбл #{a.labelId} </span>}
                    {!a.releaseId && !a.trackId && !a.artistId && !a.labelId && "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleString("ru-RU")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
