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
  const [data, setData]         = useState<MonitorData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [recovery, setRecovery] = useState<"idle" | "running" | "ok" | "err">("idle");

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
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/procedencia-exames?c=${d.client_id}`}
                            className="flex items-center gap-1 text-[10px] font-semibold"
                            style={{ color: GOLD }}
                          >
                            Ver
                            <ChevronRight className="h-3 w-3" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
