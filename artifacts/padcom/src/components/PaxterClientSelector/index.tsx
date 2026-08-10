/**
 * PaxterClientSelector — Seletor universal de cliente/paciente (Paxter).
 *
 * Substitui ClientPicker, ClientCombobox, CockpitSearch e Radix <Select> de clientes.
 * Busca por nome, CPF e telefone. Barra A–Z com estilo keycap 3D.
 * CPF sempre visível ao lado do nome para evitar seleção de homônimos.
 * Mini-avatar (foto ou iniciais) no trigger e em cada linha da lista.
 *
 * Skill de referência: .agents/skills/skill-paxter-client-selector/SKILL.md
 */

import { useState, useMemo, useRef } from "react";
import { Search, X, ChevronsUpDown, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, tituloProprio } from "@/lib/utils";

import type { PaxterClientSelectorProps, PaxterClientOption } from "./types";
import { useClientFilter, useServerSearch, formatCpf } from "./useClientFilter";
import { AlphabetBar } from "./AlphabetBar";

export type { PaxterClientOption, PaxterClientSelectorProps };

// ── Helper: iniciais do nome ──────────────────────────────────────────────────

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0]?.[0] ?? "?").toUpperCase();
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

// ── Mini avatar (foto ou iniciais) ───────────────────────────────────────────

function ClientAvatar({
  name,
  photoUrl,
  size = "md",
}: {
  name: string;
  photoUrl?: string | null;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "h-5 w-5 text-[9px] rounded-[3px]" : "h-7 w-7 text-[10px] rounded-[4px]";
  return (
    <span
      className={cn(
        "shrink-0 overflow-hidden flex items-center justify-center font-bold bg-primary/10 text-primary",
        dim,
      )}
    >
      {photoUrl ? (
        <img src={photoUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────

export function PaxterClientSelector({
  clientes = [],
  serverSearch = false,
  value,
  onChange,
  variant = "popover",
  placeholder = "Selecionar cliente…",
  allOptionLabel,
  disabled = false,
  className,
}: PaxterClientSelectorProps) {
  const [open, setOpen] = useState(false);
  // Para server-side: guarda o nome do selecionado localmente
  const [serverName, setServerName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Hooks de dados — só um é usado por vez
  const localFilter  = useClientFilter(serverSearch ? [] : clientes);
  const serverFilter = useServerSearch();
  const filter = serverSearch ? serverFilter : localFilter;

  // Cliente selecionado (modo local)
  const selected = useMemo(() => {
    if (value == null || serverSearch) return null;
    return clientes.find((c) => c.id === value) ?? null;
  }, [value, clientes, serverSearch]);

  // Nome de exibição no trigger/input
  const displayName = selected?.name ?? (serverSearch ? serverName : null);
  const displayCpf  = selected?.cpf ? formatCpf(selected.cpf) : null;

  // Abre o popover e foca o input
  function handleOpen(v: boolean) {
    setOpen(v);
    if (v) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      filter.setBusca("");
    }
  }

  // Seleciona um cliente
  function handleSelect(cliente: PaxterClientOption | null) {
    if (cliente === null) {
      onChange(null);
      setServerName(null);
    } else {
      onChange(cliente.id);
      if (serverSearch) setServerName(cliente.name);
    }
    setOpen(false);
    filter.setBusca("");
  }

  // ── Painel de conteúdo (shared entre popover e search) ───────────────────

  const content = (
    <div className="flex flex-col gap-2 p-2">
      {/* Campo de busca */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="search"
          autoComplete="off"
          placeholder={`Buscar por nome, CPF ou telefone…`}
          value={filter.busca}
          onChange={(e) => filter.setBusca(e.target.value)}
          className="w-full rounded-md border border-input bg-background pl-7 pr-3 py-1.5 text-sm outline-none ring-0 focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/60"
        />
        {filter.loading && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        )}
      </div>

      {/* Barra A–Z */}
      <AlphabetBar
        letraSelecionada={filter.letra}
        letrasDisponiveis={filter.letrasDisponiveis}
        onLetraChange={filter.setLetra}
      />

      {/* Lista de clientes */}
      <ScrollArea className="h-[280px] rounded-md">
        <div className="space-y-[2px] pr-1">
          {/* Opção "Todos" (allOptionLabel) */}
          {allOptionLabel && (
            <ClientRow
              name={allOptionLabel}
              cpf={null}
              photoUrl={null}
              selected={value === null}
              onClick={() => handleSelect(null)}
            />
          )}

          {/* Estado: aguardando busca (server-side) */}
          {serverSearch && filter.busca.trim().length < 2 && filter.filtrados.length === 0 && (
            <p className="py-8 text-center text-xs text-muted-foreground/60">
              Digite pelo menos 2 caracteres para buscar.
            </p>
          )}

          {/* Estado: sem resultado */}
          {!filter.loading &&
            filter.filtrados.length === 0 &&
            (!serverSearch || filter.busca.trim().length >= 2) && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhum cliente encontrado.
              </p>
            )}

          {/* Linhas de clientes */}
          {filter.filtrados.map((c) => (
            <ClientRow
              key={c.id}
              name={c.name}
              cpf={c.cpf}
              photoUrl={c.photoUrl}
              selected={c.id === value}
              onClick={() => handleSelect(c)}
            />
          ))}
        </div>
      </ScrollArea>

      {/* Aviso de overflow */}
      {filter.overflow && (
        <p className="border-t px-2 pt-1.5 pb-0.5 text-[11px] text-muted-foreground/70">
          Mostrando os primeiros 300 resultados. Refine a busca por nome, CPF ou telefone.
        </p>
      )}
    </div>
  );

  // ── Variante: SEARCH (campo sempre visível) ──────────────────────────────

  if (variant === "search") {
    return (
      <div className={cn("relative", className)}>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            autoComplete="off"
            disabled={disabled}
            placeholder={
              displayName
                ? `Trocar: ${displayName.split(" ")[0]}…`
                : placeholder
            }
            value={filter.busca}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              filter.setBusca(e.target.value);
              setOpen(true);
            }}
            className={cn(
              "w-full rounded-md border border-input/60 bg-navy/30 pl-7 pr-3 py-1.5 text-sm text-white/80",
              "placeholder:text-white/40 outline-none focus:border-[rgba(231,205,143,0.5)] focus:bg-navy/50",
              "transition-colors",
              disabled && "cursor-not-allowed opacity-50",
            )}
          />
          {filter.loading && (
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          )}
        </div>

        {/* Dropdown inline */}
        {open && (
          <>
            {/* Overlay para fechar ao clicar fora */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => {
                setOpen(false);
                filter.setBusca("");
              }}
            />
            <div
              className="absolute right-0 top-full z-50 mt-1 w-[380px] max-w-[90vw] rounded-lg border border-border/60 bg-popover shadow-xl"
              style={{ maxHeight: 420 }}
            >
              {content}
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Variante: POPOVER (padrão) ───────────────────────────────────────────

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-md border border-input",
            "bg-background px-3 py-2 text-sm transition-colors min-h-[48px]",
            "hover:border-primary/40 hover:bg-muted/30",
            "focus:outline-none focus:ring-1 focus:ring-primary/40",
            disabled && "cursor-not-allowed opacity-50",
            className,
          )}
        >
          {/* Lado esquerdo: avatar + nome + CPF como subtítulo */}
          {displayName ? (
            <span className="flex items-center gap-2 min-w-0 truncate">
              <ClientAvatar name={tituloProprio(displayName)} photoUrl={selected?.photoUrl} size="sm" />
              <span className="flex flex-col items-start min-w-0">
                <span className="truncate font-medium text-foreground leading-tight">
                  {tituloProprio(displayName)}
                </span>
                {displayCpf && (
                  <span className="text-[11px] text-muted-foreground tabular-nums leading-tight">
                    {displayCpf}
                  </span>
                )}
              </span>
            </span>
          ) : (
            <span className="truncate text-muted-foreground">{placeholder}</span>
          )}

          {/* Lado direito: X para limpar ou chevron */}
          <span className="flex shrink-0 items-center gap-1">
            {value !== null && (
              <span
                role="button"
                aria-label="Limpar seleção"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && onChange(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(null);
                  setServerName(null);
                }}
                className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronsUpDown className="h-4 w-4 text-muted-foreground/50" />
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="p-0 shadow-xl"
        align="start"
        style={{
          width: "var(--radix-popover-trigger-width)",
          minWidth: 320,
          maxWidth: 500,
        }}
        sideOffset={4}
      >
        {content}
      </PopoverContent>
    </Popover>
  );
}

// ── ClientRow — linha individual da lista ────────────────────────────────────

function ClientRow({
  name,
  cpf,
  photoUrl,
  selected,
  onClick,
}: {
  name: string;
  cpf?: string | null;
  photoUrl?: string | null;
  selected: boolean;
  onClick: () => void;
}) {
  const cpfFormatado = cpf ? formatCpf(cpf) : null;
  const nomeTitulo = tituloProprio(name);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-[5px] px-2 py-2",
        "text-left text-sm transition-colors",
        selected
          ? "bg-primary/10 text-primary font-semibold"
          : "hover:bg-muted/70 text-foreground",
      )}
    >
      {/* Mini avatar */}
      <ClientAvatar name={nomeTitulo} photoUrl={photoUrl} size="md" />

      {/* Nome + CPF em linha separada abaixo */}
      <span className="flex flex-col min-w-0 flex-1">
        <span className="truncate font-medium leading-tight">{nomeTitulo}</span>
        {cpfFormatado && (
          <span className="text-[11px] text-muted-foreground tabular-nums leading-tight">
            {cpfFormatado}
          </span>
        )}
      </span>

      {selected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
    </button>
  );
}
