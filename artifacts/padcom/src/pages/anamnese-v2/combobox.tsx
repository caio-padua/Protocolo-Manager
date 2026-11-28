import { useEffect, useId, useRef, useState } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronDown, X } from "lucide-react";
import type { Opcao } from "./types";

const norm = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
/** Busca por trecho, sem diferenciar acento nem maiuscula (a busca aproximada do cmdk trazia itens sem relacao). */
const buscaSemAcento = (valor: string, busca: string) => (norm(valor).includes(norm(busca.trim())) ? 1 : 0);

interface Props {
  opcoes: Opcao[];
  /** Rotulos selecionados. */
  selecionados: string[];
  multiplo: boolean;
  onToggle: (label: string) => void;
  placeholder?: string;
  ariaLabel: string;
}

/**
 * Seletor pesquisavel. Abre para baixo quando ha espaco e para cima quando falta (Radix/floating-ui),
 * fica ancorado ao campo, nunca sai da tela e e renderizado DENTRO da raiz tematica da anamnese
 * (.anamnese-solo) para herdar tema claro/escuro. Acompanha o teclado movel via visualViewport.
 */
export function SearchableSelect({ opcoes, selecionados, multiplo, onToggle, placeholder, ariaLabel }: Props) {
  const [aberto, setAberto] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listId = useId();
  const raiz = triggerRef.current?.closest<HTMLElement>(".anamnese-solo") ?? undefined;

  useEffect(() => {
    if (!aberto) return;
    // Teclado movel: reposiciona o painel quando a area visivel muda.
    const vv = window.visualViewport;
    const onVv = () => window.dispatchEvent(new Event("resize"));
    vv?.addEventListener("resize", onVv);
    vv?.addEventListener("scroll", onVv);
    return () => { vv?.removeEventListener("resize", onVv); vv?.removeEventListener("scroll", onVv); };
  }, [aberto]);

  const resumo = selecionados.length === 0 ? null : multiplo && selecionados.length > 1 ? `${selecionados.length} selecionadas` : selecionados[0];

  return (
    <div className="flex flex-col gap-2">
      <PopoverPrimitive.Root open={aberto} onOpenChange={setAberto}>
        <PopoverPrimitive.Trigger asChild>
          <button
            ref={triggerRef}
            type="button"
            role="combobox"
            aria-expanded={aberto}
            aria-controls={listId}
            aria-haspopup="listbox"
            aria-label={ariaLabel}
            data-testid="combobox-trigger"
            className="leva-chip flex min-h-[48px] w-full items-center justify-between gap-2 px-4 py-3 text-left text-base font-medium outline-none focus-visible:ring-2 focus-visible:ring-[#c9a24e]"
          >
            <span className={`min-w-0 truncate ${resumo ? "" : "opacity-60"}`}>{resumo ?? placeholder ?? "Selecione…"}</span>
            <ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${aberto ? "rotate-180" : ""}`} aria-hidden />
          </button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal container={raiz}>
          <PopoverPrimitive.Content
            side="bottom"
            align="start"
            sideOffset={6}
            collisionPadding={12}
            avoidCollisions
            onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true }); }}
            style={{ width: "var(--radix-popover-trigger-width)", maxHeight: "min(22rem, var(--radix-popover-content-available-height))", zIndex: 80 }}
            className="flex flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl outline-none"
          >
            <Command className="min-h-0 flex-1" loop filter={buscaSemAcento}>
              <CommandInput placeholder="Pesquisar…" aria-label="Pesquisar opção" className="text-base" />
              <CommandList id={listId} className="max-h-none flex-1 overscroll-contain">
                <CommandEmpty>Nenhuma opção encontrada.</CommandEmpty>
                {opcoes.map((o) => {
                  const ativo = selecionados.includes(o.label);
                  return (
                    <CommandItem
                      key={String(o.valor)}
                      value={o.label}
                      onSelect={() => { onToggle(o.label); if (!multiplo) setAberto(false); }}
                      className="min-h-[44px] gap-2 text-base data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                    >
                      <Check className={`h-4 w-4 shrink-0 ${ativo ? "opacity-100" : "opacity-0"}`} aria-hidden />
                      <span className="min-w-0 whitespace-normal">{o.label}</span>
                    </CommandItem>
                  );
                })}
              </CommandList>
            </Command>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
      {multiplo && selecionados.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Opções escolhidas">
          {selecionados.map((s) => (
            <li key={s}>
              <button type="button" onClick={() => onToggle(s)} aria-label={`Remover ${s}`}
                className="leva-chip flex items-center gap-1 px-2.5 py-1 text-xs font-medium" data-active>
                <span className="max-w-[14rem] truncate">{s}</span><X className="h-3 w-3 shrink-0" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
