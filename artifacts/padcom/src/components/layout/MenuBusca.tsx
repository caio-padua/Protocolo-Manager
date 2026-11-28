// Seletor de menus da barra lateral: campo discreto, fixo abaixo do logo (fora da rolagem do menu).
// Digita parte do nome (sem acento, qualquer ordem) e escolhe o item; Enter abre, Esc fecha, setas navegam.
import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";

export type ItemBusca = { name: string; href: string; group: string; icon: React.ComponentType<{ className?: string }>; external?: boolean };

const semAcento = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

type Props = {
  itens: ItemBusca[];
  /** Menu recolhido: mostra só a lupa; ao clicar, expande o menu e foca o campo. */
  compacto: boolean;
  onExpandir: () => void;
  onAbrir: (item: ItemBusca) => void;
};

export function MenuBusca({ itens, compacto, onExpandir, onAbrir }: Props) {
  const [q, setQ] = useState("");
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const focarAoExpandir = useRef(false);

  const resultados = useMemo(() => {
    const termos = semAcento(q).split(/\s+/).filter(Boolean);
    if (!termos.length) return [];
    return itens
      .filter((i) => { const alvo = semAcento(`${i.name} ${i.group}`); return termos.every((t) => alvo.includes(t)); })
      .slice(0, 8);
  }, [q, itens]);

  useEffect(() => { setAtivo(0); }, [q]);
  useEffect(() => {
    if (!compacto && focarAoExpandir.current) { focarAoExpandir.current = false; inputRef.current?.focus(); }
  }, [compacto]);
  useEffect(() => {
    const fora = (e: MouseEvent) => { if (!raiz.current?.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  const abrir = (i: ItemBusca) => { setQ(""); setAberto(false); inputRef.current?.blur(); onAbrir(i); };

  if (compacto) {
    return (
      <div className="flex justify-center px-2 pb-2">
        <button
          type="button"
          aria-label="Buscar no menu"
          title="Buscar no menu"
          onClick={() => { focarAoExpandir.current = true; onExpandir(); }}
          className="flex h-8 w-8 items-center justify-center rounded-[5px] border border-sidebar-primary/25 bg-sidebar-accent/40 text-sidebar-foreground/60 transition-colors hover:text-sidebar-primary"
        >
          <Search className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div ref={raiz} className="relative px-4 pb-2">
      <div className="flex h-8 items-center gap-2 rounded-[5px] border border-sidebar-primary/25 bg-black/20 px-2.5 shadow-[inset_0_1px_3px_rgba(0,0,0,.45)] focus-within:border-sidebar-primary/60">
        <Search className="h-3.5 w-3.5 shrink-0 text-sidebar-primary/70" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setAberto(true); }}
          onFocus={() => setAberto(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setQ(""); setAberto(false); inputRef.current?.blur(); }
            else if (e.key === "ArrowDown") { e.preventDefault(); setAtivo((a) => Math.min(a + 1, resultados.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setAtivo((a) => Math.max(a - 1, 0)); }
            else if (e.key === "Enter" && resultados[ativo]) { e.preventDefault(); abrir(resultados[ativo]); }
          }}
          placeholder="Buscar no menu"
          aria-label="Buscar no menu"
          role="combobox"
          aria-expanded={aberto && resultados.length > 0}
          aria-controls="menu-busca-lista"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-[12px] text-sidebar-foreground placeholder:text-sidebar-foreground/40 focus:outline-none"
        />
      </div>
      {aberto && q.trim() !== "" && (
        <ul
          id="menu-busca-lista"
          role="listbox"
          className="absolute inset-x-4 top-[calc(100%-2px)] z-[70] max-h-72 overflow-y-auto rounded-[5px] border border-sidebar-primary/40 bg-sidebar py-1 shadow-[0_10px_24px_rgba(0,0,0,.55)]"
        >
          {resultados.length === 0 && <li className="px-3 py-2 text-[11px] text-sidebar-foreground/50">Nenhum menu encontrado</li>}
          {resultados.map((r, idx) => {
            const Icone = r.icon;
            return (
              <li key={r.href + r.name} role="option" aria-selected={idx === ativo}>
                <button
                  type="button"
                  onMouseEnter={() => setAtivo(idx)}
                  onClick={() => abrir(r)}
                  className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left ${idx === ativo ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/75"}`}
                >
                  <Icone className="h-4 w-4 shrink-0 text-sidebar-primary/80" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] leading-tight">{r.name}</span>
                    <span className="block truncate text-[9px] uppercase tracking-[0.12em] text-sidebar-foreground/40">{r.group}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
