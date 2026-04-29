/**
 * Catalog / Bulk Edit page — массовое редактирование releases/tracks/artists/labels.
 */
import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Layers } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { adminApi } from "@/lib/admin-api";

const ENTITIES = [
  { value: "release", label: "Релизы" },
  { value: "track", label: "Треки" },
  { value: "artist", label: "Артисты" },
] as const;

export default function CatalogBulkEdit() {
  const [entity, setEntity] = useState<typeof ENTITIES[number]["value"]>("release");
  const [idsText, setIdsText] = useState("");
  const [patchText, setPatchText] = useState('{\n  "status": "active"\n}');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ affectedCount: number } | null>(null);

  const submit = async () => {
    const ids = idsText.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean).map(Number).filter((n) => Number.isFinite(n) && n > 0);
    if (ids.length === 0) { toast({ title: "Нет валидных ID", variant: "destructive" }); return; }
    let patch: Record<string, unknown>;
    try { patch = JSON.parse(patchText); }
    catch { toast({ title: "Невалидный JSON в patch", variant: "destructive" }); return; }
    if (!confirm(`Применить изменения к ${ids.length} записям (${entity})?`)) return;
    setBusy(true);
    try {
      const r = await adminApi<{ ok: boolean; entity: string; affectedCount: number; ids: number[] }>("/api/catalog/bulk-edit", {
        method: "POST",
        body: JSON.stringify({ entity, ids, patch }),
      });
      setResult({ affectedCount: r.affectedCount });
      toast({ title: `Обновлено записей: ${r.affectedCount}` });
    } catch (e) {
      toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <Layout>
      <div className="space-y-6 p-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Layers className="h-5 w-5" /> Массовое редактирование</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Применить одно изменение сразу к множеству объектов. Будьте осторожны — действие записывается в журнал аудита.
          </p>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Параметры</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Сущность</Label>
              <Select value={entity} onValueChange={(v) => setEntity(v as typeof entity)}>
                <SelectTrigger data-testid="select-bulk-entity"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ENTITIES.map((e) => (<SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>ID (через запятую или с новой строки)</Label>
              <Textarea rows={4} value={idsText} onChange={(e) => setIdsText(e.target.value)} placeholder="1, 2, 3" data-testid="textarea-bulk-ids" />
            </div>
            <div>
              <Label>Patch (JSON)</Label>
              <Textarea rows={8} value={patchText} onChange={(e) => setPatchText(e.target.value)} className="font-mono text-xs" data-testid="textarea-bulk-patch" />
              <p className="text-xs text-muted-foreground mt-1">
                Поля, разрешённые на сервере для выбранной сущности. Например, для releases: status, primaryGenre, releaseDate.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => void submit()} disabled={busy} data-testid="button-bulk-submit">Применить</Button>
              {result && (
                <span className="text-sm text-muted-foreground">
                  Обновлено записей: <strong>{result.affectedCount}</strong>
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
