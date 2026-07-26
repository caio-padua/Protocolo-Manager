/**
 * Prova de Valor — Painel de KPIs auditáveis para licenciamento PADAXOR
 *
 * Rota: /prova-de-valor
 * API: GET /api/prova-de-valor?de=&ate=
 *      POST /api/prova-de-valor/exportar-pdf
 */

import { useState } from "react";
import { TrendingUp, Download, RefreshCw, Clock } from "lucide-react";

interface KPIs {
  receitasEmitidas: number;
  documentosEntregues: number;
  taxaConfirmacaoPercent: number;
  duvidasRespondidas: number;
  lembretesEntregues: number;
  laudosProcessados: number;
}

interface ProvaData {
  de: string;
  ate: string;
  kpis: KPIs;
}

type Periodo = "7" | "30" | "90" | "custom";

function toInputDate(iso: string) {
  return iso.slice(0, 10);
}

function fromInputDate(d: string): Date {
  return new Date(d + "T00:00:00-03:00");
}

export default function ProvaDeValor() {
  const [periodo, setPeriodo] = useState<Periodo>("30");
  const [deCustom, setDeCustom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toInputDate(d.toISOString());
  });
  const [ateCustom, setAteCustom] = useState<string>(() => toInputDate(new Date().toISOString()));
  const [minutosReceita, setMinutosReceita] = useState(8);
  const [minutosLembrete, setMinutosLembrete] = useState(3);
  const [data, setData] = useState<ProvaData | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function buildDates(): { de: Date; ate: Date } {
    const ate = new Date();
    if (periodo === "custom") {
      return { de: fromInputDate(deCustom), ate: fromInputDate(ateCustom) };
    }
    const de = new Date();
    de.setDate(de.getDate() - parseInt(periodo));
    return { de, ate };
  }

  async function carregar() {
    setLoading(true);
    setErro(null);
    try {
      const { de, ate } = buildDates();
      const r = await fetch(
        `/api/prova-de-valor?de=${de.toISOString()}&ate=${ate.toISOString()}`
      );
      if (!r.ok) throw new Error(`Erro ${r.status}`);
      const json = (await r.json()) as ProvaData;
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
      const r = await fetch("/api/prova-de-valor/exportar-pdf", {
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
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `prova-de-valor-${de.toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao exportar PDF");
    } finally {
      setExportando(false);
    }
  }

  const kpis = data?.kpis;
  const totalMinutos = kpis
    ? kpis.receitasEmitidas * minutosReceita + kpis.lembretesEntregues * minutosLembrete
    : 0;
  const totalHoras = (totalMinutos / 60).toFixed(1);

  const cards = kpis
    ? [
        { label: "RECEITAS EMITIDAS", valor: kpis.receitasEmitidas, cor: "from-blue-900/30" },
        { label: "DOCUMENTOS ENTREGUES", valor: kpis.documentosEntregues, cor: "from-indigo-900/30" },
        { label: "TAXA DE CONFIRMAÇÃO", valor: `${kpis.taxaConfirmacaoPercent}%`, cor: "from-purple-900/30" },
        { label: "DÚVIDAS RESPONDIDAS PELA IA", valor: kpis.duvidasRespondidas, cor: "from-teal-900/30" },
        { label: "LEMBRETES DE DOSE ENTREGUES", valor: kpis.lembretesEntregues, cor: "from-emerald-900/30" },
        { label: "LAUDOS PROCESSADOS", valor: kpis.laudosProcessados, cor: "from-amber-900/30" },
      ]
    : [];

  return (
    <div className="min-h-screen p-6" style={{ background: "#0d1526" }}>
      {/* Topo */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-[6px] flex items-center justify-center"
          style={{ background: "linear-gradient(135deg,#1a2a4a,#0d1526)", border: "1px solid rgba(191,153,64,0.4)" }}>
          <TrendingUp className="w-5 h-5" style={{ color: "#bf9940" }} />
        </div>
        <div>
          <h1 className="text-lg font-bold uppercase tracking-widest" style={{ color: "#bf9940" }}>
            Prova de Valor
          </h1>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
            KPIs auditáveis — Instituto Pádua / PADAXOR
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="rounded-[8px] p-4 mb-6 flex flex-wrap gap-4 items-end"
        style={{ background: "#131f36", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div>
          <label className="block text-xs font-bold uppercase mb-1" style={{ color: "rgba(255,255,255,0.5)" }}>
            Período
          </label>
          <div className="flex gap-1">
            {(["7", "30", "90", "custom"] as Periodo[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriodo(p)}
                className="px-3 py-1.5 rounded-[6px] text-xs font-bold uppercase transition-all"
                style={{
                  background: periodo === p ? "#bf9940" : "rgba(255,255,255,0.06)",
                  color: periodo === p ? "#0d1526" : "rgba(255,255,255,0.7)",
                  border: `1px solid ${periodo === p ? "#bf9940" : "rgba(255,255,255,0.1)"}`,
                }}
              >
                {p === "custom" ? "Personalizado" : `${p} dias`}
              </button>
            ))}
          </div>
        </div>

        {periodo === "custom" && (
          <>
            <div>
              <label className="block text-xs font-bold uppercase mb-1" style={{ color: "rgba(255,255,255,0.5)" }}>
                De
              </label>
              <input
                type="date"
                value={deCustom}
                onChange={(e) => setDeCustom(e.target.value)}
                className="rounded-[6px] px-3 py-1.5 text-sm"
                style={{ background: "rgba(255,255,255,0.06)", color: "#fff", border: "1px solid rgba(255,255,255,0.12)" }}
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase mb-1" style={{ color: "rgba(255,255,255,0.5)" }}>
                Até
              </label>
              <input
                type="date"
                value={ateCustom}
                onChange={(e) => setAteCustom(e.target.value)}
                className="rounded-[6px] px-3 py-1.5 text-sm"
                style={{ background: "rgba(255,255,255,0.06)", color: "#fff", border: "1px solid rgba(255,255,255,0.12)" }}
              />
            </div>
          </>
        )}

        <button
          onClick={carregar}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-[6px] text-sm font-bold uppercase transition-all"
          style={{ background: "linear-gradient(135deg,#1e3a6e,#132347)", color: "#fff", border: "1px solid rgba(191,153,64,0.3)" }}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Carregando..." : "Atualizar"}
        </button>

        {data && (
          <button
            onClick={exportarPdf}
            disabled={exportando}
            className="flex items-center gap-2 px-4 py-2 rounded-[6px] text-sm font-bold uppercase transition-all"
            style={{ background: "linear-gradient(135deg,#bf9940,#8b6f2e)", color: "#0d1526" }}
          >
            <Download className="w-4 h-4" />
            {exportando ? "Gerando PDF..." : "Exportar PDF"}
          </button>
        )}
      </div>

      {/* Erro */}
      {erro && (
        <div className="rounded-[8px] p-4 mb-6 text-sm" style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)", color: "#fca5a5" }}>
          {erro}
        </div>
      )}

      {/* KPIs */}
      {!data && !loading && (
        <div className="text-center py-20" style={{ color: "rgba(255,255,255,0.3)" }}>
          <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Clique em "Atualizar" para carregar os dados do período.</p>
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            {cards.map(({ label, valor, cor }) => (
              <div
                key={label}
                className={`rounded-[8px] p-4 bg-gradient-to-br ${cor} to-transparent`}
                style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#131f36" }}
              >
                <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "rgba(255,255,255,0.45)" }}>
                  {label}
                </p>
                <p className="text-3xl font-bold" style={{ color: "#bf9940" }}>
                  {valor}
                </p>
              </div>
            ))}
          </div>

          {/* Tempo de secretaria economizado */}
          <div className="rounded-[8px] p-5 mb-6"
            style={{ background: "#131f36", border: "1px solid rgba(191,153,64,0.2)" }}>
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4" style={{ color: "#bf9940" }} />
              <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.6)" }}>
                Tempo de Secretaria Economizado
              </h2>
            </div>
            <div className="flex flex-wrap gap-6 items-center">
              <div>
                <p className="text-4xl font-bold" style={{ color: "#bf9940" }}>
                  {totalHoras}h
                </p>
                <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {kpis!.receitasEmitidas} receitas × {minutosReceita}min + {kpis!.lembretesEntregues} lembretes × {minutosLembrete}min
                </p>
              </div>
              <div className="flex gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase mb-1" style={{ color: "rgba(255,255,255,0.45)" }}>
                    Min / Receita
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={minutosReceita}
                    onChange={(e) => setMinutosReceita(Number(e.target.value))}
                    className="w-16 rounded-[6px] px-2 py-1.5 text-sm text-center font-bold"
                    style={{ background: "rgba(255,255,255,0.06)", color: "#bf9940", border: "1px solid rgba(191,153,64,0.3)" }}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase mb-1" style={{ color: "rgba(255,255,255,0.45)" }}>
                    Min / Lembrete
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={minutosLembrete}
                    onChange={(e) => setMinutosLembrete(Number(e.target.value))}
                    className="w-16 rounded-[6px] px-2 py-1.5 text-sm text-center font-bold"
                    style={{ background: "rgba(255,255,255,0.06)", color: "#bf9940", border: "1px solid rgba(191,153,64,0.3)" }}
                  />
                </div>
              </div>
            </div>
          </div>

          <p className="text-[10px] text-center" style={{ color: "rgba(255,255,255,0.2)" }}>
            Período: {new Date(data.de).toLocaleDateString("pt-BR")} a {new Date(data.ate).toLocaleDateString("pt-BR")} · PADAXOR Clinical Intelligence System
          </p>
        </>
      )}
    </div>
  );
}
