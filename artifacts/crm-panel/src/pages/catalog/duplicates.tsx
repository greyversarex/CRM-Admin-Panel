import { useEffect, useState, useCallback } from "react";
import { ArrowLeft, RefreshCw, Files } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Layout } from "@/components/layout";
import { toast } from "@/hooks/use-toast";

type Group = {
  key: string;
  cnt: number;
  items: Array<Record<string, unknown>>;
};

function DuplicatesList({ type }: { type: "artist" | "track" | "release" | "asset" }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/catalog/duplicates?type=${type}`, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setGroups(j.groups ?? []);
    } catch (e) {
      toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" });
    } finally { setLoading(false); }
  }, [type]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">Найдено групп дубликатов: {groups.length}</div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> Обновить
        </Button>
      </div>

      {groups.length === 0 && (
        <div className="rounded-lg border border-border/50 bg-card p-8 text-center text-sm text-muted-foreground">
          {loading ? "Поиск..." : "Дубликатов не найдено"}
        </div>
      )}

      {groups.map((g) => (
        <div key={g.key} className="rounded-lg border border-border/50 bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Files className="h-4 w-4 text-rose-400" />
            <span className="text-xs text-muted-foreground">Ключ:</span>
            <code className="text-xs">{g.key}</code>
            <span className="ml-auto text-xs text-muted-foreground">{g.cnt} записей</span>
          </div>
          <div className="space-y-1 text-xs font-mono text-muted-foreground">
            {g.items.map((it, i) => (
              <div key={i} className="border-t border-border/30 pt-1 mt-1">
                {JSON.stringify(it)}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Duplicates() {
  return (
    <Layout>
      <div className="space-y-4 p-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => history.back()}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Назад
          </Button>
          <h1 className="text-xl font-semibold">Поиск дубликатов</h1>
        </div>

        <Tabs defaultValue="artist">
          <TabsList>
            <TabsTrigger value="artist">Артисты</TabsTrigger>
            <TabsTrigger value="track">Треки</TabsTrigger>
            <TabsTrigger value="release">Релизы</TabsTrigger>
            <TabsTrigger value="asset">Файлы (sha256)</TabsTrigger>
          </TabsList>
          <TabsContent value="artist" className="mt-4"><DuplicatesList type="artist" /></TabsContent>
          <TabsContent value="track" className="mt-4"><DuplicatesList type="track" /></TabsContent>
          <TabsContent value="release" className="mt-4"><DuplicatesList type="release" /></TabsContent>
          <TabsContent value="asset" className="mt-4"><DuplicatesList type="asset" /></TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
