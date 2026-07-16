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
  Circle,
  Home,
  Building2,
  Calendar,
  FlaskConical,
  Repeat,
  Hash,
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
const NAVY = "#16284a";
const FALLBACK_COLOR = "#94a3b8";

// Cor+texto do badge de status do protocolo (superfície clara do bevel-3d)
function statusBadgeStyle(status: string): { bg: string; color: string; label: string } {
  switch (status) {
    case "active":    return { bg: "rgba(34,197,94,0.18)",  color: "#15803d", label: "Ativo" };
    case "suggested": return { bg: "rgba(245,158,11,0.18)", color: "#b45309", label: "Sugerido" };
    case "validated": return { bg: "rgba(59,130,246,0.18)", color: "#1d4ed8", label: "Validado" };
    case "completed": return { bg: "rgba(100,116,139,0.18)",color: "#475569", label: "Concluído" };
    case "cancelled": return { bg: "rgba(239,68,68,0.18)",  color: "#b91c1c", label: "Cancelado" };
    default:          return { bg: "rgba(100,116,139,0.15)",color: "#64748b", label: formatStatus(status) };
  }
}

// Frequência abreviada para caber na coluna
function fmtFreq(freq: string | null | undefined): string {
  if (!freq) return "—";
  const f = freq.toLowerCase();
  if (f.includes("semanalmente") || f.includes("semanal") || f.includes("7")) return "Semanal";
  if (f.includes("quinzenal") || f.includes("15")) return "Quinzenal";
  if (f.includes("mensal") || f.includes("30")) return "Mensal";
  if (f.includes("diária") || f.includes("diario") || f.includes("1")) return "Diária";
  return freq.length > 14 ? freq.slice(0, 13) + "…" : freq;
}

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
            // Conta quantas sessões de cada substância já foram aplicadas (por substanceId)
            const appliedCountById = new Map<number, number>();
            allApps.forEach((a) => {
              if (a.availability === "disp" && a.status === "applied" && a.sessionNumber > 0) {
                appliedCountById.set(a.substanceId, (appliedCountById.get(a.substanceId) ?? 0) + 1);
              }
            });

            const progressPct =
              protocol.totalSessions > 0
                ? Math.round((protocol.completedSessions / protocol.totalSessions) * 100)
                : 0;

            const badge = statusBadgeStyle(protocol.status);
            const totalAppliedSubst = protocol.items.filter(
              (item) => (appliedCountById.get(item.substanceId) ?? 0) > 0,
            ).length;

            return (
              <div
                key={protocol.id}
                className="panel-3d overflow-hidden rounded-lg"
                style={{ borderLeft: `4px solid ${GOLD}` }}
              >
                {/* ── ZONA 1: TOP BAR (altura fixa, nunca cresce) ─────────── */}
                {/* Regra: texto em cima do bevel-3d = escuro (navy). Gold = só ícone e borda. */}
                <div
                  className="bevel-3d flex items-center gap-3 px-4 py-2.5"
                  style={{ borderBottom: `1px solid ${GOLD}33` }}
                >
                  <Syringe className="h-4 w-4 shrink-0" style={{ color: GOLD }} />
                  {/* Título: navy escuro sobre bevel claro */}
                  <h3
                    className="min-w-0 flex-1 truncate text-[13px] font-extrabold uppercase tracking-wide"
                    style={{ color: NAVY }}
                  >
                    {protocol.title}
                  </h3>
                  {/* Badge status: cor semântica correta no bevel */}
                  <span
                    className="shrink-0 rounded-[4px] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest"
                    style={{ background: badge.bg, color: badge.color }}
                  >
                    {badge.label}
                  </span>
                  {/* Contador sessões */}
                  <span
                    className="shrink-0 rounded-[4px] px-2.5 py-0.5 text-[11px] font-black tabular-nums"
                    style={{
                      color: NAVY,
                      background: `${GOLD}28`,
                      border: `1px solid ${GOLD}66`,
                    }}
                  >
                    {protocol.completedSessions}/{protocol.totalSessions} sess.
                  </span>
                </div>

                <div className="p-4">
                  {/* ── ZONA META: linha única com ícones ouro ──────────────── */}
                  <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] font-semibold text-slate-400">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 shrink-0" style={{ color: GOLD }} />
                      Início {fmtData(protocol.startDate)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      {protocol.serviceType === "homecare" ? (
                        <Home className="h-3.5 w-3.5 shrink-0" style={{ color: GOLD }} />
                      ) : (
                        <Building2 className="h-3.5 w-3.5 shrink-0" style={{ color: GOLD }} />
                      )}
                      {protocol.serviceType === "homecare" ? "Nurse Care Domiciliar" : "Clínica"}
                    </span>
                    {protocol.professionalName && (
                      <span className="text-slate-300">Prof.: {protocol.professionalName}</span>
                    )}
                  </div>

                  {/* ── BARRA DE PROGRESSO ──────────────────────────────────── */}
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
                              : `linear-gradient(90deg,${GOLD},${GOLD_FORTE})`,
                          boxShadow: `0 0 8px ${GOLD}55`,
                        }}
                      />
                    </div>
                  </div>

                  {/* ── ZONA 4: GRADE DE SUBSTÂNCIAS (Lei 4 + Lei 5) ─────────── */}
                  {/* grid-cols fixo: nunca flex-wrap. 1 coluna = 1 função. */}
                  <div className="concave-3d rounded-[6px] p-3">
                    {/* Cabeçalho da grade */}
                    <div className="mb-2 flex items-center justify-between">
                      <span
                        className="text-[10px] font-black uppercase tracking-widest"
                        style={{ color: GOLD }}
                      >
                        Substâncias do protocolo
                      </span>
                      <span className="text-[10px] font-bold text-slate-400">
                        <span className="text-emerald-400">{totalAppliedSubst}</span>
                        /{protocol.items.length} com aplicação
                      </span>
                    </div>

                    {/* Linha de cabeçalho das colunas */}
                    <div
                      className="mb-1 grid items-center gap-x-3 border-b pb-1 text-[9px] font-black uppercase tracking-widest text-slate-500"
                      style={{
                        gridTemplateColumns: "14px 1fr auto auto auto auto",
                        borderColor: "rgba(255,255,255,0.08)",
                      }}
                    >
                      <span />
                      <span>Substância</span>
                      <span className="text-center">Dose</span>
                      <span className="text-center">Freq.</span>
                      <span className="text-center">Sess.</span>
                      <span className="text-right">Estado</span>
                    </div>

                    {/* Linhas de substâncias — 1 por item, colunas fixas */}
                    <div className="space-y-0.5">
                      {protocol.items.map((item, idx) => {
                        const appliedCount = appliedCountById.get(item.substanceId) ?? 0;
                        const isApplied = appliedCount > 0;
                        const isComplete = appliedCount >= (item.totalSessions ?? 1);

                        return (
                          <div
                            key={item.id}
                            className="grid items-center gap-x-3 rounded-[4px] px-1.5 py-1.5 transition-colors hover:bg-white/5"
                            style={{
                              gridTemplateColumns: "14px 1fr auto auto auto auto",
                              background:
                                idx % 2 === 0
                                  ? "rgba(255,255,255,0.03)"
                                  : "transparent",
                            }}
                          >
                            {/* Col 1: bolinha colorida da substância */}
                            <span
                              className="h-3 w-3 shrink-0 rounded-full"
                              style={{
                                backgroundColor: item.substanceColor || FALLBACK_COLOR,
                                boxShadow: `0 0 5px ${item.substanceColor || FALLBACK_COLOR}88`,
                              }}
                            />

                            {/* Col 2: nome da substância (truncate — 1fr) */}
                            <span
                              className="truncate text-[11px] font-bold text-slate-200"
                              title={item.substanceName}
                            >
                              {item.substanceName}
                            </span>

                            {/* Col 3: dose */}
                            <span className="flex items-center gap-0.5 text-[10px] tabular-nums text-slate-400">
                              <FlaskConical className="h-2.5 w-2.5 shrink-0 text-slate-500" />
                              {(item as { dose?: string | null }).dose ?? "—"}
                            </span>

                            {/* Col 4: frequência */}
                            <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
                              <Repeat className="h-2.5 w-2.5 shrink-0 text-slate-500" />
                              {fmtFreq((item as { frequency?: string | null }).frequency)}
                            </span>

                            {/* Col 5: sessões aplicadas / total */}
                            <span className="flex items-center gap-0.5 text-[10px] tabular-nums text-slate-400">
                              <Hash className="h-2.5 w-2.5 shrink-0 text-slate-500" />
                              <span style={{ color: isApplied ? "#86efac" : undefined }}>
                                {appliedCount}
                              </span>
                              /{item.totalSessions ?? "?"}
                            </span>

                            {/* Col 6: badge aplicado/pendente */}
                            {isComplete ? (
                              <span className="inline-flex shrink-0 items-center justify-end gap-1 text-[9px] font-black uppercase tracking-wide text-emerald-400">
                                <CheckCircle2 className="h-3 w-3" /> Concluída
                              </span>
                            ) : isApplied ? (
                              <span className="inline-flex shrink-0 items-center justify-end gap-1 text-[9px] font-black uppercase tracking-wide text-amber-400">
                                <CheckCircle2 className="h-3 w-3" /> Em curso
                              </span>
                            ) : (
                              <span className="inline-flex shrink-0 items-center justify-end gap-1 text-[9px] font-black uppercase tracking-wide text-slate-500">
                                <Circle className="h-3 w-3" /> Pendente
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── RODAPÉ: botão de ação ────────────────────────────────── */}
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setLocation(`/protocols/${protocol.id}`)}
                      className="btn-3d-soft inline-flex items-center gap-1.5 rounded-[5px] px-4 py-2 text-[11px] font-bold uppercase tracking-widest"
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
