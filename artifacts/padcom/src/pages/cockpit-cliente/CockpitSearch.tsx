// CockpitSearch — campo de busca-enquanto-digita para seleção de cliente.
// Substitui ClientPicker (que carregava TODOS os clientes).
// Mínimo 2 caracteres → debounce 300ms → GET /api/clients?search=...&limit=20

import { useRef, useEffect } from "react";
import { tituloProprio } from "@/lib/utils";
import { Search, X, Loader2 } from "lucide-react";
import { useCockpitSearch } from "./hooks/useCockpitSearch";

const NAVY = "#16294a";
const GOLD = "#9a7b32";

interface CockpitSearchProps {
  onSelect: (id: number) => void;
  currentName?: string;
  placeholder?: string;
}

export default function CockpitSearch({
  onSelect,
  currentName,
  placeholder = "Buscar paciente por nome ou CPF…",
}: CockpitSearchProps) {
  const { query, setQuery, results, loading, open, setOpen, clear } = useCockpitSearch();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        listRef.current && !listRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [setOpen]);

  const showDropdown = open && (results.length > 0 || loading || query.length >= 2);

  return (
    <div className="relative" style={{ minWidth: 280, maxWidth: 380 }}>
      {/* Campo gravado */}
      <div
        className="concave-3d flex items-center gap-2 px-3 h-9"
        style={{ borderColor: `${GOLD}60` }}
      >
        {loading
          ? <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" style={{ color: GOLD }} />
          : <Search className="w-3.5 h-3.5 shrink-0" style={{ color: GOLD }} />}
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-[12px] font-semibold text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
        {query && (
          <button
            type="button"
            onClick={clear}
            className="shrink-0 hover:opacity-70 transition-opacity"
            aria-label="Limpar busca"
          >
            <X className="w-3.5 h-3.5" style={{ color: GOLD }} />
          </button>
        )}
      </div>

      {/* Dropdown de resultados */}
      {showDropdown && (
        <div
          ref={listRef}
          className="absolute top-full left-0 right-0 z-50 mt-1 panel-3d border-none overflow-hidden"
          style={{
            boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
            maxHeight: 300,
            overflowY: "auto",
          }}
        >
          {loading && (
            <div className="flex items-center gap-2 px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
              <Loader2 className="w-3 h-3 animate-spin" /> Buscando…
            </div>
          )}
          {!loading && results.length === 0 && query.length >= 2 && (
            <div className="px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
              Nenhum resultado para "{query}"
            </div>
          )}
          {results.map(r => (
            <button
              key={r.id}
              type="button"
              className="w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors border-b border-border/20 last:border-b-0 flex items-center gap-3"
              onClick={() => { onSelect(r.id); clear(); }}
            >
              {/* Iniciais */}
              <div
                className="w-8 h-8 shrink-0 flex items-center justify-center font-black text-[11px] rounded-[5px]"
                style={{
                  background: `linear-gradient(135deg, #1e3668 0%, #0f1e3a 100%)`,
                  border: `1.5px solid ${GOLD}`,
                  color: GOLD,
                  fontFamily: "'EB Garamond', serif",
                  fontSize: 13,
                }}
              >
                {r.name.trim().split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
              </div>
              <div className="min-w-0">
                <div
                  className="font-bold truncate text-primary"
                  style={{ fontFamily: "'EB Garamond', serif", fontSize: 14 }}
                >
                  {tituloProprio(r.name)}
                </div>
                {r.cpf && (
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
                    {r.cpf}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
