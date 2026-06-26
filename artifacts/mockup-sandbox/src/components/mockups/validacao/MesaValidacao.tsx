import "./_group.css";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Beaker,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Download,
  Droplet,
  Droplets,
  FileText,
  FlaskConical,
  HeartPulse,
  Maximize2,
  Microscope,
  PenLine,
  Pill,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Syringe,
  TestTube2,
  User,
} from "lucide-react";

/* ============================================================
   Selo PAXTER (serifado, ouro)
   ============================================================ */
function Selo({ size = 18 }: { size?: number }) {
  return (
    <span
      className="font-serif font-semibold tracking-[0.16em]"
      style={{ fontSize: size, color: "#e7cd8f", textShadow: "0 1px 0 rgba(0,0,0,0.45)" }}
    >
      PAXTER
    </span>
  );
}

/* ============================================================
   Cabecalho de bloco — pilula de titulo + botao maximizar
   ============================================================ */
function BotaoMax() {
  return (
    <button
      type="button"
      title="Maximizar"
      className="btn-3d-soft flex h-7 w-7 shrink-0 items-center justify-center"
    >
      <Maximize2 className="h-3.5 w-3.5 text-[#647c97]" />
    </button>
  );
}

function CabecalhoBloco({ Icon, texto, cor = "#16294a" }: { Icon: typeof Activity; texto: string; cor?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <div className="bevel-3d flex items-center gap-2 px-3 py-2">
        <Icon className="h-4 w-4" style={{ color: cor }} />
        <span className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: cor }}>
          {texto}
        </span>
      </div>
      <BotaoMax />
    </div>
  );
}

function MetaField({ label, value, Icon }: { label: string; value: string | null; Icon?: typeof User }) {
  const vazio = value == null || value === "";
  return (
    <div className="concave-3d min-w-0 px-2.5 py-1.5">
      <div className="mb-0.5 text-[9px] font-bold uppercase leading-none tracking-[0.14em] text-[#647c97]">{label}</div>
      <div className="flex min-w-0 items-center gap-1.5 text-[12px] font-semibold leading-none text-[#16294a]">
        {Icon && !vazio && <Icon className="h-3 w-3 shrink-0 text-[#647c97]" />}
        <span className={`truncate ${vazio ? "text-[#a9b6c8]" : ""}`}>{vazio ? "—" : value}</span>
      </div>
    </div>
  );
}

/* ============================================================
   Quadro clinico — doencas / hipoteses
   ============================================================ */
type Achado = { nome: string; grau: "alta" | "media" };

function ItemDoenca({ a, hipotese = false }: { a: Achado; hipotese?: boolean }) {
  const led = a.grau === "alta" ? "paxter-led-red" : "paxter-led-amber";
  return (
    <div className="bevel-3d flex items-center gap-2.5 px-3 py-2" style={hipotese ? { opacity: 0.92 } : undefined}>
      <span className={`paxter-led ${led} paxter-led-on shrink-0`} />
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-[#16294a]">{a.nome}</span>
      {hipotese ? (
        <span className="shrink-0 rounded bg-[#fff3d6] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#9a6b12]">
          Hipótese
        </span>
      ) : (
        <span className="shrink-0 rounded bg-[#fdecea] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#c0392b]">
          Confirmado
        </span>
      )}
    </div>
  );
}

/* ============================================================
   Medicacoes em uso — dose + via + periodo + horario (tomadas)
   ============================================================ */
type Tomada = { dose: string; periodo: string; hora: string };
type Medicacao = { nome: string; via: string; tomadas: Tomada[] };

const MEDICACOES: Medicacao[] = [
  { nome: "Levotiroxina 50 mcg", via: "VO", tomadas: [{ dose: "1 comp", periodo: "Em Jejum", hora: "07h00" }] },
  {
    nome: "Captopril 25 mg",
    via: "VO",
    tomadas: [
      { dose: "1 comp", periodo: "Manhã", hora: "08h00" },
      { dose: "1 comp", periodo: "Noite", hora: "20h00" },
    ],
  },
  {
    nome: "Prednisona 5 mg",
    via: "VO",
    tomadas: [
      { dose: "2 comp", periodo: "Manhã", hora: "08h00" },
      { dose: "1 comp", periodo: "À tarde", hora: "14h00" },
    ],
  },
  {
    nome: "Metformina 850 mg",
    via: "VO",
    tomadas: [
      { dose: "1 comp", periodo: "Almoço", hora: "12h00" },
      { dose: "1 comp", periodo: "Jantar", hora: "19h00" },
    ],
  },
];

function LinhaMedicacao({ m }: { m: Medicacao }) {
  return (
    <div className="bevel-3d px-3 py-2">
      <div className="flex items-center gap-2">
        <Pill className="h-3.5 w-3.5 shrink-0 text-[#2e86c1]" />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-[#16294a]">{m.nome}</span>
        <span className="shrink-0 rounded bg-[#eef4fb] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#2e6da4]" style={{ border: "1px solid rgba(46,134,193,0.3)" }}>
          {m.via}
        </span>
      </div>
      {/* tomadas alinhadas em colunas verticais: dose | periodo | horario */}
      <div className="concave-3d mt-1.5 flex flex-col gap-1 p-1.5">
        {m.tomadas.map((t, i) => (
          <div key={i} className="grid grid-cols-[58px_1fr_52px] items-center gap-2">
            <span className="rounded bg-white px-1.5 py-0.5 text-center text-[10.5px] font-bold text-[#16294a]" style={{ border: "1px solid rgba(46,134,193,0.25)" }}>
              {t.dose}
            </span>
            <span className="text-[10.5px] font-semibold text-[#2c3e52]">{t.periodo}</span>
            <span className="text-right text-[10px] font-medium text-[#647c97]">{t.hora}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   Resultado dos exames recebidos
   ============================================================ */
type ResultadoExame = { nome: string; valor: string; ref: string; status: "alto" | "baixo" | "normal" };
const RESULTADOS: ResultadoExame[] = [
  { nome: "TSH", valor: "6,8 mUI/L", ref: "0,4 – 4,0", status: "alto" },
  { nome: "Glicose (jejum)", valor: "108 mg/dL", ref: "70 – 99", status: "alto" },
  { nome: "Insulina", valor: "18 µUI/mL", ref: "2,6 – 24,9", status: "normal" },
  { nome: "Vitamina D (25-OH)", valor: "22 ng/mL", ref: "30 – 100", status: "baixo" },
  { nome: "Colesterol LDL", valor: "162 mg/dL", ref: "< 130", status: "alto" },
  { nome: "Hemoglobina", valor: "13,5 g/dL", ref: "12 – 16", status: "normal" },
];

function LinhaResultado({ r }: { r: ResultadoExame }) {
  const led = r.status === "normal" ? "paxter-led-green" : r.status === "alto" ? "paxter-led-red" : "paxter-led-amber";
  const cor = r.status === "normal" ? "#1e8449" : r.status === "alto" ? "#c0392b" : "#9a6b12";
  const rotulo = r.status === "normal" ? "Normal" : r.status === "alto" ? "Alto" : "Baixo";
  return (
    <div className="bevel-3d grid grid-cols-[14px_1fr_104px_92px_72px] items-center gap-2 px-3 py-2">
      <span className={`paxter-led ${led} paxter-led-on shrink-0`} />
      <span className="min-w-0 truncate text-[12px] font-bold text-[#16294a]">{r.nome}</span>
      <span className="text-[11.5px] font-semibold text-[#2c3e52]">{r.valor}</span>
      <span className="text-[10px] font-medium text-[#647c97]">ref {r.ref}</span>
      <span className="rounded px-1.5 py-0.5 text-center text-[9px] font-bold uppercase tracking-wide" style={{ color: cor, background: "#fff", border: `1px solid ${cor}55` }}>
        {rotulo}
      </span>
    </div>
  );
}

/* ============================================================
   Sugestoes do motor — exames / injetaveis / formulas
   ============================================================ */
type ExameSug = { nome: string; preparo: string; validado: boolean; cor: string };
const EXAMES_SUG: ExameSug[] = [
  { nome: "Hemograma completo", preparo: "jejum", validado: true, cor: "#c0392b" },
  { nome: "TSH e T4 livre", preparo: "sem preparo", validado: true, cor: "#8e44ad" },
  { nome: "Insulina e HOMA-IR", preparo: "jejum", validado: true, cor: "#2e86c1" },
  { nome: "Ferritina e saturação", preparo: "jejum", validado: false, cor: "#d68910" },
];

function ChkValidado({ on }: { on: boolean }) {
  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[3px]"
      style={
        on
          ? { background: "linear-gradient(180deg,#3fbf6a,#1e8449)", border: "1px solid #166938" }
          : { background: "#fff", border: "1px solid rgba(184,146,77,0.6)", boxShadow: "inset 0 2px 4px rgba(7,22,43,0.18)" }
      }
    >
      {on && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
    </span>
  );
}

function LinhaExameSug({ e }: { e: ExameSug }) {
  return (
    <div className="bevel-3d grid grid-cols-[14px_1fr_96px_16px_20px] items-center gap-2 px-3 py-1.5">
      <span className="h-3.5 w-3.5 shrink-0 rounded-[3px]" style={{ background: e.cor, boxShadow: "inset 0 1px 1px rgba(255,255,255,0.5), 0 0 0 1px rgba(0,0,0,0.12)" }} />
      <span className="min-w-0 truncate text-[12px] font-semibold text-[#16294a]">{e.nome}</span>
      <span className="text-[10px] font-medium text-[#647c97]">{e.preparo}</span>
      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-[#a9883f]" />
      <ChkValidado on={e.validado} />
    </div>
  );
}

/* Injetaveis / implantes — colunas alinhadas: DOSE | SESSOES | FREQUENCIA (ordem do CEO) */
type Inj = { nome: string; sessoes: string; dose: string; intervalo: string; cor: string; validado: boolean };
type GrupoInj = { titulo: string; Icon: typeof Syringe; cor: string; itens: Inj[] };
const GRUPOS_INJ: GrupoInj[] = [
  {
    titulo: "Endovenosos (soros)",
    Icon: Droplets,
    cor: "#b03a2e",
    itens: [
      { nome: "Vitamina C endovenosa", sessoes: "8 sessões", dose: "15 g", intervalo: "7/7 dias", cor: "#b03a2e", validado: true },
      { nome: "Glutationa endovenosa", sessoes: "6 sessões", dose: "600 mg", intervalo: "7/7 dias", cor: "#cb4335", validado: false },
      { nome: "Soro de Myers (polivitamínico)", sessoes: "4 sessões", dose: "infusão", intervalo: "15/15 dias", cor: "#922b21", validado: false },
    ],
  },
  {
    titulo: "Intramusculares",
    Icon: Syringe,
    cor: "#8e44ad",
    itens: [
      { nome: "Vitamina B12 (cianocobalamina)", sessoes: "8 sessões", dose: "5.000 mcg", intervalo: "7/7 dias", cor: "#8e44ad", validado: true },
      { nome: "Complexo B", sessoes: "6 sessões", dose: "2 mL", intervalo: "7/7 dias", cor: "#9b59b6", validado: false },
    ],
  },
  {
    titulo: "Subcutâneos",
    Icon: Droplet,
    cor: "#1f9bbf",
    itens: [
      { nome: "Tirzepatida", sessoes: "12 sessões", dose: "2,5 mg", intervalo: "7/7 dias", cor: "#1f9bbf", validado: true },
      { nome: "Glutationa", sessoes: "10 sessões", dose: "300 mg", intervalo: "3/3 dias", cor: "#16a085", validado: false },
    ],
  },
  {
    titulo: "Implantes",
    Icon: CircleDot,
    cor: "#b7950b",
    itens: [
      { nome: "Gestrinona", sessoes: "1 implante", dose: "—", intervalo: "libera 90d", cor: "#b7950b", validado: false },
      { nome: "Testosterona", sessoes: "1 implante", dose: "—", intervalo: "libera 180d", cor: "#9a7d0a", validado: false },
    ],
  },
];

const COLS_INJ = "grid grid-cols-[14px_1fr_92px_82px_92px_16px_20px] items-center gap-2";

function LinhaInjetavel({ i }: { i: Inj }) {
  return (
    <div className={`bevel-3d px-3 py-1.5 ${COLS_INJ}`}>
      <span className="h-3.5 w-3.5 shrink-0 rounded-[3px]" style={{ background: i.cor, boxShadow: "inset 0 1px 1px rgba(255,255,255,0.5), 0 0 0 1px rgba(0,0,0,0.12)" }} />
      <span className="min-w-0 truncate text-[12px] font-semibold text-[#16294a]">{i.nome}</span>
      <span className="text-[10.5px] font-bold text-[#16294a]">{i.dose}</span>
      <span className="text-[10.5px] font-semibold text-[#2c3e52]">{i.sessoes}</span>
      <span className="text-[10.5px] font-semibold text-[#2c3e52]">{i.intervalo}</span>
      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-[#a9883f]" />
      <ChkValidado on={i.validado} />
    </div>
  );
}

type Formula = { nome: string; posologia: string; duracao: string; cor: string; validado: boolean };
const FORMULAS: Formula[] = [
  { nome: "NAD+ sublingual", posologia: "1 dose/dia", duracao: "60 dias", cor: "#1e8449", validado: true },
  { nome: "Resveratrol + Quercetina", posologia: "1 cáp/dia", duracao: "90 dias", cor: "#27ae60", validado: false },
];

function LinhaFormula({ f }: { f: Formula }) {
  return (
    <div className="bevel-3d grid grid-cols-[14px_1fr_82px_92px_16px_20px] items-center gap-2 px-3 py-1.5">
      <span className="h-3.5 w-3.5 shrink-0 rounded-[3px]" style={{ background: f.cor, boxShadow: "inset 0 1px 1px rgba(255,255,255,0.5), 0 0 0 1px rgba(0,0,0,0.12)" }} />
      <span className="min-w-0 truncate text-[12px] font-semibold text-[#16294a]">{f.nome}</span>
      <span className="text-[10.5px] font-bold text-[#16294a]">{f.posologia}</span>
      <span className="text-[10.5px] font-semibold text-[#2c3e52]">{f.duracao}</span>
      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-[#a9883f]" />
      <ChkValidado on={f.validado} />
    </div>
  );
}

/* ============================================================
   Faixa da IA — areas fixas
   ============================================================ */
function QuadranteIA({ titulo, bullets }: { titulo: string; bullets: string[] }) {
  return (
    <div className="concave-3d px-3 py-2.5">
      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#3a4a8a]">{titulo}</div>
      <ul className="flex flex-col gap-1">
        {bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-1.5 text-[11.5px] leading-snug text-[#2c3e52]">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "#6a78c4" }} />
            {b}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* mini-titulo de grupo (dentro de uma faixa) */
function MiniTitulo({ Icon, texto, cor, contagem }: { Icon: typeof Syringe; texto: string; cor: string; contagem: string }) {
  return (
    <div className="mb-1.5 mt-2 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" style={{ color: cor }} />
        <span className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: cor }}>
          {texto}
        </span>
      </div>
      <span className="concave-3d px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#647c97]">{contagem}</span>
    </div>
  );
}

/* ============================================================
   TELA — Mesa de Validacao Clinica
   ============================================================ */
export function MesaValidacao() {
  return (
    <div className="cockpit-root min-h-screen w-full font-sans">
      {/* ===== Barra de topo navy ===== */}
      <header
        className="flex items-center justify-between px-7 py-3"
        style={{ background: "linear-gradient(180deg,#1b3260 0%,#16294a 60%,#101f3a 100%)", borderBottom: "1px solid rgba(231,205,143,0.35)" }}
      >
        <div className="flex items-center gap-4">
          <Selo />
          <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-slate-300">
            <ArrowLeft className="h-3.5 w-3.5" /> Fila de validação
          </span>
          <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-white">
            <ShieldCheck className="h-4 w-4 text-[#e7cd8f]" /> Mesa de Validação Clínica
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-md bg-[#0e1c34] px-3 py-1.5" style={{ border: "1px solid rgba(231,205,143,0.30)" }}>
            <Stethoscope className="h-3.5 w-3.5 text-[#e7cd8f]" />
            <div className="leading-tight">
              <div className="text-[8px] uppercase tracking-wide text-slate-400">Médico responsável</div>
              <div className="text-[12px] font-semibold text-white">Dr. Caio Pádua</div>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </div>
        </div>
      </header>

      <main className="px-7 py-6">
        {/* ===== Cabecalho do paciente — alerta no ULTIMO quadradinho ===== */}
        <section className="panel-3d mb-5 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="truncate text-[22px] font-bold tracking-wide text-[#16294a]">Maria Silva Santos</h1>
              <p className="mt-0.5 text-[11.5px] text-[#647c97]">Protocolo de longevidade · gerado pela Mega Anamnese</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide"
                style={{ background: "linear-gradient(180deg,#fff5da,#f3e3b6)", color: "#8a6a1f", border: "1px solid rgba(184,146,77,0.6)" }}
              >
                Aguardando validação
              </span>
              <span className="rounded bg-[#16294a] px-2 py-1 font-mono text-[10px] font-bold tracking-wider text-[#e7cd8f]">#VE-0142</span>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-6 gap-2">
            <MetaField label="Idade" value="47 anos" Icon={User} />
            <MetaField label="CPF" value="123.456.789-00" />
            <MetaField label="Anamnese em" value="24/06/2026" />
            <MetaField label="Médico designado" value="Dr. Caio Pádua" Icon={Stethoscope} />
            <MetaField label="Origem" value="Mega Anamnese" />
            <div className="concave-3d flex flex-col justify-center px-2.5 py-1.5">
              <div className="mb-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-[#647c97]">Alerta clínico</div>
              <div className="flex items-center gap-1.5">
                <span className="paxter-led paxter-led-amber paxter-led-on" />
                <span className="text-[12px] font-bold text-amber-700">ATENÇÃO</span>
              </div>
            </div>
          </div>
        </section>

        {/* ===== FAIXA 1: Doencas | Hipoteses | Medicacoes em uso ===== */}
        <div className="mb-5 grid grid-cols-3 gap-5">
          <section className="panel-3d flex flex-col px-4 py-4">
            <CabecalhoBloco Icon={HeartPulse} texto="Doenças diagnosticadas" cor="#c0392b" />
            <div className="concave-3d flex flex-col gap-2 p-2">
              <ItemDoenca a={{ nome: "Hipotireoidismo", grau: "alta" }} />
              <ItemDoenca a={{ nome: "Resistência à insulina", grau: "alta" }} />
              <ItemDoenca a={{ nome: "Dislipidemia", grau: "media" }} />
            </div>
          </section>

          <section className="panel-3d flex flex-col px-4 py-4">
            <CabecalhoBloco Icon={Activity} texto="Hipóteses diagnósticas" cor="#9a6b12" />
            <div className="concave-3d flex flex-col gap-2 p-2">
              <ItemDoenca a={{ nome: "Síndrome metabólica", grau: "media" }} hipotese />
              <ItemDoenca a={{ nome: "Apneia do sono", grau: "media" }} hipotese />
            </div>
          </section>

          <section className="panel-3d flex flex-col px-4 py-4">
            <CabecalhoBloco Icon={Pill} texto="Medicações em uso" cor="#2e86c1" />
            <div className="flex flex-col gap-2">
              {MEDICACOES.map((m) => (
                <LinhaMedicacao key={m.nome} m={m} />
              ))}
            </div>
          </section>
        </div>

        {/* ===== FAIXA 2: Resumo da anamnese (cheia) ===== */}
        <section className="panel-3d mb-5 px-5 py-4">
          <CabecalhoBloco Icon={ScrollText} texto="Resumo da anamnese" cor="#16294a" />
          <div className="concave-3d grid grid-cols-2 gap-x-6 gap-y-2 p-3">
            {[
              "Queixa de cansaço persistente e sono não reparador há 6 meses.",
              "Ganho de 6 kg no último ano, dificuldade de emagrecer.",
              "Histórico familiar de tireoide (mãe) e diabetes (pai).",
              "Pratica caminhada 2x/semana; deseja iniciar longevidade.",
            ].map((t, i) => (
              <div key={i} className="flex items-start gap-2 text-[12.5px] leading-snug text-[#2c3e52]">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#16294a]" />
                {t}
              </div>
            ))}
          </div>
        </section>

        {/* ===== FAIXA 3: Resumo da IA (cheia) ===== */}
        <section className="panel-3d mb-5 px-5 py-4" style={{ borderColor: "rgba(106,120,196,0.55)", borderWidth: 2 }}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="bevel-3d flex items-center gap-2 px-3 py-2">
              <Sparkles className="h-4 w-4 text-[#5b67c4]" />
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#3a4a8a]">Resumo da IA — organização clínica</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-[#eceefb] px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-[#5b67c4]" style={{ border: "1px solid rgba(91,103,196,0.4)" }}>
                Revisar
              </span>
              <BotaoMax />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2.5">
            <QuadranteIA titulo="Queixa principal" bullets={["Fadiga + sono ruim", "Baixo rendimento diário"]} />
            <QuadranteIA titulo="Achados-chave" bullets={["TSH provável elevado", "Padrão de resistência insulínica"]} />
            <QuadranteIA titulo="Correlação exames ↔ sintomas" bullets={["Vitamina D baixa explica parte da fadiga", "LDL elevado a tratar"]} />
            <QuadranteIA titulo="Pontos de atenção" bullets={["Pressão limítrofe (Captopril)", "Reavaliar dose de Levotiroxina"]} />
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[10.5px] italic text-[#647c97]">
            <AlertTriangle className="h-3.5 w-3.5 text-[#5b67c4]" />
            Texto gerado por inteligência artificial a partir da anamnese e exames. Requer revisão e validação do médico.
          </p>
        </section>

        {/* ===== FAIXA 4: Resultado dos exames recebidos (cheia) ===== */}
        <section className="panel-3d mb-5 px-5 py-4">
          <CabecalhoBloco Icon={TestTube2} texto="Resultado dos exames recebidos" cor="#1f618d" />
          <div className="grid grid-cols-2 gap-x-5 gap-y-2">
            {RESULTADOS.map((r) => (
              <LinhaResultado key={r.nome} r={r} />
            ))}
          </div>
        </section>

        {/* ===== FAIXA 5: Sugestoes de prescricao (cheia) ===== */}
        <section className="panel-3d mb-5 px-5 py-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="bevel-3d flex items-center gap-2 px-3 py-2">
              <Beaker className="h-4 w-4 text-[#16294a]" />
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#16294a]">Sugestões do motor — prescrição</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-[10px] text-[#647c97]">
                marque para validar · <ArrowUpRight className="h-3 w-3 text-[#a9883f]" /> abre no módulo de prescrição
              </span>
              <BotaoMax />
            </div>
          </div>

          {/* FAIXAS empilhadas (uma embaixo da outra) — pedido do CEO */}
          <div className="flex flex-col gap-4">
            {/* faixa: exames sugeridos */}
            <div>
              <MiniTitulo Icon={Microscope} texto="Exames sugeridos" cor="#2e86c1" contagem={`${EXAMES_SUG.filter((e) => e.validado).length}/${EXAMES_SUG.length}`} />
              <div className="flex flex-col gap-1.5">
                {EXAMES_SUG.map((e) => (
                  <LinhaExameSug key={e.nome} e={e} />
                ))}
              </div>
            </div>

            {/* faixa: formulas / manipulados */}
            <div>
              <MiniTitulo Icon={FlaskConical} texto="Fórmulas / manipulados" cor="#1e8449" contagem={`${FORMULAS.filter((f) => f.validado).length}/${FORMULAS.length}`} />
              <div className="flex flex-col gap-1.5">
                {FORMULAS.map((f) => (
                  <LinhaFormula key={f.nome} f={f} />
                ))}
              </div>
            </div>

            {/* injetaveis / implantes — uma faixa por via, colunas alinhadas: DOSE | SESSOES | FREQUENCIA */}
            <div className={`px-3 pb-1 ${COLS_INJ}`}>
              <span />
              <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#9fb0c4]">Item</span>
              <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#9fb0c4]">Dose (mg)</span>
              <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#9fb0c4]">Sessões</span>
              <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#9fb0c4]">Frequência</span>
              <span />
              <span />
            </div>
            {GRUPOS_INJ.map((g) => (
              <div key={g.titulo}>
                <MiniTitulo Icon={g.Icon} texto={g.titulo} cor={g.cor} contagem={`${g.itens.filter((i) => i.validado).length}/${g.itens.length}`} />
                <div className="flex flex-col gap-1.5">
                  {g.itens.map((i) => (
                    <LinhaInjetavel key={i.nome} i={i} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ===== PRONTUARIO MEDICO ===== */}
        <section className="panel-3d mb-5 px-5 py-4">
          <CabecalhoBloco Icon={FileText} texto="Prontuário médico — Maria Silva Santos" cor="#16294a" />
          <div className="grid grid-cols-[1fr_1fr] gap-5">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#647c97]">Documento gerado (PDF)</span>
                <button type="button" className="btn-3d-soft inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide">
                  <Download className="h-3.5 w-3.5" /> Baixar
                </button>
              </div>
              <div className="screen-3d px-6 py-5" style={{ minHeight: 320 }}>
                <div className="flex items-center justify-between border-b border-[#d9cdb0] pb-2">
                  <span className="font-serif text-[15px] font-bold tracking-wide text-[#16294a]">Instituto Pádua</span>
                  <span className="text-[9px] uppercase tracking-wide text-[#647c97]">Prontuário · 25/06/2026</span>
                </div>
                <div className="mt-3 space-y-2 text-[11px] leading-relaxed text-[#3a4a57]">
                  <p><strong>Cliente:</strong> Maria Silva Santos · 47 anos · CPF 123.456.789-00</p>
                  <p><strong>Hipótese / diagnóstico:</strong> Hipotireoidismo, resistência à insulina, dislipidemia.</p>
                  <p><strong>Conduta:</strong> Protocolo de longevidade com reposição de B12, NAD+ e ajuste medicamentoso. Exames solicitados conforme guia.</p>
                  <p><strong>Orientações:</strong> Retorno em 30 dias com exames. Reavaliar dose de levotiroxina.</p>
                  <p className="text-[#a9b6c8]">_________________________________________________</p>
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <div className="font-[cursive] text-[18px] italic text-[#1b3a6b]">Caio Pádua</div>
                    <div className="text-[10px] font-semibold text-[#16294a]">Dr. Caio Pádua</div>
                    <div className="text-[9px] text-[#647c97]">CRM-SP 000000 · assinado digitalmente (ICP-Brasil)</div>
                  </div>
                  <ShieldCheck className="h-9 w-9 text-[#1e8449]" />
                </div>
              </div>
            </div>

            <div className="flex flex-col">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#647c97]">Resumo da consulta (o médico digita)</span>
                <span className="flex items-center gap-1 text-[10px] text-[#647c97]"><PenLine className="h-3 w-3" /> editável</span>
              </div>
              <div className="field-engraved flex-1 px-4 py-3" style={{ minHeight: 200 }}>
                <p className="text-[12px] leading-relaxed text-[#2c3e52]">
                  Paciente em bom estado geral. Mantida hipótese de hipotireoidismo e resistência insulínica.
                  Iniciado protocolo de longevidade. Solicitados exames conforme guia. Orientada quanto à dieta
                  e atividade física. Retorno em 30 dias.
                  <span className="ml-0.5 inline-block h-4 w-px animate-pulse bg-[#16294a] align-middle" />
                </p>
              </div>

              <div className="bevel-3d mt-3 flex items-center gap-4 px-4 py-3">
                <div className="screen-3d flex h-16 w-44 items-center justify-center">
                  <span className="font-[cursive] text-[22px] italic text-[#1b3a6b]">Caio Pádua</span>
                </div>
                <div className="flex-1">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-[#647c97]">Assinatura do médico</div>
                  <div className="text-[11px] text-[#2c3e52]">Imagem JPEG vinda do cadastro do profissional + carimbo CRM.</div>
                </div>
                <button type="button" className="btn-3d inline-flex items-center gap-1.5 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide">
                  <PenLine className="h-3.5 w-3.5" /> Assinar PDF
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ===== RODAPE DE ACOES ===== */}
        <section className="panel-3d flex items-center justify-between gap-4 px-5 py-4">
          <p className="flex items-center gap-2 text-[12px] text-[#2c3e52]">
            <CheckCircle2 className="h-4 w-4 text-[#1e8449]" />
            Ao aprovar: gera a guia de exames, dispara o vídeo de orientação e assina o prontuário — tudo de uma vez.
          </p>
          <div className="flex items-center gap-3">
            <button type="button" className="btn-3d-soft inline-flex items-center gap-1.5 px-4 py-2.5 text-[12px] font-bold uppercase tracking-wide">
              <Beaker className="h-4 w-4" /> Editar sugestões
            </button>
            <button type="button" className="btn-3d-soft inline-flex items-center gap-1.5 px-4 py-2.5 text-[12px] font-bold uppercase tracking-wide">
              <ScrollText className="h-4 w-4" /> Salvar prontuário
            </button>
            <button type="button" className="btn-3d inline-flex items-center gap-1.5 px-5 py-2.5 text-[12px] font-bold uppercase tracking-wide">
              <CheckCircle2 className="h-4 w-4" /> Aprovar tudo e enviar
            </button>
          </div>
        </section>

        <p className="mt-6 text-center text-[10px] uppercase tracking-[0.2em] text-[#9fb0c4]">
          Padcon Conect · Motor de Encantamento · Mesa de Validação Clínica
        </p>
      </main>
    </div>
  );
}

export default MesaValidacao;
