import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export type ClientOption = { id: number | string; name: string; cpf?: string | null };

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function norm(s: string) {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function initialOf(name: string) {
  const c = norm(name).trim().charAt(0);
  return c >= "A" && c <= "Z" ? c : "#";
}

export function ClientCombobox({
  clients,
  value,
  onChange,
  placeholder = "Selecionar cliente",
}: {
  clients: ClientOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [letter, setLetter] = useState<string | null>(null);

  const selected = useMemo(
    () => clients.find((c) => String(c.id) === value) ?? null,
    [clients, value],
  );

  const available = useMemo(() => {
    const set = new Set<string>();
    for (const c of clients) set.add(initialOf(c.name));
    return set;
  }, [clients]);

  const filtered = useMemo(() => {
    const q = norm(search);
    const digits = search.replace(/\D/g, "");
    return clients
      .filter((c) => {
        if (letter && initialOf(c.name) !== letter) return false;
        if (!q && !digits) return true;
        const byName = q.length > 0 && norm(c.name).includes(q);
        const byCpf =
          digits.length > 0 && (c.cpf ?? "").replace(/\D/g, "").includes(digits);
        return Boolean(byName || byCpf);
      })
      .sort((a, b) => norm(a.name).localeCompare(norm(b.name)))
      .slice(0, 300);
  }, [clients, search, letter]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between rounded-md font-normal"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.name : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        align="start"
        style={{ width: "var(--radix-popover-trigger-width)", minWidth: 320 }}
      >
        <div className="border-b p-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Buscar por nome ou CPF"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-md pl-8"
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setLetter(null)}
              className={cn(
                "rounded-md border px-2 py-0.5 text-xs font-semibold uppercase tracking-wider transition-colors",
                letter === null
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-background hover:bg-muted",
              )}
            >
              Todos
            </button>
            {LETTERS.map((l) => {
              const has = available.has(l);
              const active = letter === l;
              return (
                <button
                  key={l}
                  type="button"
                  disabled={!has}
                  onClick={() => setLetter(active ? null : l)}
                  className={cn(
                    "h-6 w-6 rounded-md border text-xs font-semibold transition-colors",
                    active
                      ? "border-primary bg-primary text-white"
                      : has
                        ? "border-border bg-background hover:bg-muted"
                        : "cursor-not-allowed border-transparent text-muted-foreground/30",
                  )}
                >
                  {l}
                </button>
              );
            })}
          </div>
        </div>
        <ScrollArea className="h-64">
          {filtered.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              Nenhum cliente encontrado.
            </p>
          ) : (
            <div className="p-1">
              {filtered.map((c) => {
                const isSel = String(c.id) === value;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      onChange(String(c.id));
                      setOpen(false);
                      setSearch("");
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                      isSel && "bg-muted",
                    )}
                  >
                    <span className="truncate">
                      <span className="font-medium">{c.name}</span>
                      {c.cpf ? (
                        <span className="ml-2 text-xs text-muted-foreground">{c.cpf}</span>
                      ) : null}
                    </span>
                    {isSel ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
        {filtered.length >= 300 ? (
          <div className="border-t px-3 py-1.5 text-xs text-muted-foreground">
            Mostrando os primeiros 300. Refine a busca por nome ou CPF.
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
