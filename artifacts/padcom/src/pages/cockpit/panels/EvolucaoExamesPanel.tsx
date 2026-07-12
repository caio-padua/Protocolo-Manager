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
  Pin,
  PinOff,
  ChevronDown,
  ChevronRight,
  Check,
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
const NOME_BG = "#e9ecf1";
const PIN_BG = "#eef1f6";

// Larguras FIXAS: o cálculo do "grudar" das colunas fixadas depende disso.
const NAME_W = 200; // coluna do nome (congelada à esquerda)
const COL_W = 62; // largura de cada coluna de data
const GAP = 8; // gap-2 entre células

// Paleta oficial dos rótulos (espelha zones.ts do backend).
const ZONE_COLOR: Record<string, string> = {
  ALERTA: "#b4413c",
  ATENCAO: "#c17a2b",
  INSUFICIENTE: "#d0a53f",
  ACEITAVEL: "#7a9a4a",
  EXCELENTE: "#3f7a3f",
};
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
  const stickyStyle = sticky
    ? { position: "sticky" as const, left, zIndex: 1, background: PIN_BG }
    : {};
  if (!cell || cell.value == null) {
    return (
      <div
        className="flex shrink-0 items-center justify-center py-1.5 text-[12px] text-[#b3bccb]"
        style={{ width: COL_W, ...stickyStyle }}
      >
        —
      </div>
    );
  }
  const cor = cell.zone?.color ?? MUTED;
  // A faixinha (tarja + tint) só aparece quando o toggle "Faixinha de cor" está
  // ligado. Desligado, fica só o número navy nítido, sem cor de faixa.
  const temZona = !!cell.zone && mostrarFaixas;
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-[4px] py-1.5 text-center ${
        atual ? "screen-3d" : "concave-3d"
      }`}
      style={{
        width: COL_W,
        ...(acesa
          ? { boxShadow: `0 0 0 2px ${cor}, 0 0 12px 3px ${cor}`, transition: "box-shadow .15s" }
          : { transition: "box-shadow .15s" }),
        ...stickyStyle,
        ...(sticky ? {} : temZona ? { background: `${cor}14` } : {}),
      }}
      title={`${cell.value} ${cell.unit ?? ""} · ${cell.zone ? ZONE_ROTULO[cell.zone.name] ?? cell.zone.name : "conferência"}${
        cell.unitConverted ? " · unidade revisada (convertida para a padrão)" : ""
      }`}
    >
      {/* faixinha de cor à esquerda: a FAIXA vive aqui, não no dígito */}
      {temZona && <span className="absolute left-0 top-0 h-full w-[5px]" style={{ background: cor }} />}
      {/* número SEMPRE navy forte e nítido */}
      <span
        className={atual ? "text-[13px] font-black" : "text-[12px] font-bold"}
        style={{ color: NAVY, paddingLeft: temZona ? 6 : 0 }}
      >
        {cell.value}
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
}

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
    ? { position: "sticky" as const, left, zIndex: 3, background: PIN_BG }
    : {};
  return (
    <div
      className="flex shrink-0 flex-col items-center px-0.5 text-center"
      style={{ width: COL_W, ...stickyStyle }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onFixar();
        }}
        title={fixada ? "Soltar coluna" : "Fixar coluna para comparar"}
        className="mb-0.5 flex h-4 w-4 items-center justify-center rounded-[3px]"
        style={fixada ? { color: GOLD } : { color: "#9aa6b6" }}
      >
        {fixada ? <Pin className="h-3 w-3" fill={GOLD} /> : <PinOff className="h-3 w-3" />}
      </button>
      <span className={`text-[12px] font-black leading-none ${ultima ? "text-[#16294a]" : "text-[#3a4a63]"}`}>
        {diaMes(c.date)}
      </span>
      <span className="text-[9px] font-bold leading-none text-[#8a97a9]">{ano(c.date)}</span>
      <span className="mt-1 max-w-[60px] truncate text-[9px] font-semibold leading-tight" style={{ color: GOLD }}>
        {c.lab ?? "Lab. —"}
      </span>
      <span className="mt-0.5 text-[8px] font-medium leading-tight text-[#8a97a9]">
        {c.conferenteName ? (
          c.confLevel === "c2" ? "Conferido" : "Lançado"
        ) : (
          <span className="inline-flex items-center gap-0.5">
            <Bot className="h-2.5 w-2.5" /> Aguardando
          </span>
        )}
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
  const corUltimo = ultimo?.cor ?? MUTED;
  const rotuloUltimo = ultimo?.zona ? ZONE_ROTULO[ultimo.zona] ?? ultimo.zona : "—";
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
              {analyte.refLow && analyte.refHigh && (
                <span className="text-[10px] text-[#647c97]">
                  ref {analyte.refLow}–{analyte.refHigh}
                </span>
              )}
            </div>
          </div>
        </div>
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
                  type="linear"
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

      {/* RODAPÉ: situação atual + tendência na BOLINHA (requisito 5) */}
      <div className="mt-2 flex items-center gap-2">
        {ultimo && (
          <div className="concave-3d flex flex-1 items-center gap-2 px-3 py-2">
            <span className="inline-block h-3 w-3 shrink-0 rounded-[3px]" style={{ background: corUltimo }} />
            <span className="text-[13px] font-bold leading-tight" style={{ color: corUltimo }}>
              {rotuloUltimo}
            </span>
            <span className="ml-auto text-[11px] font-semibold text-[#647c97]">
              {ultimo.valor} {analyte.unit ?? ""}
            </span>
          </div>
        )}
        <div
          className="bevel-3d flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-full"
          title={`Tendência: ${tend.rotulo}`}
          style={{ border: `2px solid ${tend.hex}` }}
        >
          <tend.Icon className="h-4 w-4" style={{ color: tend.hex }} />
          <span className="text-[7px] font-black uppercase leading-none" style={{ color: tend.hex }}>
            {tend.rotulo}
          </span>
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

// --------------------------------------------------- bloco editável (F5) ------
type LayoutMode = "lado" | "topo" | "sanfona" | "fixo";
const LAYOUTS: { id: LayoutMode; label: string }[] = [
  { id: "lado", label: "Ao lado" },
  { id: "topo", label: "Topo largura total" },
  { id: "sanfona", label: "Sanfona" },
  { id: "fixo", label: "Fixo (rodapé)" },
];

// ============================================================== PAINEL ========
export default function EvolucaoExamesPanel({ clientId }: { clientId: number }) {
  const [data, setData] = useState<EvolucaoData | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [mostrarFaixas, setMostrarFaixas] = useState(true);
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

  const zonasPresentes = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of analytes) {
      for (const c of Object.values(a.cells)) {
        if (c.zone) m.set(c.zone.name, c.zone.color);
      }
    }
    // ordem canônica primeiro; depois o resto
    const ordem = ["ALERTA", "ATENCAO", "INSUFICIENTE", "SUFICIENTE", "EXCELENTE"];
    return [...m.entries()].sort((a, b) => {
      const ia = ordem.indexOf(a[0]);
      const ib = ordem.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [analytes]);

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
  if (columnsRaw.length === 0 || analytes.length === 0) {
    return <p className="py-6 text-sm text-[#647c97]">Nenhum exame para este cliente ainda.</p>;
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

      {/* controles */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-[#16294a]/10 pb-3">
        {/* botões de FAIXA em BEVEL (requisito 4) */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[9px] font-bold uppercase tracking-wide text-[#647c97]">Acender faixa:</span>
          <button
            type="button"
            onClick={() => setZonaAcesa(null)}
            className={`rounded-[5px] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${zonaAcesa === null ? "btn-3d" : "btn-3d-soft"}`}
            style={zonaAcesa === null ? { background: NAVY, color: "#fff" } : { color: NAVY }}
          >
            Todas
          </button>
          {zonasPresentes.map(([nome, cor]) => {
            const ativo = zonaAcesa === nome;
            return (
              <button
                key={nome}
                type="button"
                onClick={() => setZonaAcesa(ativo ? null : nome)}
                className={`flex items-center gap-1 rounded-[5px] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${ativo ? "btn-3d" : "btn-3d-soft"}`}
                style={ativo ? { background: cor, color: "#fff", boxShadow: `0 0 8px 1px ${cor}` } : { color: cor }}
              >
                <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: cor }} />
                {ZONE_ROTULO[nome] ?? nome}
              </button>
            );
          })}
        </div>
        <Toggle ligado={mostrarFaixas} onToggle={() => setMostrarFaixas((v) => !v)} texto="Faixinha de cor" />
      </div>

      {/* toggle de LAYOUT (requisito 7) */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[9px] font-bold uppercase tracking-wide text-[#647c97]">Gráficos:</span>
        {LAYOUTS.map((l) => {
          const ativo = layout === l.id;
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => setLayout(l.id)}
              className={`rounded-[5px] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${ativo ? "btn-3d" : "btn-3d-soft"}`}
              style={ativo ? { background: NAVY, color: "#fff" } : { color: NAVY }}
            >
              {l.label}
            </button>
          );
        })}
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-3 text-[10px] font-semibold uppercase tracking-wide text-[#647c97]">
        <span className="flex items-center gap-1">
          <MousePointerClick className="h-3.5 w-3.5" /> Clique no exame para abrir o gráfico
        </span>
        <span className="flex items-center gap-1">
          <Pin className="h-3.5 w-3.5" /> Alfinete no cabeçalho fixa a coluna
        </span>
      </div>

      {/* planilha com rolagem lateral; nome + colunas fixadas grudam à esquerda */}
      <div className="overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
        <div className="min-w-max">
          {/* cabeçalho */}
          <div className="flex items-end gap-2 pb-2">
            <div
              className="sticky left-0 z-[4] flex shrink-0 items-end px-2 py-1"
              style={{ width: NAME_W, background: NOME_BG }}
            >
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#647c97]">
                Exame (congelado)
              </span>
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
                  {/* nome congelado em UP-BEVEL (requisito 3) */}
                  <div
                    className="sticky left-0 z-[3] flex shrink-0 flex-col justify-center"
                    style={{ width: NAME_W, background: NOME_BG }}
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
                    const acesa = zonaAcesa !== null && cell?.zone?.name === zonaAcesa;
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
