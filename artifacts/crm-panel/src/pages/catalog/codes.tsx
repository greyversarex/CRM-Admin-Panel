import { useState } from "react";
import { ArrowLeft, Hash, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Layout } from "@/components/layout";
import { toast } from "@/hooks/use-toast";

async function gen(kind: "isrc" | "upc"): Promise<string> {
  const r = await fetch(`/api/catalog/codes/${kind}`, { method: "POST", credentials: "same-origin" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  return String(j.code);
}

function Generator({ title, description, kind }: { title: string; description: string; kind: "isrc" | "upc" }) {
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    try { setCode(await gen(kind)); }
    catch (e) { toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" }); }
    finally { setBusy(false); }
  }

  function copy() {
    if (!code) return;
    void navigator.clipboard.writeText(code);
    toast({ title: "Скопировано", description: code });
  }

  return (
    <div className="rounded-lg border border-border/50 bg-card p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Hash className="h-5 w-5 text-violet-400" />
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="rounded border border-border/50 bg-background/50 p-3 font-mono text-lg text-center min-h-[3.5rem] flex items-center justify-center">
        {code ?? <span className="text-xs text-muted-foreground">Нажмите «Сгенерировать»</span>}
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={generate} disabled={busy} className="flex-1">
          {busy ? "Генерация..." : "Сгенерировать"}
        </Button>
        <Button size="sm" variant="outline" onClick={copy} disabled={!code}>
          <Copy className="h-3.5 w-3.5 mr-1" /> Копировать
        </Button>
      </div>
    </div>
  );
}

export default function CodesPage() {
  return (
    <Layout>
      <div className="space-y-6 p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => history.back()}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Назад
          </Button>
          <h1 className="text-xl font-semibold">Генератор кодов</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Generator title="ISRC" description="Международный стандартный код записи (формат TJ-TM1-YY-NNNNN)" kind="isrc" />
          <Generator title="UPC" description="Универсальный код продукта для релизов (12 цифр + контрольная сумма)" kind="upc" />
        </div>

        <div className="rounded-lg border border-border/50 bg-card/50 p-4 text-xs text-muted-foreground space-y-1">
          <p><b>ISRC:</b> Префикс TJ (Таджикистан) — TM1 (наш регистрант). Используется для уникальной идентификации каждого аудио/видео-произведения.</p>
          <p><b>UPC:</b> Используется для идентификации релиза в DSP. Контрольная цифра рассчитывается по алгоритму EAN-13.</p>
          <p>Сгенерированные коды не сохраняются автоматически — назначайте их вручную при создании релиза/трека.</p>
        </div>
      </div>
    </Layout>
  );
}
