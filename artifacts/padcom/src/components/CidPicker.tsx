import { useEffect, useRef, useState } from "react";

// Autocomplete de CID-10 (Arsenal Clínico / Cockpit da Consulta).
// Input de texto LIVRE controlado: o usuário pode digitar qualquer coisa; ao
// digitar, busca no catálogo GET /api/cid10?q= (debounce ~250ms) e mostra um
// dropdown. Clicar preenche com o CÓDIGO (ex.: E11.9), mas o texto continua
// livre — nunca trava.

const API = import.meta.env.BASE_URL + "api";

interface Cid10Row {
  id: number;
  codigo: string;
  descricao: string | null;
  capitulo: string | null;
}

interface CidPickerProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}

export function CidPicker({ value, onChange, placeholder, className }: CidPickerProps) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Cid10Row[]>([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipRef = useRef(false);

  // Busca com debounce sempre que o texto muda (a não ser logo após selecionar).
  useEffect(() => {
    if (skipRef.current) {
      skipRef.current = false;
      return;
    }
    const termo = value.trim();
    if (!termo) {
      setRows([]);
      setOpen(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      fetch(`${API}/cid10?q=${encodeURIComponent(termo)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((d: Cid10Row[]) => {
          setRows(Array.isArray(d) ? d : []);
          setOpen(true);
        })
        .catch(() => setRows([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  // Fecha ao clicar fora.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function selecionar(row: Cid10Row) {
    skipRef.current = true;
    onChange(row.codigo);
    setOpen(false);
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        className={className ?? "field-engraved h-10 w-full px-3"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          if (rows.length > 0) setOpen(true);
        }}
        placeholder={placeholder ?? "ex.: E11.9 ou diabetes"}
        autoComplete="off"
      />
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {loading ? (
            <div className="px-3 py-2 text-xs text-slate-400">Buscando…</div>
          ) : rows.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-400">Nenhum CID encontrado — texto livre permitido.</div>
          ) : (
            rows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => selecionar(row)}
                className="flex w-full flex-col items-start gap-0.5 border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-slate-50"
              >
                <span className="text-sm font-semibold text-[#16284a]">{row.codigo}</span>
                <span className="text-xs text-slate-500">
                  {row.descricao ?? row.capitulo ?? "—"}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default CidPicker;
