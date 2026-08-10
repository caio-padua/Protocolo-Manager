// Página: Procedência de Exames — de onde vieram os resultados
// Rota: /procedencia-exames
// Menu: O Ato Médico → Procedência de Exames
// Motor: ProcedenciaDocumentosBloco (unificado)
// Pedido CEO 23/07/2026.

import { useState, useEffect, useRef } from "react";
import { tituloProprio } from "@/lib/utils";
import { MapPin, Search, UserRound, X, Loader2 } from "lucide-react";
import { useListClients } from "@workspace/api-client-react";
import ProcedenciaDocumentosBloco from "@/components/ProcedenciaDocumentosBloco";

const NAVY  = "#16294a";
const GOLD  = "#9a7b32";
const CREAM = "hsl(40 33% 96%)";

type ClienteItem = { id: number; name: string; cpf?: string | null };

export default function ProcedenciaExamesPage() {
  const [busca, setBusca]           = useState("");
  const [debouncedBusca, setDeb]    = useState("");
  const [clienteId, setClienteId]   = useState<number | null>(() => {
    const p = new URLSearchParams(window.location.search).get("c");
    return p ? Number(p) : null;
  });
  const [clienteNome, setClienteNome] = useState("");
  const [aberto, setAberto]         = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef  = useRef<HTMLDivElement>(null);

  // Debounce: 300ms após parar de digitar, dispara busca server-side
  useEffect(() => {
    const t = setTimeout(() => setDeb(busca.trim()), 300);
    return () => clearTimeout(t);
  }, [busca]);

  // Busca server-side: mínimo 2 chars; sem texto = lista vazia no dropdown
  const searchParam = debouncedBusca.length >= 2 ? { search: debouncedBusca } : undefined;
  const { data: clientes, isLoading, isFetching } = useListClients(searchParam);

  // Resultado já vem filtrado do servidor; ordenar alfabeticamente
  const filtrados: ClienteItem[] = debouncedBusca.length >= 2
    ? [...(clientes ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
      )
    : [];

  function selecionar(c: ClienteItem) {
    setClienteId(c.id);
    setClienteNome(c.name);
    setBusca("");
    setAberto(false);
  }

  function limpar() {
    setClienteId(null);
    setClienteNome("");
    setBusca("");
    inputRef.current?.focus();
  }

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        dropRef.current && !dropRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setAberto(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);


  return (
    <div className="min-h-screen font-sans" style={{ background: CREAM }}>

      {/* ── HEADER ── */}
      <header
        className="px-6 py-5"
        style={{
          background: "linear-gradient(180deg,#1e3668 0%,#16294a 100%)",
          borderBottom: "2px solid rgba(231,205,143,0.25)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
        }}
      >
        <div className="flex items-center gap-3">
          <MapPin className="h-5 w-5 shrink-0" style={{ color: GOLD }} />
          <h1
            className="text-[20px] font-black uppercase tracking-[0.10em]"
            style={{ color: "#e7cd8f", textShadow: "0 1px 8px rgba(0,0,0,0.55)" }}
          >
            Procedência de Exames
          </h1>
        </div>
        <p className="mt-1 text-[12px] text-slate-400">
          Motor unificado de recebimento — todos os laudos do cliente em um único lugar,
          com origem, status, analitos extraídos e acesso direto ao Drive.
        </p>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 space-y-6">

        {/* ── SELETOR DE CLIENTE ── */}
        <div className="panel-3d p-5">
          <div
            className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em]"
            style={{ color: NAVY }}
          >
            <UserRound className="h-3.5 w-3.5" style={{ color: GOLD }} />
            Selecionar Cliente (ordem alfabética)
          </div>

          <div className="relative">
            <div className="concave-3d flex items-center gap-2 px-3 py-2.5">
              <Search className="h-4 w-4 shrink-0" style={{ color: GOLD }} />
              <input
                ref={inputRef}
                className="flex-1 bg-transparent outline-none text-[13px] placeholder:text-slate-400"
                style={{ color: NAVY }}
                placeholder="Digite 2+ letras para buscar…"
                value={busca}
                onChange={(e) => { setBusca(e.target.value); setAberto(true); }}
                onFocus={() => setAberto(true)}
              />
              {(busca || clienteNome) && (
                <button type="button" onClick={limpar} className="shrink-0">
                  <X className="h-3.5 w-3.5 text-slate-400 hover:text-red-500 transition-colors" />
                </button>
              )}
            </div>

            {/* Dropdown de resultados (server-side, mín. 2 chars) */}
            {aberto && busca.trim().length >= 2 && (
              <div
                ref={dropRef}
                className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-[6px] shadow-xl border"
                style={{ background: "#fff", borderColor: "#d8cfbc" }}
              >
                {isFetching ? (
                  <div className="flex items-center gap-2 px-4 py-3 text-[12px]" style={{ color: "#94a3b8" }}>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Buscando…
                  </div>
                ) : filtrados.length === 0 ? (
                  <div className="px-4 py-3 text-[12px]" style={{ color: "#94a3b8" }}>
                    Nenhum cliente encontrado para "{debouncedBusca}"
                  </div>
                ) : (
                  filtrados.slice(0, 80).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full px-4 py-2.5 text-left text-[13px] hover:bg-amber-50 border-b last:border-0 transition-colors"
                      style={{ color: NAVY, borderColor: "#f0ebe0" }}
                      onMouseDown={() => selecionar(c)}
                    >
                      <span className="font-semibold">{tituloProprio(c.name)}</span>
                      {c.cpf && <span className="ml-2 text-[11px] text-slate-400">{c.cpf}</span>}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Badge do cliente selecionado */}
          {clienteNome && !aberto && (
            <div
              className="mt-3 flex items-center gap-3 rounded-[6px] px-3 py-2"
              style={{ background: "rgba(154,123,50,0.08)", border: "1px solid rgba(154,123,50,0.25)" }}
            >
              <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: GOLD }} />
              <span className="text-[13px] font-semibold" style={{ color: NAVY }}>
                {clienteNome}
              </span>
              <button
                type="button"
                className="ml-auto text-[11px] hover:text-red-500 transition-colors"
                style={{ color: "#94a3b8" }}
                onClick={limpar}
              >
                Trocar cliente
              </button>
            </div>
          )}
        </div>

        {/* ── MOTOR UNIFICADO ── */}
        {clienteId ? (
          <div className="panel-3d border-none p-0 overflow-hidden">
            {/* Cabeçalho do bloco */}
            <div
              className="flex items-center gap-2 px-5 py-3"
              style={{
                background: "linear-gradient(90deg,#1e3668 0%,#16294a 100%)",
                borderBottom: "2px solid rgba(231,205,143,0.22)",
              }}
            >
              <MapPin className="h-4 w-4 shrink-0" style={{ color: GOLD }} />
              <span className="text-[11px] font-black uppercase tracking-[0.22em]" style={{ color: "#e7cd8f" }}>
                Laudos de {clienteNome}
              </span>
              <span className="ml-auto text-[10px] text-slate-400">
                Clique em qualquer card para expandir os analitos extraídos
              </span>
            </div>
            <div className="p-5">
              <ProcedenciaDocumentosBloco clientId={clienteId} comCabecalho />
            </div>
          </div>
        ) : (
          <div className="panel-3d p-12 text-center">
            <MapPin className="mx-auto mb-4 h-10 w-10 opacity-25" style={{ color: GOLD }} />
            <p className="text-[14px] font-black uppercase tracking-[0.14em]" style={{ color: NAVY }}>
              Selecione um cliente acima
            </p>
            <p className="mt-2 text-[12px]" style={{ color: "#647c97" }}>
              Os laudos, analitos extraídos e botões de Drive aparecerão aqui.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
