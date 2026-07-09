import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, ChevronDown, AlertOctagon } from "lucide-react";

const FAIL_CATEGORIES = [
  {
    id: "artwork",
    label: "Artwork",
    labelRu: "Обложка",
    reasons: [
      "Разрешение обложки ниже 3000×3000 пикселей",
      "На обложке есть текст, не относящийся к релизу",
      "На обложке присутствует логотип или URL",
      "Обложка не соответствует содержанию релиза",
      "Неправильные пропорции обложки (требуется 1:1)",
      "Обложка содержит явный контент без пометки Explicit",
    ],
  },
  {
    id: "titles",
    label: "Titles",
    labelRu: "Названия",
    reasons: [
      "Неправильное форматирование названия трека или релиза",
      "Использование ВСЕХ ЗАГЛАВНЫХ БУКВ (недопустимо)",
      "В названии указана версия трека (используйте поле Version)",
      "Посторонние символы ™, ®, © в названии",
      "Некорректное использование скобок",
    ],
  },
  {
    id: "artists",
    label: "Artists",
    labelRu: "Артисты",
    reasons: [
      "Не указан артист Featuring в поле артистов",
      "Неверное написание или форматирование имени артиста",
      "Добавлен артист без его согласия",
      "Отсутствует основной артист",
      "Имена артистов не совпадают с профилями на DSP-платформах",
    ],
  },
  {
    id: "album",
    label: "Album",
    labelRu: "Альбом",
    reasons: [
      "Неправильный тип релиза (сингл / EP / альбом / сборник)",
      "Дата релиза указана некорректно",
      "Неверные строки Copyright (©) или Phonogram (℗)",
      "UPC не соответствует продукту",
      "Отсутствует информация о статусе компиляции",
    ],
  },
  {
    id: "composition",
    label: "Composition",
    labelRu: "Композиция",
    reasons: [
      "Не указаны авторы (Writers / Composers)",
      "Неверный язык трека",
      "Ошибки в коде ISRC",
      "Обязательный ISRC отсутствует",
    ],
  },
  {
    id: "rights",
    label: "Rights & Terms of Use",
    labelRu: "Права и условия использования",
    reasons: [
      "Вредит бренду",
      "Незаконный / неэтичный контент (разжигание ненависти, дискриминация и т.п.)",
      "Отклонение из-за проблем с правами",
      "Отклонение и блокировка за нарушение авторских прав",
      "Отклонение и блокировка за нарушение стандартов контента",
      "Нарушение правил использования: предупреждение 1",
      "Нарушение правил использования: предупреждение 2",
      "Нарушение правил использования: предупреждение 3 (и блокировка аккаунта)",
      "Отклонение за нарушение условий использования DSP",
      "Неверное происхождение / свойства трека",
      "Не подходит для UGC-платформ (YouTube, TikTok и т.п.)",
      "ACRCloud: обнаружено совпадение с другим треком",
      "Конфликт ISRC в базе MusicBrainz",
    ],
  },
  {
    id: "misc",
    label: "Miscellaneous",
    labelRu: "Разное",
    reasons: [
      "Дата релиза слишком близко к текущей дате (менее 2 рабочих дней)",
      "Технические проблемы с аудиофайлом (повреждение, тишина, обрыв)",
      "Отсутствуют обязательные метаданные",
      "Повреждён или отсутствует файл обложки",
    ],
  },
];

interface FailReturnDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (note: string) => void;
  isPending?: boolean;
}

export function FailReturnDialog({ open, onClose, onConfirm, isPending }: FailReturnDialogProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [otherText, setOtherText] = useState("");

  function toggleReason(reason: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(reason)) next.delete(reason);
      else next.add(reason);
      return next;
    });
  }

  function buildNote(): string {
    const parts: string[] = [];
    for (const cat of FAIL_CATEGORIES) {
      const catReasons = cat.reasons.filter((r) => selected.has(r));
      if (catReasons.length > 0) {
        parts.push(`${cat.labelRu}:\n${catReasons.map((r) => `• ${r}`).join("\n")}`);
      }
    }
    if (otherText.trim()) {
      parts.push(`Другое:\n${otherText.trim()}`);
    }
    return parts.join("\n\n");
  }

  const totalSelected = selected.size + (otherText.trim() ? 1 : 0);
  const canConfirm = totalSelected > 0;

  function handleClose() {
    setExpanded(null);
    setSelected(new Set());
    setOtherText("");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-4 border-b sticky top-0 bg-background z-10">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-rose-500/15 flex items-center justify-center shrink-0">
              <AlertOctagon className="h-4 w-4 text-rose-400" />
            </div>
            <div>
              <DialogTitle className="text-base">Fail and return release to user for editing</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Выберите причины. Артист получит подробное объяснение и сможет исправить релиз.
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="divide-y divide-border/60">
          {FAIL_CATEGORIES.map((cat) => {
            const catSelected = cat.reasons.filter((r) => selected.has(r));
            const isOpen = expanded === cat.id;
            return (
              <div key={cat.id}>
                <button
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-accent/40 transition-colors text-left"
                  onClick={() => setExpanded(isOpen ? null : cat.id)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{cat.label}</span>
                    <span className="text-xs text-muted-foreground hidden sm:inline">— {cat.labelRu}</span>
                    {catSelected.length > 0 && (
                      <Badge
                        className="h-4 min-w-4 px-1 text-[10px] bg-amber-500/20 text-amber-500 border-amber-500/40"
                        variant="outline"
                      >
                        {catSelected.length}
                      </Badge>
                    )}
                  </div>
                  {isOpen
                    ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                </button>

                {isOpen && (
                  <div className="px-5 py-3 space-y-2.5 bg-muted/20 border-t border-border/40">
                    {cat.reasons.map((reason) => (
                      <label
                        key={reason}
                        className="flex items-start gap-2.5 cursor-pointer group"
                      >
                        <Checkbox
                          checked={selected.has(reason)}
                          onCheckedChange={() => toggleReason(reason)}
                          className="mt-0.5 shrink-0"
                        />
                        <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors leading-snug">
                          {reason}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <div>
            <button
              className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-accent/40 transition-colors text-left"
              onClick={() => setExpanded(expanded === "other" ? null : "other")}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Other Reasons</span>
                <span className="text-xs text-muted-foreground hidden sm:inline">— Другое</span>
                {otherText.trim() && (
                  <Badge
                    className="h-4 min-w-4 px-1 text-[10px] bg-amber-500/20 text-amber-500 border-amber-500/40"
                    variant="outline"
                  >
                    1
                  </Badge>
                )}
              </div>
              {expanded === "other"
                ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
            </button>
            {expanded === "other" && (
              <div className="px-5 py-3 bg-muted/20 border-t border-border/40">
                <Textarea
                  value={otherText}
                  onChange={(e) => setOtherText(e.target.value)}
                  placeholder="Опишите причину отказа в свободной форме..."
                  rows={3}
                  className="text-sm resize-none"
                />
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-4 border-t bg-muted/20 sticky bottom-0 flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground shrink-0">
            {totalSelected > 0
              ? <span className="text-amber-500 font-medium">Выбрано: {totalSelected}</span>
              : "Выберите хотя бы одну причину"}
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" onClick={handleClose} disabled={isPending} size="sm">
              Отмена
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={!canConfirm || isPending}
              onClick={() => onConfirm(buildNote())}
            >
              {isPending ? "Отправка..." : "Fail & Return"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
