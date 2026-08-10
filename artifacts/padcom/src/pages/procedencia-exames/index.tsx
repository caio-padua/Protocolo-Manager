// Página: Procedência de Exames — de onde vieram os resultados
// Rota: /procedencia-exames
// Menu: O Ato Médico → Procedência de Exames
// Motor: ProcedenciaDocumentosBloco (unificado)
// Pedido CEO 23/07/2026.

import { useState, useMemo } from "react";
import { PaxterClientSelector } from "@/components/PaxterClientSelector";
import { tituloProprio } from "@/lib/utils";
import { MapPin, UserRound } from "lucide-react";
import { useListClients } from "@workspace/api-client-react";
import ProcedenciaDocumentosBloco from "@/components/ProcedenciaDocumentosBloco";

const NAVY  = "#16294a";
const GOLD  = "#9a7b32";
const CREAM = "hsl(40 33% 96%)";

export default function ProcedenciaExamesPage() {
  const [clienteId, setClienteId] = useState<number | null>(() => {
    const p = new URLSearchParams(window.location.search).get("c");
    return p ? Number(p) : null;
  });

  const { data: clientes } = useListClients();
  const clienteOpts = useMemo(
    () => (clientes ?? []).map(c => ({ id: c.id, name: c.name, cpf: c.cpf ?? null, phone: c.phone ?? null, photoUrl: (c as any).photoUrl ?? null })),
    [clientes],
  );
  const clienteNome = useMemo(
    () => { const cl = (clientes ?? []).find(c => c.id === clienteId); return cl ? cl.name : ""; },
    [clientes, clienteId],
  );


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
            Selecionar Cliente
          </div>
          <PaxterClientSelector
            clientes={clienteOpts}
            value={clienteId}
            onChange={setClienteId}
            placeholder="Selecionar cliente…"
          />
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
