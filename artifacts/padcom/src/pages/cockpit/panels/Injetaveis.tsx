import { useMemo } from "react";
import { useLocation } from "wouter";
import { useListProtocols, useListSubstances } from "@workspace/api-client-react";
import { formatStatus } from "@/lib/status";
import {
  Loader2,
  AlertTriangle,
  Syringe,
  ExternalLink,
  Plus,
  CheckCircle2,
  Hourglass,
  Home,
  Building2,
  Calendar,
} from "lucide-react";

// ===========================================================================
// PAINEL: INJETÁVEIS (protocolos do cliente) — extraido de
// protocols/index.tsx (lista) + protocols/detail.tsx (Aplicadas x A Aplicar).
// Consome apenas o motor existente:
//   GET /api/protocols?clientId=<id>   (via useListProtocols)
// Nao altera nenhum motor de validacao/sessoes nem as paginas originais.
// ===========================================================================

const GOLD = "#c2a05a";
const GOLD_FORTE = "#d9bd7e";
const FALLBACK_COLOR = "#94a3b8";

function fmtData(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export default function Injetaveis({
  clientId,
  filtroProcedimento,
  ocultarBotaoNovo,
}: {
  clientId: number;
  /** Sem filtro = todos (cockpit antigo). "implante" = só protocolos com implante; "injetavel" = só com IV/IM. */
  filtroProcedimento?: "implante" | "injetavel";
  ocultarBotaoNovo?: boolean;
}) {
  const [, setLocation] = useLocation();

  const {
    data: protocols,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useListProtocols(
    { clientId },
    { query: { queryKey: ["cockpit-injetaveis-protocols", clientId] } },
  );

  const { data: substances, isLoading: carregandoSubstancias } = useListSubstances({
    query: {
      queryKey: ["cockpit-injetaveis-substances"],
      enabled: !!filtroProcedimento,
    },
  });

  const aguardandoFiltro = !!filtroProcedimento && carregandoSubstancias;

  const lista = useMemo(() => {
    const todos = protocols ?? [];
    if (!filtroProcedimento) return todos;
    if (substances == null) return [];
    const implantIds = new Set(
      substances.filter((s) => s.procedureType === "implant").map((s) => s.id),
    );
    if (filtroProcedimento === "implante") {
      return todos.filter((p) => p.items.some((i) => implantIds.has(i.substanceId)));
    }
    return todos.filter((p) => p.items.some((i) => !implantIds.has(i.substanceId)));
  }, [protocols, substances, filtroProcedimento]);

  const rotuloTipo =
    filtroProcedimento === "implante" ? "implantes" : "injetáveis";

  if (isLoading || aguardandoFiltro) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando protocolos…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bevel-3d flex items-center justify-between gap-2 px-3 py-3 text-sm text-red-400">
        <span className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" /> Falha ao carregar os protocolos do cliente.
        </span>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isRefetching}
          className="btn-3d-soft rounded px-2 py-1 text-xs font-semibold uppercase disabled:opacity-60"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
          {lista.length} protocolo(s) de {rotuloTipo} deste cliente
        </p>
        {!ocultarBotaoNovo && (
          <button
            type="button"
            onClick={() => setLocation("/protocols/new")}
            className="btn-3d-soft inline-flex items-center gap-2 rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-wide"
            style={{ color: GOLD_FORTE }}
          >
            <Plus className="h-4 w-4" /> Lançar novo protocolo
          </button>
        )}
      </div>

      {lista.length === 0 ? (
        <div className="concave-3d flex flex-col items-center justify-center gap-2 rounded-md py-10 text-center">
          <Syringe className="h-8 w-8 text-slate-500" />
          <p className="text-sm text-slate-400">
            Nenhum protocolo de {rotuloTipo} para este cliente.
          </p>
          {!ocultarBotaoNovo && (
            <button
              type="button"
              onClick={() => setLocation("/protocols/new")}
              className="btn-3d-soft mt-1 inline-flex items-center gap-2 rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-wide"
              style={{ color: GOLD_FORTE }}
            >
              <Plus className="h-4 w-4" /> Lançar novo protocolo
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {lista.map((protocol) => {
            const allApps = protocol.sessions.flatMap((s) =>
              s.substanceApplications.map((a) => ({ ...a, sessionDate: s.scheduledDate })),
            );
            const appliedApps = allApps.filter(
              (a) => a.availability === "disp" && a.status === "applied" && a.sessionNumber > 0,
            );
            const pendingApps = allApps.filter(
              (a) => a.availability === "disp" && a.status !== "applied" && a.sessionNumber > 0,
            );
            const progressPct =
              protocol.totalSessions > 0
                ? Math.round((protocol.completedSessions / protocol.totalSessions) * 100)
                : 0;

            // Deduplica pills por substanceName (mantém só 1 por nome)
            const uniqueApplied = appliedApps.filter(
              (a, i, arr) => arr.findIndex((x) => x.substanceName === a.substanceName) === i,
            );
            const uniquePending = pendingApps.filter(
              (a, i, arr) => arr.findIndex((x) => x.substanceName === a.substanceName) === i,
            );

            return (
              <div
                key={protocol.id}
                className="panel-3d overflow-hidden rounded-lg"
                style={{ borderLeft: `4px solid ${GOLD}` }}
              >
                {/* ── ZONA TOPO: bevel-strip (título + status + progresso) ── */}
                <div
                  className="bevel-3d flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5"
                  style={{ borderBottom: "1px solid rgba(194,160,90,0.25)" }}
                >
                  {/* Coluna esquerda: ícone + título */}
                  <div className="flex min-w-0 items-center gap-2">
                    <Syringe className="h-4 w-4 shrink-0" style={{ color: GOLD }} />
                    <h3
                      className="truncate text-[13px] font-extrabold uppercase tracking-wide"
                      style={{ color: GOLD_FORTE }}
                    >
                      {protocol.title}
                    </h3>
                  </div>
                  {/* Coluna direita: status badge + contador sessões */}
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="concave-3d rounded-[4px] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-300">
                      {formatStatus(protocol.status)}
                    </span>
                    <span
                      className="rounded-[4px] px-2.5 py-0.5 text-[11px] font-black tabular-nums"
                      style={{
                        color: GOLD_FORTE,
                        background: "rgba(194,160,90,0.15)",
                        border: "1px solid rgba(194,160,90,0.35)",
                      }}
                    >
                      {protocol.completedSessions}/{protocol.totalSessions}
                    </span>
                  </div>
                </div>

                <div className="p-4">
                  {/* ── METADADOS (linha única alinhada) ── */}
                  <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] font-semibold text-slate-400">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" style={{ color: GOLD }} />
                      Início {fmtData(protocol.startDate)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      {protocol.serviceType === "homecare" ? (
                        <Home className="h-3.5 w-3.5" style={{ color: GOLD }} />
                      ) : (
                        <Building2 className="h-3.5 w-3.5" style={{ color: GOLD }} />
                      )}
                      {protocol.serviceType === "homecare" ? "Nurse Care Domiciliar" : "Clínica"}
                    </span>
                    {protocol.professionalName && (
                      <span className="inline-flex items-center gap-1.5 text-slate-300">
                        Prof.: {protocol.professionalName}
                      </span>
                    )}
                  </div>

                  {/* ── BARRA DE PROGRESSO ── */}
                  <div className="mb-4">
                    <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      <span>Progresso do protocolo</span>
                      <span style={{ color: progressPct === 100 ? "#4ade80" : GOLD_FORTE }}>
                        {progressPct}%
                      </span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-[3px] bg-white/10 shadow-inner">
                      <div
                        className="h-full rounded-[3px] transition-all duration-500"
                        style={{
                          width: `${progressPct}%`,
                          background:
                            progressPct === 100
                              ? "linear-gradient(90deg,#22c55e,#4ade80)"
                              : `linear-gradient(90deg,${GOLD} 0%,${GOLD_FORTE} 100%)`,
                          boxShadow: `0 0 8px ${GOLD}55`,
                        }}
                      />
                    </div>
                  </div>

                  {/* ── GRID APLICADAS × A APLICAR ── */}
                  <div className="mb-4 grid grid-cols-2 gap-3">
                    {/* APLICADAS */}
                    <div
                      className="panel-3d-sub rounded-[6px] p-3"
                      style={{ borderTop: "2px solid rgba(74,222,128,0.5)" }}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-emerald-300">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Aplicadas
                        </span>
                        <span
                          className="rounded-[3px] px-2 py-0.5 text-[11px] font-black tabular-nums text-emerald-200"
                          style={{ background: "rgba(74,222,128,0.15)" }}
                        >
                          {uniqueApplied.length}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {uniqueApplied.length === 0 ? (
                          <span className="text-[11px] text-slate-500">Nenhuma ainda.</span>
                        ) : (
                          uniqueApplied.slice(0, 10).map((a) => (
                            <span
                              key={a.id}
                              className="inline-flex items-center rounded-[4px] px-2.5 py-1 text-[11px] font-bold leading-none text-white shadow-sm"
                              style={{ backgroundColor: a.substanceColor || FALLBACK_COLOR }}
                              title={a.substanceName}
                            >
                              {a.substanceName}
                            </span>
                          ))
                        )}
                      </div>
                    </div>

                    {/* A APLICAR */}
                    <div
                      className="panel-3d-sub rounded-[6px] p-3"
                      style={{ borderTop: "2px solid rgba(148,163,184,0.4)" }}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-slate-300">
                          <Hourglass className="h-3.5 w-3.5" /> A Aplicar
                        </span>
                        <span
                          className="rounded-[3px] px-2 py-0.5 text-[11px] font-black tabular-nums text-slate-300"
                          style={{ background: "rgba(148,163,184,0.15)" }}
                        >
                          {uniquePending.length}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {uniquePending.length === 0 ? (
                          <span className="text-[11px] text-slate-500">Tudo concluído.</span>
                        ) : (
                          uniquePending.slice(0, 10).map((a) => (
                            <span
                              key={a.id}
                              className="inline-flex items-center rounded-[4px] px-2.5 py-1 text-[11px] font-bold leading-none text-white/80 shadow-sm"
                              style={{ backgroundColor: a.substanceColor || FALLBACK_COLOR }}
                              title={a.substanceName}
                            >
                              {a.substanceName}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ── RODAPÉ: substâncias do protocolo + botão ── */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-3">
                    <div className="flex flex-wrap gap-1.5">
                      {protocol.items.map((item) => (
                        <span
                          key={item.id}
                          className="inline-flex items-center rounded-[4px] px-2.5 py-1 text-[11px] font-extrabold leading-none text-white"
                          style={{
                            backgroundColor: item.substanceColor || FALLBACK_COLOR,
                            boxShadow: `0 1px 4px ${item.substanceColor || FALLBACK_COLOR}55`,
                          }}
                        >
                          {item.substanceName}
                        </span>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setLocation(`/protocols/${protocol.id}`)}
                      className="btn-3d-soft inline-flex shrink-0 items-center gap-1.5 rounded-[5px] px-4 py-2 text-[11px] font-bold uppercase tracking-widest"
                      style={{ color: GOLD_FORTE }}
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Abrir Protocolo Completo
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
