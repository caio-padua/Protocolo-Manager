import "./_group.css";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CalendarCheck2,
  Minus,
  Stethoscope,
  TrendingUp,
} from "lucide-react";

type Tend = "melhorou" | "igual" | "piorou";

type Linha = {
  indicador: string;
  unidade?: string;
  base: string;
  cons2: string;
  cons3: string;
  hoje: string;
  tend: Tend;
};

const LINHAS: Linha[] = [
  { indicador: "Pressão arterial", unidade: "mmHg", base: "160/100", cons2: "145/95", cons3: "138/88", hoje: "130/85", tend: "melhorou" },
  { indicador: "Dor", unidade: "0 a 10", base: "8", cons2: "6", cons3: "4", hoje: "3", tend: "melhorou" },
  { indicador: "Peso", unidade: "kg", base: "92", cons2: "90", cons3: "89", hoje: "88", tend: "melhorou" },
  { indicador: "Energia / disposição", unidade: "0 a 10", base: "3", cons2: "4", cons3: "5", hoje: "6", tend: "melhorou" },
  { indicador: "Qualidade do sono", base: "ruim", cons2: "ruim", cons3: "regular", hoje: "boa", tend: "melhorou" },
  { indicador: "Colesterol LDL", unidade: "mg/dL", base: "180", cons2: "176", cons3: "172", hoje: "170", tend: "igual" },
  { indicador: "Nº de medicamentos", unidade: "qtd", base: "4", cons2: "4", cons3: "3", hoje: "2", tend: "melhorou" },
  { indicador: "Glicemia em jejum", unidade: "mg/dL", base: "108", cons2: "112", cons3: "115", hoje: "119", tend: "piorou" },
];

const TEND_CFG: Record<Tend, { rotulo: string; led: string; cor: string; Icon: typeof ArrowUpRight }> = {
  melhorou: { rotulo: "MELHOROU", led: "paxter-led-green", cor: "text-emerald-700", Icon: ArrowUpRight },
  igual: { rotulo: "IGUAL", led: "paxter-led-amber", cor: "text-amber-700", Icon: Minus },
  piorou: { rotulo: "PIOROU", led: "paxter-led-red", cor: "text-red-700", Icon: ArrowDownRight },
};

const GRID = "grid-cols-[minmax(220px,1.6fr)_repeat(3,1fr)_1.1fr_150px]";

function Selo() {
  return (
    <span
      className="font-serif text-[19px] font-semibold tracking-[0.16em]"
      style={{ color: "#e7cd8f", textShadow: "0 1px 0 rgba(0,0,0,0.45)" }}
    >
      PAXTER
    </span>
  );
}

export function Cockpit() {
  return (
    <div className="cockpit-root min-h-screen w-full font-sans">
      {/* Barra de topo (azul-marinho) */}
      <header
        className="flex items-center justify-between px-7 py-3"
        style={{ background: "linear-gradient(180deg,#1b3260 0%,#16294a 60%,#101f3a 100%)", borderBottom: "1px solid rgba(231,205,143,0.35)" }}
      >
        <div className="flex items-center gap-3">
          <Selo />
          <span className="text-[11px] uppercase tracking-[0.22em] text-slate-300">Motor Clínico</span>
        </div>
        <div className="text-right leading-tight">
          <div className="text-[13px] font-semibold uppercase tracking-wide text-white">Maria Silva Santos</div>
          <div className="text-[11px] text-slate-300">CPF 123.456.789-00 · 47 anos</div>
        </div>
      </header>

      {/* Abas da ficha do cliente */}
      <nav className="flex items-end gap-1 px-7 pt-3" style={{ background: "#13233f" }}>
        {["Dados", "Protocolos", "Agenda", "Financeiro", "Acompanhamento"].map((t) => {
          const ativo = t === "Acompanhamento";
          return (
            <div
              key={t}
              className={`px-4 py-2 text-[12px] font-semibold uppercase tracking-wide rounded-t-[5px] ${
                ativo ? "text-[#16294a]" : "text-slate-300"
              }`}
              style={
                ativo
                  ? { background: "hsl(40 33% 96%)", borderTop: "2px solid #e7cd8f" }
                  : { background: "rgba(255,255,255,0.04)" }
              }
            >
              {t}
            </div>
          );
        })}
      </nav>

      {/* Corpo */}
      <main className="px-7 py-6" style={{ background: "hsl(40 33% 96%)" }}>
        {/* Título do bloco */}
        <div className="bevel-3d mb-5 inline-flex items-center gap-2 px-4 py-2">
          <Activity className="h-4 w-4" style={{ color: "#9a7b32" }} />
          <span className="text-[13px] font-bold uppercase tracking-[0.14em] text-[#16294a]">
            Acompanhamento — Evolução Clínica
          </span>
        </div>

        {/* KPIs salientes */}
        <div className="mb-6 grid grid-cols-3 gap-4">
          <div className="screen-3d px-4 py-3">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#647c97]">
              <CalendarCheck2 className="h-3.5 w-3.5" /> Consultas registradas
            </div>
            <div className="mt-1 text-3xl font-bold text-[#16294a]">4</div>
          </div>
          <div className="screen-3d px-4 py-3">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#647c97]">
              <TrendingUp className="h-3.5 w-3.5" /> Evolução geral
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="paxter-led paxter-led-green paxter-led-on" />
              <span className="text-2xl font-bold text-emerald-700">Melhorando</span>
            </div>
          </div>
          <div className="screen-3d px-4 py-3">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#647c97]">
              <Stethoscope className="h-3.5 w-3.5" /> Médico responsável
            </div>
            <div className="mt-1 text-base font-semibold text-[#16294a]">Dr. Caio H. F. Pádua</div>
            <div className="text-[11px] text-[#647c97]">Última consulta: 25/06/2026</div>
          </div>
        </div>

        {/* Cockpit longitudinal */}
        <section className="panel-3d p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#16294a]">
              Linha do tempo — indicador por consulta
            </span>
            <div className="flex items-center gap-4 text-[10px] font-semibold uppercase tracking-wide">
              <span className="flex items-center gap-1.5"><span className="paxter-led paxter-led-green" /> Melhorou</span>
              <span className="flex items-center gap-1.5"><span className="paxter-led paxter-led-amber" /> Igual</span>
              <span className="flex items-center gap-1.5"><span className="paxter-led paxter-led-red" /> Piorou</span>
            </div>
          </div>

          {/* Cabeçalho da grade */}
          <div className={`grid ${GRID} gap-2 px-2 pb-2`}>
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#647c97]">Indicador</div>
            <div className="text-center text-[10px] font-bold uppercase tracking-[0.12em] text-[#647c97]">
              Linha de base<br /><span className="font-medium normal-case tracking-normal">13/02/2026</span>
            </div>
            <div className="text-center text-[10px] font-bold uppercase tracking-[0.12em] text-[#647c97]">
              Consulta 2<br /><span className="font-medium normal-case tracking-normal">27/03/2026</span>
            </div>
            <div className="text-center text-[10px] font-bold uppercase tracking-[0.12em] text-[#647c97]">
              Consulta 3<br /><span className="font-medium normal-case tracking-normal">08/05/2026</span>
            </div>
            <div className="text-center text-[10px] font-bold uppercase tracking-[0.12em] text-[#16294a]">
              Hoje<br /><span className="font-medium normal-case tracking-normal">25/06/2026</span>
            </div>
            <div className="text-center text-[10px] font-bold uppercase tracking-[0.14em] text-[#647c97]">Tendência</div>
          </div>

          {/* Linhas */}
          <div className="space-y-2">
            {LINHAS.map((l) => {
              const cfg = TEND_CFG[l.tend];
              return (
                <div key={l.indicador} className={`panel-3d-sub grid ${GRID} items-center gap-2 px-2 py-2`}>
                  <div className="px-1">
                    <div className="text-[13px] font-semibold text-[#16294a]">{l.indicador}</div>
                    {l.unidade && (
                      <div className="text-[10px] uppercase tracking-wide text-[#647c97]">{l.unidade}</div>
                    )}
                  </div>
                  <div className="concave-3d py-1.5 text-center text-[13px] font-medium text-[#3a4a63]">{l.base}</div>
                  <div className="concave-3d py-1.5 text-center text-[13px] font-medium text-[#3a4a63]">{l.cons2}</div>
                  <div className="concave-3d py-1.5 text-center text-[13px] font-medium text-[#3a4a63]">{l.cons3}</div>
                  <div className="screen-3d py-1.5 text-center text-[14px] font-bold text-[#16294a]">{l.hoje}</div>
                  <div className="bevel-3d flex items-center justify-center gap-1.5 py-1.5">
                    <span className={`paxter-led ${cfg.led} paxter-led-on`} />
                    <cfg.Icon className={`h-4 w-4 ${cfg.cor}`} />
                    <span className={`text-[10px] font-bold uppercase tracking-wide ${cfg.cor}`}>{cfg.rotulo}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-4 text-[11px] italic text-[#647c97]">
            A 1ª consulta vira a “linha de base” (vem da anamnese). Cada retorno cria uma coluna nova; o
            médico insere os dados de hoje e marca se cada item melhorou, ficou igual ou piorou.
          </p>
        </section>
      </main>
    </div>
  );
}
