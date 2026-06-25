import "./_group.css";
import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, FlaskConical, Minus, MousePointerClick, TrendingUp, X } from "lucide-react";

/* ---------- modelo ---------- */
type Tend = "melhorou" | "igual" | "piorou";
type ZonaNome = "ruim" | "alerta" | "atencao" | "aceitavel" | "excelente";
type Zona = { nome: ZonaNome; de: number; ate: number };
type Ponto = { data: string; valor: number };
type Analito = {
  nome: string;
  unidade: string;
  direcao: "Quanto maior, melhor" | "Quanto menor, melhor";
  vmin: number;
  vmax: number;
  zonas: Zona[];
  pontos: Ponto[];
  tend: Tend;
  zonaAtual: ZonaNome;
};

const ZCOR: Record<ZonaNome, { cor: string; rotulo: string }> = {
  ruim: { cor: "#c0392b", rotulo: "Ruim" },
  alerta: { cor: "#e07b39", rotulo: "Alerta" },
  atencao: { cor: "#d4a72c", rotulo: "Atenção" },
  aceitavel: { cor: "#6fae5f", rotulo: "Aceitável" },
  excelente: { cor: "#2f8f4e", rotulo: "Excelente" },
};

const TEND: Record<Tend, { rotulo: string; cor: string; led: string; Icon: typeof ArrowUpRight }> = {
  melhorou: { rotulo: "MELHOROU", cor: "text-emerald-700", led: "paxter-led-green", Icon: ArrowUpRight },
  igual: { rotulo: "IGUAL", cor: "text-amber-700", led: "paxter-led-amber", Icon: Minus },
  piorou: { rotulo: "PIOROU", cor: "text-red-700", led: "paxter-led-red", Icon: ArrowDownRight },
};

/* datas (9 coletas) — para demonstrar o rolar lateral da planilha */
const DATAS = ["25/10/25", "25/11/25", "25/12/25", "25/01/26", "25/02/26", "25/03/26", "20/04/26", "20/05/26", "25/06/26"];

function serie(valores: number[]): Ponto[] {
  return DATAS.map((data, i) => ({ data, valor: valores[i] }));
}

const ANALITOS: Analito[] = [
  {
    nome: "Ferritina (estoque de ferro)",
    unidade: "ng/mL",
    direcao: "Quanto maior, melhor",
    vmin: 0,
    vmax: 200,
    zonas: [
      { nome: "ruim", de: 0, ate: 15 },
      { nome: "alerta", de: 15, ate: 30 },
      { nome: "atencao", de: 30, ate: 70 },
      { nome: "aceitavel", de: 70, ate: 100 },
      { nome: "excelente", de: 100, ate: 200 },
    ],
    pontos: serie([8, 12, 16, 20, 24, 28, 30, 70, 110]),
    tend: "melhorou",
    zonaAtual: "excelente",
  },
  {
    nome: "Vitamina D",
    unidade: "ng/mL",
    direcao: "Quanto maior, melhor",
    vmin: 0,
    vmax: 80,
    zonas: [
      { nome: "ruim", de: 0, ate: 20 },
      { nome: "alerta", de: 20, ate: 30 },
      { nome: "atencao", de: 30, ate: 40 },
      { nome: "aceitavel", de: 40, ate: 60 },
      { nome: "excelente", de: 60, ate: 80 },
    ],
    pontos: serie([10, 13, 15, 16, 18, 22, 18, 32, 45]),
    tend: "melhorou",
    zonaAtual: "aceitavel",
  },
  {
    nome: "Hemoglobina glicada (HbA1c)",
    unidade: "%",
    direcao: "Quanto menor, melhor",
    vmin: 4,
    vmax: 9,
    zonas: [
      { nome: "excelente", de: 4, ate: 5.4 },
      { nome: "aceitavel", de: 5.4, ate: 5.7 },
      { nome: "atencao", de: 5.7, ate: 6.0 },
      { nome: "alerta", de: 6.0, ate: 6.5 },
      { nome: "ruim", de: 6.5, ate: 9 },
    ],
    pontos: serie([7.5, 7.3, 7.2, 7.1, 7.0, 6.9, 6.8, 6.2, 5.8]),
    tend: "melhorou",
    zonaAtual: "atencao",
  },
  {
    nome: "Proteína C reativa (PCR)",
    unidade: "mg/L",
    direcao: "Quanto menor, melhor",
    vmin: 0,
    vmax: 6,
    zonas: [
      { nome: "excelente", de: 0, ate: 1 },
      { nome: "aceitavel", de: 1, ate: 2 },
      { nome: "atencao", de: 2, ate: 3 },
      { nome: "alerta", de: 3, ate: 5 },
      { nome: "ruim", de: 5, ate: 6 },
    ],
    pontos: serie([5.8, 5.5, 5.2, 5.0, 4.8, 4.5, 4.2, 2.0, 0.8]),
    tend: "melhorou",
    zonaAtual: "excelente",
  },
  {
    nome: "Colesterol LDL",
    unidade: "mg/dL",
    direcao: "Quanto menor, melhor",
    vmin: 50,
    vmax: 200,
    zonas: [
      { nome: "excelente", de: 50, ate: 100 },
      { nome: "aceitavel", de: 100, ate: 130 },
      { nome: "atencao", de: 130, ate: 160 },
      { nome: "alerta", de: 160, ate: 190 },
      { nome: "ruim", de: 190, ate: 200 },
    ],
    pontos: serie([190, 188, 186, 184, 182, 181, 180, 176, 170]),
    tend: "igual",
    zonaAtual: "alerta",
  },
  {
    nome: "Glicemia em jejum",
    unidade: "mg/dL",
    direcao: "Quanto menor, melhor",
    vmin: 70,
    vmax: 140,
    zonas: [
      { nome: "excelente", de: 70, ate: 90 },
      { nome: "aceitavel", de: 90, ate: 99 },
      { nome: "atencao", de: 99, ate: 110 },
      { nome: "alerta", de: 110, ate: 126 },
      { nome: "ruim", de: 126, ate: 140 },
    ],
    pontos: serie([95, 98, 100, 103, 105, 107, 108, 112, 119]),
    tend: "piorou",
    zonaAtual: "alerta",
  },
];

/* classifica um valor na faixa (terço) correspondente */
function zonaDe(a: Analito, valor: number): ZonaNome {
  for (const z of a.zonas) {
    if (valor >= z.de && valor < z.ate) return z.nome;
  }
  return a.zonas[a.zonas.length - 1].nome;
}

/* nomes das faixas CADASTRADOS por exame (subcadastro de Exames) */
const ROTULOS: Record<string, Partial<Record<ZonaNome, string>>> = {
  "Ferritina (estoque de ferro)": { ruim: "Deficiência grave", alerta: "Estoque baixo", atencao: "Estoque limítrofe", aceitavel: "Estoque adequado", excelente: "Estoque ótimo" },
  "Vitamina D": { ruim: "Deficiência", alerta: "Insuficiência", atencao: "Limítrofe", aceitavel: "Suficiente", excelente: "Nível ótimo" },
  "Hemoglobina glicada (HbA1c)": { excelente: "Normal", aceitavel: "Ótimo controle", atencao: "Pré-diabetes inicial", alerta: "Pré-diabetes", ruim: "Faixa de diabetes" },
  "Proteína C reativa (PCR)": { excelente: "Sem inflamação", aceitavel: "Inflamação baixa", atencao: "Inflamação moderada", alerta: "Inflamação alta", ruim: "Inflamação muito alta" },
  "Colesterol LDL": { excelente: "Ótimo", aceitavel: "Desejável", atencao: "Limítrofe alto", alerta: "Alto", ruim: "Muito alto" },
  "Glicemia em jejum": { excelente: "Normal", aceitavel: "Normal alto", atencao: "Glicemia alterada", alerta: "Pré-diabetes", ruim: "Faixa de diabetes" },
};

/* nome cadastrado da faixa; cai no rótulo genérico se ainda não cadastrado */
function nomeFaixa(a: Analito, z: ZonaNome): string {
  return ROTULOS[a.nome]?.[z] ?? ZCOR[z].rotulo;
}

/* ---------- barra de zonas (terços) horizontal ---------- */
function ZonaBar({ a }: { a: Analito }) {
  const span = a.vmax - a.vmin;
  const valor = a.pontos[a.pontos.length - 1].valor;
  const markerPct = ((valor - a.vmin) / span) * 100;
  return (
    <div className="relative h-3.5 w-full overflow-visible rounded-[3px]" style={{ boxShadow: "inset 0 1px 2px rgba(0,0,0,0.25)" }}>
      <div className="flex h-full w-full overflow-hidden rounded-[3px]">
        {a.zonas.map((z) => (
          <div key={z.nome} style={{ width: `${((z.ate - z.de) / span) * 100}%`, background: ZCOR[z.nome].cor, opacity: 0.82 }} />
        ))}
      </div>
      <div
        className="absolute top-[-3px] h-[20px] w-[3px] rounded-full"
        style={{ left: `calc(${markerPct}% - 1.5px)`, background: "#16294a", boxShadow: "0 0 0 1.5px #fff" }}
      />
    </div>
  );
}

/* ---------- gráfico de linha com faixas (terços) ---------- */
function LineChart({ a }: { a: Analito }) {
  const W = 720, H = 250, L = 52, R = 18, T = 18, B = 38;
  const pw = W - L - R, ph = H - T - B;
  const span = a.vmax - a.vmin;
  const yFor = (v: number) => T + (1 - (v - a.vmin) / span) * ph;
  const xFor = (i: number) => L + (i / (a.pontos.length - 1)) * pw;
  const ticks = Array.from({ length: 5 }, (_, i) => a.vmin + (span * i) / 4);
  const linePts = a.pontos.map((p, i) => `${xFor(i)},${yFor(p.valor)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Evolução de ${a.nome}`}>
      {/* faixas (terços/zonas) ao fundo */}
      {a.zonas.map((z) => {
        const yTop = yFor(z.ate), yBot = yFor(z.de);
        return (
          <g key={z.nome}>
            <rect x={L} y={yTop} width={pw} height={yBot - yTop} fill={ZCOR[z.nome].cor} opacity={0.16} />
            <text x={W - R - 4} y={(yTop + yBot) / 2 + 3} textAnchor="end" fontSize="9" fontWeight={700} fill={ZCOR[z.nome].cor} opacity={0.9}>
              {ZCOR[z.nome].rotulo.toUpperCase()}
            </text>
          </g>
        );
      })}
      {/* eixo Y */}
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={L} y1={yFor(t)} x2={W - R} y2={yFor(t)} stroke="#16294a" strokeOpacity={0.08} />
          <text x={L - 8} y={yFor(t) + 3} textAnchor="end" fontSize="10" fill="#647c97">{Number.isInteger(t) ? t : t.toFixed(1)}</text>
        </g>
      ))}
      {/* linha + pontos */}
      <polyline points={linePts} fill="none" stroke="#16294a" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {a.pontos.map((p, i) => {
        const last = i === a.pontos.length - 1;
        const mostraData = i % 2 === 0 || last;
        return (
          <g key={i}>
            <circle cx={xFor(i)} cy={yFor(p.valor)} r={last ? 7 : 4.5} fill={last ? "#b8924d" : "#16294a"} stroke="#fff" strokeWidth={2} />
            {(last || i % 2 === 0) && (
              <text x={xFor(i)} y={yFor(p.valor) - 11} textAnchor="middle" fontSize="11" fontWeight={700} fill="#16294a">{p.valor}</text>
            )}
            {mostraData && (
              <text x={xFor(i)} y={H - 12} textAnchor="middle" fontSize="9" fill="#647c97">{p.data.slice(0, 5)}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function Selo() {
  return (
    <span className="font-serif text-[19px] font-semibold tracking-[0.16em]" style={{ color: "#e7cd8f", textShadow: "0 1px 0 rgba(0,0,0,0.45)" }}>
      PAXTER
    </span>
  );
}

/* largura da planilha: nome CONGELADO + 9 datas que rolam + faixa + tendência */
const GRID = "grid-cols-[200px_44px_repeat(9,58px)_150px_118px]";
const NOME_BG = "#e9ecf1";

/* uma célula de valor, com faixinha de cor opcional e neon opcional */
function Cela({ a, idx, atual, showStrip, neonZona }: { a: Analito; idx: number; atual?: boolean; showStrip: boolean; neonZona: ZonaNome | null }) {
  const valor = a.pontos[idx].valor;
  const z = zonaDe(a, valor);
  const cor = ZCOR[z].cor;
  const aceso = neonZona !== null && z === neonZona;
  return (
    <div
      className={`relative overflow-hidden rounded-[4px] py-1.5 text-center ${atual ? "screen-3d" : "concave-3d"}`}
      style={aceso ? { boxShadow: `0 0 0 2px ${cor}, 0 0 12px 3px ${cor}`, transition: "box-shadow .15s" } : { transition: "box-shadow .15s" }}
      title={`${valor} ${a.unidade} · faixa ${ZCOR[z].rotulo}`}
    >
      {showStrip && <span className="absolute left-0 top-0 h-full w-[5px]" style={{ background: cor }} />}
      <span
        className={atual ? "text-[12px] font-bold text-[#16294a]" : "text-[11px] font-medium text-[#3a4a63]"}
        style={{ paddingLeft: showStrip ? 5 : 0 }}
      >
        {valor}
      </span>
    </div>
  );
}

/* célula do nome — CONGELADA (fica parada ao rolar para os lados) */
function CelaNome({ children, cabecalho }: { children: React.ReactNode; cabecalho?: boolean }) {
  return (
    <div
      className={`sticky left-0 z-[2] flex flex-col justify-center px-1 ${cabecalho ? "" : "py-0.5"}`}
      style={{ background: NOME_BG, boxShadow: "7px 0 7px -5px rgba(0,0,0,0.18)" }}
    >
      {children}
    </div>
  );
}

/* uma linha completa do comparativo */
function Linha({
  a,
  showStrip,
  neonZona,
  onClick,
  selecionada,
}: {
  a: Analito;
  showStrip: boolean;
  neonZona: ZonaNome | null;
  onClick?: () => void;
  selecionada?: boolean;
}) {
  const cfg = TEND[a.tend];
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`panel-3d-sub grid ${GRID} items-center gap-2 py-2 pr-2 ${onClick ? "cursor-pointer" : ""}`}
      style={selecionada ? { outline: "2px solid #b8924d", outlineOffset: "-2px" } : undefined}
    >
      <CelaNome>
        <div className="flex items-center gap-1.5">
          {selecionada && <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: "#b8924d", boxShadow: "0 0 6px 1px #b8924d" }} />}
          <span className="text-[12px] font-semibold leading-tight text-[#16294a]">{a.nome}</span>
        </div>
        <div className="text-[9px] uppercase tracking-wide text-[#647c97]">{a.unidade} · {a.direcao}</div>
      </CelaNome>
      <div className="text-center text-[9px] text-[#647c97]">{a.unidade}</div>
      {a.pontos.map((_, i) => (
        <Cela key={i} a={a} idx={i} atual={i === a.pontos.length - 1} showStrip={showStrip} neonZona={neonZona} />
      ))}
      <div className="px-1.5">
        <ZonaBar a={a} />
        <div className="mt-1 text-center text-[9px] font-bold uppercase tracking-wide" style={{ color: ZCOR[a.zonaAtual].cor }}>
          {ZCOR[a.zonaAtual].rotulo}
        </div>
      </div>
      <div className="bevel-3d flex items-center justify-center gap-1 py-1.5">
        <span className={`paxter-led ${cfg.led} paxter-led-on`} />
        <cfg.Icon className={`h-3.5 w-3.5 ${cfg.cor}`} />
        <span className={`text-[9px] font-bold uppercase tracking-wide ${cfg.cor}`}>{cfg.rotulo}</span>
      </div>
    </div>
  );
}

/* cabeçalho de colunas do comparativo */
function Cabecalho() {
  return (
    <div className={`grid ${GRID} items-end gap-2 pb-2 pr-2`}>
      <CelaNome cabecalho>
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#647c97]">Exame (congelado)</div>
      </CelaNome>
      <div className="text-center text-[9px] font-bold uppercase tracking-wide text-[#647c97]">Unid.</div>
      {DATAS.map((dt, i) => {
        const ultima = i === DATAS.length - 1;
        return (
          <div key={dt} className={`text-center text-[9px] font-bold uppercase tracking-wide ${ultima ? "text-[#16294a]" : "text-[#647c97]"}`}>
            {dt.slice(0, 5)}
          </div>
        );
      })}
      <div className="text-center text-[10px] font-bold uppercase tracking-[0.12em] text-[#647c97]">Faixa atual</div>
      <div className="text-center text-[10px] font-bold uppercase tracking-wide text-[#647c97]">Tendência</div>
    </div>
  );
}

/* interruptor (toggle) estilo Paxter */
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
        style={{ background: ligado ? "#b8924d" : "#c9cdd6", boxShadow: "inset 0 1px 3px rgba(0,0,0,0.35)" }}
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

/* cartão de gráfico (um por exame selecionado, empilhados) */
function CartaoGrafico({ a, ordem, onRemover }: { a: Analito; ordem: number; onRemover: () => void }) {
  const cfg = TEND[a.tend];
  const pl = a.pontos[a.pontos.length - 1];
  return (
    <section className="panel-3d p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: "#16294a" }}>
            {ordem}
          </span>
          <div>
            <div className="text-[13px] font-bold leading-tight text-[#16294a]">{a.nome}</div>
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold text-[#16294a]">{pl.valor}</span>
              <span className="text-[10px] text-[#647c97]">{a.unidade}</span>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase" style={{ color: ZCOR[a.zonaAtual].cor }}>
                <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: ZCOR[a.zonaAtual].cor }} />
                {ZCOR[a.zonaAtual].rotulo}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="bevel-3d flex items-center gap-1 px-2 py-1">
            <span className={`paxter-led ${cfg.led} paxter-led-on`} />
            <span className={`text-[9px] font-bold uppercase ${cfg.cor}`}>{cfg.rotulo}</span>
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
      <div className="screen-3d p-2">
        <LineChart a={a} />
      </div>
      <div className="concave-3d mt-2 px-3 py-2">
        <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#647c97]">
          Faixa cadastrada do valor atual
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="inline-block h-3 w-3 shrink-0 rounded-[3px]" style={{ background: ZCOR[a.zonaAtual].cor }} />
          <span className="text-[14px] font-bold leading-tight" style={{ color: ZCOR[a.zonaAtual].cor }}>
            {nomeFaixa(a, a.zonaAtual)}
          </span>
          <span className="ml-auto text-[11px] font-semibold text-[#647c97]">
            {pl.valor} {a.unidade}
          </span>
        </div>
      </div>
    </section>
  );
}

export function Exames() {
  const [selecionados, setSelecionados] = useState<number[]>([0, 2]);
  const [mostrarFaixas, setMostrarFaixas] = useState(false);
  const [filtroZona, setFiltroZona] = useState<ZonaNome | null>(null);

  function alternar(i: number) {
    setSelecionados((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));
  }

  return (
    <div className="cockpit-root min-h-screen w-full font-sans">
      {/* topo */}
      <header className="flex items-center justify-between px-7 py-3" style={{ background: "linear-gradient(180deg,#1b3260 0%,#16294a 60%,#101f3a 100%)", borderBottom: "1px solid rgba(231,205,143,0.35)" }}>
        <div className="flex items-center gap-3">
          <Selo />
          <span className="text-[11px] uppercase tracking-[0.22em] text-slate-300">Motor Clínico</span>
        </div>
        <div className="text-right leading-tight">
          <div className="text-[13px] font-semibold uppercase tracking-wide text-white">Maria Silva Santos</div>
          <div className="text-[11px] text-slate-300">CPF 123.456.789-00 · 47 anos</div>
        </div>
      </header>

      {/* abas do cockpit */}
      <nav className="flex items-end gap-1 px-7 pt-3" style={{ background: "#13233f" }}>
        {["Anamnese", "Prescrição", "Injetáveis", "Exames", "Acompanhamento", "Diário"].map((t) => {
          const ativo = t === "Exames";
          return (
            <div key={t} className={`px-4 py-2 text-[12px] font-semibold uppercase tracking-wide rounded-t-[5px] ${ativo ? "text-[#16294a]" : "text-slate-300"}`} style={ativo ? { background: "hsl(40 33% 96%)", borderTop: "2px solid #e7cd8f" } : { background: "rgba(255,255,255,0.04)" }}>
              {t}
            </div>
          );
        })}
      </nav>

      <main className="px-7 py-6" style={{ background: "hsl(40 33% 96%)" }}>
        <div className="bevel-3d mb-5 inline-flex items-center gap-2 px-4 py-2">
          <FlaskConical className="h-4 w-4" style={{ color: "#9a7b32" }} />
          <span className="text-[13px] font-bold uppercase tracking-[0.14em] text-[#16294a]">Exames — Evolução por Terços (Faixas)</span>
        </div>

        <div className="grid grid-cols-[1fr_380px] items-start gap-6">
          {/* ESQUERDA: planilha única — nome congelado + datas que rolam de lado */}
          <section className="panel-3d min-w-0 p-5">
            <div className="mb-2 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-[#16294a]">
              <TrendingUp className="h-4 w-4" style={{ color: "#9a7b32" }} /> Comparativo — passado × atual
            </div>

            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-[#16294a]/10 pb-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[9px] font-bold uppercase tracking-wide text-[#647c97]">Acender faixa:</span>
                <button
                  type="button"
                  onClick={() => setFiltroZona(null)}
                  className="rounded-[5px] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide"
                  style={filtroZona === null ? { background: "#16294a", color: "#fff" } : { background: "rgba(22,41,74,0.08)", color: "#16294a" }}
                >
                  Todos
                </button>
                {(["ruim", "alerta", "atencao", "aceitavel", "excelente"] as ZonaNome[]).map((z) => {
                  const ativo = filtroZona === z;
                  return (
                    <button
                      key={z}
                      type="button"
                      onClick={() => setFiltroZona(z)}
                      className="flex items-center gap-1 rounded-[5px] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide"
                      style={ativo ? { background: ZCOR[z].cor, color: "#fff", boxShadow: `0 0 8px 1px ${ZCOR[z].cor}` } : { background: "rgba(22,41,74,0.06)", color: ZCOR[z].cor }}
                    >
                      <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: ZCOR[z].cor }} /> {ZCOR[z].rotulo}
                    </button>
                  );
                })}
              </div>
              <Toggle ligado={mostrarFaixas} onToggle={() => setMostrarFaixas((v) => !v)} texto="Faixa de cor por valor" />
            </div>

            <div className="mb-2 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-wide text-[#647c97]">
              <span className="flex items-center gap-1"><MousePointerClick className="h-3.5 w-3.5" /> Clique no exame para empilhar o gráfico ao lado</span>
              <span className="hidden items-center gap-1 sm:flex">← role para ver todas as datas →</span>
            </div>

            {/* janela com rolagem lateral; o nome fica congelado */}
            <div className="overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
              <div className="min-w-max">
                <Cabecalho />
                <div className="space-y-2">
                  {ANALITOS.map((a, i) => (
                    <Linha
                      key={a.nome}
                      a={a}
                      showStrip={mostrarFaixas}
                      neonZona={filtroZona}
                      onClick={() => alternar(i)}
                      selecionada={selecionados.includes(i)}
                    />
                  ))}
                </div>
              </div>
            </div>

            <p className="mt-4 text-[11px] italic text-[#647c97]">
              Uma planilha só: o nome do exame fica congelado à esquerda; as datas rolam para o lado (cabem 10, 20 coletas
              sem espremer); clique numa linha para empilhar o gráfico dela ao lado; "Acender faixa" envolve com "neon" só
              os valores daquela faixa; o interruptor liga a faixinha de cor por valor.
            </p>
          </section>

          {/* DIREITA: gráficos empilhados (um por exame clicado) */}
          <aside className="sticky top-4 flex max-h-[calc(100vh-2rem)] flex-col gap-3 self-start overflow-y-auto pr-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#16294a]">Gráficos abertos ({selecionados.length})</span>
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
                <span className="text-[12px] text-[#647c97]">Clique num exame na planilha para abrir o gráfico aqui. Você pode empilhar vários.</span>
              </div>
            ) : (
              selecionados.map((i, ordem) => (
                <CartaoGrafico key={ANALITOS[i].nome} a={ANALITOS[i]} ordem={ordem + 1} onRemover={() => alternar(i)} />
              ))
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
