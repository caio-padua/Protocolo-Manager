import "./_group.css";
import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, Filter, FlaskConical, Minus, MousePointerClick, TrendingUp } from "lucide-react";

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
    pontos: [
      { data: "20/04/2026", valor: 30 },
      { data: "20/05/2026", valor: 70 },
      { data: "25/06/2026", valor: 110 },
    ],
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
    pontos: [
      { data: "20/04/2026", valor: 18 },
      { data: "20/05/2026", valor: 32 },
      { data: "25/06/2026", valor: 45 },
    ],
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
    pontos: [
      { data: "20/04/2026", valor: 6.8 },
      { data: "20/05/2026", valor: 6.2 },
      { data: "25/06/2026", valor: 5.8 },
    ],
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
    pontos: [
      { data: "20/04/2026", valor: 4.2 },
      { data: "20/05/2026", valor: 2.0 },
      { data: "25/06/2026", valor: 0.8 },
    ],
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
    pontos: [
      { data: "20/04/2026", valor: 180 },
      { data: "20/05/2026", valor: 176 },
      { data: "25/06/2026", valor: 170 },
    ],
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
    pontos: [
      { data: "20/04/2026", valor: 108 },
      { data: "20/05/2026", valor: 112 },
      { data: "25/06/2026", valor: 119 },
    ],
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
  const W = 720, H = 270, L = 52, R = 18, T = 18, B = 40;
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
        return (
          <g key={i}>
            <circle cx={xFor(i)} cy={yFor(p.valor)} r={last ? 7 : 5} fill={last ? "#b8924d" : "#16294a"} stroke="#fff" strokeWidth={2} />
            <text x={xFor(i)} y={yFor(p.valor) - 12} textAnchor="middle" fontSize="11" fontWeight={700} fill="#16294a">{p.valor}</text>
            <text x={xFor(i)} y={H - 14} textAnchor="middle" fontSize="10" fill="#647c97">{p.data}</text>
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

const GRID = "grid-cols-[minmax(160px,1.4fr)_50px_repeat(3,64px)_minmax(118px,1fr)_120px]";

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
      {showStrip && <span className="absolute left-0 top-0 h-full w-[6px]" style={{ background: cor }} />}
      <span
        className={atual ? "text-[13px] font-bold text-[#16294a]" : "text-[12px] font-medium text-[#3a4a63]"}
        style={{ paddingLeft: showStrip ? 7 : 0 }}
      >
        {valor}
      </span>
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
      className={`panel-3d-sub grid ${GRID} items-center gap-2 px-2 py-2 ${onClick ? "cursor-pointer" : ""}`}
      style={selecionada ? { outline: "2px solid #b8924d", outlineOffset: "2px" } : undefined}
    >
      <div className="px-1">
        <div className="text-[12.5px] font-semibold text-[#16294a]">{a.nome}</div>
        <div className="text-[9.5px] uppercase tracking-wide text-[#647c97]">{a.direcao}</div>
      </div>
      <div className="text-center text-[10px] text-[#647c97]">{a.unidade}</div>
      <Cela a={a} idx={0} showStrip={showStrip} neonZona={neonZona} />
      <Cela a={a} idx={1} showStrip={showStrip} neonZona={neonZona} />
      <Cela a={a} idx={2} atual showStrip={showStrip} neonZona={neonZona} />
      <div className="px-1.5">
        <ZonaBar a={a} />
        <div className="mt-1 text-center text-[9px] font-bold uppercase tracking-wide" style={{ color: ZCOR[a.zonaAtual].cor }}>
          {ZCOR[a.zonaAtual].rotulo}
        </div>
      </div>
      <div className="bevel-3d flex items-center justify-center gap-1.5 py-1.5">
        <span className={`paxter-led ${cfg.led} paxter-led-on`} />
        <cfg.Icon className={`h-4 w-4 ${cfg.cor}`} />
        <span className={`text-[10px] font-bold uppercase tracking-wide ${cfg.cor}`}>{cfg.rotulo}</span>
      </div>
    </div>
  );
}

/* cabeçalho de colunas do comparativo */
function Cabecalho() {
  return (
    <div className={`grid ${GRID} items-end gap-2 px-2 pb-2`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#647c97]">Exame</div>
      <div className="text-center text-[10px] font-bold uppercase tracking-wide text-[#647c97]">Unid.</div>
      <div className="text-center text-[10px] font-bold uppercase tracking-wide text-[#647c97]">20/04</div>
      <div className="text-center text-[10px] font-bold uppercase tracking-wide text-[#647c97]">20/05</div>
      <div className="text-center text-[10px] font-bold uppercase tracking-wide text-[#16294a]">25/06</div>
      <div className="text-center text-[10px] font-bold uppercase tracking-[0.12em] text-[#647c97]">Faixa atual (terços)</div>
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

export function Exames() {
  const [selecionado, setSelecionado] = useState(0);
  const [mostrarFaixas, setMostrarFaixas] = useState(false);
  const [filtroZona, setFiltroZona] = useState<ZonaNome | null>("ruim");

  const d = ANALITOS[selecionado];
  const p0 = d.pontos[0];
  const pl = d.pontos[d.pontos.length - 1];
  const cfgD = TEND[d.tend];

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

        <div className="grid grid-cols-[380px_1fr] items-start gap-6">
          {/* LATERAL ESQUERDA: gráfico fixo (acompanha a rolagem) */}
          <aside className="sticky top-4 flex flex-col gap-3 self-start">
            <section className="panel-3d p-4">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <div className="text-[14px] font-bold leading-tight text-[#16294a]">{d.nome}</div>
                  <div className="text-[10px] uppercase tracking-wide text-[#647c97]">{d.unidade} · {d.direcao}</div>
                </div>
                <div className="bevel-3d flex items-center gap-1.5 px-2.5 py-1">
                  <span className={`paxter-led ${cfgD.led} paxter-led-on`} />
                  <span className={`text-[11px] font-bold uppercase tracking-wide ${cfgD.cor}`}>{cfgD.rotulo}</span>
                </div>
              </div>
              <div className="screen-3d p-2">
                <LineChart a={d} />
              </div>
            </section>

            <div className="grid grid-cols-2 gap-3">
              <div className="screen-3d px-3 py-2.5">
                <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#647c97]">Valor atual</div>
                <div className="mt-1 flex items-end gap-1">
                  <span className="text-3xl font-bold leading-none text-[#16294a]">{pl.valor}</span>
                  <span className="mb-0.5 text-[11px] text-[#647c97]">{d.unidade}</span>
                </div>
              </div>
              <div className="screen-3d px-3 py-2.5">
                <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#647c97]">Faixa atual</div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded-[3px]" style={{ background: ZCOR[d.zonaAtual].cor }} />
                  <span className="text-[15px] font-bold" style={{ color: ZCOR[d.zonaAtual].cor }}>{ZCOR[d.zonaAtual].rotulo}</span>
                </div>
                <div className="mt-1.5"><ZonaBar a={d} /></div>
              </div>
            </div>

            <div className="concave-3d px-4 py-2.5 text-[11px] italic text-[#647c97]">
              Saiu de {p0.valor} (faixa {ZCOR[zonaDe(d, p0.valor)].rotulo}) para {pl.valor} {d.unidade} (faixa {ZCOR[zonaDe(d, pl.valor)].rotulo}).
            </div>
          </aside>

          {/* DIREITA: planilha ÚNICA — clicável + faixinhas + acender faixa */}
          <section className="panel-3d p-5">
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

            <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[#647c97]">
              <MousePointerClick className="h-3.5 w-3.5" /> Clique num exame para o gráfico ao lado mudar
            </div>

            <Cabecalho />
            <div className="space-y-2">
              {ANALITOS.map((a, i) => (
                <Linha
                  key={a.nome}
                  a={a}
                  showStrip={mostrarFaixas}
                  neonZona={filtroZona}
                  onClick={() => setSelecionado(i)}
                  selecionada={i === selecionado}
                />
              ))}
            </div>

            <p className="mt-4 text-[11px] italic text-[#647c97]">
              Uma planilha só: clique numa linha para trocar o gráfico ao lado; use "Acender faixa" para o "neon"
              envolver, em todas as datas, só os valores daquela faixa; o interruptor liga a faixinha de cor por valor.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
