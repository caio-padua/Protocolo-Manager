import "./_group.css";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Beaker,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Download,
  Droplet,
  FileText,
  FlaskConical,
  HeartPulse,
  Microscope,
  PenLine,
  Pill,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Syringe,
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
   Helpers de bloco (vocabulario Paxter)
   ============================================================ */
function TituloBloco({ Icon, texto, cor = "#16294a" }: { Icon: typeof Activity; texto: string; cor?: string }) {
  return (
    <div className="bevel-3d mb-3 flex items-center gap-2 px-3 py-2">
      <Icon className="h-4 w-4" style={{ color: cor }} />
      <span className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: cor }}>
        {texto}
      </span>
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
   Coluna esquerda — quadro clinico
   ============================================================ */
type Achado = { nome: string; grau: "alta" | "media"; nota?: string };

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

type Medicacao = { nome: string; dose: string; via: string; posologia: string[] };
const MEDICACOES: Medicacao[] = [
  { nome: "Captopril 25 mg", dose: "1 comprimido", via: "Via oral", posologia: ["08h00", "20h00"] },
  { nome: "Metformina 850 mg", dose: "1 comprimido", via: "Via oral", posologia: ["Almoço", "Jantar"] },
  { nome: "Levotiroxina 50 mcg", dose: "1 comprimido", via: "Via oral", posologia: ["Jejum"] },
  { nome: "Rosuvastatina 10 mg", dose: "1 comprimido", via: "Via oral", posologia: ["22h00"] },
];

function LinhaMedicacao({ m }: { m: Medicacao }) {
  return (
    <div className="bevel-3d px-3 py-2">
      <div className="flex items-center gap-2">
        <Pill className="h-3.5 w-3.5 shrink-0 text-[#2e86c1]" />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-[#16294a]">{m.nome}</span>
      </div>
      <div className="mt-1.5 grid grid-cols-[1fr_1fr] gap-1.5">
        <span className="concave-3d px-2 py-1 text-[10.5px] font-semibold text-[#2c3e52]">{m.dose}</span>
        <span className="concave-3d px-2 py-1 text-[10.5px] font-semibold text-[#2c3e52]">{m.via}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {m.posologia.map((p, i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded bg-[#eef4fb] px-2 py-0.5 text-[10px] font-semibold text-[#2e6da4]" style={{ border: "1px solid rgba(46,134,193,0.3)" }}>
            <span className="text-[8px] font-bold uppercase text-[#7e93a8]">{i + 1}ª</span>
            {p}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   Coluna direita — sugestoes do motor (validaveis)
   ============================================================ */
type Sugestao = { nome: string; detalhe: string; cor: string; validado: boolean };
type GrupoSugestao = { titulo: string; Icon: typeof Syringe; cor: string; itens: Sugestao[] };

const GRUPOS: GrupoSugestao[] = [
  {
    titulo: "Exames sugeridos",
    Icon: Microscope,
    cor: "#2e86c1",
    itens: [
      { nome: "Hemograma completo", detalhe: "jejum", cor: "#c0392b", validado: true },
      { nome: "TSH e T4 livre", detalhe: "—", cor: "#8e44ad", validado: true },
      { nome: "Insulina e HOMA-IR", detalhe: "jejum", cor: "#2e86c1", validado: true },
      { nome: "Vitamina D (25-OH)", detalhe: "—", cor: "#d68910", validado: false },
    ],
  },
  {
    titulo: "Injetáveis intramusculares",
    Icon: Syringe,
    cor: "#8e44ad",
    itens: [
      { nome: "Vitamina B12 (cianocobalamina)", detalhe: "5.000 mcg · semanal", cor: "#8e44ad", validado: true },
      { nome: "Complexo B", detalhe: "2 mL · semanal", cor: "#9b59b6", validado: false },
    ],
  },
  {
    titulo: "Injetáveis subcutâneos",
    Icon: Droplet,
    cor: "#1f9bbf",
    itens: [
      { nome: "Tirzepatida", detalhe: "2,5 mg · semanal", cor: "#1f9bbf", validado: true },
      { nome: "Glutationa", detalhe: "300 mg · 2x semana", cor: "#16a085", validado: false },
    ],
  },
  {
    titulo: "Implantes",
    Icon: CircleDot,
    cor: "#b7950b",
    itens: [{ nome: "Gestrinona", detalhe: "implante · 90 dias", cor: "#b7950b", validado: false }],
  },
  {
    titulo: "Fórmulas / manipulados",
    Icon: FlaskConical,
    cor: "#1e8449",
    itens: [
      { nome: "NAD+ sublingual", detalhe: "uso diário", cor: "#1e8449", validado: true },
      { nome: "Resveratrol + Quercetina", detalhe: "1 cápsula/dia", cor: "#27ae60", validado: false },
    ],
  },
];

function ItemSugestao({ s }: { s: Sugestao }) {
  return (
    <div className="bevel-3d flex items-center gap-2.5 px-2.5 py-1.5">
      <span className="h-3.5 w-3.5 shrink-0 rounded-[3px]" style={{ background: s.cor, boxShadow: "inset 0 1px 1px rgba(255,255,255,0.5), 0 0 0 1px rgba(0,0,0,0.12)" }} />
      <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[#16294a]">{s.nome}</span>
      <span className="shrink-0 text-[10px] font-medium text-[#647c97]">{s.detalhe}</span>
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[3px]"
        style={
          s.validado
            ? { background: "linear-gradient(180deg,#3fbf6a,#1e8449)", border: "1px solid #166938" }
            : { background: "#fff", border: "1px solid rgba(184,146,77,0.6)", boxShadow: "inset 0 2px 4px rgba(7,22,43,0.18)" }
        }
      >
        {s.validado && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
      </span>
    </div>
  );
}

function GrupoMotor({ g }: { g: GrupoSugestao }) {
  const aprovados = g.itens.filter((i) => i.validado).length;
  return (
    <section className="panel-3d-sub px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <g.Icon className="h-4 w-4" style={{ color: g.cor }} />
          <span className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: g.cor }}>
            {g.titulo}
          </span>
        </div>
        <span className="concave-3d px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#647c97]">
          {aprovados}/{g.itens.length}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {g.itens.map((s) => (
          <ItemSugestao key={s.nome} s={s} />
        ))}
      </div>
    </section>
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
          {/* Seletor de medico responsavel (varios medicos) */}
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
        {/* ===== Cabecalho do paciente (grade imaginaria) ===== */}
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
            <div className="concave-3d flex flex-col justify-center px-2.5 py-1.5">
              <div className="mb-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-[#647c97]">Alerta clínico</div>
              <div className="flex items-center gap-1.5">
                <span className="paxter-led paxter-led-amber paxter-led-on" />
                <span className="text-[12px] font-bold text-amber-700">ATENÇÃO</span>
              </div>
            </div>
            <MetaField label="Origem" value="Mega Anamnese" />
          </div>
        </section>

        {/* ===== 3 COLUNAS ===== */}
        <div className="grid grid-cols-[1.02fr_1.12fr_1fr] gap-5">
          {/* -------- COLUNA ESQUERDA: quadro clinico -------- */}
          <div className="flex flex-col gap-5">
            <section className="panel-3d px-4 py-4">
              <TituloBloco Icon={HeartPulse} texto="Doenças diagnosticadas" cor="#c0392b" />
              <div className="concave-3d flex flex-col gap-2 p-2">
                <ItemDoenca a={{ nome: "Hipotireoidismo", grau: "alta" }} />
                <ItemDoenca a={{ nome: "Resistência à insulina", grau: "alta" }} />
                <ItemDoenca a={{ nome: "Dislipidemia", grau: "media" }} />
              </div>
            </section>

            <section className="panel-3d px-4 py-4">
              <TituloBloco Icon={Activity} texto="Hipóteses diagnósticas" cor="#9a6b12" />
              <div className="concave-3d flex flex-col gap-2 p-2">
                <ItemDoenca a={{ nome: "Síndrome metabólica", grau: "media" }} hipotese />
                <ItemDoenca a={{ nome: "Apneia do sono", grau: "media" }} hipotese />
              </div>
            </section>

            <section className="panel-3d px-4 py-4">
              <TituloBloco Icon={Pill} texto="Medicações em uso" cor="#2e86c1" />
              <div className="flex flex-col gap-2">
                {MEDICACOES.map((m) => (
                  <LinhaMedicacao key={m.nome} m={m} />
                ))}
              </div>
            </section>
          </div>

          {/* -------- COLUNA CENTRAL: resumo + IA -------- */}
          <div className="flex flex-col gap-5">
            <section className="panel-3d px-4 py-4">
              <TituloBloco Icon={ScrollText} texto="Resumo da anamnese" cor="#16294a" />
              <div className="concave-3d flex flex-col gap-2 p-3">
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

            {/* FAIXA DA IA */}
            <section
              className="panel-3d px-4 py-4"
              style={{ borderColor: "rgba(106,120,196,0.55)", borderWidth: 2 }}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="bevel-3d flex items-center gap-2 px-3 py-2">
                  <Sparkles className="h-4 w-4 text-[#5b67c4]" />
                  <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#3a4a8a]">Assistente de IA — organização clínica</span>
                </div>
                <span className="rounded bg-[#eceefb] px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-[#5b67c4]" style={{ border: "1px solid rgba(91,103,196,0.4)" }}>
                  Revisar
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <QuadranteIA
                  titulo="Queixa principal"
                  bullets={["Fadiga + sono ruim", "Baixo rendimento diário"]}
                />
                <QuadranteIA
                  titulo="Achados-chave"
                  bullets={["TSH provável elevado", "Padrão de resistência insulínica"]}
                />
                <QuadranteIA
                  titulo="Correlação exames ↔ sintomas"
                  bullets={["Vitamina D baixa explica parte da fadiga", "Perfil lipídico a confirmar"]}
                />
                <QuadranteIA
                  titulo="Pontos de atenção"
                  bullets={["Pressão limítrofe (Captopril)", "Reavaliar dose de Levotiroxina"]}
                />
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-[10.5px] italic text-[#647c97]">
                <AlertTriangle className="h-3.5 w-3.5 text-[#5b67c4]" />
                Texto gerado por inteligência artificial a partir da anamnese e exames. Requer revisão e validação do médico.
              </p>
            </section>
          </div>

          {/* -------- COLUNA DIREITA: sugestoes do motor -------- */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#16294a]">Sugestões do motor</span>
              <span className="text-[10px] text-[#647c97]">marque para validar</span>
            </div>
            {GRUPOS.map((g) => (
              <GrupoMotor key={g.titulo} g={g} />
            ))}
          </div>
        </div>

        {/* ===== PRONTUARIO MEDICO ===== */}
        <section className="panel-3d mt-5 px-5 py-4">
          <TituloBloco Icon={FileText} texto="Prontuário médico — Maria Silva Santos" cor="#16294a" />
          <div className="grid grid-cols-[1fr_1fr] gap-5">
            {/* Visualizador de PDF */}
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

            {/* Campo de digitacao + assinatura */}
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

              {/* Assinatura digital (JPEG do cadastro do medico) */}
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
        <section className="panel-3d mt-5 flex items-center justify-between gap-4 px-5 py-4">
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
            <button type="button" className="btn-3d inline-flex items-center gap-2 px-6 py-2.5 text-[13px] font-bold uppercase tracking-wide">
              <CheckCircle2 className="h-4 w-4" /> Aprovar tudo e enviar
            </button>
          </div>
        </section>

        <p className="mt-6 text-center text-[10px] uppercase tracking-[0.2em] text-[#9aa9bd]">
          Padcon Conect · Motor de Encantamento · Mesa de Validação Clínica
        </p>
      </main>
    </div>
  );
}

export default MesaValidacao;
