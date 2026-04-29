/**
 * Publishing / Registration tab — отправка works в PRO (ASCAP/BMI/Songtrust/MLC).
 * При отсутствии credentials в Settings → Publishing → PRO — показывает понятное предупреждение.
 */
import { useEffect, useState, useCallback } from "react";
import { Send, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { adminApi } from "@/lib/admin-api";

interface Work {
  id: number;
  title: string;
  iswc: string | null;
  status: string;
  registeredWith: string[];
  ascap: boolean;
  bmi: boolean;
  songtrust: boolean;
  mlcSongCode: string | null;
}

const PROS = ["ascap", "bmi", "songtrust", "mlc"] as const;

export function RegistrationTab() {
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(false);
  const [workId, setWorkId] = useState("");
  const [pro, setPro] = useState<string>("ascap");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminApi<{ works: Work[] } | Work[]>("/api/publishing/works?limit=50");
      setWorks(Array.isArray(r) ? r : (r.works ?? []));
    } catch (e) { toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" }); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const register = async () => {
    if (!workId) { toast({ title: "Укажите ID работы", variant: "destructive" }); return; }
    try {
      await adminApi(`/api/publishing/works/${workId}/register/${pro}`, { method: "POST" });
      toast({ title: `Отправлено в ${pro.toUpperCase()}` });
      await load();
    } catch (e) { toast({ title: "Ошибка регистрации", description: String((e as Error).message), variant: "destructive" }); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Регистрация в PRO</h3>
          <p className="text-xs text-muted-foreground">Заполните Настройки → Publishing → endpoint+API key для каждой PRO. Без них кнопка вернёт ошибку.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} data-testid="button-refresh-works">
          <RefreshCw className="h-4 w-4 mr-1" /> Обновить
        </Button>
      </div>

      <div className="rounded-md border bg-card p-3 grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
        <div>
          <Label className="text-xs">ID работы</Label>
          <Input type="number" value={workId} onChange={(e) => setWorkId(e.target.value)} data-testid="input-work-id" />
        </div>
        <div>
          <Label className="text-xs">PRO</Label>
          <Select value={pro} onValueChange={setPro}>
            <SelectTrigger data-testid="select-pro"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PROS.map((p) => (<SelectItem key={p} value={p}>{p.toUpperCase()}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => void register()} data-testid="button-pro-register">
          <Send className="h-4 w-4 mr-1" /> Зарегистрировать
        </Button>
      </div>

      <div className="rounded-md border bg-card divide-y">
        {works.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">Нет работ.</div>
        ) : works.map((w) => (
          <div key={w.id} className="p-3 flex items-center justify-between" data-testid={`row-work-${w.id}`}>
            <div className="text-sm">
              <div className="font-medium">#{w.id} · {w.title}{w.iswc ? ` · ISWC ${w.iswc}` : ""}</div>
              <div className="text-xs text-muted-foreground flex gap-1 flex-wrap mt-1">
                <Badge variant="outline">{w.status}</Badge>
                {w.ascap && <Badge variant="default">ASCAP</Badge>}
                {w.bmi && <Badge variant="default">BMI</Badge>}
                {w.songtrust && <Badge variant="default">Songtrust</Badge>}
                {w.mlcSongCode && <Badge variant="default">MLC: {w.mlcSongCode}</Badge>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
