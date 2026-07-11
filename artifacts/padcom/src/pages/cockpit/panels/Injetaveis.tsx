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
        <div className="space-y-3">
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
                ? (protocol.completedSessions / protocol.totalSessions) * 100
                : 0;

            return (
              <div key={protocol.id} className="panel-3d-sub rounded-md p-4">
                {/* Cabecalho: titulo + status */}
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Syringe className="h-4 w-4 shrink-0" style={{ color: GOLD }} />
                    <h3 className="truncate text-sm font-bold uppercase tracking-tight" style={{ color: GOLD_FORTE }}>
                      {protocol.title}
                    </h3>
                  </div>
                  <span className="concave-3d rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-200">
                    {formatStatus(protocol.status)}
                  </span>
                </div>

                {/* Metadados */}
                <div className="mb-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Início {fmtData(protocol.startDate)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    {protocol.serviceType === "homecare" ? (
                      <Home className="h-3 w-3" />
                    ) : (
                      <Building2 className="h-3 w-3" />
                    )}
                    {protocol.serviceType === "homecare" ? "Nurse Care" : "Clínica"}
                  </span>
                  {protocol.professionalName && <span>Prof: {protocol.professionalName}</span>}
                </div>

                {/* Progresso de sessoes */}
                <div className="mb-3">
                  <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    <span>Sessões concluídas</span>
                    <span className="tabular-nums" style={{ color: GOLD_FORTE }}>
                      {protocol.completedSessions}/{protocol.totalSessions}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-[2px] bg-white/10 shadow-inner">
                    <div
                      className="h-full rounded-[2px]"
                      style={{
                        width: `${progressPct}%`,
                        background: "linear-gradient(90deg, hsl(214 54% 19%) 0%, hsl(39 41% 51%) 100%)",
                      }}
                    />
                  </div>
                </div>

                {/* Resumo Aplicadas x A Aplicar */}
                <div className="mb-3 grid grid-cols-2 gap-2">
                  <div className="screen-3d rounded-md p-2">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-300">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Aplicadas
                      </span>
                      <span className="concave-3d rounded px-1.5 py-0.5 text-[10px] font-black tabular-nums text-slate-200">
                        {appliedApps.length}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {appliedApps.length === 0 ? (
                        <span className="text-[10px] text-slate-500">Nenhuma ainda.</span>
                      ) : (
                        appliedApps.slice(0, 8).map((a) => (
                          <span
                            key={a.id}
                            className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
                            style={{ backgroundColor: a.substanceColor || FALLBACK_COLOR }}
                            title={`${a.substanceName} — ${fmtData(a.sessionDate)}`}
                          >
                            {a.substanceName}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="screen-3d rounded-md p-2">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-300">
                        <Hourglass className="h-3.5 w-3.5" /> A Aplicar
                      </span>
                      <span className="concave-3d rounded px-1.5 py-0.5 text-[10px] font-black tabular-nums text-slate-200">
                        {pendingApps.length}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {pendingApps.length === 0 ? (
                        <span className="text-[10px] text-slate-500">Tudo concluído.</span>
                      ) : (
                        pendingApps.slice(0, 8).map((a) => (
                          <span
                            key={a.id}
                            className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white opacity-75"
                            style={{ backgroundColor: a.substanceColor || FALLBACK_COLOR }}
                            title={`${a.substanceName} — ${fmtData(a.sessionDate)}`}
                          >
                            {a.substanceName}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Substancias do protocolo (chips) + acao */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1">
                    {protocol.items.map((item) => (
                      <span
                        key={item.id}
                        className="concave-3d inline-flex items-center rounded-[3px] px-2 py-0.5 text-[10px] font-extrabold text-white"
                        style={{ backgroundColor: item.substanceColor || FALLBACK_COLOR }}
                      >
                        {item.substanceName}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setLocation(`/protocols/${protocol.id}`)}
                    className="btn-3d-soft inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-wide"
                    style={{ color: GOLD_FORTE }}
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Abrir protocolo completo
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
