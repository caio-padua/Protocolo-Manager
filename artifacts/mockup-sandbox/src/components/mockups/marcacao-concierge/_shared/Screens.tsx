import "../_group.css";
import {
  Crown,
  Stethoscope,
  HeartPulse,
  Syringe,
  Sparkles,
  ChevronRight,
  Sun,
  Moon,
  Lock,
  ShieldCheck,
} from "lucide-react";

type Theme = "light" | "dark";

/* ------------------------------------------------------------------ */
/* Dados de exemplo (estáticos — mockup de comparação visual)          */
/* ------------------------------------------------------------------ */
const DIRETOR = {
  name: "Dr. Caio H. Pádua",
  role: "Endocrinologia · Diretor Clínico",
  desc: "Consulta premium e protocolos avançados, com acompanhamento pessoal e prioridade de agenda.",
};
const MEDICOS = [
  { name: "Dra. Marina Alves", role: "Endocrinologia", Icon: Stethoscope },
  { name: "Dr. Rafael Nunes", role: "Clínica Geral", Icon: HeartPulse },
];
const OUTRAS = [
  { name: "Aplicação de Injetáveis", role: "Enfermagem · Protocolos", Icon: Syringe },
  { name: "Procedimento Estético", role: "Estética avançada", Icon: Sparkles },
];

/* ------------------------------------------------------------------ */
/* Cúpula Paxter em medalhão de vidro (discreta) — cabeçalho           */
/* ------------------------------------------------------------------ */
function Medallion() {
  return (
    <div
      className="relative flex items-center justify-center"
      style={{
        width: 40,
        height: 40,
        borderRadius: 8,
        background:
          "radial-gradient(120% 120% at 30% 20%, rgba(255,255,255,0.35), rgba(255,255,255,0.04) 45%, rgba(0,0,0,0.18))",
        border: "1px solid rgba(184,146,77,0.55)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -3px 8px rgba(0,0,0,0.35), 0 4px 10px -3px rgba(0,0,0,0.5)",
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="cc-dome" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f6e6b0" />
            <stop offset="0.5" stopColor="#d8b667" />
            <stop offset="1" stopColor="#a8823c" />
          </linearGradient>
        </defs>
        <path d="M12 3c4 0 7 3.2 7 7.3V15H5v-4.7C5 6.2 8 3 12 3Z" fill="url(#cc-dome)" stroke="rgba(120,92,40,0.5)" strokeWidth="0.6" />
        <rect x="4" y="15.2" width="16" height="2.4" rx="0.6" fill="url(#cc-dome)" />
        <rect x="5.4" y="17.9" width="13.2" height="2" rx="0.6" fill="url(#cc-dome)" opacity="0.85" />
        <line x1="12" y1="3" x2="12" y2="15" stroke="rgba(255,255,255,0.5)" strokeWidth="0.5" />
      </svg>
    </div>
  );
}

function Header({ theme }: { theme: Theme }) {
  return (
    <header className="relative z-10 flex items-center justify-between px-4 pt-4 pb-3">
      <div className="flex items-center gap-3">
        <Medallion />
        <div className="leading-none">
          <div className="cc-serif text-[19px] font-bold" style={{ color: "var(--gold)" }}>
            PAXTER
          </div>
          <div className="text-[9px] tracking-[0.2em] mt-1" style={{ color: "var(--muted)" }}>
            MOTOR CLÍNICO
          </div>
        </div>
      </div>
      <div className="cc-toggle flex items-center gap-1 rounded-md px-1 py-1">
        <span
          className="flex items-center justify-center rounded"
          style={{
            width: 24,
            height: 22,
            background: theme === "light" ? "linear-gradient(180deg,#faf2df,#efe3c9)" : "transparent",
            color: theme === "light" ? "#8a6d2f" : "var(--muted)",
          }}
        >
          <Sun size={13} />
        </span>
        <span
          className="flex items-center justify-center rounded"
          style={{
            width: 24,
            height: 22,
            background: theme === "dark" ? "linear-gradient(180deg,#1a3055,#234063)" : "transparent",
            color: theme === "dark" ? "#f4e2a8" : "var(--muted)",
          }}
        >
          <Moon size={13} />
        </span>
      </div>
    </header>
  );
}

function Shell({ theme, children }: { theme: Theme; children: React.ReactNode }) {
  return (
    <div className={`cc-scope ${theme === "dark" ? "dark" : ""}`} style={{ minHeight: "100vh", background: "var(--page)" }}>
      <div className="relative" style={{ minHeight: "100vh" }}>
        <div className="cc-paper" />
        <div className="relative z-10">{children}</div>
      </div>
    </div>
  );
}

/* Rótulo de seção: olho-vivo ouro + linha fina à direita */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-5 pt-5 pb-2.5">
      <span className="text-[10px] font-bold tracking-[0.22em]" style={{ color: "var(--gold)" }}>
        {children}
      </span>
      <span className="cc-hair flex-1" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* CARTÃO IRMÃO — uniforme para TODO cartão que não é o Dr. Caio.       */
/* Requisito do CEO: demais cartões todos do mesmo tamanho.            */
/* `edge` só muda ONDE fica o fio de ouro (topo x lateral).           */
/* ------------------------------------------------------------------ */
function CardIrmao({
  Icon,
  name,
  role,
  edge = "top",
}: {
  Icon: typeof Stethoscope;
  name: string;
  role?: string;
  edge?: "top" | "left";
}) {
  return (
    <div className="cc-card flex items-center gap-3 px-4" style={{ height: 70 }}>
      <span className={edge === "top" ? "cc-hair-top" : "cc-hair-left"} aria-hidden />
      <div className="cc-well flex items-center justify-center shrink-0" style={{ width: 42, height: 42 }}>
        <Icon size={18} style={{ color: "var(--gold)" }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold leading-snug truncate" style={{ color: "var(--ink)" }}>
          {name}
        </div>
        {role ? (
          <div className="text-[10.5px] mt-0.5 truncate" style={{ color: "var(--muted)" }}>
            {role}
          </div>
        ) : null}
      </div>
      <ChevronRight size={18} style={{ color: "var(--muted)" }} className="shrink-0" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* CARTÃO-MEMBRO — o Dr. Caio como o "Via Concierge" (navy nos 2 temas)*/
/* `rail`: "top" (variante Carteira) x "left" (variante Placa).        */
/* Maior e mais largo que os irmãos (requisito do CEO).               */
/* ------------------------------------------------------------------ */
function CartaoMembro({ rail }: { rail: "top" | "left" }) {
  return (
    <div className="cc-flagship overflow-hidden" style={{ paddingLeft: rail === "left" ? 6 : 0 }}>
      {rail === "top" ? <div className="cc-rail" /> : <span className="cc-mastro" aria-hidden />}

      <div className="relative px-5 pt-4 pb-4">
        {/* linha superior: selo EXCLUSIVO à esquerda + chapa DIRETOR à direita */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <Crown size={13} style={{ color: "#f4e2a8" }} />
            <span className="text-[10px] font-bold tracking-[0.18em]" style={{ color: "#f4e2a8" }}>
              ATENDIMENTO EXCLUSIVO
            </span>
          </div>
          <span className="cc-seal px-2 py-0.5 text-[8.5px] font-bold tracking-[0.14em]">DIRETOR</span>
        </div>

        {/* identidade: poço com coroa + nome serifado + especialidade */}
        <div className="flex items-start gap-3.5">
          <div className="cc-well-dark flex items-center justify-center shrink-0" style={{ width: 52, height: 52 }}>
            <Crown size={24} style={{ color: "#f4e2a8" }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="cc-serif text-[20px] font-bold leading-snug" style={{ color: "#f6f0e0" }}>
              {DIRETOR.name}
            </div>
            <div className="text-[11px] mt-1" style={{ color: "#c9b98f" }}>
              {DIRETOR.role}
            </div>
          </div>
        </div>

        <p className="text-[11.5px] leading-relaxed mt-3" style={{ color: "#b9c4d8" }}>
          {DIRETOR.desc}
        </p>

        {/* CTA de ouro */}
        <button className="cc-btn-gold mt-4 w-full inline-flex items-center justify-center gap-2 rounded-md py-2.5 text-[12px] font-bold tracking-[0.06em]">
          <Sparkles size={14} />
          CONCIERGE EXCLUSIVO
          <ChevronRight size={14} />
        </button>

        {/* rodapé-hairline: eco fiel da linha "PIX·CARTÃO·BOLETO" do cartão real */}
        <div className="cc-flag-hair my-3" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Lock size={11} style={{ color: "#c9b98f" }} />
            <span className="text-[9.5px] tracking-[0.12em]" style={{ color: "#b9c4d8" }}>
              ACESSO PRIORITÁRIO
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={11} style={{ color: "#c9b98f" }} />
            <span className="text-[9.5px] tracking-[0.12em]" style={{ color: "#b9c4d8" }}>
              AGENDA PROTEGIDA
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/* VARIANTE A — CARTEIRA CONCIERGE                                     */
/* Cartão-membro do Dr. Caio com TRILHO de ouro no topo; abaixo, os   */
/* irmãos com fio de ouro no topo. Corpo Médico separado das demais.  */
/* ================================================================== */
export function VariantCarteira({ theme }: { theme: Theme }) {
  return (
    <Shell theme={theme}>
      <Header theme={theme} />

      <div className="px-5 pt-1 pb-1">
        <h1 className="cc-serif text-[24px] font-bold leading-tight" style={{ color: "var(--ink)" }}>
          Marcar Consulta
        </h1>
        <p className="text-[11.5px] mt-1" style={{ color: "var(--muted)" }}>
          Escolha com quem deseja se consultar.
        </p>
      </div>

      <SectionLabel>CORPO MÉDICO</SectionLabel>

      {/* Dr. Caio — cartão-membro, MAIOR e MAIS LARGO (px-3 = extravasa os irmãos) */}
      <div className="px-3">
        <CartaoMembro rail="top" />
      </div>

      {/* Médicos assistentes — irmãos RECUADOS (px-5), uniformes */}
      <div className="px-5 pt-3 space-y-2.5">
        {MEDICOS.map((m) => (
          <CardIrmao key={m.name} Icon={m.Icon} name={m.name} role={m.role} edge="top" />
        ))}
      </div>

      <SectionLabel>OUTRAS CATEGORIAS</SectionLabel>

      {/* Outras categorias — mesmos irmãos, mesmo tamanho, mesma coluna */}
      <div className="px-5 pt-0.5 pb-7 space-y-2.5">
        {OUTRAS.map((o) => (
          <CardIrmao key={o.name} Icon={o.Icon} name={o.name} role={o.role} edge="top" />
        ))}
      </div>
    </Shell>
  );
}

/* ================================================================== */
/* VARIANTE B — PLACA METAL                                            */
/* Mesmo DNA, porém o ouro vem como MASTRO na lateral esquerda (placa  */
/* de metal). Lista mais coesa; Dr. Caio segue dominante e mais largo. */
/* ================================================================== */
export function VariantPlaca({ theme }: { theme: Theme }) {
  return (
    <Shell theme={theme}>
      <Header theme={theme} />

      <div className="px-5 pt-1 pb-1">
        <h1 className="cc-serif text-[24px] font-bold leading-tight" style={{ color: "var(--ink)" }}>
          Escolha seu caminho
        </h1>
        <p className="text-[11.5px] mt-1" style={{ color: "var(--muted)" }}>
          Cada atendimento é uma placa; a do diretor é o acesso exclusivo.
        </p>
      </div>

      <SectionLabel>CORPO MÉDICO</SectionLabel>

      {/* Dr. Caio — cartão-membro com mastro lateral, MAIOR e MAIS LARGO */}
      <div className="px-3">
        <CartaoMembro rail="left" />
      </div>

      {/* Médicos assistentes — placas irmãs recuadas com fio lateral */}
      <div className="px-5 pt-3 space-y-2.5">
        {MEDICOS.map((m) => (
          <CardIrmao key={m.name} Icon={m.Icon} name={m.name} role={m.role} edge="left" />
        ))}
      </div>

      <SectionLabel>OUTRAS CATEGORIAS</SectionLabel>

      <div className="px-5 pt-0.5 pb-7 space-y-2.5">
        {OUTRAS.map((o) => (
          <CardIrmao key={o.name} Icon={o.Icon} name={o.name} role={o.role} edge="left" />
        ))}
      </div>
    </Shell>
  );
}
