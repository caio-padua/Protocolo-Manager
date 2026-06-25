import "./_group.css";
import {
  Activity,
  AlertTriangle,
  CalendarCheck2,
  ClipboardList,
  FlaskConical,
  LayoutDashboard,
  PencilLine,
  Search,
  ShieldCheck,
  Stethoscope,
  Users,
  Boxes,
  Wallet,
  Pill,
  CheckCircle2,
  Clock,
  Send,
} from "lucide-react";

/* ============================================================
   Selo / wordmark PAXTER (serifado, ouro)
   ============================================================ */
function Selo({ size = 19 }: { size?: number }) {
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
   Menu lateral (azul-marinho) — item ativo = Validacao de Exames
   ============================================================ */
type ItemMenu = { rotulo: string; Icon: typeof LayoutDashboard; ativo?: boolean; novo?: boolean };
const MENU: ItemMenu[] = [
  { rotulo: "Dashboard", Icon: LayoutDashboard },
  { rotulo: "Clientes", Icon: Users },
  { rotulo: "Protocolos", Icon: ClipboardList },
  { rotulo: "Agenda", Icon: CalendarCheck2 },
  { rotulo: "Validação de Exames", Icon: ShieldCheck, ativo: true, novo: true },
  { rotulo: "RAS", Icon: Activity },
  { rotulo: "Estoque", Icon: Boxes },
  { rotulo: "Financeiro", Icon: Wallet },
  { rotulo: "Substâncias", Icon: Pill },
  { rotulo: "Profissionais", Icon: Stethoscope },
];

function Sidebar() {
  return (
    <aside
      className="flex w-[236px] shrink-0 flex-col"
      style={{ background: "linear-gradient(180deg,#1b3260 0%,#16294a 55%,#0e1c34 100%)", borderRight: "1px solid rgba(231,205,143,0.30)" }}
    >
      <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: "1px solid rgba(231,205,143,0.20)" }}>
        <Selo size={20} />
        <span className="text-[9px] uppercase tracking-[0.22em] text-slate-400">Motor Clínico</span>
      </div>
      <nav className="flex flex-col gap-1 px-3 py-4">
        {MENU.map((m) => {
          const Icon = m.Icon;
          return (
            <div
              key={m.rotulo}
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-[12.5px] font-medium tracking-wide"
              style={
                m.ativo
                  ? {
                      color: "#16294a",
                      background: "linear-gradient(180deg,#e7cd8f 0%,#c2a05a 100%)",
                      boxShadow: "inset 0 1px 0 rgba(255,246,214,0.9), 0 6px 12px -6px rgba(0,0,0,0.5)",
                    }
                  : { color: "#c8d4e6" }
              }
            >
              <Icon className="h-[15px] w-[15px]" style={{ opacity: m.ativo ? 1 : 0.8 }} />
              <span className="flex-1">{m.rotulo}</span>
              {m.novo && (
                <span
                  className="rounded px-1.5 py-[1px] text-[8px] font-bold uppercase tracking-wide"
                  style={
                    m.ativo
                      ? { background: "#16294a", color: "#e7cd8f" }
                      : { background: "rgba(231,205,143,0.18)", color: "#e7cd8f" }
                  }
                >
                  Novo
                </span>
              )}
            </div>
          );
        })}
      </nav>
      <div className="mt-auto px-5 py-4 text-[10px] leading-relaxed text-slate-400" style={{ borderTop: "1px solid rgba(231,205,143,0.18)" }}>
        Padcon Conect · uso interno
        <br />Tatuapé · Mooca · Domiciliar
      </div>
    </aside>
  );
}

/* ============================================================
   Dados realistas da fila
   ============================================================ */
type Alerta = "verde" | "amarelo" | "vermelho";
type Exame = { nome: string; cor: string };
type Pendente = {
  id: string;
  nome: string;
  idade: number;
  cpf: string;
  dataAnamnese: string;
  medico: string;
  origem: string;
  alerta: Alerta;
  resumo: string;
  exames: Exame[];
  motivoVermelho?: string;
};

const C = {
  sangue: "#c0392b",
  hormonio: "#8e44ad",
  vitamina: "#d68910",
  metabolico: "#2e86c1",
  imagem: "#16a085",
  cardio: "#c0392b",
};

const FILA: Pendente[] = [
  {
    id: "VE-0142",
    nome: "Maria Silva Santos",
    idade: 47,
    cpf: "123.456.789-00",
    dataAnamnese: "24/06/2026",
    medico: "Dr. Caio Pádua",
    origem: "Mega Anamnese",
    alerta: "verde",
    resumo:
      "Queixa de cansaço e sono ruim. Sem comorbidades graves. Histórico familiar de tireoide. Deseja iniciar protocolo de longevidade.",
    exames: [
      { nome: "Hemograma completo", cor: C.sangue },
      { nome: "TSH e T4 livre", cor: C.hormonio },
      { nome: "Vitamina D (25-OH)", cor: C.vitamina },
      { nome: "Ferritina", cor: C.sangue },
      { nome: "Glicemia de jejum", cor: C.metabolico },
      { nome: "Perfil lipídico", cor: C.metabolico },
    ],
  },
  {
    id: "VE-0143",
    nome: "Roberto Almeida Costa",
    idade: 58,
    cpf: "987.654.321-00",
    dataAnamnese: "24/06/2026",
    medico: "Dra. Helena Martins",
    origem: "Mega Anamnese",
    alerta: "amarelo",
    resumo:
      "Hipertensão controlada. Relata dor torácica esporádica ao esforço. Pai com infarto aos 60. Acompanhamento atento sugerido.",
    exames: [
      { nome: "Perfil lipídico completo", cor: C.metabolico },
      { nome: "Troponina", cor: C.cardio },
      { nome: "Eletrocardiograma", cor: C.imagem },
      { nome: "Hemograma completo", cor: C.sangue },
      { nome: "Creatinina e ureia", cor: C.metabolico },
    ],
  },
  {
    id: "VE-0144",
    nome: "Carla Fernandes Lima",
    idade: 39,
    cpf: "456.789.123-00",
    dataAnamnese: "23/06/2026",
    medico: "Dr. Caio Pádua",
    origem: "Mega Anamnese",
    alerta: "vermelho",
    motivoVermelho:
      "Resposta de alarme na anamnese: sangramento incomum + perda de peso não intencional. Validação médica obrigatória mesmo com o motor desligado.",
    resumo:
      "Perda de 8 kg em 2 meses sem dieta. Episódios de sangramento. Astenia importante. Caso marcado como prioritário pelo motor.",
    exames: [
      { nome: "Hemograma completo", cor: C.sangue },
      { nome: "Coagulograma", cor: C.sangue },
      { nome: "Marcadores tumorais", cor: C.hormonio },
      { nome: "Ultrassom de abdome", cor: C.imagem },
      { nome: "PCR e VHS", cor: C.metabolico },
    ],
  },
  {
    id: "VE-0145",
    nome: "João Pedro Oliveira",
    idade: 33,
    cpf: "321.654.987-00",
    dataAnamnese: "23/06/2026",
    medico: "Dra. Helena Martins",
    origem: "Mega Anamnese",
    alerta: "verde",
    resumo:
      "Atleta amador. Busca performance e recuperação. Sem queixas relevantes. Exames de rotina e marcadores de esforço.",
    exames: [
      { nome: "Testosterona total e livre", cor: C.hormonio },
      { nome: "Hemograma completo", cor: C.sangue },
      { nome: "Vitamina B12", cor: C.vitamina },
      { nome: "CPK (creatinoquinase)", cor: C.metabolico },
    ],
  },
];

const ALERTA_CFG: Record<Alerta, { rotulo: string; led: string; cor: string }> = {
  verde: { rotulo: "ROTINA", led: "paxter-led-green", cor: "text-emerald-700" },
  amarelo: { rotulo: "ATENÇÃO", led: "paxter-led-amber", cor: "text-amber-700" },
  vermelho: { rotulo: "ALERTA", led: "paxter-led-red", cor: "text-red-700" },
};

/* ============================================================
   Componentes auxiliares
   ============================================================ */
function CampoMeta({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="concave-3d px-3 py-2">
      <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#647c97]">{rotulo}</div>
      <div className="mt-0.5 text-[12.5px] font-semibold text-[#16294a]">{valor}</div>
    </div>
  );
}

function ChipExame({ e }: { e: Exame }) {
  return (
    <span className="bevel-3d inline-flex items-center gap-2 px-2.5 py-1.5 text-[12px] font-medium text-[#16294a]">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: e.cor, boxShadow: "inset 0 1px 1px rgba(255,255,255,0.5)" }} />
      {e.nome}
    </span>
  );
}

function CartaoPendente({ p }: { p: Pendente }) {
  const a = ALERTA_CFG[p.alerta];
  const vermelho = p.alerta === "vermelho";
  return (
    <article
      className="panel-3d px-5 py-4"
      style={vermelho ? { borderColor: "rgba(192,57,43,0.65)", borderWidth: 2 } : undefined}
    >
      {/* ZONA IDENTIDADE: nome a esquerda, badge+ID a direita */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate text-[17px] font-bold tracking-wide text-[#16294a]">{p.nome}</h3>
          <p className="mt-0.5 text-[11.5px] text-[#647c97]">
            {p.idade} anos · CPF {p.cpf}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide"
            style={{ background: "linear-gradient(180deg,#fff5da,#f3e3b6)", color: "#8a6a1f", border: "1px solid rgba(184,146,77,0.6)" }}
          >
            <Clock className="h-3 w-3" /> Pendente
          </span>
          <span className="rounded bg-[#16294a] px-2 py-1 font-mono text-[10px] font-bold tracking-wider text-[#e7cd8f]">
            #{p.id}
          </span>
        </div>
      </div>

      {/* Faixa de alerta vermelho (regra: forca validacao mesmo desligado) */}
      {vermelho && (
        <div
          className="mt-3 flex items-start gap-2.5 rounded-md px-3 py-2.5"
          style={{ background: "linear-gradient(180deg,#fdeceb,#f8dcd9)", border: "1px solid rgba(192,57,43,0.5)" }}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#c0392b]" />
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-[#c0392b]">
              Validação obrigatória
            </div>
            <p className="mt-0.5 text-[11.5px] leading-snug text-[#7a2018]">{p.motivoVermelho}</p>
          </div>
        </div>
      )}

      {/* ZONA META GRID */}
      <div className="mt-3 grid grid-cols-4 gap-2">
        <CampoMeta rotulo="Anamnese em" valor={p.dataAnamnese} />
        <CampoMeta rotulo="Médico designado" valor={p.medico} />
        <div className="concave-3d flex flex-col justify-center px-3 py-2">
          <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#647c97]">Alerta clínico</div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className={`paxter-led ${a.led} paxter-led-on`} />
            <span className={`text-[12px] font-bold ${a.cor}`}>{a.rotulo}</span>
          </div>
        </div>
        <CampoMeta rotulo="Origem" valor={p.origem} />
      </div>

      {/* ZONA CONTEUDO: exames sugeridos */}
      <div className="screen-3d mt-3 px-4 py-3">
        <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#16294a]">
          <FlaskConical className="h-3.5 w-3.5 text-[#c2a05a]" />
          Exames sugeridos pelo motor ({p.exames.length})
        </div>
        <div className="flex flex-wrap gap-2">
          {p.exames.map((e) => (
            <ChipExame key={e.nome} e={e} />
          ))}
        </div>
      </div>

      {/* Resumo da anamnese */}
      <div className="concave-3d mt-3 px-4 py-3">
        <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#647c97]">Resumo da anamnese</div>
        <p className="text-[12.5px] leading-snug text-[#2c3e52]">{p.resumo}</p>
      </div>

      {/* ZONA ACOES */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-[11px] italic text-[#647c97]">
          <Send className="h-3.5 w-3.5" />
          Ao aprovar: gera a guia de exames e dispara o vídeo de orientação ao cliente.
        </p>
        <div className="flex items-center gap-2.5">
          <button type="button" className="btn-3d-soft inline-flex items-center gap-1.5 px-4 py-2 text-[12px] font-bold uppercase tracking-wide">
            <PencilLine className="h-3.5 w-3.5" /> Editar lista
          </button>
          <button type="button" className="btn-3d inline-flex items-center gap-1.5 px-5 py-2 text-[12px] font-bold uppercase tracking-wide">
            <CheckCircle2 className="h-4 w-4" /> Aprovar e enviar
          </button>
        </div>
      </div>
    </article>
  );
}

function CartaoKpi({ Icon, rotulo, valor, detalhe, led }: { Icon: typeof Activity; rotulo: string; valor: string; detalhe: string; led: string }) {
  return (
    <div className="bevel-3d flex items-center gap-3 px-4 py-3">
      <div className="screen-3d flex h-10 w-10 items-center justify-center">
        <Icon className="h-5 w-5 text-[#16294a]" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`paxter-led ${led} paxter-led-on`} />
          <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#647c97]">{rotulo}</span>
        </div>
        <div className="text-[22px] font-bold leading-tight text-[#16294a]">{valor}</div>
        <div className="text-[10px] text-[#647c97]">{detalhe}</div>
      </div>
    </div>
  );
}

/* ============================================================
   TELA
   ============================================================ */
export function FilaValidacao() {
  return (
    <div className="cockpit-root flex min-h-screen w-full font-sans">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra de topo */}
        <header
          className="flex items-center justify-between px-7 py-3"
          style={{ background: "linear-gradient(180deg,#1b3260 0%,#16294a 60%,#101f3a 100%)", borderBottom: "1px solid rgba(231,205,143,0.35)" }}
        >
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-300">
            <ShieldCheck className="h-4 w-4 text-[#e7cd8f]" />
            Validação de Exames
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-md bg-[#0e1c34] px-3 py-1.5" style={{ border: "1px solid rgba(231,205,143,0.25)" }}>
              <Search className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-[11px] text-slate-400">Buscar cliente…</span>
            </div>
            <div className="text-right leading-tight">
              <div className="text-[12px] font-semibold uppercase tracking-wide text-white">Dr. Caio Pádua</div>
              <div className="text-[10px] text-slate-300">Médico · CRM 00000</div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-7 py-6">
          {/* Cabecalho da pagina */}
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <h1 className="text-[24px] font-bold tracking-wide text-[#16294a]">Fila de Validação</h1>
              <p className="mt-1 text-[12.5px] text-[#647c97]">
                Pedidos de exames gerados pela anamnese, aguardando aprovação médica.
              </p>
            </div>
            <div
              className="flex items-center gap-2 rounded-md px-3 py-2"
              style={{ background: "linear-gradient(180deg,#eafaef,#d6f0de)", border: "1px solid rgba(46,160,67,0.4)" }}
            >
              <span className="paxter-led paxter-led-green paxter-led-on" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">Validação ligada</span>
            </div>
          </div>

          {/* Linha de chamada (regra de seguranca) */}
          <div className="concave-3d mb-5 flex items-start gap-2.5 px-4 py-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#c2a05a]" />
            <p className="text-[12px] leading-snug text-[#2c3e52]">
              Nada é enviado ao cliente antes da aprovação. Casos com <strong className="text-[#c0392b]">alerta vermelho</strong> exigem
              validação obrigatória — mesmo que o motor esteja desligado nos Parâmetros do Motor.
            </p>
          </div>

          {/* KPIs */}
          <div className="mb-6 grid grid-cols-4 gap-3">
            <CartaoKpi Icon={Clock} rotulo="Pendentes" valor="4" detalhe="aguardando médico" led="paxter-led-amber" />
            <CartaoKpi Icon={CheckCircle2} rotulo="Aprovados hoje" valor="12" detalhe="enviados ao cliente" led="paxter-led-green" />
            <CartaoKpi Icon={AlertTriangle} rotulo="Alertas vermelhos" valor="1" detalhe="validação obrigatória" led="paxter-led-red" />
            <CartaoKpi Icon={Stethoscope} rotulo="Médicos ativos" valor="2" detalhe="na escala de hoje" led="paxter-led-green" />
          </div>

          {/* Fila */}
          <div className="flex flex-col gap-4">
            {FILA.map((p) => (
              <CartaoPendente key={p.id} p={p} />
            ))}
          </div>

          <p className="mt-6 text-center text-[10px] uppercase tracking-[0.2em] text-[#9aa9bd]">
            Padcon Conect · Motor de Encantamento · tela de referência
          </p>
        </main>
      </div>
    </div>
  );
}

export default FilaValidacao;
