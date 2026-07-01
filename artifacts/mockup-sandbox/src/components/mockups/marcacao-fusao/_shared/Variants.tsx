import "../_group.css";
import {
  Crown,
  Star,
  Stethoscope,
  HeartPulse,
  Syringe,
  Sparkles,
  ChevronRight,
  Sun,
  Moon,
} from "lucide-react";

type Theme = "light" | "dark";

/* ------------------------------------------------------------------ */
/* Dados de exemplo (estáticos — mockup de comparação visual)          */
/* ------------------------------------------------------------------ */
const DIRETOR = {
  name: "Dr. Caio H. Pádua",
  role: "Endocrinologia · Diretor Clínico",
  desc: "Consulta premium e protocolos avançados, com acompanhamento exclusivo.",
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
/* Cúpula Paxter em medalhão de vidro (discreta)                       */
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
          <linearGradient id="fx-dome" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f6e6b0" />
            <stop offset="0.5" stopColor="#d8b667" />
            <stop offset="1" stopColor="#a8823c" />
          </linearGradient>
        </defs>
        <path d="M12 3c4 0 7 3.2 7 7.3V15H5v-4.7C5 6.2 8 3 12 3Z" fill="url(#fx-dome)" stroke="rgba(120,92,40,0.5)" strokeWidth="0.6" />
        <rect x="4" y="15.2" width="16" height="2.4" rx="0.6" fill="url(#fx-dome)" />
        <rect x="5.4" y="17.9" width="13.2" height="2" rx="0.6" fill="url(#fx-dome)" opacity="0.85" />
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
          <div className="fx-serif text-[19px] font-bold" style={{ color: "var(--gold)" }}>
            PAXTER
          </div>
          <div className="text-[9px] tracking-[0.2em] mt-1" style={{ color: "var(--muted)" }}>
            MOTOR CLÍNICO
          </div>
        </div>
      </div>
      <div className="fx-toggle flex items-center gap-1 rounded-md px-1 py-1">
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
    <div className={`fx-scope ${theme === "dark" ? "dark" : ""}`} style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <div className="relative" style={{ minHeight: "100vh" }}>
        <div className="fx-paper" />
        <div className="relative z-10">{children}</div>
      </div>
    </div>
  );
}

/* Rótulo de seção: OLHO-VIVO ouro + linha fina à direita */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 pt-4 pb-2">
      <span className="text-[10px] font-bold tracking-[0.2em]" style={{ color: "var(--gold)" }}>
        {children}
      </span>
      <span className="fx-hair flex-1" />
    </div>
  );
}

/* Card UNIFORME para TODO cartão que não é o Dr. Caio.
   Requisito do CEO: demais cartões todos do mesmo tamanho.
   Mesmíssima caixa (padding, altura, poço, tipografia) em qualquer posição. */
function CardPadrao({
  Icon,
  name,
  role,
  eyebrow,
}: {
  Icon: typeof Stethoscope;
  name: string;
  role?: string;
  eyebrow?: string;
}) {
  return (
    <div className="fx-card px-4 flex items-center gap-3" style={{ height: 66 }}>
      <div className="fx-well flex items-center justify-center shrink-0" style={{ width: 42, height: 42 }}>
        <Icon size={18} style={{ color: "var(--gold)" }} />
      </div>
      <div className="min-w-0 flex-1">
        {eyebrow ? (
          <div className="text-[9px] font-bold tracking-[0.16em] mb-0.5" style={{ color: "var(--muted)" }}>
            {eyebrow}
          </div>
        ) : null}
        <div className="text-[13.5px] font-semibold leading-snug truncate" style={{ color: "var(--ink)" }}>
          {name}
        </div>
        {role ? (
          <div className="text-[10px] mt-0.5 truncate" style={{ color: "var(--muted)" }}>
            {role}
          </div>
        ) : null}
      </div>
      <ChevronRight size={18} style={{ color: "var(--muted)" }} className="shrink-0" />
    </div>
  );
}

/* ================================================================== */
/* VARIANTE A — EDITORIAL (o clássico, com um sussurro de relevo)      */
/* Divisão por SERVIÇO: consulta médica × outros serviços.            */
/* Dr. Caio: cartão maior e mais largo; demais recuados (mesmo tam.). */
/* ================================================================== */
export function VariantEditorial({ theme }: { theme: Theme }) {
  return (
    <Shell theme={theme}>
      <Header theme={theme} />

      <div className="px-6 pt-2 pb-4 text-center">
        <h1 className="fx-serif text-[26px] font-bold leading-tight" style={{ color: "var(--ink)" }}>
          Como podemos ajudar?
        </h1>
        <p className="text-[12px] mt-1.5" style={{ color: "var(--muted)" }}>
          Escolha o serviço desejado para iniciar seu atendimento.
        </p>
      </div>

      {/* Dr. Caio — MAIOR e MAIS LARGO (largura total, px maior, mais alto) */}
      <div className="px-3 pt-1">
        <div className="fx-card fx-featured px-5 py-5" style={{ minHeight: 128 }}>
          <div className="flex items-center gap-2 mb-2">
            <Star size={14} style={{ color: "var(--gold)" }} fill="currentColor" />
            <span className="text-[10px] font-bold tracking-[0.16em]" style={{ color: "var(--gold)" }}>
              ATENDIMENTO EXCLUSIVO
            </span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="fx-serif text-[20px] font-bold leading-snug" style={{ color: "var(--ink)" }}>
                Consulta com {DIRETOR.name}
              </div>
              <p className="text-[11.5px] mt-1.5 leading-snug" style={{ color: "var(--muted)" }}>
                {DIRETOR.desc}
              </p>
            </div>
            <ChevronRight size={22} style={{ color: "var(--gold)" }} className="shrink-0 mt-1" />
          </div>
        </div>
      </div>

      {/* Corpo Clínico — RECUADO (mais estreito que o Dr. Caio), card padrão */}
      <div className="px-5 pt-3">
        <CardPadrao
          Icon={Stethoscope}
          eyebrow="CORPO CLÍNICO"
          name="Nossos Médicos Assistentes"
        />
      </div>

      {/* Divisória: OUTROS SERVIÇOS (separa a parte médica das outras categorias) */}
      <div className="flex items-center gap-3 px-6 pt-5 pb-1">
        <span className="fx-hair flex-1" />
        <span className="text-[9px] font-bold tracking-[0.2em]" style={{ color: "var(--muted)" }}>
          OUTROS SERVIÇOS
        </span>
        <span className="fx-hair flex-1" />
      </div>

      {/* Outras categorias — RECUADAS e do MESMO tamanho do card Corpo Clínico */}
      <div className="px-5 pt-2 pb-6 space-y-2.5">
        {OUTRAS.map((o) => (
          <CardPadrao key={o.name} Icon={o.Icon} name={o.name} role={o.role} />
        ))}
      </div>
    </Shell>
  );
}

/* ================================================================== */
/* VARIANTE B — SEÇÕES EMOLDURADAS                                     */
/* Dois blocos rotulados: CORPO MÉDICO × OUTRAS CATEGORIAS.           */
/* Dr. Caio maior/mais largo; demais em coluna única com CardPadrao.  */
/* ================================================================== */
export function VariantSecoes({ theme }: { theme: Theme }) {
  return (
    <Shell theme={theme}>
      <Header theme={theme} />

      <div className="px-4 pt-1 pb-1">
        <h1 className="fx-serif text-[22px] font-bold leading-tight" style={{ color: "var(--ink)" }}>
          Marcar Consulta
        </h1>
        <p className="text-[11.5px] mt-0.5" style={{ color: "var(--muted)" }}>
          Escolha com quem deseja se consultar.
        </p>
      </div>

      <SectionLabel>CORPO MÉDICO</SectionLabel>

      {/* Dr. Caio — largura total, px maior, mais alto */}
      <div className="px-3">
        <div className="fx-card fx-featured px-5 py-4" style={{ minHeight: 108 }}>
          <span className="fx-seal absolute-none float-right rounded px-2 py-0.5 text-[8px] font-bold tracking-[0.14em]" style={{ float: "right" }}>
            DIRETOR
          </span>
          <div className="flex items-center gap-3">
            <div className="fx-well flex items-center justify-center shrink-0" style={{ width: 52, height: 52 }}>
              <Crown size={24} style={{ color: "var(--gold)" }} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="fx-serif text-[17px] font-bold leading-snug" style={{ color: "var(--ink)" }}>
                {DIRETOR.name}
              </div>
              <div className="text-[10.5px] mt-0.5" style={{ color: "var(--muted)" }}>
                {DIRETOR.role}
              </div>
            </div>
          </div>
          <button className="fx-btn-gold mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded py-2.5 text-[12px] font-bold tracking-wide">
            <Sparkles size={14} />
            CONCIERGE EXCLUSIVO
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Médicos assistentes — RECUADOS, card padrão (mesmo tamanho de todos os não-Dr) */}
      <div className="px-6 pt-2.5 space-y-2.5">
        {MEDICOS.map((m) => (
          <CardPadrao key={m.name} Icon={m.Icon} name={m.name} role={m.role} />
        ))}
      </div>

      <SectionLabel>OUTRAS CATEGORIAS</SectionLabel>

      {/* Outras categorias — mesma coluna e MESMO card dos médicos assistentes */}
      <div className="px-6 pt-1 pb-6 space-y-2.5">
        {OUTRAS.map((o) => (
          <CardPadrao key={o.name} Icon={o.Icon} name={o.name} role={o.role} />
        ))}
      </div>
    </Shell>
  );
}

/* ================================================================== */
/* VARIANTE C — HERO CONCIERGE + LISTA AGRUPADA                        */
/* Dr. Caio como faixa hero larga no topo; abaixo, lista "ligante"    */
/* agrupada por MÉDICOS / ENFERMAGEM / ESTÉTICA (recuada, discreta).  */
/* ================================================================== */
function GroupRow({
  Icon,
  name,
  role,
  last,
}: {
  Icon: typeof Stethoscope;
  name: string;
  role: string;
  last?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-3 px-3.5 py-3"
      style={{ borderBottom: last ? "none" : "1px solid var(--line)" }}
    >
      <div className="fx-well flex items-center justify-center shrink-0" style={{ width: 36, height: 36 }}>
        <Icon size={16} style={{ color: "var(--gold)" }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold leading-snug" style={{ color: "var(--ink)" }}>
          {name}
        </div>
        <div className="text-[10px]" style={{ color: "var(--muted)" }}>
          {role}
        </div>
      </div>
      <ChevronRight size={17} style={{ color: "var(--muted)" }} className="shrink-0" />
    </div>
  );
}

export function VariantHero({ theme }: { theme: Theme }) {
  return (
    <Shell theme={theme}>
      <Header theme={theme} />

      <div className="px-4 pt-1 pb-3">
        <h1 className="fx-serif text-[22px] font-bold leading-tight" style={{ color: "var(--ink)" }}>
          Marcar Consulta
        </h1>
      </div>

      {/* HERO do Diretor — mais largo (estende -mx-1) e alto */}
      <div className="px-3">
        <div className="fx-hero -mx-1 px-5 py-5">
          <div className="flex items-center gap-2 mb-2.5">
            <Star size={13} style={{ color: "var(--gold)" }} fill="currentColor" />
            <span className="text-[9.5px] font-bold tracking-[0.16em]" style={{ color: "var(--gold)" }}>
              ATENDIMENTO EXCLUSIVO DO DIRETOR
            </span>
          </div>
          <div className="flex items-center gap-3.5">
            <div
              className="flex items-center justify-center shrink-0 rounded-lg"
              style={{
                width: 56,
                height: 56,
                background:
                  theme === "dark"
                    ? "linear-gradient(160deg,#1a3055,#0f1c35)"
                    : "linear-gradient(160deg,#faf2df,#efe3c9)",
                border: "1px solid rgba(184,146,77,0.5)",
                color: "var(--gold)",
              }}
            >
              <Crown size={26} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="fx-serif text-[19px] font-bold leading-snug" style={{ color: "var(--ink)" }}>
                {DIRETOR.name}
              </div>
              <div className="text-[10.5px] mt-0.5" style={{ color: "var(--muted)" }}>
                {DIRETOR.role}
              </div>
            </div>
          </div>
          <button className="fx-btn-gold mt-4 w-full inline-flex items-center justify-center gap-2 rounded py-2.5 text-[12.5px] font-bold tracking-wide">
            <Sparkles size={15} />
            FALAR COM O CONCIERGE
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      <p className="fx-serif text-center text-[13px] italic pt-5 pb-1" style={{ color: "var(--muted)" }}>
        Ou escolha um serviço
      </p>

      {/* Lista agrupada e RECUADA (mais estreita que o hero) */}
      <div className="px-5 pt-2 pb-6">
        <div className="fx-card overflow-hidden">
          <div className="px-3.5 pt-3 pb-1 text-[9px] font-bold tracking-[0.2em]" style={{ color: "var(--gold)" }}>
            MÉDICOS
          </div>
          {MEDICOS.map((m, i) => (
            <GroupRow key={m.name} Icon={m.Icon} name={m.name} role={m.role} last={i === MEDICOS.length - 1} />
          ))}

          <div className="fx-hair mx-3.5" />
          <div className="px-3.5 pt-3 pb-1 text-[9px] font-bold tracking-[0.2em]" style={{ color: "var(--gold)" }}>
            ENFERMAGEM
          </div>
          <GroupRow Icon={Syringe} name="Aplicação de Injetáveis" role="Enfermagem · Protocolos" last />

          <div className="fx-hair mx-3.5" />
          <div className="px-3.5 pt-3 pb-1 text-[9px] font-bold tracking-[0.2em]" style={{ color: "var(--gold)" }}>
            ESTÉTICA
          </div>
          <GroupRow Icon={Sparkles} name="Procedimento Estético" role="Estética avançada" last />
        </div>
      </div>
    </Shell>
  );
}
