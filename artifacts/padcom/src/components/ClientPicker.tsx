import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface ClientPickerOption {
  id: number;
  name: string;
}

interface ClientPickerProps {
  clientes: ClientPickerOption[];
  value: number | null;
  onChange: (id: number | null) => void;
  placeholder?: string;
  allOptionLabel?: string;
  className?: string;
  triggerClassName?: string;
}

function semAcento(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

const LOTE = 200;

export function ClientPicker({
  clientes,
  value,
  onChange,
  placeholder = "Escolha um cliente...",
  allOptionLabel,
  className,
  triggerClassName,
}: ClientPickerProps) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const [limite, setLimite] = useState(LOTE);

  // Ordena uma vez em ordem alfabetica (pt-BR) e pre-calcula a chave de busca
  // sem acento, para nao normalizar novamente a cada tecla digitada.
  const ordenados = useMemo(
    () =>
      [...clientes]
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
        .map((c) => ({ ...c, norm: semAcento(c.name) })),
    [clientes],
  );

  const filtrados = useMemo(() => {
    const q = semAcento(busca.trim());
    if (!q) return ordenados;
    return ordenados.filter((c) => c.norm.includes(q));
  }, [ordenados, busca]);

  // Reinicia a janela de rolagem sempre que a busca muda.
  useEffect(() => {
    setLimite(LOTE);
  }, [busca]);

  const visiveis = filtrados.slice(0, limite);
  const escondidos = filtrados.length - visiveis.length;

  const selecionado =
    value != null ? clientes.find((c) => c.id === value) ?? null : null;

  const listRef = useRef<HTMLDivElement>(null);
  function aoRolar(e: React.UIEvent<HTMLDivElement>): void {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 48 && escondidos > 0) {
      setLimite((l) => l + LOTE);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Selecionar cliente"
          className={cn(
            "field-engraved h-10 w-full justify-between font-normal",
            triggerClassName,
          )}
        >
          <span className={cn("truncate", !selecionado && "text-slate-400")}>
            {selecionado ? selecionado.name : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("w-[--radix-popover-trigger-width] p-0", className)}
        align="start"
      >
        <Command shouldFilter={false}>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <CommandInput
              value={busca}
              onValueChange={setBusca}
              placeholder="Digite o nome do cliente..."
              className="border-0"
            />
          </div>
          <CommandList
            ref={listRef}
            onScroll={aoRolar}
            className="max-h-[20rem]"
          >
            <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
            <CommandGroup>
              {allOptionLabel != null && (
                <CommandItem
                  value="__todos__"
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                    setBusca("");
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value == null ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {allOptionLabel}
                </CommandItem>
              )}
              {visiveis.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.name}::${c.id}`}
                  onSelect={() => {
                    onChange(c.id);
                    setOpen(false);
                    setBusca("");
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === c.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{c.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            {escondidos > 0 && (
              <div className="px-3 py-2 text-center text-xs text-slate-400">
                Mostrando {visiveis.length} de {filtrados.length}. Role para ver
                mais ou digite para filtrar.
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
