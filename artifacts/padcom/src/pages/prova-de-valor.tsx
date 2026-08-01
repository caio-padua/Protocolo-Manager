/**
 * Prova de Valor — Painel de KPIs auditáveis para licenciamento PADAXOR
 *
 * Rota: /prova-de-valor
 * API: GET /api/prova-de-valor/por-empresa?de=&ate=
 *      POST /api/prova-de-valor/exportar-pdf
 *
 * Mostra, por clínica, tudo que o sistema realizou automaticamente:
 * receitas, documentos, lembretes, laudos, respostas de IA.
 * Dados vêm do banco — zero nova infraestrutura.
 */

import { useEffect, useState } from "react";
import {
  TrendingUp, Download, RefreshCw, Clock, FileText,
  MessageSquare, Bell, Microscope, CheckCircle, Crown,
  ShieldCheck, Building2,
} from "lucide-react";

// ── Tipos ────────────────────────────────────────────────────────────────────

interface KPIs {
  receitasEmitidas: number;
  documentosEntregues: number;
  taxaConfirmacaoPercent: number;
  duvidasRespondidas: number;
  lembretesEntregues: number;
  laudosProcessados: number;
}

interface EmpresaKPI {
  empresaId: number;
  nome: string;
  nomeCompleto: string;
  tipoLicenciamento: string;
  isPropria: boolean;
  isLicenciada: boolean;
  isSublicenciada: boolean;
  kpis: KPIs;
  totalEventos: number;
}

interface PorEmpresaData {
  de: string;
  ate: string;
  totais: Omit<KPIs, "taxaConfirmacaoPercent">;
  por_empresa: EmpresaKPI[];
}

type Periodo = "7" | "30" | "90" | "custom";

// ── Helpers ──────────────────────────────────────────────────────────────────

function toInputDate(iso: string) {
  return iso.slice(0, 10);
}

function fromInputDate(d: string): Date {
  return new Date(d + "T00:00:00-03:00");
}

function nfmt(n: number): string {
  return n.toLocaleString("pt-BR");
}

const TIPO_COR: Record<string, { badge: string; faixa: string }> = {
  propria:              { badge: "text-emerald-400", faixa: "bg-emerald-500" },
  licenciada_direta:    { badge: "text-cyan-400",    faixa: "bg-cyan-500"    },
  licenciada_por_clinica: { badge: "text-amber-400", faixa: "bg-amber-500"  },
  sub_unidade:          { badge: "text-amber-400",   faixa: "bg-amber-500"   },
};

function tipoCor(tipo: string) {
  return TIPO_COR[tipo] ?? { badge: "text-slate-400", faixa: "bg-slate-500" };
}

function tipoLabel(emp: EmpresaKPI): string {
  if (emp.isPropria)        return "PRÓPRIA";
  if (emp.isSublicenciada)  return "SUB-LIC.";
  if (emp.isLicenciada)     return "LICENCIADA";
  return "—";
}

// ── Componente KPI Card (visão geral) ─────────────────────────────────────────

function KpiCard({ icon: Icon, label, valor, destaque = false }: {
  icon: typeof TrendingUp;
  label: string;
  valor: string | number;
  destaque?: boolean;
}) {
  return (
    <div
      className="rounded-[8px] p-4 flex flex-col gap-2"
      style={{
        background: destaque ? "rgba(191,153,64,0.08)" : "#131f36",
        border: `1px solid ${destaque ? "rgba(191,153,64,0.35)" : "rgba(255,255,255,0.07)"}`,
      }}
    >
      <div className="flex items-center gap-1.5">
        <Icon
          className="w-3.5 h-3.5 shrink-0"
          style={{ color: destaque ? "#bf9940" : "rgba(255,255,255,0.35)" }}
        />
        <span
          className="text-[9px] font-black uppercase tracking-widest"
          style={{ color: "rgba(255,255,255,0.4)" }}
        >
          {label}
        </span>
      </div>
      <span
        className="text-3xl font-black tabular-nums leading-none"
        style={{ color: destaque ? "#bf9940" : "rgba(191,153,64,0.8)" }}
      >
        {typeof valor === "number" ? nfmt(valor) : valor}
      </span>
    </div>
  );
}

// ── Linha da tabela por clínica ───────────────────────────────────────────────

function EmpresaRow({ emp, rank }: { emp: EmpresaKPI; rank: number }) {
  const cor = tipoCor(emp.tipoLicenciamento);
  const k = emp.kpis;
  const total = emp.totalEventos;

  return (
    <tr className={rank % 2 === 0 ? "bg-muted/30" : ""} style={{ borderBottom: "1px solid hsl(var(--border)/0.4)" }}>

      {/* Nome + tipo */}
      <td className="py-3 pl-4 pr-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`shrink-0 w-1 self-stretch rounded-full ${cor.faixa} opacity-70`} style={{ minHeight: "28px" }} />
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-tight leading-tight truncate text-foreground">
              {emp.nome}
            </div>
            <div className={`text-[9px] font-bold uppercase tracking-widest ${cor.badge}`}>
              {tipoLabel(emp)}
            </div>
          </div>
        </div>
      </td>

      {/* Receitas */}
      <td className="py-3 px-3 text-center">
        <span className="text-base font-black tabular-nums text-primary">
          {nfmt(k.receitasEmitidas)}
        </span>
      </td>

      {/* Documentos */}
      <td className="py-3 px-3 text-center">
        <span className="text-base font-black tabular-nums text-primary/80">
          {nfmt(k.documentosEntregues)}
        </span>
        {k.taxaConfirmacaoPercent > 0 && (
          <div className="text-[9px] tabular-nums font-bold text-muted-foreground/60">
            {k.taxaConfirmacaoPercent}% conf.
          </div>
        )}
      </td>

      {/* Lembretes */}
      <td className="py-3 px-3 text-center">
        <span className="text-base font-black tabular-nums text-primary/80">
          {nfmt(k.lembretesEntregues)}
        </span>
      </td>

      {/* Laudos OCR */}
      <td className="py-3 px-3 text-center">
        <span className="text-base font-black tabular-nums text-primary/80">
          {nfmt(k.laudosProcessados)}
        </span>
      </td>

      {/* IA */}
      <td className="py-3 px-3 text-center">
        <span className="text-base font-black tabular-nums text-primary/80">
          {nfmt(k.duvidasRespondidas)}
        </span>
      </td>

      {/* Total */}
      <td className="py-3 pr-4 pl-3 text-right">
        <span className={`text-[11px] font-black tabular-nums px-2 py-0.5 rounded-[4px] bevel-3d ${
          total > 0 ? "text-primary" : "text-muted-foreground/40"
        }`}>
          {nfmt(total)}
        </span>
      </td>
    </tr>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function ProvaDeValor() {
  const [periodo, setPeriodo] = useState<Periodo>("30");
  const [deCustom, setDeCustom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toInputDate(d.toISOString());
  });
  const [ateCustom, setAteCustom]   = useState<string>(() => toInputDate(new Date().toISOString()));
  const [minutosReceita, setMinutosReceita]   = useState(8);
  const [minutosLembrete, setMinutosLembrete] = useState(3);
  const [data, setData]       = useState<PorEmpresaData | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [erro, setErro]       = useState<string | null>(null);

  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

  function buildDates(): { de: Date; ate: Date } {
    if (periodo === "custom") {
      return { de: fromInputDate(deCustom), ate: fromInputDate(ateCustom) };
    }
    const ate = new Date();
    const de  = new Date();
    de.setDate(de.getDate() - parseInt(periodo));
    return { de, ate };
  }

  async function carregar() {
    setLoading(true);
    setErro(null);
    try {
      const { de, ate } = buildDates();
      const r = await fetch(
        `${base}/api/prova-de-valor/por-empresa?de=${de.toISOString()}&ate=${ate.toISOString()}`
      );
      if (!r.ok) throw new Error(`Erro ${r.status}`);
      const json = (await r.json()) as PorEmpresaData;
      setData(json);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }

  async function exportarPdf() {
    setExportando(true);
    try {
      const { de, ate } = buildDates();
      const r = await fetch(`${base}/api/prova-de-valor/exportar-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          de: de.toISOString(),
          ate: ate.toISOString(),
          minutosReceita,
          minutosLembrete,
        }),
      });
      if (!r.ok) throw new Error(`Erro ${r.status}`);
      const blob = await r.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `prova-de-valor-${de.toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao exportar PDF");
    } finally {
      setExportando(false);
    }
  }

  // Carrega automaticamente ao montar e ao trocar período
  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo]);

  const totais = data?.totais;
  const totalMinutos = totais
    ? totais.receitasEmitidas * minutosReceita + totais.lembretesEntregues * minutosLembrete
    : 0;
  const totalHoras = (totalMinutos / 60).toFixed(1);

  const todasEmpresas = data?.por_empresa ?? [];
  const totalEventos  = todasEmpresas.reduce((s, e) => s + e.totalEventos, 0);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── Cabeçalho ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Prova de Valor</h1>
          <p className="text-muted-foreground font-medium uppercase tracking-wider text-[10px] mt-1">
            O que o sistema realizou automaticamente · por clínica
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Seletor de período */}
          {(["7", "30", "90", "custom"] as Periodo[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={`btn-3d-soft px-3 py-1.5 text-[11px] font-black uppercase tracking-wider transition-all ${
                periodo === p ? "btn-3d text-primary" : ""
              }`}
            >
              {p === "custom" ? "Personalizado" : `${p}d`}
            </button>
          ))}

          <button
            onClick={carregar}
            disabled={loading}
            className="btn-3d-soft p-2"
            title="Atualizar"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>

          {data && (
            <button
              onClick={exportarPdf}
              disabled={exportando}
              className="btn-3d flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-black uppercase"
            >
              <Download className="w-3.5 h-3.5" />
              {exportando ? "Gerando…" : "PDF"}
            </button>
          )}
        </div>
      </div>

      {/* Datas personalizadas */}
      {periodo === "custom" && (
        <div className="bevel-3d p-3 flex flex-wrap gap-4 items-end">
          {[["De", deCustom, setDeCustom] as const, ["Até", ateCustom, setAteCustom] as const].map(([lbl, val, fn]) => (
            <div key={lbl}>
              <label className="block text-[9px] font-black uppercase tracking-widest text-muted-foreground/70 mb-1">
                {lbl}
              </label>
              <input
                type="date"
                value={val}
                onChange={(e) => { fn(e.target.value); }}
                className="concave-3d px-3 py-1.5 text-sm font-bold text-foreground rounded-[6px]"
              />
            </div>
          ))}
          <button onClick={carregar} disabled={loading} className="btn-3d px-4 py-1.5 text-[11px] font-black uppercase">
            Aplicar
          </button>
        </div>
      )}

      {/* Erro */}
      {erro && (
        <div className="paxter-alert paxter-alert-red px-4 py-3 text-sm text-red-700 font-medium">
          {erro}
        </div>
      )}

      {/* Skeleton de loading */}
      {loading && !data && (
        <div className="panel-3d p-12 flex flex-col items-center gap-3">
          <RefreshCw size={24} className="animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Calculando eventos por clínica…</span>
        </div>
      )}

      {/* ── VISÃO GERAL (totais consolidados) ──────────────────────────────── */}
      {data && (
        <>
          <div>
            <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 mb-2 pl-0.5">
              VISÃO GERAL — {todasEmpresas.length} clínica(s) ·&nbsp;
              {new Date(data.de).toLocaleDateString("pt-BR")} a {new Date(data.ate).toLocaleDateString("pt-BR")}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <KpiCard icon={FileText}       label="Receitas emitidas"        valor={totais!.receitasEmitidas}    destaque />
              <KpiCard icon={CheckCircle}    label="Documentos entregues"     valor={totais!.documentosEntregues} />
              <KpiCard icon={Bell}           label="Lembretes WhatsApp"       valor={totais!.lembretesEntregues}  />
              <KpiCard icon={Microscope}     label="Laudos por OCR"           valor={totais!.laudosProcessados}   />
              <KpiCard icon={MessageSquare}  label="Respostas de IA"          valor={totais!.duvidasRespondidas}  />
              <KpiCard icon={TrendingUp}     label="Total de eventos"         valor={totalEventos}                destaque />
            </div>
          </div>

          {/* Tempo economizado */}
          <div className="bevel-3d p-4 flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 shrink-0 text-primary" />
              <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/70">
                Tempo de secretaria economizado
              </span>
            </div>
            <div>
              <span className="text-3xl font-black text-primary tabular-nums">{totalHoras}h</span>
              <span className="text-[10px] text-muted-foreground ml-2">
                ({totais!.receitasEmitidas} receitas × {minutosReceita}min + {totais!.lembretesEntregues} lembretes × {minutosLembrete}min)
              </span>
            </div>
            {/* Sliders de minutagem */}
            <div className="flex gap-4 ml-auto">
              {[
                ["Min / Receita", minutosReceita, setMinutosReceita] as const,
                ["Min / Lembrete", minutosLembrete, setMinutosLembrete] as const,
              ].map(([lbl, val, fn]) => (
                <div key={lbl}>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 mb-1">
                    {lbl}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={val}
                    onChange={(e) => fn(Number(e.target.value))}
                    className="concave-3d w-16 px-2 py-1.5 text-sm text-center font-bold text-primary"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* ── TABELA POR CLÍNICA ──────────────────────────────────────────── */}
          <div>
            <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 mb-2 pl-0.5 flex items-center gap-2">
              <Building2 className="w-3 h-3" />
              POR CLÍNICA
            </div>
            <div className="panel-3d overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr
                      style={{
                        borderBottom: "1px solid rgba(255,255,255,0.08)",
                        background: "rgba(255,255,255,0.025)",
                      }}
                    >
                      <th className="py-2.5 pl-4 pr-2 text-left">
                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" /> Clínica
                        </span>
                      </th>
                      <th className="py-2.5 px-3 text-center">
                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 flex items-center justify-center gap-1">
                          <FileText className="w-3 h-3" /> Receitas
                        </span>
                      </th>
                      <th className="py-2.5 px-3 text-center">
                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 flex items-center justify-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Docs
                        </span>
                      </th>
                      <th className="py-2.5 px-3 text-center">
                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 flex items-center justify-center gap-1">
                          <Bell className="w-3 h-3" /> Lembretes
                        </span>
                      </th>
                      <th className="py-2.5 px-3 text-center">
                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 flex items-center justify-center gap-1">
                          <Microscope className="w-3 h-3" /> Laudos
                        </span>
                      </th>
                      <th className="py-2.5 px-3 text-center">
                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 flex items-center justify-center gap-1">
                          <MessageSquare className="w-3 h-3" /> IA
                        </span>
                      </th>
                      <th className="py-2.5 pr-4 pl-3 text-right">
                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 flex items-center justify-end gap-1">
                          <Crown className="w-3 h-3" /> Total
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {todasEmpresas.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="py-12 text-center text-sm text-muted-foreground"
                        >
                          Nenhuma clínica encontrada.
                        </td>
                      </tr>
                    ) : (
                      todasEmpresas.map((emp, i) => (
                        <EmpresaRow key={emp.empresaId} emp={emp} rank={i} />
                      ))
                    )}
                  </tbody>
                  {/* Rodapé — totais */}
                  {todasEmpresas.length > 1 && (
                    <tfoot>
                      <tr
                        style={{
                          borderTop: "1px solid rgba(191,153,64,0.2)",
                          background: "rgba(191,153,64,0.04)",
                        }}
                      >
                        <td className="py-2.5 pl-4 pr-2">
                          <span className="text-[9px] font-black uppercase tracking-widest text-primary">
                            TOTAL — {todasEmpresas.length} clínicas
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="text-[13px] font-black tabular-nums text-primary">{nfmt(totais!.receitasEmitidas)}</span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="text-[13px] font-black tabular-nums text-primary">{nfmt(totais!.documentosEntregues)}</span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="text-[13px] font-black tabular-nums text-primary">{nfmt(totais!.lembretesEntregues)}</span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="text-[13px] font-black tabular-nums text-primary">{nfmt(totais!.laudosProcessados)}</span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="text-[13px] font-black tabular-nums text-primary">{nfmt(totais!.duvidasRespondidas)}</span>
                        </td>
                        <td className="py-2.5 pr-4 pl-3 text-right">
                          <span
                            className="text-[13px] font-black tabular-nums px-2 py-0.5 rounded-[4px]"
                            style={{ background: "rgba(191,153,64,0.2)", color: "#bf9940", border: "1px solid rgba(191,153,64,0.4)" }}
                          >
                            {nfmt(totalEventos)}
                          </span>
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>

          {/* Legenda */}
          <div className="flex flex-wrap gap-3 items-center">
            {[
              { faixa: "bg-emerald-500", label: "Própria (CEO)" },
              { faixa: "bg-cyan-500",    label: "Licenciada direta" },
              { faixa: "bg-amber-500",   label: "Sub-licenciada" },
            ].map((l) => (
              <div key={l.label} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${l.faixa}`} />
                <span className="text-[9px] uppercase tracking-widest text-muted-foreground/60 font-semibold">
                  {l.label}
                </span>
              </div>
            ))}
            <span className="ml-auto text-[9px] text-muted-foreground/30 uppercase tracking-widest">
              PADAXOR Clinical Intelligence System
            </span>
          </div>
        </>
      )}

    </div>
  );
}
