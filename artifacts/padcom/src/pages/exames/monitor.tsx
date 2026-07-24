// Monitor do Motor de Exames — status global do motor Gemini
// Rota: /exames/monitor
// Pedido CEO 24/07/2026.

import { useState, useEffect, useCallback } from "react";
import { getCollabToken } from "@/lib/collab-auth";
import { Link } from "wouter";
import {
  Activity,
  CheckCircle2,
  AlertCircle,
  Clock,
  RefreshCcw,
  ChevronRight,
  Loader2,
  Play,
  RotateCcw,
  Cpu,
} from "lucide-react";

const NAVY  = "#16294a";
const GOLD  = "#9a7b32";
const CREAM = "hsl(40 33% 96%)";

type StatusStat = { status: string; total: number };
type DocError   = {
  id: number;
  client_id: number;
  status: string;
  file_name: string | null;
  created_at: string;
  source_pdf_drive_id: string | null;
  client_name: string | null;
};

type MonitorData = { stats: StatusStat[]; pendentes: DocError[] };

type LlmStep = {
  provider: string;
  model: string;
  ok: boolean;
  analitos?: number;
  ms?: number;
  error?: string;
};

type AuditRow = {
  id: number;
  file_name: string | null;
  origin: string | null;
  status: string;
  exam_kind: string | null;
  created_at: string | null;
  processed_at: string | null;
  client_name: string | null;
  elapsed_s: number | null;
  analitos: number | null;
  source_pdf_drive_id: string | null;
  reprocessamento_count: number | null;
  reprocessado_at: string | null;
  llm_pipeline: LlmStep[] | null;
};

function fmtElapsed(s: number | null): string {
  if (s == null || Number.isNaN(s)) return "—";
  const total = Math.round(s);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function fmtDataHora(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

const AUDIT_STATUS: Record<string, { label: string; bg: string; cor: string }> = {
  concluido:   { label: "Processado",  bg: "#dcfce7", cor: "#166534" },
  processado:  { label: "Processado",  bg: "#dcfce7", cor: "#166534" },
  conferido:   { label: "Processado",  bg: "#dcfce7", cor: "#166534" },
  erro:        { label: "Erro",        bg: "#fee2e2", cor: "#991b1b" },
  processando: { label: "Processando", bg: "#fef3c7", cor: "#92400e" },
};

function statFor(stats: StatusStat[], key: string): number {
  return stats.find((s) => s.status === key)?.total ?? 0;
}

const STATUS_LABELS: Record<string, { label: string; cor: string; icone: typeof CheckCircle2 }> = {
  concluido:    { label: "Concluídos",    cor: "#166534", icone: CheckCircle2 },
  processando:  { label: "Processando",   cor: "#9a3220", icone: Loader2 },
  erro:         { label: "Com Erro",      cor: "#991b1b", icone: AlertCircle },
  pendente:     { label: "Pendentes",     cor: "#92400e", icone: Clock },
};

export default function MonitorMotorPage() {
  const [data, setData]             = useState<MonitorData | null>(null);
  const [loading, setLoading]       = useState(true);
  const [recovery, setRecovery]     = useState<"idle" | "running" | "ok" | "err">("idle");
  const [audit, setAudit]           = useState<AuditRow[]>([]);
  const [reprocessando, setReprocessando] = useState<Record<number, boolean>>({});

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const token = getCollabToken();
      const r = await fetch("/api/exames-lab/monitor", {
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!r.ok) throw new Error("Falha na API");
      const json: MonitorData = await r.json();
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const carregarAudit = useCallback(async () => {
    try {
      const token = getCollabToken();
      const r = await fetch("/api/exames-lab/auditoria?limit=50", {
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!r.ok) throw new Error("Falha na API");
      const json = await r.json();
      setAudit(Array.isArray(json) ? json : (json?.eventos ?? json?.rows ?? []));
    } catch {
      /* mantém dados anteriores */
    }
  }, []);

  useEffect(() => {
    void carregarAudit();
    const t = setInterval(() => { void carregarAudit(); }, 5000);
    return () => clearInterval(t);
  }, [carregarAudit]);

  async function reprocessarDoc(id: number) {
    setReprocessando((prev) => ({ ...prev, [id]: true }));
    try {
      const token = getCollabToken();
      await fetch(`/api/exames-lab/reprocessar/${id}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      // Atualiza monitor e auditoria após reprocessar
      void carregar();
      void carregarAudit();
    } catch {
      /* silencioso — monitor refaz o status */
    } finally {
      setReprocessando((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function acionarRecovery() {
    setRecovery("running");
    try {
      const token = getCollabToken();
      const r = await fetch("/api/exames-lab/recovery", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setRecovery(r.ok ? "ok" : "err");
    } catch {
      setRecovery("err");
    }
    setTimeout(() => setRecovery("idle"), 5000);
  }

  const totalGeral = (data?.stats ?? []).reduce((acc, s) => acc + s.total, 0);

  return (
    <div className="min-h-screen font-sans" style={{ background: CREAM }}>
      {/* HEADER */}
      <header
        className="px-6 py-5"
        style={{
          background: "linear-gradient(180deg,#1e3668 0%,#16294a 100%)",
          borderBottom: "2px solid rgba(231,205,143,0.25)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
        }}
      >
        <div className="flex items-center gap-3">
          <Activity className="h-5 w-5 shrink-0" style={{ color: GOLD }} />
          <h1
            className="text-[20px] font-black uppercase tracking-[0.10em]"
            style={{ color: "#e7cd8f", textShadow: "0 1px 8px rgba(0,0,0,0.55)" }}
          >
            Monitor do Motor de Exames
          </h1>
          <button
            type="button"
            onClick={carregar}
            className="ml-auto concave-3d rounded-[6px] px-3 py-1.5 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.10em]"
            style={{ color: GOLD }}
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>
        <p className="mt-1 text-[12px] text-slate-400">
          Status global do motor Gemini de extração. Recovery processa documentos com erro dos últimos 7 dias.
        </p>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 space-y-6">

        {/* STATS */}
        {loading ? (
          <div className="panel-3d p-8 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin" style={{ color: GOLD }} />
            <p className="mt-3 text-[12px] text-slate-400">Carregando dados do motor…</p>
          </div>
        ) : !data ? (
          <div className="panel-3d p-8 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-red-500" />
            <p className="mt-3 text-[13px] font-semibold" style={{ color: NAVY }}>
              Não foi possível carregar os dados.
            </p>
            <button type="button" onClick={carregar} className="mt-3 text-[12px]" style={{ color: GOLD }}>
              Tentar novamente
            </button>
          </div>
        ) : (
          <>
            {/* Cards de status */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {(["concluido", "processando", "erro", "pendente"] as const).map((k) => {
                const cfg = STATUS_LABELS[k];
                const Ic  = cfg.icone;
                const val = statFor(data.stats, k);
                return (
                  <div
                    key={k}
                    className="panel-3d p-4 flex flex-col gap-1"
                    style={{ borderLeft: `4px solid ${cfg.cor}` }}
                  >
                    <div className="flex items-center gap-1.5">
                      <Ic className="h-3.5 w-3.5 shrink-0" style={{ color: cfg.cor }} />
                      <span
                        className="text-[10px] font-black uppercase tracking-[0.18em]"
                        style={{ color: "#64748b" }}
                      >
                        {cfg.label}
                      </span>
                    </div>
                    <span className="text-[28px] font-black" style={{ color: cfg.cor }}>
                      {val.toLocaleString("pt-BR")}
                    </span>
                    <span className="text-[10px]" style={{ color: "#94a3b8" }}>
                      {totalGeral > 0 ? `${((val / totalGeral) * 100).toFixed(1)}% do total` : "—"}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Botão de recovery */}
            <div className="panel-3d p-4 flex items-center gap-4">
              <div className="flex-1">
                <div className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: NAVY }}>
                  Acionar Recovery Manual
                </div>
                <p className="mt-0.5 text-[11px]" style={{ color: "#64748b" }}>
                  Reprocessa documentos com <code className="text-[10px] bg-slate-100 px-1 rounded">status=erro</code> criados nos últimos 7 dias. Roda em background.
                </p>
              </div>
              <button
                type="button"
                onClick={acionarRecovery}
                disabled={recovery === "running"}
                className="bevel-3d px-4 py-2 rounded-[6px] flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.08em] shrink-0"
                style={{
                  color: recovery === "ok" ? "#166534" : recovery === "err" ? "#991b1b" : NAVY,
                  borderColor: recovery === "ok" ? "#16a34a" : GOLD,
                }}
              >
                {recovery === "running" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                {recovery === "idle" && "Iniciar Recovery"}
                {recovery === "running" && "Rodando…"}
                {recovery === "ok" && "Iniciado!"}
                {recovery === "err" && "Falhou"}
              </button>
            </div>

            {/* Lista de documentos com erro / processando */}
            <div className="panel-3d overflow-hidden">
              <div
                className="flex items-center gap-2 px-5 py-3"
                style={{
                  background: "linear-gradient(90deg,#1e3668 0%,#16294a 100%)",
                  borderBottom: "2px solid rgba(231,205,143,0.22)",
                }}
              >
                <AlertCircle className="h-4 w-4 shrink-0" style={{ color: GOLD }} />
                <span className="text-[11px] font-black uppercase tracking-[0.22em]" style={{ color: "#e7cd8f" }}>
                  Documentos com Erro ou Processando
                </span>
                <span className="ml-auto text-[10px] text-slate-400">
                  {data.pendentes.length} doc{data.pendentes.length !== 1 ? "s" : ""}
                </span>
              </div>

              {data.pendentes.length === 0 ? (
                <div className="p-8 text-center">
                  <CheckCircle2 className="mx-auto h-8 w-8" style={{ color: "#16a34a" }} />
                  <p className="mt-2 text-[12px] font-semibold" style={{ color: "#166534" }}>
                    Nenhum documento com erro. Motor operando normalmente.
                  </p>
                </div>
              ) : (
                <table className="w-full text-[12px]" style={{ color: NAVY }}>
                  <thead>
                    <tr
                      className="text-[10px] font-black uppercase tracking-[0.18em]"
                      style={{ background: "rgba(231,205,143,0.08)", color: "#64748b" }}
                    >
                      <th className="px-4 py-2 text-left">ID</th>
                      <th className="px-4 py-2 text-left">Cliente</th>
                      <th className="px-4 py-2 text-left">Arquivo</th>
                      <th className="px-4 py-2 text-left">Status</th>
                      <th className="px-4 py-2 text-left">Data</th>
                      <th className="px-4 py-2 text-left">Drive ID</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.pendentes.map((d) => (
                      <tr
                        key={d.id}
                        className="border-t hover:bg-amber-50 transition-colors"
                        style={{ borderColor: "#f0ebe0" }}
                      >
                        <td className="px-4 py-2.5 font-mono font-bold">{d.id}</td>
                        <td className="px-4 py-2.5 max-w-[140px] truncate">
                          <Link
                            href={`/cockpit-cliente?clientId=${d.client_id}`}
                            className="hover:underline font-semibold"
                            style={{ color: NAVY }}
                          >
                            {d.client_name ?? `Cliente ${d.client_id}`}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 max-w-[180px] truncate text-[11px]" style={{ color: "#475569" }}>
                          {d.file_name ?? "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className="text-[10px] font-black uppercase tracking-[0.12em] px-2 py-0.5 rounded-[4px]"
                            style={{
                              background: d.status === "erro" ? "#fee2e2" : "#fef3c7",
                              color: d.status === "erro" ? "#991b1b" : "#92400e",
                            }}
                          >
                            {d.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-[11px]" style={{ color: "#64748b" }}>
                          {d.created_at
                            ? new Date(d.created_at).toLocaleDateString("pt-BR")
                            : "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          {d.source_pdf_drive_id ? (
                            <a
                              href={`https://drive.google.com/file/d/${d.source_pdf_drive_id}/view`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] font-semibold"
                              style={{ color: GOLD }}
                            >
                              Abrir Drive
                            </a>
                          ) : (
                            <span className="text-[10px] text-red-500 font-semibold">Sem ID</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 flex items-center gap-2">
                          <Link
                            href={`/procedencia-exames?c=${d.client_id}`}
                            className="flex items-center gap-1 text-[10px] font-semibold"
                            style={{ color: GOLD }}
                          >
                            Ver
                            <ChevronRight className="h-3 w-3" />
                          </Link>
                          <button
                            type="button"
                            disabled={reprocessando[d.id]}
                            onClick={() => void reprocessarDoc(d.id)}
                            className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded disabled:opacity-50"
                            style={{ background: "#fef3c7", color: "#92400e", border: "1px solid #fcd34d" }}
                            title="Reprocessar este documento com a IA agora"
                          >
                            {reprocessando[d.id]
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <RotateCcw className="h-3 w-3" />}
                            Reprocessar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* AUDITORIA EM TEMPO REAL — polling 5s */}
            <div className="panel-3d overflow-hidden">
              <div
                className="flex items-center gap-2 px-5 py-3"
                style={{
                  background: "linear-gradient(90deg,#1e3668 0%,#16294a 100%)",
                  borderBottom: "2px solid rgba(231,205,143,0.22)",
                }}
              >
                <Activity className="h-4 w-4 shrink-0" style={{ color: GOLD }} />
                <span className="text-[11px] font-black uppercase tracking-[0.22em]" style={{ color: "#e7cd8f" }}>
                  Auditoria em Tempo Real
                </span>
                <span className="ml-auto text-[10px] text-slate-400">
                  atualiza a cada 5s · {audit.length} registro{audit.length !== 1 ? "s" : ""}
                </span>
              </div>

              {audit.length === 0 ? (
                <div className="p-8 text-center">
                  <Clock className="mx-auto h-8 w-8" style={{ color: "#94a3b8" }} />
                  <p className="mt-2 text-[12px] font-semibold" style={{ color: "#64748b" }}>
                    Nenhum documento registrado ainda.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]" style={{ color: NAVY }}>
                    <thead>
                      <tr
                        className="text-[10px] font-black uppercase tracking-[0.18em]"
                        style={{ background: "rgba(231,205,143,0.08)", color: "#64748b" }}
                      >
                        <th className="px-4 py-2 text-left">Arquivo</th>
                        <th className="px-4 py-2 text-left">Cliente</th>
                        <th className="px-4 py-2 text-left">Origem</th>
                        <th className="px-4 py-2 text-left">Status</th>
                        <th className="px-4 py-2 text-right">Analitos</th>
                        <th className="px-4 py-2 text-left">IAs</th>
                        <th className="px-4 py-2 text-center">Reprocessamentos</th>
                        <th className="px-4 py-2 text-left">Recebido em</th>
                        <th className="px-4 py-2 text-left">Extraído em</th>
                        <th className="px-4 py-2 text-right">Tempo</th>
                        <th className="px-4 py-2 text-left">Link Drive</th>
                      </tr>
                    </thead>
                    <tbody>
                      {audit.map((a) => {
                        const st = AUDIT_STATUS[a.status] ?? { label: a.status, bg: "#e2e8f0", cor: "#475569" };
                        return (
                          <tr
                            key={a.id}
                            className="border-t hover:bg-amber-50 transition-colors"
                            style={{ borderColor: "#f0ebe0" }}
                          >
                            <td className="px-4 py-2.5 max-w-[200px] truncate text-[11px]" style={{ color: "#475569" }} title={a.file_name ?? ""}>
                              {a.file_name ?? "—"}
                            </td>
                            <td className="px-4 py-2.5 max-w-[140px] truncate font-semibold">
                              {a.client_name ?? "—"}
                            </td>
                            <td className="px-4 py-2.5 text-[11px]" style={{ color: "#64748b" }}>
                              {a.origin ?? "—"}
                            </td>
                            <td className="px-4 py-2.5">
                              <span
                                className="text-[10px] font-black uppercase tracking-[0.12em] px-2 py-0.5 rounded-[4px]"
                                style={{ background: st.bg, color: st.cor }}
                              >
                                {st.label}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono font-bold tabular-nums">
                              {a.analitos ?? 0}
                            </td>
                            <td className="px-4 py-2.5">
                              {a.llm_pipeline && a.llm_pipeline.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {a.llm_pipeline.map((step, i) => (
                                    <span
                                      key={i}
                                      className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-[3px]"
                                      style={{
                                        background: step.ok ? "#dcfce7" : "#fee2e2",
                                        color: step.ok ? "#166534" : "#991b1b",
                                      }}
                                      title={`${step.provider}: ${step.analitos ?? 0} analitos, ${step.ms ?? 0}ms${step.error ? ` — ${step.error}` : ""}`}
                                    >
                                      <Cpu className="h-2.5 w-2.5" />
                                      {step.provider}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-center font-mono tabular-nums text-[11px]" style={{ color: "#64748b" }}>
                              {a.reprocessamento_count
                                ? <span className="font-bold" style={{ color: GOLD }}>{a.reprocessamento_count}×</span>
                                : <span style={{ color: "#94a3b8" }}>—</span>}
                            </td>
                            <td className="px-4 py-2.5 text-[11px] tabular-nums" style={{ color: "#64748b" }}>
                              {fmtDataHora(a.created_at)}
                            </td>
                            <td className="px-4 py-2.5 text-[11px] tabular-nums" style={{ color: "#64748b" }}>
                              {fmtDataHora(a.processed_at)}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono tabular-nums" style={{ color: "#64748b" }}>
                              {fmtElapsed(a.elapsed_s)}
                            </td>
                            <td className="px-4 py-2.5 text-[11px]">
                              {a.source_pdf_drive_id ? (
                                <a
                                  href={`https://drive.google.com/file/d/${a.source_pdf_drive_id}/view`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-semibold hover:underline"
                                  style={{ color: GOLD }}
                                >
                                  Abrir Drive
                                </a>
                              ) : (
                                <span style={{ color: "#94a3b8" }}>—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Link de volta ao Hub */}
            <div className="text-center">
              <Link
                href="/exames-hub"
                className="text-[11px] font-semibold"
                style={{ color: GOLD }}
              >
                ← Voltar ao Hub de Exames
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
