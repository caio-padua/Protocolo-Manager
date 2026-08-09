/**
 * @deprecated Use PaxterClientSelector em vez deste componente.
 * import { PaxterClientSelector } from "@/components/PaxterClientSelector";
 *
 * Mantido apenas para referência histórica (Regra de Ouro: nunca apagar sem ordem dupla do CEO).
 * Arquivo migrado em 09/08/2026 — spec: specs/paxter-client-selector.md
 *
 * ClientPicker — seletor de cliente com barra do alfabeto.
 *
 * Padrão sênior PAXTER:
 *  - Barra A-Z acima da busca. Clique numa letra = filtra instantaneamente.
 *  - Letras sem clientes ficam esmaecidas (cursor-not-allowed).
 *  - Letra ativa destacada em destaque primário.
 *  - Campo de busca por nome OU CPF (ambos, sem acento).
 *  - Lista limitada a 300 itens; rola em ScrollArea.
 *  - CPF exibido na linha do cliente.
 */
import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// ─── Tipos públicos ────────────────────────────────────────────────────────────
export interface ClientPickerOption {
  id: number;
  name: string;
  cpf?: string | null;
  /** Se fornecido, clientes com status != "active" ficam fora da lista. */
  status?: string | null;
  /** Se fornecido e não nulo, cliente está apagado e fica fora da lista. */
  deletedAt?: string | null;
}

interface ClientPickerProps {
  clientes: ClientPickerOption[];
  value: number | null;
  onChange: (id: number | null) => void;
  placeholder?: string;
  allOptionLabel?: string;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
}

// ─── Utilitários ──────────────────────────────────────────────────────────────
const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function norm(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function inicial(nome: string): string {
  const c = norm(nome).trim().charAt(0);
  return c >= "A" && c <= "Z" ? c : "#";
}

// ─── Componente ──────────────────────────────────────────────────────────────
export function ClientPicker({
  clientes,
  value,
  onChange,
  placeholder = "Escolha um cliente...",
  allOptionLabel,
  className,
  triggerClassName,
  disabled,
}: ClientPickerProps) {
  const [open, setOpen]       = useState(false);
  const [busca, setBusca]     = useState("");
  const [letra, setLetra]     = useState<string | null>(null);

  // Letras disponíveis (pré-computadas)
  const disponíveis = useMemo(() => {
    const s = new Set<string>();
    for (const c of clientes) s.add(inicial(c.name));
    return s;
  }, [clientes]);

  // Filtro principal — busca por nome E CPF, combinado com filtro de letra
  // Clientes inativos (status != "active") ou apagados (deletedAt != null) são excluídos
  // quando esses campos estiverem presentes no objeto.
  const filtrados = useMemo(() => {
    const q      = norm(busca.trim());
    const digits = busca.replace(/\D/g, "");
    return clientes
      .filter((c) => {
        if (c.deletedAt != null) return false;
        if (c.status != null && c.status !== "active") return false;
        if (letra && inicial(c.name) !== letra) return false;
        if (!q && !digits) return true;
        const byName = q.length > 0 && norm(c.name).includes(q);
        const byCpf  = digits.length > 0 && (c.cpf ?? "").replace(/\D/g, "").includes(digits);
        return Boolean(byName || byCpf);
      })
      .sort((a, b) => norm(a.name).localeCompare(norm(b.name)))
      .slice(0, 300);
  }, [clientes, busca, letra]);

  const selecionado = value != null ? clientes.find((c) => c.id === value) ?? null : null;

  function fechar(id: number | null) {
    onChange(id);
    setOpen(false);
    setBusca("");
  }

  function limpar(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(null);
    setBusca("");
    setLetra(null);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* ── Trigger ────────────────────────────────────────────────────── */}
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Selecionar cliente"
          disabled={disabled}
          className={cn(
            "field-engraved h-10 w-full justify-between font-normal",
            triggerClassName,
          )}
        >
          <span className={cn("truncate", !selecionado && "text-slate-400")}>
            {selecionado ? selecionado.name : placeholder}
          </span>
          <span className="ml-2 flex shrink-0 items-center gap-1">
            {selecionado && (
              <X
                className="h-3.5 w-3.5 opacity-50 hover:opacity-100"
                onClick={limpar}
              />
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-60" />
          </span>
        </Button>
      </PopoverTrigger>

      {/* ── Painel ─────────────────────────────────────────────────────── */}
      <PopoverContent
        className={cn("p-0", className)}
        align="start"
        style={{ width: "var(--radix-popover-trigger-width)", minWidth: 320 }}
      >
        {/* Cabeçalho: busca + alfabeto */}
        <div className="border-b bg-muted/30 p-2 space-y-2">
          {/* Campo de busca */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              autoFocus
              placeholder="Buscar por nome ou CPF…"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                if (e.target.value) setLetra(null); // busca livre zera a letra
              }}
              className="rounded-md pl-8 h-9 text-sm"
            />
          </div>

          {/* Barra do alfabeto */}
          <div className="flex flex-wrap gap-[3px]">
            {/* Botão TODOS */}
            <button
              type="button"
              onClick={() => { setLetra(null); setBusca(""); }}
              className={cn(
                "h-6 rounded border px-2 text-[10px] font-bold uppercase tracking-widest transition-colors",
                letra === null && !busca
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              todos
            </button>

            {LETRAS.map((l) => {
              const tem    = disponíveis.has(l);
              const ativa  = letra === l;
              return (
                <button
                  key={l}
                  type="button"
                  disabled={!tem}
                  onClick={() => {
                    setLetra(ativa ? null : l);
                    setBusca("");
                  }}
                  className={cn(
                    "h-6 w-6 rounded border text-[11px] font-bold transition-colors",
                    ativa
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : tem
                        ? "border-border bg-background text-foreground hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
                        : "cursor-not-allowed border-transparent text-muted-foreground/25",
                  )}
                >
                  {l}
                </button>
              );
            })}
          </div>
        </div>

        {/* Lista de clientes */}
        <ScrollArea className="h-64">
          {filtrados.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              Nenhum cliente encontrado.
            </p>
          ) : (
            <div className="p-1">
              {/* Opção "Todos" (allOptionLabel) */}
              {allOptionLabel != null && (
                <button
                  type="button"
                  onClick={() => fechar(null)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                    value == null && "bg-muted",
                  )}
                >
                  <Check className={cn("h-4 w-4 shrink-0 text-primary", value != null && "invisible")} />
                  <span className="font-medium text-muted-foreground">{allOptionLabel}</span>
                </button>
              )}

              {filtrados.map((c) => {
                const sel = value === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => fechar(c.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                      sel && "bg-muted",
                    )}
                  >
                    <span className="flex items-baseline gap-2 truncate">
                      <span className="font-medium truncate">{c.name}</span>
                      {c.cpf && (
                        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                          {c.cpf}
                        </span>
                      )}
                    </span>
                    {sel && <Check className="h-4 w-4 shrink-0 text-primary" />}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Rodapé quando há truncagem */}
        {filtrados.length >= 300 && (
          <div className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
            Mostrando os primeiros 300. Refine pelo alfabeto ou digite para filtrar.
          </div>
        )}

        {/* Contador */}
        {filtrados.length > 0 && filtrados.length < 300 && (
          <div className="border-t px-3 py-1 text-[11px] text-muted-foreground/60">
            {filtrados.length} cliente{filtrados.length !== 1 ? "s" : ""}
            {letra ? ` com "${letra}"` : busca ? " encontrado(s)" : " no total"}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
