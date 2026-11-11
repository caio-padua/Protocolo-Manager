import { useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

export interface ProtocolSubstanceOption {
  id: number;
  name: string;
  dose: string;
  via: string;
  color?: string | null;
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function ProtocolSubstancePicker({ options, selected, onSelect }: {
  options: ProtocolSubstanceOption[];
  selected?: ProtocolSubstanceOption;
  onSelect: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const term = normalize(search.trim());
    return term ? options.filter(item => normalize(`${item.name} ${item.dose} ${item.id}`).includes(term)) : options;
  }, [options, search]);
  return (
    <Popover open={open} onOpenChange={value => { setOpen(value); if (!value) setSearch(""); }}>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Escolher substância" className="field-engraved flex min-h-10 w-full items-center justify-between gap-2 px-3 text-left text-sm">
          <span className="min-w-0 truncate">
            {selected ? `${selected.name}${selected.dose ? ` — dose padrão ${selected.dose}` : ""}` : "Escolha a substância..."}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(var(--radix-popover-trigger-width),calc(100vw-24px))] p-2">
        <div className="relative mb-2">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input aria-label="Buscar substância" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por nome, dose ou cadastro" className="field-engraved h-10 pl-9" />
        </div>
        <div className="max-h-[min(50vh,320px)] overflow-y-auto overscroll-contain touch-pan-y" aria-label="Resultados de substâncias">
          {filtered.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nenhuma substância encontrada.</p>}
          {filtered.map(item => (
            <button type="button" key={item.id} onClick={() => { onSelect(item.id); setOpen(false); setSearch(""); }}
              className="flex min-h-12 w-full items-center gap-2 rounded px-2 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline focus-visible:outline-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color || "#888" }} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block break-words text-sm font-semibold">{item.name}{item.dose ? ` — ${item.dose}` : ""}</span>
                <span className="block text-xs text-muted-foreground">Cadastro #{item.id} · {item.via} · {item.dose ? "dose padrão; revisar" : "dose não confirmada; revisar"}</span>
              </span>
              {selected?.id === item.id && <Check className="h-4 w-4 shrink-0" aria-label="Selecionada" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
