import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  Bot,
  AlertTriangle,
  MousePointerClick,
  FlaskConical,
  X,
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
// PAINEL: EVOLUCAO DE EXAMES (client-scoped) — fiel ao mockup
//   artifacts/mockup-sandbox/src/components/mockups/acompanhamento/Exames.tsx
// Adaptado aos dados REAIS do motor: GET /api/exames-lab/evolucao/:clientId.
// Tema CLARO 3D Paxter (cockpit-cliente é cream).
// - Nome do exame CONGELADO à esquerda; datas rolam na horizontal.
// - Clique numa faixa (linha) EMPILHA o gráfico daquele exame à direita.
// - O gráfico plota SÓ os pontos que têm valor (eixo X não estica).
// - Cabeçalho de cada coluna mostra a DATA (grande) + laboratório + conferência.
// - Cor por STATUS real (dentro/acima/abaixo/conferência) — sem zonas fictícias.
// ===========================================================================

const NAVY = "#16294a";
const MUTED = "#647c97";
const GOLD = "#b8924d";
const NOME_BG = "#e9ecf1";

// Cor por status real do resultado (o motor só entrega status + refLow/refHigh,
// não as 5 zonas do mockup; então a cor honesta vem do status).
type StatusKey = "dentro" | "acima" | "abaixo" | "conferencia";
const STATUS_COR: Record<StatusKey, { cor: string; rotulo: string }> = {
  dentro: { cor: "#2f8f4e", rotulo: "Dentro" },
  acima: { cor: "#c0392b", rotulo: "Acima" },
  abaixo: { cor: "#e07b39", rotulo: "Abaixo" },
  conferencia: { cor: MUTED, rotulo: "Conferência" },
};

function corStatus(status: string | null): string {
  if (status === "dentro" || status === "acima" || status === "abaixo" || status === "conferencia") {
    return STATUS_COR[status].cor;
  }
  return MUTED;
}

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

// dd/mm (dia+mês) e o ano separado, para o cabeçalho em duas linhas
function diaMes(iso: string | null): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : iso;
}
function ano(iso: string | null): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})/);
  return m ? m[1] : "";
}
// dd/mm/aa curto para o eixo do gráfico
function dataCurta(iso: string | null): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : iso;
}

function toNum(s: string | null): number | null {
  if (s == null) return null;
  const n = Number(String(s).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// Config de tendência (LED + ícone). Semântica mantida do painel anterior:
// subiu=alerta vermelho, caiu=verde, estável=âmbar.
const TEND = {
  subiu: { rotulo: "SUBIU", cor: "text-red-700", led: "paxter-led-red", Icon: TrendingUp },
  caiu: { rotulo: "CAIU", cor: "text-emerald-700", led: "paxter-led-green", Icon: TrendingDown },
  estavel: { rotulo: "ESTÁVEL", cor: "text-amber-700", led: "paxter-led-amber", Icon: Minus },
} as const;

// ---- célula de valor ----
function Cela({
  cell,
  atual,
  showStrip,
  neonStatus,
}: {
  cell: EvolucaoCell | undefined;
  atual: boolean;
  showStrip: boolean;
  neonStatus: StatusKey | null;
}) {
  if (!cell || cell.value == null) {
    return (
      <div className="flex min-w-[58px] items-center justify-center py-1.5 text-[12px] text-[#b3bccb]">
        —
      </div>
    );
  }
  const cor = corStatus(cell.status);
  const aceso = neonStatus !== null && cell.status === neonStatus;
  return (
    <div
      className={`relative min-w-[58px] overflow-hidden rounded-[4px] py-1.5 text-center ${
        atual ? "screen-3d" : "concave-3d"
      }`}
      style={
        aceso
          ? { boxShadow: `0 0 0 2px ${cor}, 0 0 12px 3px ${cor}`, transition: "box-shadow .15s" }
          : { transition: "box-shadow .15s" }
      }
      title={`${cell.value} ${cell.unit ?? ""} · ${STATUS_COR[(cell.status as StatusKey) ?? "conferencia"]?.rotulo ?? "—"}`}
    >
      {showStrip && <span className="absolute left-0 top-0 h-full w-[5px]" style={{ background: cor }} />}
      <span
        className={atual ? "text-[12px] font-bold" : "text-[11px] font-semibold"}
        style={{ color: cell.status ? cor : "#3a4a63", paddingLeft: showStrip ? 5 : 0 }}
      >
        {cell.value}
      </span>
    </div>
  );
}

// ---- cabeçalho da coluna: DATA grande + ano + lab + conferência ----
function ColunaCabecalho({ c, ultima }: { c: EvolucaoColumn; ultima: boolean }) {
  return (
    <div className="flex min-w-[58px] flex-col items-center px-0.5 text-center">
      <span className={`text-[12px] font-black leading-none ${ultima ? "text-[#16294a]" : "text-[#3a4a63]"}`}>
        {diaMes(c.date)}
      </span>
      <span className="text-[9px] font-bold leading-none text-[#8a97a9]">{ano(c.date)}</span>
      <span className="mt-1 max-w-[64px] truncate text-[9px] font-semibold leading-tight" style={{ color: GOLD }}>
        {c.lab ?? "Lab. —"}
      </span>
      <span className="mt-0.5 text-[8px] font-medium leading-tight text-[#8a97a9]">
        {c.conferenteName ? (
          <>
            {c.confLevel === "c2" ? "Conferido" : "Lançado"}
          </>
        ) : (
          <span className="inline-flex items-center gap-0.5">
            <Bot className="h-2.5 w-2.5" /> Aguardando
          </span>
        )}
      </span>
    </div>
  );
}

// ---- cartão de gráfico (um por exame selecionado, empilhados à direita) ----
function CartaoGrafico({
  analyte,
  columns,
  ordem,
  onRemover,
}: {
  analyte: EvolucaoAnalyte;
  columns: EvolucaoColumn[];
  ordem: number;
  onRemover: () => void;
}) {
  // SÓ pontos com valor — assim o eixo X não estica com datas vazias.
  const data = useMemo(
    () =>
      columns
        .map((c) => {
          const cell = analyte.cells[c.key];
          return cell && cell.valueNum != null
            ? { data: dataCurta(c.date), valor: cell.valueNum, status: cell.status }
            : null;
        })
        .filter((d): d is { data: string; valor: number; status: string | null } => d != null),
    [analyte, columns],
  );

  const refLow = toNum(analyte.refLow);
  const refHigh = toNum(analyte.refHigh);

  // último valor + status para o cabeçalho do cartão
  const ultimo = data.length > 0 ? data[data.length - 1] : null;
  const corUltimo = corStatus(ultimo?.status ?? null);

  const tend = analyte.trend ? TEND[analyte.trend] : TEND.estavel;

  return (
    <section className="panel-3d p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <span
            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
            style={{ background: NAVY }}
          >
            {ordem}
          </span>
          <div>
            <div className="text-[13px] font-bold leading-tight text-[#16294a]">{analyte.name}</div>
            <div className="flex items-center gap-2">
              {ultimo && <span className="text-[15px] font-bold text-[#16294a]">{ultimo.valor}</span>}
              {analyte.unit && <span className="text-[10px] text-[#647c97]">{analyte.unit}</span>}
              {refLow != null && refHigh != null && (
                <span className="text-[10px] text-[#647c97]">
                  ref {analyte.refLow}–{analyte.refHigh}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="bevel-3d flex items-center gap-1 px-2 py-1">
            <span className={`paxter-led ${tend.led} paxter-led-on`} />
            <span className={`text-[9px] font-bold uppercase ${tend.cor}`}>{tend.rotulo}</span>
          </span>
          <button
            type="button"
            onClick={onRemover}
            title="Tirar este gráfico"
            className="flex h-6 w-6 items-center justify-center rounded-[5px] text-[#647c97] hover:text-[#c0392b]"
            style={{ background: "rgba(22,41,74,0.06)" }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="concave-3d px-3 py-8 text-center text-[12px] text-[#647c97]">
          Sem valores numéricos para desenhar o gráfico deste exame.
        </div>
      ) : (
        <div className="screen-3d p-2">
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(22,41,74,0.10)" />
                {refLow != null && refHigh != null && (
                  <ReferenceArea
                    y1={refLow}
                    y2={refHigh}
                    fill="#2f8f4e"
                    fillOpacity={0.12}
                    stroke="#2f8f4e"
                    strokeOpacity={0.3}
                  />
                )}
                <XAxis
                  dataKey="data"
                  tick={{ fill: MUTED, fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: "rgba(22,41,74,0.15)" }}
                />
                <YAxis
                  tick={{ fill: MUTED, fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: "rgba(22,41,74,0.15)" }}
                  width={44}
                  domain={["auto", "auto"]}
                />
                <Tooltip
                  contentStyle={{
                    background: "#fff",
                    border: "1px solid rgba(184,146,77,0.5)",
                    borderRadius: 8,
                    color: NAVY,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: GOLD }}
                  formatter={(v: number | string) => [`${v} ${analyte.unit ?? ""}`.trim(), "Valor"]}
                />
                <Line
                  type="monotone"
                  dataKey="valor"
                  stroke={NAVY}
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: GOLD, stroke: "#fff", strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: GOLD, stroke: "#fff", strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {ultimo && (
        <div className="concave-3d mt-2 flex items-center gap-2 px-3 py-2">
          <span className="inline-block h-3 w-3 shrink-0 rounded-[3px]" style={{ background: corUltimo }} />
          <span className="text-[13px] font-bold leading-tight" style={{ color: corUltimo }}>
            {STATUS_COR[(ultimo.status as StatusKey) ?? "conferencia"]?.rotulo ?? "—"}
          </span>
          <span className="ml-auto text-[11px] font-semibold text-[#647c97]">
            {ultimo.valor} {analyte.unit ?? ""}
          </span>
        </div>
      )}
    </section>
  );
}

// ---- interruptor (toggle) estilo Paxter ----
function Toggle({ ligado, onToggle, texto }: { ligado: boolean; onToggle: () => void; texto: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={ligado}
      className="flex items-center gap-2 rounded-[5px] px-1 text-[11px] font-bold uppercase tracking-wide text-[#16294a]"
    >
      <span
        className="relative inline-flex h-[20px] w-[38px] items-center rounded-full transition-colors"
        style={{ background: ligado ? GOLD : "#c9cdd6", boxShadow: "inset 0 1px 3px rgba(0,0,0,0.35)" }}
      >
        <span
          className="absolute h-[15px] w-[15px] rounded-full bg-white transition-all"
          style={{ left: ligado ? 20 : 3, boxShadow: "0 1px 2px rgba(0,0,0,0.4)" }}
        />
      </span>
      {texto}
    </button>
  );
}

export default function EvolucaoExamesPanel({ clientId }: { clientId: number }) {
  const [data, setData] = useState<EvolucaoData | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [mostrarFaixas, setMostrarFaixas] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState<StatusKey | null>(null);

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

  // Trocar de cliente re-alimenta e limpa a seleção do cliente anterior.
  useEffect(() => {
    setSelecionados([]);
    carregar(clientId);
  }, [clientId, carregar]);

  const analytes = data?.analytes ?? [];
  const columns = data?.columns ?? [];
  const ultimaCol = columns.length > 0 ? columns[columns.length - 1].key : null;

  const alternar = (key: string) => {
    setSelecionados((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const analytePorKey = useMemo(() => {
    const m = new Map<string, EvolucaoAnalyte>();
    analytes.forEach((a) => m.set(a.key, a));
    return m;
  }, [analytes]);

  if (carregando) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-[#647c97]">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando evolução…
      </div>
    );
  }

  if (erro) {
    return (
      <div className="bevel-3d flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm text-red-700">
        <span className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" /> Falha ao carregar a evolução de exames.
        </span>
        <button
          type="button"
          onClick={() => carregar(clientId)}
          className="btn-3d-soft rounded px-2 py-1 text-xs font-semibold uppercase text-[#16294a]"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (columns.length === 0 || analytes.length === 0) {
    return <p className="py-6 text-sm text-[#647c97]">Nenhum exame para este cliente ainda.</p>;
  }

  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[1fr_380px]">
      {/* ESQUERDA — planilha: nome congelado + datas rolando */}
      <section className="panel-3d min-w-0 p-4">
        <div className="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-[#16294a]">
          <FlaskConical className="h-4 w-4" style={{ color: "#9a7b32" }} /> Exames — Evolução
        </div>

        {/* controles: acender faixa por status + toggle de cor por valor */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-[#16294a]/10 pb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[9px] font-bold uppercase tracking-wide text-[#647c97]">Acender:</span>
            <button
              type="button"
              onClick={() => setFiltroStatus(null)}
              className="rounded-[5px] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide"
              style={
                filtroStatus === null
                  ? { background: NAVY, color: "#fff" }
                  : { background: "rgba(22,41,74,0.08)", color: NAVY }
              }
            >
              Todos
            </button>
            {(["dentro", "acima", "abaixo"] as StatusKey[]).map((s) => {
              const ativo = filtroStatus === s;
              const cor = STATUS_COR[s].cor;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFiltroStatus(ativo ? null : s)}
                  className="flex items-center gap-1 rounded-[5px] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide"
                  style={
                    ativo
                      ? { background: cor, color: "#fff", boxShadow: `0 0 8px 1px ${cor}` }
                      : { background: "rgba(22,41,74,0.06)", color: cor }
                  }
                >
                  <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: cor }} />
                  {STATUS_COR[s].rotulo}
                </button>
              );
            })}
          </div>
          <Toggle
            ligado={mostrarFaixas}
            onToggle={() => setMostrarFaixas((v) => !v)}
            texto="Faixa de cor por valor"
          />
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-3 text-[10px] font-semibold uppercase tracking-wide text-[#647c97]">
          <span className="flex items-center gap-1">
            <MousePointerClick className="h-3.5 w-3.5" /> Clique no exame para empilhar o gráfico ao lado
          </span>
          <span className="hidden items-center gap-1 sm:flex">← role para ver todas as datas →</span>
        </div>

        {/* janela com rolagem lateral; a coluna do nome fica congelada */}
        <div className="overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
          <div className="min-w-max">
            {/* cabeçalho */}
            <div className="flex items-end gap-2 pb-2">
              <div
                className="sticky left-0 z-[2] flex w-[200px] shrink-0 items-end px-2 py-1"
                style={{ background: NOME_BG }}
              >
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#647c97]">
                  Exame (congelado)
                </span>
              </div>
              {columns.map((c) => (
                <ColunaCabecalho key={c.key} c={c} ultima={c.key === ultimaCol} />
              ))}
              <div className="flex w-[92px] shrink-0 items-end justify-center text-[10px] font-bold uppercase tracking-wide text-[#647c97]">
                Tendência
              </div>
            </div>

            {/* linhas */}
            <div className="space-y-2">
              {analytes.map((a) => {
                const selecionada = selecionados.includes(a.key);
                const tend = a.trend ? TEND[a.trend] : TEND.estavel;
                return (
                  <div
                    key={a.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => alternar(a.key)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        alternar(a.key);
                      }
                    }}
                    className="panel-3d-sub flex cursor-pointer items-center gap-2 py-2 pr-2"
                    style={selecionada ? { outline: `2px solid ${GOLD}`, outlineOffset: "-2px" } : undefined}
                  >
                    {/* nome congelado */}
                    <div
                      className="sticky left-0 z-[2] flex w-[200px] shrink-0 flex-col justify-center px-2 py-0.5"
                      style={{ background: NOME_BG, boxShadow: "7px 0 7px -5px rgba(0,0,0,0.18)" }}
                    >
                      <div className="flex items-center gap-1.5">
                        {selecionada && (
                          <span
                            className="inline-block h-2 w-2 shrink-0 rounded-full"
                            style={{ background: GOLD, boxShadow: `0 0 6px 1px ${GOLD}` }}
                          />
                        )}
                        <span className="text-[12px] font-semibold leading-tight text-[#16294a]">{a.name}</span>
                      </div>
                      <div className="text-[9px] uppercase tracking-wide text-[#647c97]">
                        {[a.unit, a.refLow && a.refHigh ? `ref ${a.refLow}–${a.refHigh}` : null]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </div>
                    </div>
                    {/* valores por data */}
                    {columns.map((c) => (
                      <Cela
                        key={c.key}
                        cell={a.cells[c.key]}
                        atual={c.key === ultimaCol}
                        showStrip={mostrarFaixas}
                        neonStatus={filtroStatus}
                      />
                    ))}
                    {/* tendência */}
                    <div className="bevel-3d flex w-[92px] shrink-0 items-center justify-center gap-1 py-1.5">
                      <span className={`paxter-led ${tend.led} paxter-led-on`} />
                      <tend.Icon className={`h-3.5 w-3.5 ${tend.cor}`} />
                      <span className={`text-[9px] font-bold uppercase tracking-wide ${tend.cor}`}>
                        {tend.rotulo}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <p className="mt-4 text-[11px] italic text-[#647c97]">
          Uma planilha só: o nome do exame fica congelado à esquerda e as datas rolam para o lado. Clique numa
          linha para empilhar o gráfico dela ao lado; "Acender" destaca só os valores daquela situação; o
          interruptor liga a faixinha de cor por valor.
        </p>
      </section>

      {/* DIREITA — gráficos empilhados (um por exame clicado) */}
      <aside className="flex flex-col gap-3 self-start xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto xl:pr-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#16294a]">
            Gráficos abertos ({selecionados.length})
          </span>
          {selecionados.length > 0 && (
            <button
              type="button"
              onClick={() => setSelecionados([])}
              className="text-[10px] font-bold uppercase tracking-wide text-[#647c97] hover:text-[#c0392b]"
            >
              Limpar
            </button>
          )}
        </div>

        {selecionados.length === 0 ? (
          <div className="concave-3d flex flex-col items-center gap-2 px-4 py-10 text-center">
            <MousePointerClick className="h-6 w-6 text-[#647c97]" />
            <span className="text-[12px] text-[#647c97]">
              Clique num exame na planilha para abrir o gráfico aqui. Você pode empilhar vários.
            </span>
          </div>
        ) : (
          selecionados.map((key, i) => {
            const a = analytePorKey.get(key);
            if (!a) return null;
            return (
              <CartaoGrafico
                key={key}
                analyte={a}
                columns={columns}
                ordem={i + 1}
                onRemover={() => alternar(key)}
              />
            );
          })
        )}
      </aside>
    </div>
  );
}
