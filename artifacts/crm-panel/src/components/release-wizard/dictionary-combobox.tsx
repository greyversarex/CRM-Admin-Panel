/**
 * Поисковый combobox для справочников (жанр, язык, страна) из Broma16.
 *
 * В словарях Broma16 сотни значений (256 стран, 280 жанров, 186 языков), поэтому
 * обычный <Select> непригоден — нужен поиск. Повторяет паттерн ArtistNameCombobox.
 * Если текущее значение отсутствует в списке опций (например, старый релиз с
 * захардкоженным жанром) — оно всё равно показывается, чтобы не «пропадало».
 */
import { useMemo, useState } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { ChevronsUpDown, Check } from "lucide-react";
import type { Option } from "./use-catalog";

export function DictionaryCombobox({
  value,
  onChange,
  options,
  placeholder = "Выберите…",
  disabled = false,
  className = "bg-background/40",
}: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  // Если текущее значение не найдено среди опций — добавляем его «как есть»,
  // чтобы выбранное ранее значение отображалось и не сбрасывалось.
  const mergedOptions = useMemo(() => {
    if (value && !options.some((o) => o.value === value)) {
      return [{ value, label: value }, ...options];
    }
    return options;
  }, [value, options]);

  const selectedOption = mergedOptions.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={`w-full min-w-0 justify-between font-normal h-10 px-3 ${className}`}
        >
          {selectedOption ? (
            <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
              {selectedOption.prefix && (
                <span className="shrink-0 text-base leading-none">{selectedOption.prefix}</span>
              )}
              <span className="truncate">{selectedOption.label}</span>
              {selectedOption.meta && (
                <span className="ml-auto shrink-0 rounded border border-border/60 bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {selectedOption.meta}
                </span>
              )}
            </span>
          ) : (
            <span className="truncate text-foreground/40">{placeholder}</span>
          )}
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[240px]">
        <Command>
          <CommandInput placeholder="Поиск…" />
          <CommandList>
            <CommandEmpty>Ничего не найдено</CommandEmpty>
            <CommandGroup>
              {mergedOptions.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.meta ?? ""}`.trim()}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <Check className={`mr-2 h-4 w-4 ${o.value === value ? "opacity-100" : "opacity-0"}`} />
                  {o.prefix && <span className="mr-2 shrink-0 text-base leading-none">{o.prefix}</span>}
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.meta && (
                    <span className="ml-2 shrink-0 rounded border border-border/60 bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {o.meta}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
