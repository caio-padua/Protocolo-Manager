import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  MousePointerClick,
  FlaskConical,
  X,
  Square,
  SquareCheck,
  ChevronDown,
  ChevronRight,
  Check,
  FileUp,
  Upload,
  CheckCircle,
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
import { ConsoleExamesTool } from "@/components/ConsoleExamesTool";

// ===========================================================================
// PAINEL: EVOLUCAO DE EXAMES (client-scoped) — motor de 5 FAIXAS do IHE.
//   Backend: GET /api/exames-lab/evolucao/:clientId (agora com direção + zonas
//   por analito e zona por célula) e CRUD /api/exames-lab/faixas?code=...
//
// Requisitos do CEO atendidos aqui:
//   (1) CINCO faixas no número (planilha) e no gráfico, semântica oficial do IHE.
//   (2) Números NÍTIDOS: valor sempre em navy forte; a faixa vira faixinha
//       lateral + tint, nunca tinge o dígito (que ficava apagado).
//   (3) Nome do exame em UP-BEVEL (relevo saliente).
//   (4) Botões das faixas em BEVEL (bevel-3d).
//   (5) Tendência numa BOLINHA no rodapé do gráfico.
//   (6) FIXAR coluna(s) para comparar (alfinete no cabeçalho).
//   (7) TODAS as opções de layout como TOGGLE in-tool: ao lado / topo largura
//       total / sanfona / fixo.
//   (9) BLOCO EDITÁVEL no final (direção + 5 faixas por exame).
// ===========================================================================

const NAVY = "#16294a";
const MUTED = "#647c97";
const GOLD = "#b8924d";
// Pedido do CEO (24/07/2026): coluna congelada SEM "painel" cinza atrás.
const NOME_BG = "#fbfaf4";
// O fundo continua existindo (senão as colunas rolando vazam por baixo),
// mas na MESMA cor creme do painel — invisível a olho nu.
const PIN_BG = "#fbfaf4";

// Larguras FIXAS: o cálculo do "grudar" das colunas fixadas depende disso.
const NAME_W = 200; // coluna do nome (congelada à esquerda)
const COL_W = 62; // largura de cada coluna de data
const GAP = 8; // gap-2 entre células

const ZONE_ROTULO: Record<string, string> = {
  ALERTA: "ALERTA",
  ATENCAO: "ATENÇÃO",
  INSUFICIENTE: "INSUFICIENTE",
  ACEITAVEL: "ACEITÁVEL",
  EXCELENTE: "EXCELENTE",
};
// ---- tipos do payload ----
interface ZonePayload {
  key: "below" | "t1" | "t2" | "t3" | "above";
  name: string;
  color: string;
  low: number | null;
  high: number | null;
}
interface CellZone {
  key: string;
  name: string;
  color: string;
}
interface EvolucaoCell {
  value: string | null;
  valueNum: number | null;
  unit: string | null;
  status: string | null;
  documentId: number;
  zone: CellZone | null;
  unitConverted?: boolean;
}
interface EvolucaoColumn {
  key: string;
  date: string | null;
  lab: string | null;
  confLevel: "ia" | "c1" | "c2" | null;
  conferenteName: string | null;
  conferenteCargo: string | null;
  /** true quando TODOS os resultados desta coluna vieram do histórico interno de outro laudo */
  isHistory?: boolean;
}
interface EvolucaoAnalyte {
  key: string;
  name: string;
  unit: string | null;
  refLow: string | null;
  refHigh: string | null;
  direction: "higher_better" | "lower_better" | "target";
  zones: ZonePayload[] | null;
  trend: "subiu" | "caiu" | "estavel" | null;
  cells: Record<string, EvolucaoCell>;
}
interface EvolucaoData {
  columns: EvolucaoColumn[];
  analytes: EvolucaoAnalyte[];
}

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
function dataCurta(iso: string | null): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : iso;
}
// Pedido do CEO (24/07/2026): laboratórios escrevem "inferior a 7" / "superior a 34"
// e o texto longo deforma a célula. Exibimos com símbolo: "< 7" e "> 34".
function exibirValor(v: string): string {
  return v
    .replace(/inferior\s+a\s*/gi, "< ")
    .replace(/superior\s+a\s*/gi, "> ")
    .replace(/menor\s+que\s*/gi, "< ")
    .replace(/maior\s+que\s*/gi, "> ");
}
function toNum(s: string | null): number | null {
  if (s == null) return null;
  const n = Number(String(s).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const TEND = {
  subiu: { rotulo: "SUBIU", cor: "text-red-700", hex: "#b4413c", led: "paxter-led-red", Icon: TrendingUp },
  caiu: { rotulo: "CAIU", cor: "text-emerald-700", hex: "#3f7a3f", led: "paxter-led-green", Icon: TrendingDown },
  estavel: { rotulo: "ESTÁVEL", cor: "text-amber-700", hex: "#c17a2b", led: "paxter-led-amber", Icon: Minus },
} as const;

// SINALIZAR FAIXA: 5 posições fixas do MENOR valor ao MAIOR (espelha ZoneKey do
// backend: below→t1→t2→t3→above). O filtro é por POSIÇÃO, nunca por nome — assim
// os nomes custom de cada exame não poluem a planilha (eles vivem só no gráfico
// individual). A célula acesa brilha na cor da própria faixa daquele exame.
const FAIXAS_POSICAO = [
  { key: "below", label: "1/5 Extremo Baixo" },
  { key: "t1", label: "2/5 Baixo" },
  { key: "t2", label: "3/5 Médio" },
  { key: "t3", label: "4/5 Alto" },
  { key: "above", label: "5/5 Extremo Alto" },
] as const;

// ------------------------------------------------------------------ célula ---
function Cela({
  cell,
  atual,
  acesa,
  sticky,
  left,
  mostrarFaixas,
}: {
  cell: EvolucaoCell | undefined;
  atual: boolean;
  acesa: boolean;
  sticky: boolean;
  left: number;
  mostrarFaixas: boolean;
}) {
  // A máscara do vão (gap) fecha o corredor de 8px à direita da CORTINA
  // fixada, para a esteira não aparecer entre colunas fixadas.
  const mascaraVao = sticky ? `${GAP}px 0 0 0 ${PIN_BG}` : null;
  // CORTINA fixada: a linha é mais ALTA que a caixinha da célula (o painel do
  // nome tem ~56px). Sem uma cortina de altura TOTAL (self-stretch), a esteira
  // que rola por baixo aparecia nas faixas acima/abaixo da caixinha. A cortina
  // é sticky, opaca, z:20 e com camada GPU própria; a caixinha visual fica
  // DENTRO dela, centralizada, sem sticky próprio.
  const cortina = (miolo: React.ReactNode) => (
    <div
      className="flex shrink-0 items-center self-stretch"
      style={{
        width: COL_W,
        position: "sticky",
        left,
        zIndex: 20,
        background: PIN_BG,
        willChange: "transform",
        ...(mascaraVao ? { boxShadow: mascaraVao } : {}),
      }}
    >
      {miolo}
    </div>
  );
  if (!cell || cell.value == null) {
    const vazio = (
      <div
        className="flex w-full shrink-0 items-center justify-center py-1.5 text-[12px] text-[#b3bccb]"
        style={{ width: COL_W }}
      >
        —
      </div>
    );
    return sticky ? cortina(vazio) : vazio;
  }
  const cor = cell.zone?.color ?? MUTED;
  // A faixinha (tarja + tint) só aparece quando o toggle "Faixinha de cor" está
  // ligado. Desligado, fica só o número navy nítido, sem cor de faixa.
  const temZona = !!cell.zone && mostrarFaixas;
  const caixinha = (
    <div
      className={`relative shrink-0 overflow-hidden rounded-[4px] py-1.5 text-center ${
        atual ? "screen-3d" : "concave-3d"
      }`}
      style={{
        width: COL_W,
        transition: "box-shadow .15s",
        // brilho da faixa acesa (na cortina fixada, o brilho fica contido
        // porque a cortina vizinha também é opaca e está na mesma camada):
        boxShadow: acesa ? `0 0 0 2px ${cor}, 0 0 12px 3px ${cor}` : undefined,
        ...(temZona && !sticky ? { background: `${cor}14` } : {}),
        ...(sticky ? { background: PIN_BG } : {}),
      }}
      title={`${exibirValor(cell.value)} ${cell.unit ?? ""} · ${cell.zone ? ZONE_ROTULO[cell.zone.name] ?? cell.zone.name : "conferência"}${
        cell.unitConverted ? " · unidade revisada (convertida para a padrão)" : ""
      }`}
    >
      {/* faixinha de cor à esquerda: a FAIXA vive aqui, não no dígito */}
      {temZona && <span className="absolute left-0 top-0 h-full w-[5px]" style={{ background: cor }} />}
      {/* número SEMPRE navy forte e nítido */}
      <span
        className={`whitespace-nowrap ${atual ? "text-[13px] font-black" : "text-[12px] font-bold"}`}
        style={{ color: NAVY, paddingLeft: temZona ? 6 : 0 }}
      >
        {exibirValor(cell.value)}
      </span>
      {/* selo "revisado": unidade diferente foi convertida para a padrão na varredura */}
      {cell.unitConverted && (
        <span
          aria-label="unidade revisada (convertida para a padrão)"
          className="absolute right-[3px] top-[2px] inline-flex items-center justify-center"
          style={{ color: GOLD }}
        >
          <Check className="h-2.5 w-2.5" strokeWidth={3} />
        </span>
      )}
    </div>
  );
  return sticky ? cortina(caixinha) : caixinha;
}

// ─── paleta pastel por laboratório ─────────────────────────────────────────
function labPastel(lab: string): { bg: string; color: string; border: string } {
  const k = lab.toLowerCase();
  if (k.includes("fleury"))   return { bg: "#dbeafe", color: "#1e3a8a", border: "#93c5fd" };
  if (k.includes("delboni"))  return { bg: "#dcfce7", color: "#14532d", border: "#86efac" };
  if (k.includes("pardini") || k.includes("hermes"))
                               return { bg: "#ede9fe", color: "#4c1d95", border: "#c4b5fd" };
  if (k.includes("synlab"))   return { bg: "#ffedd5", color: "#7c2d12", border: "#fdba74" };
  if (k.includes("lavoisier"))return { bg: "#ccfbf1", color: "#134e4a", border: "#5eead4" };
  if (k.includes("einstein")) return { bg: "#fce7f3", color: "#831843", border: "#f9a8d4" };
  if (k.includes("alta"))     return { bg: "#fef9c3", color: "#713f12", border: "#fde047" };
  return                             { bg: "#f1f5f9", color: "#334155", border: "#94a3b8" };
}

// ─── config visual do status de conferência ────────────────────────────────
const STATUS_CFG = {
  Conferido:  { bg: "#dcfce7", color: "#166534", border: "#86efac", dot: "#22c55e" },
  Lançado:    { bg: "#dbeafe", color: "#1e40af", border: "#93c5fd", dot: "#3b82f6" },
  Aguardando: { bg: "#f1f5f9", color: "#64748b", border: "#cbd5e1", dot: "#94a3b8" },
} as const;

// ---------------------------------------------------------- cabeçalho coluna --
function ColunaCabecalho({
  c,
  ultima,
  fixada,
  onFixar,
  sticky,
  left,
}: {
  c: EvolucaoColumn;
  ultima: boolean;
  fixada: boolean;
  onFixar: () => void;
  sticky: boolean;
  left: number;
}) {
  const stickyStyle = sticky
    ? {
        position: "sticky" as const,
        left,
        zIndex: 3,
        background: PIN_BG,
        boxShadow: `${GAP}px 0 0 0 ${PIN_BG}`,
      }
    : {};
  return (
    <div
      className="flex shrink-0 flex-col items-center px-0.5 text-center"
      style={{ width: COL_W, ...stickyStyle }}
    >
      {/* QUADRADINHO fixa a coluna (pedido do CEO 24/07/2026: era alfinete) */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onFixar();
        }}
        title={fixada ? "Soltar coluna" : "Fixar coluna para comparar"}
        className="mb-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px]"
        style={fixada ? { color: GOLD } : { color: "#9aa6b6" }}
      >
        {fixada ? <SquareCheck className="h-3 w-3" /> : <Square className="h-3 w-3" />}
      </button>
      {/* Dia/mês e ano na MESMA fonte e mesmo design; alturas fixas garantem a
          linha horizontal imaginária igual em todas as colunas. */}
      <span
        className={`flex h-[14px] items-center text-[12px] font-black leading-none ${ultima ? "text-[#16294a]" : "text-[#3a4a63]"}`}
      >
        {diaMes(c.date)}
      </span>
      <span
        className={`flex h-[14px] items-center text-[12px] font-black leading-none ${ultima ? "text-[#16294a]" : "text-[#3a4a63]"}`}
      >
        {ano(c.date)}
      </span>
      {/* Pedido do CEO (24/07/2026): posição NUNCA muda com presença/ausência de
          informação. Cada linha abaixo tem ALTURA FIXA e sempre mostra TEXTO
          (nada de símbolo, nada de traço mínimo). */}
      {/* Pedido do CEO (24/07/2026): nome do laboratório SEMPRE na mesma cor
          (Fleury, Delboni, qualquer um = ouro, sem variar). Quando NÃO
          identificado: mesmo layoutzinho, outra cor, COM moldura em volta,
          e o texto é "Indefinido". */}
      {/* LAB — badge pastel largura FIXA (w-full = mesma largura da coluna);
          todos os labs ficam alinhados verticalmente independente do nome. */}
      <span className="mt-1 flex h-[14px] w-full items-center">
        {c.lab ? (
          <span
            className="w-full truncate rounded-[3px] px-1 py-0.5 text-center text-[8px] font-black leading-none"
            style={{ background: labPastel(c.lab).bg, color: labPastel(c.lab).color, border: `1px solid ${labPastel(c.lab).border}` }}
            title={c.lab}
          >
            {c.lab}
          </span>
        ) : (
          <span
            className="w-full truncate rounded-[3px] px-1 py-0.5 text-center text-[8px] font-black leading-none"
            style={{ background: "#f1f5f9", color: "#8a97a9", border: "1px solid #c3ccd8" }}
            title="Laboratório não identificado no laudo"
          >
            Indefinido
          </span>
        )}
      </span>

      {/* DO LAUDO / HISTÓRICO — mesma moldura, intensidades diferentes */}
      <span className="mt-0.5 flex h-[13px] items-center">
        {c.isHistory ? (
          <span
            className="inline-block rounded-[3px] px-1 py-0.5 text-[7px] font-black uppercase tracking-widest leading-none"
            style={{ background: "#fefce8", color: "#a16207", border: "1px solid #fde68a" }}
          >
            Histórico
          </span>
        ) : (
          <span
            className="inline-block rounded-[3px] px-1 py-0.5 text-[7px] font-black uppercase tracking-widest leading-none"
            style={{ background: "#fef3c7", color: "#78350f", border: "1px solid #f59e0b" }}
          >
            Do laudo
          </span>
        )}
      </span>

      <span className="mt-0.5 flex h-[11px] items-center text-[8px] font-medium leading-none text-[#8a97a9]">
        {c.conferenteName ? (c.confLevel === "c2" ? "Conferido" : "Lançado") : "Aguardando"}
      </span>
    </div>
  );
}

// ----------------------------------------------------- cartão de gráfico ------
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
  const data = useMemo(
    () =>
      columns
        .map((c) => {
          const cell = analyte.cells[c.key];
          return cell && cell.valueNum != null
            ? {
                data: dataCurta(c.date),
                valor: cell.valueNum,
                cor: cell.zone?.color ?? MUTED,
                zona: cell.zone?.name ?? null,
              }
            : null;
        })
        .filter((d): d is { data: string; valor: number; cor: string; zona: string | null } => d != null),
    [analyte, columns],
  );

  const zones = analyte.zones;
  const ultimo = data.length > 0 ? data[data.length - 1] : null;
  const tend = analyte.trend ? TEND[analyte.trend] : TEND.estavel;

  // Domínio do eixo Y: engloba valores + limites finitos das zonas.
  const dominio = useMemo(() => {
    const vals: number[] = data.map((d) => d.valor);
    if (zones) {
      for (const z of zones) {
        if (z.low != null) vals.push(z.low);
        if (z.high != null) vals.push(z.high);
      }
    }
    if (!vals.length) return { min: 0, max: 1 };
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const folga = (max - min) * 0.08;
    return { min: min - folga, max: max + folga };
  }, [data, zones]);

  // Estatísticas do período (pedido do CEO 24/07/2026 — igual ao mockup):
  // Mínimo, Máximo, Média, Variação % e Última Coleta.
  const stats = useMemo(() => {
    if (!data.length) return null;
    let min = data[0];
    let max = data[0];
    let soma = 0;
    for (const d of data) {
      if (d.valor < min.valor) min = d;
      if (d.valor > max.valor) max = d;
      soma += d.valor;
    }
    const primeiro = data[0];
    const ultimoP = data[data.length - 1];
    const penultimo = data.length > 1 ? data[data.length - 2] : null;
    const variacao =
      primeiro.valor !== 0 ? ((ultimoP.valor - primeiro.valor) / Math.abs(primeiro.valor)) * 100 : null;
    const media = soma / data.length;
    const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ","));
    // Delta contra a coleta ANTERIOR (substitui "Última Coleta" — pedido do
    // CEO 25/07/2026: informação clinicamente mais útil).
    const deltaAnterior = penultimo ? ultimoP.valor - penultimo.valor : null;
    return {
      min,
      max,
      media: fmt(media),
      variacao: variacao == null ? null : `${variacao >= 0 ? "+" : "−"}${Math.abs(variacao).toFixed(0)}%`,
      variacaoPositiva: variacao != null && variacao >= 0,
      desde: primeiro.data,
      deltaAnterior:
        deltaAnterior == null ? null : `${deltaAnterior >= 0 ? "+" : "−"}${fmt(Math.abs(deltaAnterior))}`,
      fmt,
    };
  }, [data]);

  // Rolagem interna: cada ponto ganha no MÍNIMO 64 pixels de largura — as
  // datas nunca se espremem; se não couber, rola da esquerda para a direita.
  const LARGURA_POR_PONTO = 64;
  const larguraMinimaGrafico = Math.max(data.length * LARGURA_POR_PONTO, 320);

  // Ponto sob o mouse (pedido do CEO 24/07/2026): NADA de janelinha em cima
  // do gráfico — o valor aparece na barra inferior, mudando conforme o mouse
  // passeia pela linha. Sem mouse = última coleta.
  const [ponteiro, setPonteiro] = useState<(typeof data)[number] | null>(null);
  const pontoAtivo = ponteiro ?? ultimo;
  const corAtiva = pontoAtivo?.cor ?? MUTED;
  const rotuloAtivo = pontoAtivo?.zona ? ZONE_ROTULO[pontoAtivo.zona] ?? pontoAtivo.zona : "—";

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
              {analyte.unit && <span className="text-[10px] text-[#647c97]">{analyte.unit}</span>}
              {analyte.refLow && analyte.refHigh && (
                <span className="text-[10px] text-[#647c97]">
                  ref {analyte.refLow}–{analyte.refHigh}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-start gap-2">
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
        <div className="screen-tv-3d p-2">
          {/* Tela do grafico em INSET BEVEL puro (pedido do CEO 25/07/2026:
              sem vidro, sem efeitos por cima). */}
          {/* Rolagem INTERNA esquerda→direita: as datas nunca se espremem */}
          <div className="scroll-gold overflow-x-auto pb-1">
            <div style={{ minWidth: larguraMinimaGrafico, width: "100%", height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data}
                margin={{ top: 12, right: 16, left: 0, bottom: 4 }}
                onMouseMove={(st) => {
                  const i = st?.activeTooltipIndex;
                  setPonteiro(typeof i === "number" && data[i] ? data[i] : null);
                }}
                onMouseLeave={() => setPonteiro(null)}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(22,41,74,0.10)" />
                {/* CINCO faixas oficiais do IHE como fundo do gráfico */}
                {zones?.map((z) => (
                  <ReferenceArea
                    key={z.key}
                    y1={z.low ?? dominio.min}
                    y2={z.high ?? dominio.max}
                    fill={z.color}
                    fillOpacity={0.16}
                    stroke={z.color}
                    strokeOpacity={0.22}
                  />
                ))}
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
                  domain={[dominio.min, dominio.max]}
                />
                {/* SEM janelinha em cima do gráfico (pedido do CEO): o Tooltip
                    fica invisível — serve só para acender o ponto ativo e
                    alimentar a barra inferior. Cursor = linha-guia dourada. */}
                <Tooltip
                  content={() => null}
                  cursor={{ stroke: "rgba(184,146,77,0.55)", strokeDasharray: "4 3" }}
                />
                <Line
                  type="linear"
                  dataKey="valor"
                  stroke={NAVY}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={(props: { cx?: number; cy?: number }) => {
                    const { cx, cy } = props;
                    if (cx == null || cy == null) return <g />;
                    // QUADRADINHO dourado — só aparece sob o mouse.
                    return (
                      <rect
                        x={cx - 5}
                        y={cy - 5}
                        width={10}
                        height={10}
                        rx={2}
                        fill={GOLD}
                        stroke="#fff"
                        strokeWidth={2}
                      />
                    );
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ESTATÍSTICAS do período (igual ao mockup validado pelo CEO):
          Mínimo, Máximo, Média, Variação e Última Coleta em mini-telas. */}
      {stats && (
        <div className="mt-2 grid grid-cols-5 gap-1.5">
          <div className="screen-3d flex flex-col items-center px-1 py-1.5">
            <span className="text-[7px] font-bold uppercase tracking-wide text-[#8a97a9]">Mínimo</span>
            <span className="text-[12px] font-black leading-tight text-[#16294a]">{stats.fmt(stats.min.valor)}</span>
            <span className="max-w-full truncate text-[7px] font-semibold text-[#647c97]">{stats.min.data === "—" ? "sem data" : stats.min.data}</span>
          </div>
          <div className="screen-3d flex flex-col items-center px-1 py-1.5">
            <span className="text-[7px] font-bold uppercase tracking-wide text-[#8a97a9]">Máximo</span>
            <span className="text-[12px] font-black leading-tight text-[#16294a]">{stats.fmt(stats.max.valor)}</span>
            <span className="max-w-full truncate text-[7px] font-semibold text-[#647c97]">{stats.max.data === "—" ? "sem data" : stats.max.data}</span>
          </div>
          <div className="screen-3d flex flex-col items-center px-1 py-1.5">
            <span className="text-[7px] font-bold uppercase tracking-wide text-[#8a97a9]">Média</span>
            <span className="text-[12px] font-black leading-tight text-[#16294a]">{stats.media}</span>
            <span className="max-w-full truncate text-[7px] font-semibold text-[#647c97]">período todo</span>
          </div>
          <div className="screen-3d flex flex-col items-center px-1 py-1.5">
            <span className="text-[7px] font-bold uppercase tracking-wide text-[#8a97a9]">Variação</span>
            <span className="text-[12px] font-black leading-tight text-[#16294a]">{stats.variacao ?? "—"}</span>
            <span className="max-w-full truncate text-[7px] font-semibold text-[#647c97]">desde {stats.desde}</span>
          </div>
          <div className="screen-3d flex flex-col items-center px-1 py-1.5">
            <span className="text-[7px] font-bold uppercase tracking-wide text-[#8a97a9]">Meta</span>
            <span className="max-w-full truncate text-[12px] font-black leading-tight text-[#16294a]">{stats.deltaAnterior ?? "—"}</span>
            <span className="max-w-full truncate text-[7px] font-semibold text-[#647c97]">{data.length} coletas</span>
          </div>
        </div>
      )}

      {/* RODAPÉ VIVO — 2 grupos que se espremem lado a lado.
          Grupo esquerdo: VALOR + DATA (encolhem juntos).
          Grupo direito: SITUAÇÃO + TENDÊNCIA com flex-wrap-reverse interno —
          TENDÊNCIA é o último item, então É ELA que sobe (não SITUAÇÃO) quando
          o grupo direito apertar. SITUAÇÃO nunca sai do lugar. */}
      <div className="mt-2 flex items-stretch justify-between gap-1.5">

        {/* GRUPO ESQUERDO — VALOR + DATA em LARGURA FIXA equilibrada.
            VALOR: 82px (valor + unidade, até ~6 chars numéricos).
            DATA: 62px (datas no formato DD/MM/AA cabem bem).
            shrink-0 no wrapper → os boxes nunca oscilam ao mudar de ponto. */}
        <div className="flex shrink-0 items-stretch gap-1.5">
          {/* VALOR — 82px fixos */}
          <div className="concave-3d flex w-[82px] flex-col items-center justify-center py-1.5">
            <span className="text-[7px] font-bold uppercase tracking-wide text-[#8a97a9]">
              {ponteiro ? "no ponto" : "última"}
            </span>
            <span className="flex items-baseline gap-0.5 tabular-nums">
              <span className="text-[15px] font-black leading-tight text-[#16294a]">
                {pontoAtivo?.valor ?? "—"}
              </span>
              {analyte.unit && (
                <span className="text-[9px] font-semibold text-[#16294a]">{analyte.unit}</span>
              )}
            </span>
          </div>
          {/* DATA — 70px fixos; datas "DD/MM/AA" cabem com um pouco de ar */}
          <div className="concave-3d flex w-[70px] flex-col items-center justify-center py-1.5">
            <span className="text-[7px] font-bold uppercase tracking-wide text-[#8a97a9]">data</span>
            <span className="text-[11px] font-bold leading-tight text-[#16294a]">
              {pontoAtivo?.data || "—"}
            </span>
          </div>
        </div>

        {/* GRUPO DIREITO — SITUAÇÃO + TENDÊNCIA, mesma largura (alinhamento
            vertical perfeito ao empilhar). SEM shrink-0 no wrapper: quando
            o cartão estreitar, o flex externo comprime este grupo; quando
            ele fica menor que 2×66+gap, flex-wrap-reverse dispara e
            TENDÊNCIA sobe ACIMA de SITUAÇÃO pela linha imaginária comum. */}
        <div className="flex min-w-0 flex-wrap-reverse items-stretch justify-end gap-1.5">
          {/* TENDÊNCIA — sem cor: borda neutra, texto preto, só 1ª letra
              maiúscula. Cores ficam reservadas para SITUAÇÃO. */}
          <div
            className="bevel-3d flex w-[66px] shrink-0 flex-col items-center justify-center rounded-[5px] py-1.5"
            style={{ border: `2px solid #b0bec5` }}
          >
            <span className="text-[7px] font-bold uppercase tracking-wide text-[#8a97a9]">tendência</span>
            <span className="text-[11px] font-black capitalize leading-tight text-[#16294a]">
              {tend.rotulo}
            </span>
          </div>
          {/* SITUAÇÃO — MAIS LARGA (80px), ÚLTIMA da direita, TODA EM
              MAIÚSCULAS, cor cheia (borda + texto). A mais importante. */}
          <div
            className="bevel-3d flex w-[80px] shrink-0 flex-col items-center justify-center rounded-[5px] py-1.5"
            style={{ border: `2px solid ${corAtiva}` }}
          >
            <span className="text-[7px] font-bold uppercase tracking-wide text-[#8a97a9]">situação</span>
            <span className="text-[11px] font-bold uppercase leading-tight" style={{ color: corAtiva }}>
              {rotuloAtivo}
            </span>
          </div>
        </div>

      </div>
    </section>
  );
}

// -------------------------------------------------- interruptor (toggle) ------
function Toggle({ ligado, onToggle, texto }: { ligado: boolean; onToggle: () => void; texto: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={ligado}
      className="flex items-center gap-2 rounded-[5px] px-1 text-[11px] font-bold uppercase tracking-wide text-[#16294a]"
    >
      {/* Interruptor RETANGULAR (padrão da skill de layout; era redondo) */}
      <span
        className="relative inline-flex h-[20px] w-[38px] items-center rounded-[4px] transition-colors"
        style={{ background: ligado ? GOLD : "#c9cdd6", boxShadow: "inset 0 1px 3px rgba(0,0,0,0.35)" }}
      >
        <span
          className="absolute h-[14px] w-[14px] rounded-[3px] bg-white transition-all"
          style={{ left: ligado ? 20 : 3, boxShadow: "0 1px 2px rgba(0,0,0,0.4)" }}
        />
      </span>
      {texto}
    </button>
  );
}

// --------------------------------------------------- bloco editável (F5) ------
type LayoutMode = "lado" | "topo" | "sanfona" | "fixo" | "linha";
const LAYOUTS: { id: LayoutMode; label: string }[] = [
  { id: "lado", label: "Ao lado" },
  { id: "topo", label: "Topo largura total" },
  { id: "sanfona", label: "Sanfona" },
  { id: "fixo", label: "Fixo (rodapé)" },
  { id: "linha", label: "Abaixo da linha" },
];

// ============================================================== PAINEL ========
export default function EvolucaoExamesPanel({ clientId }: { clientId: number }) {
  const [data, setData] = useState<EvolucaoData | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [mostrarFaixas, setMostrarFaixas] = useState(true);
  // ── Upload admin de PDF ──────────────────────────────────────────────────
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; txt: string } | null>(null);
  const [zonaAcesa, setZonaAcesa] = useState<string | null>(null);
  const [fixadas, setFixadas] = useState<string[]>([]);
  const [layout, setLayout] = useState<LayoutMode>("lado");
  const [colapsados, setColapsados] = useState<string[]>([]);
  const [mostrarDirecoes, setMostrarDirecoes] = useState(false);

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

  const handleAdminUpload = useCallback(async () => {
    if (!uploadFile || uploading) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", uploadFile);
      fd.append("clientId", String(clientId));
      const r = await fetch(`${BASE}/api/exames-lab/ingest`, { method: "POST", body: fd });
      const json = await r.json();
      if (r.ok) {
        setUploadMsg({ ok: true, txt: json.duplicate ? "Exame já existia (duplicata detectada)." : "Exame recebido! O motor Gemini vai processar em ~60-90 segundos." });
        setUploadFile(null);
        setTimeout(() => carregar(clientId), 5000);
      } else {
        setUploadMsg({ ok: false, txt: json.error ?? "Erro ao enviar exame." });
      }
    } catch {
      setUploadMsg({ ok: false, txt: "Falha de conexão ao enviar o arquivo." });
    } finally {
      setUploading(false);
    }
  }, [uploadFile, uploading, clientId, carregar]);

  useEffect(() => {
    setSelecionados([]);
    setFixadas([]);
    carregar(clientId);
  }, [clientId, carregar]);

  const analytes = data?.analytes ?? [];
  const columnsRaw = data?.columns ?? [];
  const ultimaColKey = columnsRaw.length > 0 ? columnsRaw[columnsRaw.length - 1].key : null;

  // Colunas fixadas vão primeiro (grudadas); as demais rolam.
  const orderedColumns = useMemo(() => {
    const pin = fixadas.filter((k) => columnsRaw.some((c) => c.key === k));
    const pinCols = pin.map((k) => columnsRaw.find((c) => c.key === k)!);
    const rest = columnsRaw.filter((c) => !fixadas.includes(c.key));
    return { pinCols, list: [...pinCols, ...rest] };
  }, [columnsRaw, fixadas]);

  // Offset de "grudar" de cada coluna fixada: depois do nome (200) + gap.
  const stickyLeft = (displayIndex: number) => NAME_W + GAP + displayIndex * (COL_W + GAP);

  const alternar = (key: string) =>
    setSelecionados((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  const fixar = (key: string) =>
    setFixadas((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  const colapsar = (key: string) =>
    setColapsados((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

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
  // ── Widget de upload admin (reutilizado no estado vazio e no topo do painel) ──
  const uploadWidget = (
    <div className="bevel-3d flex flex-col gap-3 rounded-md p-4">
      <div className="flex items-center gap-2">
        <FileUp className="h-4 w-4 text-[#45B8CC]" />
        <span className="text-xs font-bold uppercase tracking-wide text-[#16294a]">Enviar PDF de Exame</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="btn-3d-soft cursor-pointer rounded px-3 py-1.5 text-xs font-semibold text-[#16294a]">
          {uploadFile ? uploadFile.name.slice(0, 40) : "Selecionar PDF…"}
          <input
            type="file"
            accept="application/pdf"
            className="sr-only"
            onChange={(e) => { setUploadFile(e.target.files?.[0] ?? null); setUploadMsg(null); }}
          />
        </label>
        <button
          type="button"
          onClick={handleAdminUpload}
          disabled={!uploadFile || uploading}
          className="btn-3d rounded px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white disabled:opacity-40"
          style={{ background: "#45B8CC" }}
        >
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Upload className="inline h-3 w-3 mr-1" />Enviar</>}
        </button>
        {uploadFile && !uploading && (
          <button type="button" onClick={() => { setUploadFile(null); setUploadMsg(null); }} className="text-xs text-[#647c97] hover:text-red-500">
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      {uploadMsg && (
        <p className={`flex items-center gap-1.5 text-xs ${uploadMsg.ok ? "text-emerald-700" : "text-red-600"}`}>
          {uploadMsg.ok ? <CheckCircle className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
          {uploadMsg.txt}
        </p>
      )}
    </div>
  );

  if (columnsRaw.length === 0 || analytes.length === 0) {
    return (
      <div className="flex flex-col gap-4 py-4">
        <p className="text-sm text-[#647c97]">Nenhum exame para este cliente ainda.</p>
        {uploadWidget}
      </div>
    );
  }

  // --------- Região de gráficos (reusada em todos os layouts) ---------
  const graficos =
    selecionados.length === 0 ? (
      <div className="concave-3d flex flex-col items-center gap-2 px-4 py-10 text-center">
        <MousePointerClick className="h-6 w-6 text-[#647c97]" />
        <span className="text-[12px] text-[#647c97]">
          Clique num exame na planilha para abrir o gráfico aqui. Você pode empilhar vários.
        </span>
      </div>
    ) : layout === "sanfona" ? (
      // SANFONA: cada gráfico numa aba que abre/fecha, largura total.
      <div className="space-y-2">
        {selecionados.map((key, i) => {
          const a = analytePorKey.get(key);
          if (!a) return null;
          const aberto = !colapsados.includes(key);
          return (
            <div key={key} className="panel-3d-sub">
              <button
                type="button"
                onClick={() => colapsar(key)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left"
              >
                {aberto ? <ChevronDown className="h-4 w-4 text-[#647c97]" /> : <ChevronRight className="h-4 w-4 text-[#647c97]" />}
                <span className="text-[13px] font-bold text-[#16294a]">{a.name}</span>
                <span className="ml-auto text-[10px] font-semibold uppercase text-[#647c97]">
                  {aberto ? "fechar" : "abrir"}
                </span>
              </button>
              {aberto && (
                <div className="px-2 pb-2">
                  <CartaoGrafico analyte={a} columns={columnsRaw} ordem={i + 1} onRemover={() => alternar(key)} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    ) : (
      // TOPO / FIXO usam grade; LADO empilha em coluna (via wrapper).
      <div
        className={
          layout === "lado"
            ? "flex flex-col gap-3"
            : "grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
        }
      >
        {selecionados.map((key, i) => {
          const a = analytePorKey.get(key);
          if (!a) return null;
          return (
            <CartaoGrafico key={key} analyte={a} columns={columnsRaw} ordem={i + 1} onRemover={() => alternar(key)} />
          );
        })}
      </div>
    );

  const cabecalhoGraficos = (
    <div className="mb-2 flex items-center justify-between">
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
  );

  // ----------------------------- planilha -----------------------------
  const planilha = (
    <section className="panel-3d min-w-0 p-4">
      <div className="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-[#16294a]">
        <FlaskConical className="h-4 w-4" style={{ color: "#9a7b32" }} /> Exames — Evolução
      </div>

      {/* CONTROLES — rodada 8 final (pedido do CEO 25/07/2026): cada categoria
          é um PAINEL com título na linha de cima e botões embaixo, na horizontal.
          Os três painéis ficam EMPILHADOS verticalmente (um abaixo do outro). */}
      <div className="mb-3 flex flex-col gap-2 border-b border-[#16294a]/10 pb-3">

        {/* PAINEL 1 — FAIXAS DE EXAMES */}
        <div className="concave-3d rounded-[6px] px-3 py-2">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#16294a]">
            Faixas de Exames
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setZonaAcesa(null)}
              className={`h-[28px] min-w-[72px] rounded-[5px] px-2 text-[10px] font-bold uppercase tracking-wide ${zonaAcesa === null ? "btn-3d" : "btn-3d-soft"}`}
              style={zonaAcesa === null ? { background: NAVY, color: "#fff" } : { color: NAVY }}
            >
              Todas
            </button>
            {FAIXAS_POSICAO.map((f) => {
              const ativo = zonaAcesa === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setZonaAcesa(ativo ? null : f.key)}
                  className={`h-[28px] min-w-[112px] rounded-[5px] px-2 text-[10px] font-bold uppercase tracking-wide ${ativo ? "btn-3d" : "btn-3d-soft"}`}
                  style={ativo ? { background: NAVY, color: "#fff" } : { color: NAVY }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* PAINEL 2 — GRÁFICOS */}
        <div className="concave-3d rounded-[6px] px-3 py-2">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#16294a]">
            Gráficos
          </div>
          <div className="flex flex-wrap gap-1.5">
            {LAYOUTS.map((l) => {
              const ativo = layout === l.id;
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLayout(l.id)}
                  className={`h-[28px] min-w-[112px] rounded-[5px] px-2 text-[10px] font-bold uppercase tracking-wide ${ativo ? "btn-3d" : "btn-3d-soft"}`}
                  style={ativo ? { background: NAVY, color: "#fff" } : { color: NAVY }}
                >
                  {l.label}
                </button>
              );
            })}
          </div>
        </div>


      </div>

      {/* INSTRUÇÕES em relevo CÔNCAVO (inset bevel — pedido do CEO 24/07/2026) */}
      <div className="concave-3d mb-3 flex flex-wrap items-center gap-4 rounded-[6px] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-[#647c97]">
        <span className="flex items-center gap-1">
          <MousePointerClick className="h-3.5 w-3.5" /> Clique no exame para abrir o gráfico
        </span>
        <span className="flex items-center gap-1">
          <Square className="h-3.5 w-3.5" /> Quadradinho no cabeçalho fixa a coluna
        </span>
      </div>

      {/* planilha com rolagem lateral; nome + colunas fixadas grudam à esquerda */}
      <div className="overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
        <div className="min-w-max">
          {/* cabeçalho — z-[30] + relative: garante que o header row pinta
              acima de TODAS as linhas de dados (panel-3d-sub com GPU layer
              que vem depois no DOM). */}
          <div className="relative z-[30] flex items-start gap-2 pb-2">
            {/* Painel bevel-3d do toggle — sticky, z-[25] pinta acima das
                células de dados (z:20) e dos cabeçalhos de coluna (z:3). */}
            <div
              className="sticky left-0 z-[25] flex shrink-0 items-end self-stretch px-2 py-1"
              style={{ width: NAME_W, background: NOME_BG, boxShadow: `${GAP}px 0 0 0 ${NOME_BG}` }}
            >
              <div className="bevel-3d flex w-full items-center rounded-[6px] px-2 py-1.5">
                <Toggle
                  ligado={mostrarFaixas}
                  onToggle={() => setMostrarFaixas((v) => !v)}
                  texto="Faixinha de cor"
                />
              </div>
            </div>
            {orderedColumns.list.map((c, idx) => {
              const isPinned = idx < orderedColumns.pinCols.length;
              return (
                <ColunaCabecalho
                  key={c.key}
                  c={c}
                  ultima={c.key === ultimaColKey}
                  fixada={fixadas.includes(c.key)}
                  onFixar={() => fixar(c.key)}
                  sticky={isPinned}
                  left={isPinned ? stickyLeft(idx) : 0}
                />
              );
            })}
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
                <div key={a.key}>
                <div
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
                  {/* nome congelado em UP-BEVEL (requisito 3) */}
                  <div
                    className="sticky left-0 z-[30] flex shrink-0 flex-col justify-center self-stretch"
                    style={{ width: NAME_W, background: NOME_BG, boxShadow: `${GAP}px 0 0 0 ${NOME_BG}`, willChange: "transform" }}
                  >
                    <div className="bevel-3d mx-1 flex flex-col justify-center rounded-[6px] px-2 py-1">
                      <div className="flex items-center gap-1.5">
                        {selecionada && (
                          <span
                            className="inline-block h-2 w-2 shrink-0 rounded-full"
                            style={{ background: GOLD, boxShadow: `0 0 6px 1px ${GOLD}` }}
                          />
                        )}
                        <span className="text-[12px] font-bold leading-tight text-[#16294a]">{a.name}</span>
                      </div>
                      <div className="text-[9px] uppercase tracking-wide text-[#647c97]">
                        {[a.unit, a.refLow && a.refHigh ? `ref ${a.refLow}–${a.refHigh}` : null]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </div>
                    </div>
                  </div>
                  {/* valores por data */}
                  {orderedColumns.list.map((c, idx) => {
                    const isPinned = idx < orderedColumns.pinCols.length;
                    const cell = a.cells[c.key];
                    const acesa = zonaAcesa !== null && cell?.zone?.key === zonaAcesa;
                    return (
                      <Cela
                        key={c.key}
                        cell={cell}
                        atual={c.key === ultimaColKey}
                        acesa={acesa}
                        sticky={isPinned}
                        left={isPinned ? stickyLeft(idx) : 0}
                        mostrarFaixas={mostrarFaixas}
                      />
                    );
                  })}
                  {/* tendência */}
                  <div className="bevel-3d flex w-[92px] shrink-0 items-center justify-center gap-1 py-1.5">
                    <span className={`paxter-led ${tend.led} paxter-led-on`} />
                    <tend.Icon className={`h-3.5 w-3.5 ${tend.cor}`} />
                    <span className={`text-[9px] font-bold uppercase tracking-wide ${tend.cor}`}>{tend.rotulo}</span>
                  </div>
                </div>
                {/* LAYOUT "Abaixo da linha": o gráfico abre logo embaixo da linha
                    do exame clicado (pedido do CEO 24/07/2026). O wrapper é
                    sticky à esquerda para o gráfico ficar visível mesmo com a
                    planilha rolada para o lado. */}
                {layout === "linha" && selecionada && (
                  <div className="sticky left-0 py-2" style={{ width: "max(320px, min(760px, calc(100vw - 340px)))" }}>
                    <CartaoGrafico
                      analyte={a}
                      columns={columnsRaw}
                      ordem={selecionados.indexOf(a.key) + 1}
                      onRemover={() => alternar(a.key)}
                    />
                  </div>
                )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <p className="mt-4 text-[11px] italic text-[#647c97]">
        Cinco faixas oficiais do IHE por exame: o número fica sempre nítido em azul; a cor da faixa aparece na
        listinha lateral e no fundo do gráfico. Fixe colunas pelo alfinete para comparar datas distantes; escolha
        onde os gráficos aparecem no seletor "Gráficos". No fim da tela você edita as faixas de cada exame.
      </p>
    </section>
  );

  // ----------------------------- montagem por layout -----------------------------
  return (
    <div>
      <div className="mb-4">{uploadWidget}</div>
      {layout === "topo" && selecionados.length > 0 && (
        <section className="panel-3d mb-5 p-4">
          {cabecalhoGraficos}
          {graficos}
        </section>
      )}

      <div className={layout === "lado" ? "grid grid-cols-1 items-start gap-5 xl:grid-cols-[1fr_380px]" : "block"}>
        {planilha}
        {layout === "lado" && (
          <aside className="flex flex-col gap-3 self-start xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto xl:pr-1">
            {cabecalhoGraficos}
            {graficos}
          </aside>
        )}
      </div>

      {(layout === "sanfona" || layout === "fixo") && (
        <section
          className={
            layout === "fixo"
              ? "panel-3d sticky bottom-2 z-[5] mt-5 p-4 shadow-lg"
              : "panel-3d mt-5 p-4"
          }
          style={layout === "fixo" ? { maxHeight: "46vh", overflowY: "auto" } : undefined}
        >
          {cabecalhoGraficos}
          {graficos}
        </section>
      )}

      {/* ferramenta ÚNICA de faixas (mesma do menu Cadastros): direção + cortes */}
      <div className="mt-5">
        <button
          type="button"
          onClick={() => setMostrarDirecoes((v) => !v)}
          className="btn-3d-soft flex items-center gap-2 rounded-[6px] px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-[#16294a]"
        >
          {mostrarDirecoes ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Cadastro de Faixas de TODOS os exames
        </button>
        {mostrarDirecoes && (
          <div className="mt-3">
            <ConsoleExamesTool titulo="Faixas dos Exames (catálogo completo)" />
          </div>
        )}
      </div>
    </div>
  );
}
