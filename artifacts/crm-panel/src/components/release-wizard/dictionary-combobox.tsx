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

  const selectedLabel = mergedOptions.find((o) => o.value === value)?.label ?? "";

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
          <span className={selectedLabel ? "truncate" : "text-foreground/40 truncate"}>
            {selectedLabel || placeholder}
          </span>
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
                  value={o.label}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <Check className={`mr-2 h-4 w-4 ${o.value === value ? "opacity-100" : "opacity-0"}`} />
                  <span className="truncate">{o.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
