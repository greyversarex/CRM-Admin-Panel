import { useState } from "react";
import { useListArtists } from "@workspace/api-client-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { ChevronsUpDown, Check, Plus } from "lucide-react";

/**
 * Combobox for a contributor's name field.
 * Mirrors the Primary Artist picker on the first release page: you can type to
 * search the existing artist roster and pick one, or enter a free-form name
 * (writers/performers are not always roster artists).
 */
export function ArtistNameCombobox({
  value, onChange, placeholder = "Select or type a name",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data } = useListArtists({ limit: 200 });
  const artists = (data?.data ?? []) as Array<{ id: number; name: string }>;

  const filtered = artists.filter((a) =>
    a.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const typed = search.trim();
  const exact = artists.some((a) => a.name.toLowerCase() === typed.toLowerCase());

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="bg-background/40 flex-1 min-w-0 justify-between font-normal h-9 px-3"
        >
          <span className={value ? "truncate" : "text-foreground/40 truncate"}>
            {value || placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[240px]"
        align="start"
        sideOffset={4}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search or type a name..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-[210px]">
            <CommandEmpty className="py-3 text-sm text-center text-muted-foreground">
              No artists found.
            </CommandEmpty>
            {filtered.length > 0 && (
              <CommandGroup>
                {filtered.map((a) => (
                  <CommandItem
                    key={a.id}
                    value={`artist-${a.id}`}
                    onSelect={() => {
                      onChange(a.name);
                      setOpen(false);
                    }}
                  >
                    <Check className={`mr-2 h-4 w-4 ${value === a.name ? "opacity-100" : "opacity-0"}`} />
                    {a.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {typed && !exact && (
              <CommandGroup heading="Custom">
                <CommandItem
                  value={`use-${typed}`}
                  onSelect={() => {
                    onChange(typed);
                    setOpen(false);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" /> Use “{typed}”
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
