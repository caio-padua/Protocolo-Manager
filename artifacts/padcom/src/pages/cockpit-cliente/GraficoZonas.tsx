import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PainelPulso } from "./PainelPulso";
import { BotaoAjudaComJanela } from "./BotaoAjuda";
import type { TipoReferencia } from "./pulso-referencias";
import "./pulso-niveis.css";

// Gráfico do Meu Pulso no MESMO padrão do gráfico de exames do Pax Care (EvolucaoExamesPanel > CartaoGrafico):
// tela rebaixada, faixas coloridas no fundo, linha azul-marinho, etiqueta de valor na cor da faixa,
// pontos-fantasma tracejados nas pontas, quadradinho dourado sob o mouse, caixas de resumo e rodapé vivo.

const NAVY = "#16294a";
const MUTED = "#647c97";

export type ZonaGrafico = { key: string; name: string; color: string; low: number | null; high: number | null };
export type PontoGrafico = { iso: string; data: string; valor: number };

const zonaDe = (v: number, zonas: ZonaGrafico[] | null): ZonaGrafico | null =>
  zonas?.find((z) => (z.low == null || v >= z.low) && (z.high == null || v < z.high)) ?? null;

const textoSobre = (cor: string): string => {
  const m = /^#?([0-9a-f]{6})$/i.exec(cor.trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1]!, 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? NAVY : "#ffffff";
};
const rotuloPonto = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

let canvasMedida: CanvasRenderingContext2D | null | undefined;
const medir = (rotulos: string[]): number => {
  if (canvasMedida === undefined) canvasMedida = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
  let maior = 0;
  for (const r of rotulos) {
    const w = canvasMedida ? ((canvasMedida.font = "10px Inter, system-ui, sans-serif"), canvasMedida.measureText(r).width) : r.length * 6.2;
    if (w > maior) maior = w;
  }
  return Math.ceil(maior);
};

const MARGEM = 1 / 3;
const LARGURA_POR_PONTO = 56;

export function GraficoZonas({ titulo, unidade, referencia, pontos, zonas, dominioFixo, vazio, ajuda, escuro = false, cantoExtra, rodape, formatarValor, rotuloContagem = "dias", semSituacao = "—", padraoExames = false }: {
  ajuda?: TipoReferencia; escuro?: boolean;
  titulo: string; unidade: string; referencia?: string; pontos: PontoGrafico[]; zonas: ZonaGrafico[] | null;
  dominioFixo?: [number, number]; vazio?: string; cantoExtra?: ReactNode; rodape?: ReactNode;
  formatarValor?: (valor: number) => string; rotuloContagem?: string; semSituacao?: string; padraoExames?: boolean;
}) {
  const data = useMemo(() => pontos.map((p) => {
    const z = zonaDe(p.valor, zonas);
    return { data: p.data, valor: p.valor, cor: z?.color ?? NAVY, zona: z?.name ?? null };
  }), [pontos, zonas]);
  const ultimo = data.length ? data[data.length - 1]! : null;

  const dominio = useMemo(() => {
    if (dominioFixo) return { min: dominioFixo[0], max: dominioFixo[1] };
    const vals: number[] = data.map((d) => d.valor);
    for (const z of zonas ?? []) { if (z.low != null) vals.push(z.low); if (z.high != null) vals.push(z.high); }
    if (!vals.length) return { min: 0, max: 1 };
    let min = Math.min(...vals), max = Math.max(...vals);
    if (min === max) { min -= 1; max += 1; }
    const folga = (max - min) * 0.08;
    return { min: min - folga, max: max + folga };
  }, [data, zonas, dominioFixo]);

  const stats = useMemo(() => {
    if (!data.length) return null;
    let min = data[0]!, max = data[0]!, soma = 0;
    for (const d of data) { if (d.valor < min.valor) min = d; if (d.valor > max.valor) max = d; soma += d.valor; }
    const primeiro = data[0]!, fim = data[data.length - 1]!, pen = data.length > 1 ? data[data.length - 2]! : null;
    const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ","));
    const variacao = primeiro.valor !== 0 ? ((fim.valor - primeiro.valor) / Math.abs(primeiro.valor)) * 100 : null;
    const antes = data.length > 1 ? data.slice(0, -1).reduce((a, d) => a + d.valor, 0) / (data.length - 1) : null;
    const tendencia = antes == null || antes === 0 ? null : fim.valor > antes * 1.03 ? "Subiu" : fim.valor < antes * 0.97 ? "Caiu" : "Estável";
    return {
      min, max, fmt, media: fmt(soma / data.length), desde: primeiro.data, tendencia,
      variacao: variacao == null ? null : `${variacao >= 0 ? "+" : "−"}${Math.abs(variacao).toFixed(0)}%`,
      anterior: pen ? `${fim.valor - pen.valor >= 0 ? "+" : "−"}${fmt(Math.abs(fim.valor - pen.valor))}` : null,
    };
  }, [data]);

  type Ponto = { x: number; data: string; valor: number | null; ext: number | null; cor: string; zona: string | null; fantasma: boolean };
  const ultimoX = Math.max(data.length - 1, 0);
  const serie = useMemo<Ponto[]>(() => {
    if (!data.length) return [];
    const p = data[0]!, f = data[data.length - 1]!;
    return [
      { x: -MARGEM, data: "", valor: null, ext: p.valor, cor: MUTED, zona: null, fantasma: true },
      ...data.map((d, i) => ({ ...d, x: i, ext: i === 0 || i === data.length - 1 ? d.valor : null, fantasma: false })),
      { x: ultimoX + MARGEM, data: "", valor: null, ext: f.valor, cor: MUTED, zona: null, fantasma: true },
    ];
  }, [data, ultimoX]);

  const larguraMinima = Math.round((ultimoX + 2 * MARGEM) * (padraoExames ? 64 : LARGURA_POR_PONTO)) + 56;
  const rolagem = useRef<HTMLDivElement | null>(null);
  useEffect(() => { const el = rolagem.current; if (el) el.scrollLeft = el.scrollWidth; }, [serie.length]);
  const fmtEixo = (v: number) => (dominio.max - dominio.min >= 10 ? String(Math.round(v)) : v.toFixed(1).replace(".", ","));
  const larguraEixoY = useMemo(() => medir([dominio.min, dominio.max, ...data.map((d) => d.valor)].map(fmtEixo)) + 8,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dominio, data]);

  const [ponteiro, setPonteiro] = useState<(typeof data)[number] | null>(null);
  const ativo = ponteiro ?? ultimo;
  const corAtiva = ativo?.cor ?? MUTED;
  const rotuloAtivo = ativo?.zona ? ativo.zona.toUpperCase() : semSituacao;

  const canto = cantoExtra ?? (ajuda ? <BotaoAjudaComJanela tipo={ajuda} rotulo={titulo} escuro={escuro} /> : undefined);
  const cab = <>{titulo} <span style={{ color: "var(--pn-mudo)", letterSpacing: ".08em" }}>· {unidade}{referencia ? ` · ${referencia}` : ""}</span></>;
  if (!data.length) {
    return (
      <PainelPulso titulo={cab} canto={canto} rotulo={`Gráfico de ${titulo}`}>
        <div className="concave-3d px-3 py-8 text-center text-[12px]" style={{ color: "var(--pn-mudo)" }}>{vazio ?? "Ainda não há registros para desenhar este gráfico."}</div>
      </PainelPulso>
    );
  }

  const caixa = "screen-3d flex flex-col items-center px-1 py-1.5";
  const cx7 = "text-[7px] font-bold uppercase tracking-wide text-[color:var(--evo-faint)]";
  return (
    <PainelPulso titulo={cab} canto={canto} ampliavel rotulo={`Gráfico de ${titulo}`}>
      <div className="screen-tv-3d p-2">
        <div ref={rolagem} className="scroll-gold overflow-x-auto pb-1" style={{ overscrollBehaviorX: "contain" }}>
          <div style={{ minWidth: larguraMinima, width: "100%", height: padraoExames ? 260 : 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={serie} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}
                onMouseMove={(st) => {
                  const i = st?.activeTooltipIndex;
                  const pt = typeof i === "number" ? serie[i] : null;
                  setPonteiro(pt && !pt.fantasma ? (data[i! - 1] ?? null) : null);
                }}
                onMouseLeave={() => setPonteiro(null)}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(22,41,74,0.10)" />
                {zonas?.map((z) => (
                  <ReferenceArea key={z.key} y1={z.low ?? dominio.min} y2={z.high ?? dominio.max} fill={z.color} fillOpacity={padraoExames ? 0.16 : 0.18} stroke={z.color} strokeOpacity={padraoExames ? 0.22 : 0.25} />
                ))}
                <XAxis type="number" dataKey="x" domain={[-MARGEM, ultimoX + MARGEM]} ticks={data.map((_, i) => i)}
                  tickFormatter={(i: number) => data[Math.round(i)]?.data ?? ""} interval={0}
                  tick={{ fill: MUTED, fontSize: 10 }} tickLine={false} axisLine={{ stroke: "rgba(22,41,74,0.15)" }} />
                <YAxis tick={{ fill: MUTED, fontSize: 10 }} tickLine={false} axisLine={{ stroke: "rgba(22,41,74,0.15)" }}
                  width={larguraEixoY} tickSize={2} tickMargin={2} tickFormatter={fmtEixo} domain={[dominio.min, dominio.max]} />
                <Tooltip content={() => null} cursor={{ stroke: "rgba(184,146,77,0.55)", strokeDasharray: "4 3" }} />
                <Line type="linear" dataKey="ext" stroke={NAVY} strokeOpacity={0.35} strokeWidth={padraoExames ? 1.5 : 1} strokeDasharray="4 4" isAnimationActive={false} activeDot={false}
                  dot={(props: { cx?: number; cy?: number; payload?: Ponto; index?: number }) => {
                    const { cx, cy, payload, index } = props;
                    if (cx == null || cy == null || !payload?.fantasma) return <g key={`f-${index}`} />;
                    return <rect key={`f-${index}`} x={cx - 4} y={cy - 4} width={8} height={8} fill="none" stroke={NAVY} strokeOpacity={0.45} strokeWidth={1} strokeDasharray="2 2" />;
                  }} />
                <Line type="linear" dataKey="valor" stroke={NAVY} strokeWidth={padraoExames ? 2.5 : 1.25} strokeLinejoin="miter" strokeLinecap="butt" strokeMiterlimit={10} isAnimationActive={false}
                  dot={(props: { cx?: number; cy?: number; payload?: Ponto; index?: number }) => {
                    const { cx, cy, payload, index } = props;
                    if (cx == null || cy == null || !payload || payload.fantasma || payload.valor == null) return <g key={`d-${index}`} />;
                    const txt = formatarValor ? formatarValor(payload.valor) : rotuloPonto(payload.valor), w = txt.length * 5.8 + 10, h = 15;
                    const acima = cy - h - 8 >= 0, ry = acima ? cy - h - 7 : cy + 7;
                    return (
                      <g key={`d-${index}`} pointerEvents="none">
                        <rect x={cx - w / 2} y={ry} width={w} height={h} fill={payload.cor} fillOpacity={0.95} stroke="#fff" strokeWidth={1} />
                        <text x={cx} y={ry + h / 2 + 3.2} textAnchor="middle" fontSize={9.5} fontWeight={700} fill={textoSobre(payload.cor)}>{txt}</text>
                        </g>
                    );
                  }}
                  activeDot={(props: { cx?: number; cy?: number }) => {
                    const { cx, cy } = props;
                    if (cx == null || cy == null) return <g />;
                    return <rect x={cx - 5} y={cy - 5} width={10} height={10} fill="none" stroke="#000" strokeWidth={1.5} />;
                  }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {zonas && (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-semibold" style={{ color: "var(--pn-mudo)" }} aria-label="Cores das faixas">
          {zonas.map((z) => <li key={z.key} className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: z.color }} />{z.name}</li>)}
        </ul>
      )}

      {stats && (
        <div className="mt-2 grid grid-cols-5 gap-1.5">
          <div className={caixa}><span className={cx7}>Mínimo</span><span className="text-[12px] font-black leading-tight text-[color:var(--evo-ink)]">{stats.fmt(stats.min.valor)}</span><span className="max-w-full truncate text-[7px] font-semibold text-[color:var(--evo-muted)]">{stats.min.data}</span></div>
          <div className={caixa}><span className={cx7}>Máximo</span><span className="text-[12px] font-black leading-tight text-[color:var(--evo-ink)]">{stats.fmt(stats.max.valor)}</span><span className="max-w-full truncate text-[7px] font-semibold text-[color:var(--evo-muted)]">{stats.max.data}</span></div>
          <div className={caixa}><span className={cx7}>Média</span><span className="text-[12px] font-black leading-tight text-[color:var(--evo-ink)]">{stats.media}</span><span className="max-w-full truncate text-[7px] font-semibold text-[color:var(--evo-muted)]">período todo</span></div>
          <div className={caixa}><span className={cx7}>Variação</span><span className="text-[12px] font-black leading-tight text-[color:var(--evo-ink)]">{stats.variacao ?? "—"}</span><span className="max-w-full truncate text-[7px] font-semibold text-[color:var(--evo-muted)]">desde {stats.desde}</span></div>
          <div className={caixa}><span className={cx7}>Anterior</span><span className="max-w-full truncate text-[12px] font-black leading-tight text-[color:var(--evo-ink)]">{stats.anterior ?? "—"}</span><span className="max-w-full truncate text-[7px] font-semibold text-[color:var(--evo-muted)]">{data.length} {rotuloContagem}</span></div>
        </div>
      )}

      <div className="mt-2 flex items-stretch justify-between gap-1.5">
        <div className="flex shrink-0 items-stretch gap-1.5">
          <div className="concave-3d flex w-[82px] flex-col items-center justify-center py-1.5">
            <span className={cx7}>{ponteiro ? "no ponto" : "última"}</span>
            <span className="flex items-baseline gap-0.5 tabular-nums">
              <span className="text-[15px] font-black leading-tight text-[color:var(--evo-ink)]">{ativo ? (formatarValor ? formatarValor(ativo.valor) : String(ativo.valor).replace(".", ",")) : "—"}</span>
              <span className="text-[9px] font-semibold text-[color:var(--evo-ink)]">{unidade.replace(/^0 a 10$/, "")}</span>
            </span>
          </div>
          <div className="concave-3d flex w-[70px] flex-col items-center justify-center py-1.5">
            <span className={cx7}>data</span>
            <span className="text-[11px] font-bold leading-tight text-[color:var(--evo-ink)]">{ativo?.data || "—"}</span>
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap-reverse items-stretch justify-end gap-1.5">
          <div className="bevel-3d flex w-[66px] shrink-0 flex-col items-center justify-center rounded-[3px] py-1.5" style={{ border: "2px solid #b0bec5" }}>
            <span className={cx7}>tendência</span>
            <span className="text-[11px] font-black capitalize leading-tight text-[color:var(--evo-ink)]">{stats?.tendencia ?? "—"}</span>
          </div>
          <div className="bevel-3d flex w-[84px] shrink-0 flex-col items-center justify-center rounded-[3px] py-1.5" style={{ border: `2px solid ${corAtiva}` }}>
            <span className={cx7}>situação</span>
            <span className="text-[10.5px] font-bold uppercase leading-tight" style={{ color: corAtiva }}>{rotuloAtivo}</span>
          </div>
        </div>
      </div>
      {rodape}
    </PainelPulso>
  );
}
