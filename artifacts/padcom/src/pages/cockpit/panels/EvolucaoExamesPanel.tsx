import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  Bot,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  LineChart as LineChartIcon,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BASE } from "../../comunicacao/_shared";

// ===========================================================================
// PAINEL: EVOLUCAO DE EXAMES (client-scoped) — base extraida de
// consulta/index.tsx (tabela comparativa) + gráfico por faixa (mockup
// acompanhamento/Exames.tsx). Consome apenas o motor existente:
//   GET /api/exames-lab/evolucao/:clientId
// Cada analito é uma FAIXA clicável: clicar expande um gráfico de linha do
// valueNum ao longo das datas, com a faixa de referência (refLow–refHigh)
// marcada. Um TOGGLE abre/fecha todas as faixas de uma vez.
// ===========================================================================

const GOLD = "#c2a05a";

interface EvolucaoCell {
  value: string | null;
  valueNum: number | null;
  unit: string | null;
  status: string | null;
  documentId: number;
}
interface EvolucaoColumn {
  key: string;
  date: string | null;
  lab: string | null;
  confLevel: "ia" | "c1" | "c2" | null;
  conferenteName: string | null;
  conferenteCargo: string | null;
}
interface EvolucaoAnalyte {
  key: string;
  name: string;
  unit: string | null;
  refLow: string | null;
  refHigh: string | null;
  trend: "subiu" | "caiu" | "estavel" | null;
  cells: Record<string, EvolucaoCell>;
}
interface EvolucaoData {
  columns: EvolucaoColumn[];
  analytes: EvolucaoAnalyte[];
}

// ---- helpers copiados de consulta/index.tsx (linhas 169-207) ----
function formatDateBr(iso: string | null): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

// Identidade do colaborador que fez a extracao/lancamento: "Sobrenome, Nome (Cargo)".
// Placeholders do sistema (ex.: lancamento legado, sem pessoa) ficam verbatim.
function formatColaborador(name: string | null, cargo: string | null): string {
  const raw = (name ?? "").trim();
  if (!raw) return cargo ? `(${cargo.trim()})` : "—";
  if (!cargo && /legad|confer[êe]ncia|sistema|automátic|automatic/i.test(raw)) return raw;
  const clean = raw
    .replace(/^(dr\.?|dra\.?|enf\.?|psic\.?|nutr\.?|recep\.?|adm\.?|fin\.?)\s+/i, "")
    .trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  let base: string;
  if (parts.length === 0) base = "";
  else if (parts.length === 1) base = parts[0];
  else base = `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(" ")}`;
  const c = (cargo ?? "").trim();
  if (!base) return c ? `(${c})` : "—";
  return c ? `${base} (${c})` : base;
}

// Cor por status do resultado — tonalizado para o navy do cockpit (contexto .dark).
function resultStatusClass(status: string | null): string {
  switch (status) {
    case "acima":
      return "bg-red-500/20 text-red-300";
    case "abaixo":
      return "bg-amber-500/20 text-amber-300";
    case "dentro":
      return "bg-emerald-500/20 text-emerald-300";
    case "conferencia":
      return "bg-slate-500/20 text-slate-300";
    default:
      return "text-slate-400";
  }
}

function toNum(s: string | null): number | null {
  if (s == null) return null;
  const n = Number(String(s).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// ---- mini-gráfico de um analito ao longo das datas ----
function FaixaGrafico({ analyte, columns }: { analyte: EvolucaoAnalyte; columns: EvolucaoColumn[] }) {
  const data = useMemo(
    () =>
      columns.map((c) => {
        const cell = analyte.cells[c.key];
        return {
          data: formatDateBr(c.date),
          valor: cell && cell.valueNum != null ? cell.valueNum : null,
        };
      }),
    [analyte, columns],
  );

  const refLow = toNum(analyte.refLow);
  const refHigh = toNum(analyte.refHigh);
  const temPontos = data.some((d) => d.valor != null);

  if (!temPontos) {
    return (
      <div className="py-6 text-center text-xs text-slate-400">
        Sem valores numéricos para desenhar o gráfico deste exame.
      </div>
    );
  }

  return (
    <div className="screen-3d rounded-md p-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
        <LineChartIcon className="h-3.5 w-3.5" style={{ color: GOLD }} />
        {analyte.name}
        {analyte.unit ? <span className="text-slate-400">({analyte.unit})</span> : null}
        {refLow != null && refHigh != null && (
          <span className="ml-auto text-[10px] normal-case text-slate-400">
            Referência {analyte.refLow}–{analyte.refHigh}
          </span>
        )}
      </div>
      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
            {refLow != null && refHigh != null && (
              <ReferenceArea
                y1={refLow}
                y2={refHigh}
                fill="#34d399"
                fillOpacity={0.12}
                stroke="#34d399"
                strokeOpacity={0.25}
              />
            )}
            <XAxis dataKey="data" tick={{ fill: "#94a3b8", fontSize: 10 }} tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} width={44} domain={["auto", "auto"]} />
            <Tooltip
              contentStyle={{
                background: "#0f1f3d",
                border: "1px solid rgba(194,160,90,0.4)",
                borderRadius: 8,
                color: "#e2e8f0",
                fontSize: 12,
              }}
              labelStyle={{ color: GOLD }}
              formatter={(v: number | string) => [`${v} ${analyte.unit ?? ""}`.trim(), "Valor"]}
            />
            <Line
              type="monotone"
              dataKey="valor"
              stroke={GOLD}
              strokeWidth={2.5}
              connectNulls
              dot={{ r: 3.5, fill: GOLD, stroke: "#0f1f3d", strokeWidth: 1.5 }}
              activeDot={{ r: 5.5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function EvolucaoExamesPanel({ clientId }: { clientId: number }) {
  const [data, setData] = useState<EvolucaoData | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  const carregar = useCallback((cid: number) => {
    setCarregando(true);
    setErro(false);
    fetch(`${BASE}/api/exames-lab/evolucao/${cid}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("evolucao"))))
      .then((d: EvolucaoData) => setData(d))
      .catch(() => {
        setData(null);
        setErro(true);
      })
      .finally(() => setCarregando(false));
  }, []);

  // Trocar de cliente re-alimenta e limpa as faixas abertas do cliente anterior.
  useEffect(() => {
    setAbertos(new Set());
    carregar(clientId);
  }, [clientId, carregar]);

  const analytes = data?.analytes ?? [];
  const columns = data?.columns ?? [];

  const todasAbertas = analytes.length > 0 && abertos.size === analytes.length;

  const alternarTodas = () => {
    setAbertos((prev) => (prev.size === analytes.length ? new Set() : new Set(analytes.map((a) => a.key))));
  };

  const alternarUma = (key: string) => {
    setAbertos((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (carregando) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando evolução…
      </div>
    );
  }

  if (erro) {
    return (
      <div className="bevel-3d flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm text-red-300">
        <span className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" /> Falha ao carregar a evolução de exames.
        </span>
        <button
          type="button"
          onClick={() => carregar(clientId)}
          className="btn-3d-soft rounded px-2 py-1 text-xs font-semibold uppercase"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (columns.length === 0 || analytes.length === 0) {
    return <p className="py-6 text-sm text-slate-400">Nenhum exame para este cliente ainda.</p>;
  }

  return (
    <div className="space-y-3">
      {/* Barra de acao: toggle abrir/fechar todas as faixas */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs text-slate-400">
          <LineChartIcon className="h-3.5 w-3.5" style={{ color: GOLD }} />
          Clique em um exame para expandir o gráfico de evolução.
        </p>
        <button
          type="button"
          onClick={alternarTodas}
          className="btn-3d-soft inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-wide"
          style={{ color: GOLD }}
        >
          {todasAbertas ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {todasAbertas ? "Fechar todas as faixas" : "Abrir todas as faixas"}
        </button>
      </div>

      {/* Tabela comparativa — cabecalho da coluna EMPILHADO: DATA / LAB / AUTOR */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-[#16284a] px-3 py-2 text-left align-bottom text-[11px] font-black uppercase tracking-wider text-slate-400">
                Exame
              </th>
              {columns.map((c) => (
                <th key={c.key} className="min-w-[130px] px-3 py-2 text-left align-bottom">
                  <span className="block text-sm font-black text-slate-100">{formatDateBr(c.date)}</span>
                  <span className="block text-xs font-medium" style={{ color: GOLD }}>
                    {c.lab ?? "Laboratório —"}
                  </span>
                  <span className="mt-0.5 block text-[10px] font-medium normal-case text-slate-400">
                    {c.conferenteName ? (
                      <>
                        {c.confLevel === "c2" ? "Conferido: " : "Lançado: "}
                        {formatColaborador(c.conferenteName, c.conferenteCargo)}
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <Bot className="h-3 w-3" /> Aguardando conferência
                      </span>
                    )}
                  </span>
                </th>
              ))}
              <th className="px-3 py-2 text-center align-bottom text-[11px] font-black uppercase tracking-wider text-slate-400">
                Tend.
              </th>
            </tr>
          </thead>
          <tbody>
            {analytes.map((a) => {
              const aberto = abertos.has(a.key);
              return (
                <Fragment key={a.key}>
                  <tr
                    onClick={() => alternarUma(a.key)}
                    className="cursor-pointer border-t border-white/10 neon-hover"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        alternarUma(a.key);
                      }
                    }}
                    style={aberto ? { outline: `1px solid ${GOLD}`, outlineOffset: "-1px" } : undefined}
                  >
                    <td className="sticky left-0 z-10 bg-[#16284a] px-3 py-2">
                      <span className="flex items-center gap-1.5">
                        {aberto ? (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: GOLD }} />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        )}
                        <span className="font-medium text-slate-100">{a.name}</span>
                      </span>
                      <span className="ml-5 block text-[11px] text-slate-400">
                        {[a.unit, a.refLow && a.refHigh ? `ref ${a.refLow}–${a.refHigh}` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </td>
                    {columns.map((c) => {
                      const cell = a.cells[c.key];
                      return (
                        <td key={c.key} className="px-3 py-2">
                          {cell && cell.value != null ? (
                            <span
                              className={`inline-block rounded px-2 py-0.5 font-semibold ${resultStatusClass(cell.status)}`}
                            >
                              {cell.value}
                            </span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-center">
                      {a.trend === "subiu" ? (
                        <TrendingUp className="mx-auto h-4 w-4 text-red-400" />
                      ) : a.trend === "caiu" ? (
                        <TrendingDown className="mx-auto h-4 w-4 text-emerald-400" />
                      ) : (
                        <Minus className="mx-auto h-4 w-4 text-slate-400" />
                      )}
                    </td>
                  </tr>
                  {aberto && (
                    <tr className="border-t border-white/5">
                      <td colSpan={columns.length + 2} className="px-3 py-3">
                        <FaixaGrafico analyte={a} columns={columns} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
