// Página: Procedência de Exames — de onde vieram os resultados
// Rota: /procedencia-exames
// Menu: O Ato Médico → Procedência de Exames
// Padrão: seletor A-Z com busca + ExamesEnviadosPanel

import { useState, useMemo, useEffect, useRef } from "react";
import { MapPin, Search, UserRound, X } from "lucide-react";
import { useListClients } from "@workspace/api-client-react";
import ExamesEnviadosPanel from "@/pages/cockpit-cliente/panels/ExamesEnviadosPanel";

const NAVY = "#16294a";
const GOLD = "#9a7b32";
const CREAM = "hsl(40 33% 96%)";

type ClienteItem = { id: number; name: string; cpf?: string | null };

export default function ProcedenciaExamesPage() {
  const [busca, setBusca] = useState("");
  const [clienteId, setClienteId]   = useState<number | null>(null);
  const [clienteNome, setClienteNome] = useState("");
  const [aberto, setAberto] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef  = useRef<HTMLDivElement>(null);

  const { data: clientes, isLoading } = useListClients();

  const filtrados = useMemo<ClienteItem[]>(() => {
    const lista = [...(clientes ?? [])].sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
    );
    const q = busca.trim().toLowerCase();
    if (!q) return lista;
    return lista.filter(
      c =>
        c.name.toLowerCase().includes(q) ||
        (c.cpf ?? "").replace(/\D/g, "").includes(q.replace(/\D/g, ""))
    );
  }, [clientes, busca]);

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

  // Fechar dropdown ao clicar fora
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

  // Letra inicial para lista A-Z agrupada (quando busca vazia)
  const grupos = useMemo(() => {
    if (busca.trim()) return null;
    const mapa = new Map<string, ClienteItem[]>();
    for (const c of filtrados) {
      const letra = c.name[0]?.toUpperCase() ?? "#";
      const lista = mapa.get(letra) ?? [];
      lista.push(c);
      mapa.set(letra, lista);
    }
    return [...mapa.entries()];
  }, [filtrados, busca]);

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
            style={{ color: "#e7cd8f", fontFamily: "var(--app-font-display)", textShadow: "0 1px 8px rgba(0,0,0,0.55)" }}
          >
            Procedência de Exames
          </h1>
        </div>
        <p className="mt-1 text-[12px] text-slate-400">
          Selecione um cliente para ver de onde vieram os arquivos e resultados de exame.
        </p>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 space-y-6">

        {/* ── SELETOR DE CLIENTE ── */}
        <div className="panel-3d p-5">
          <div
            className="mb-3 text-[10px] font-black uppercase tracking-[0.28em] flex items-center gap-2"
            style={{ color: NAVY }}
          >
            <UserRound className="h-3.5 w-3.5" style={{ color: GOLD }} />
            Selecionar Cliente
          </div>

          {/* Campo de busca */}
          <div className="relative">
            <div
              className="concave-3d flex items-center gap-2 px-3 py-2.5"
            >
              <Search className="h-4 w-4 shrink-0" style={{ color: GOLD }} />
              <input
                ref={inputRef}
                className="flex-1 bg-transparent outline-none text-[13px] placeholder:text-slate-400"
                style={{ color: NAVY }}
                placeholder={isLoading ? "Carregando clientes..." : "Buscar por nome ou CPF..."}
                value={busca}
                onChange={e => { setBusca(e.target.value); setAberto(true); }}
                onFocus={() => setAberto(true)}
                disabled={isLoading}
              />
              {(busca || clienteNome) && (
                <button type="button" onClick={limpar} className="shrink-0">
                  <X className="h-3.5 w-3.5 text-slate-400 hover:text-red-500 transition-colors" />
                </button>
              )}
            </div>

            {/* Dropdown */}
            {aberto && filtrados.length > 0 && (
              <div
                ref={dropRef}
                className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-[6px] shadow-xl border"
                style={{ background: "#fff", borderColor: "#d8cfbc" }}
              >
                {/* Com busca: lista simples */}
                {busca.trim() ? (
                  filtrados.slice(0, 80).map(c => (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full px-4 py-2.5 text-left text-[13px] hover:bg-amber-50 border-b last:border-0 transition-colors"
                      style={{ color: NAVY, borderColor: "#f0ebe0" }}
                      onMouseDown={() => selecionar(c)}
                    >
                      <span className="font-semibold">{c.name}</span>
                      {c.cpf && (
                        <span className="ml-2 text-[11px] text-slate-400">{c.cpf}</span>
                      )}
                    </button>
                  ))
                ) : (
                  /* Sem busca: agrupado por letra */
                  grupos?.map(([letra, itens]) => (
                    <div key={letra}>
                      <div
                        className="px-4 py-1 text-[10px] font-black uppercase tracking-[0.25em] sticky top-0"
                        style={{ background: "#f5f0e8", color: GOLD }}
                      >
                        {letra}
                      </div>
                      {itens.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          className="w-full px-4 py-2.5 text-left text-[13px] hover:bg-amber-50 border-b last:border-0 transition-colors"
                          style={{ color: NAVY, borderColor: "#f0ebe0" }}
                          onMouseDown={() => selecionar(c)}
                        >
                          <span className="font-semibold">{c.name}</span>
                          {c.cpf && (
                            <span className="ml-2 text-[11px] text-slate-400">{c.cpf}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Cliente selecionado */}
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

        {/* ── CONTEÚDO: Procedência ── */}
        {clienteId ? (
          <div className="panel-3d border-none p-0 overflow-hidden">
            <div
              className="flex items-center gap-2 px-4 py-3"
              style={{
                background: "linear-gradient(90deg,#1e3668 0%,#16294a 100%)",
                borderBottom: "2px solid rgba(231,205,143,0.22)",
              }}
            >
              <MapPin className="h-4 w-4 shrink-0" style={{ color: GOLD }} />
              <span
                className="text-[11px] font-black uppercase tracking-[0.22em]"
                style={{ color: "#e7cd8f" }}
              >
                Arquivos de origem — {clienteNome}
              </span>
            </div>
            <div className="p-4">
              <ExamesEnviadosPanel clientId={clienteId} />
            </div>
          </div>
        ) : (
          <div className="panel-3d p-12 text-center">
            <MapPin
              className="mx-auto mb-4 h-10 w-10 opacity-30"
              style={{ color: GOLD }}
            />
            <p
              className="text-[14px] font-black uppercase tracking-[0.14em]"
              style={{ color: NAVY }}
            >
              Selecione um cliente acima
            </p>
            <p className="mt-2 text-[12px]" style={{ color: "#647c97" }}>
              Os arquivos de exame e sua procedência aparecerão aqui.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
