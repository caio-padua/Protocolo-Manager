import "../_group.css";
import {
  Crown,
  Calendar,
  Clock,
  ChevronRight,
  Stethoscope,
  Syringe,
  HeartPulse,
  Sun,
  Moon,
  ArrowLeft,
  Check,
  User,
  Sparkles,
  Hourglass,
  PhoneCall,
  Video,
  MapPin,
  Timer,
  CheckCircle2,
} from "lucide-react";

type Theme = "light" | "dark";

/* ---------- Cúpula Paxter (símbolo em medalhão de vidro, discreto) ---------- */
function Medallion() {
  return (
    <div
      className="relative flex items-center justify-center"
      style={{
        width: 42,
        height: 42,
        borderRadius: 8,
        background:
          "radial-gradient(120% 120% at 30% 20%, rgba(255,255,255,0.35), rgba(255,255,255,0.04) 45%, rgba(0,0,0,0.18))",
        border: "1px solid rgba(194,160,90,0.55)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -3px 8px rgba(0,0,0,0.35), 0 4px 10px -3px rgba(0,0,0,0.5)",
      }}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="mt-dome" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f6e6b0" />
            <stop offset="0.5" stopColor="#d8b667" />
            <stop offset="1" stopColor="#a8823c" />
          </linearGradient>
        </defs>
        <path
          d="M12 3c4 0 7 3.2 7 7.3V15H5v-4.7C5 6.2 8 3 12 3Z"
          fill="url(#mt-dome)"
          stroke="rgba(120,92,40,0.5)"
          strokeWidth="0.6"
        />
        <rect x="4" y="15.2" width="16" height="2.4" rx="0.6" fill="url(#mt-dome)" />
        <rect x="5.4" y="17.9" width="13.2" height="2" rx="0.6" fill="url(#mt-dome)" opacity="0.85" />
        <line x1="12" y1="3" x2="12" y2="15" stroke="rgba(255,255,255,0.5)" strokeWidth="0.5" />
      </svg>
    </div>
  );
}

/* ---------- Cabeçalho-medalhão (topo de toda tela do setor) ---------- */
function Header({ theme }: { theme: Theme }) {
  return (
    <header className="relative z-10 flex items-center justify-between px-4 pt-4 pb-3">
      <div className="flex items-center gap-3">
        <Medallion />
        <div className="leading-none">
          <div className="mt-wordmark text-[19px] font-semibold">PAXTER</div>
          <div
            className="text-[9px] tracking-[0.18em] mt-1"
            style={{ color: theme === "dark" ? "#93a4bd" : "#6b7689" }}
          >
            MOTOR CLÍNICO
          </div>
        </div>
      </div>
      <div
        role="group"
        aria-label="Trocar tema"
        className="flex items-center gap-1 rounded-md px-1 py-1"
        style={{
          background: theme === "dark" ? "rgba(0,0,0,0.28)" : "rgba(15,28,53,0.06)",
          border: "1px solid rgba(138,109,47,0.25)",
        }}
      >
        <button
          type="button"
          aria-label="Tema claro"
          aria-pressed={theme === "light"}
          className="flex items-center justify-center rounded"
          style={{
            width: 24,
            height: 22,
            background: theme === "light" ? "linear-gradient(180deg,#faf2df,#efe3c9)" : "transparent",
            color: theme === "light" ? "#8a6d2f" : "#6b7689",
          }}
        >
          <Sun size={13} />
        </button>
        <button
          type="button"
          aria-label="Tema escuro"
          aria-pressed={theme === "dark"}
          className="flex items-center justify-center rounded"
          style={{
            width: 24,
            height: 22,
            background: theme === "dark" ? "linear-gradient(180deg,#1a3055,#234063)" : "transparent",
            color: theme === "dark" ? "#f4e2a8" : "#93a4bd",
          }}
        >
          <Moon size={13} />
        </button>
      </div>
    </header>
  );
}

function Shell({ theme, children }: { theme: Theme; children: React.ReactNode }) {
  return (
    <div
      className={`mt-scope ${theme === "dark" ? "dark" : ""}`}
      style={{ minHeight: "100vh", background: theme === "dark" ? "#0d1f3a" : "#f3ecdd" }}
    >
      <div className="relative" style={{ minHeight: "100vh" }}>
        <div className="leva-fabric" />
        <div className="relative z-10">{children}</div>
      </div>
    </div>
  );
}

function StepBar({ theme, pct, step }: { theme: Theme; pct: number; step: string }) {
  return (
    <div className="px-4">
      <div
        className="flex items-center justify-between text-[9px] tracking-[0.16em] mb-1.5"
        style={{ color: theme === "dark" ? "#93a4bd" : "#6b7689" }}
      >
        <span>{step}</span>
        <span>{pct}%</span>
      </div>
      <div className="paxter-bar-track" style={{ height: 8 }}>
        <span className="paxter-bar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ================= TELA 1 — ENTRADA (grade de cards alinhados) ================= */
type Person = {
  id: string;
  name: string;
  role: string;
  tag: string;
  Icon: typeof Stethoscope;
  director?: boolean;
  empty?: boolean;
};

const PEOPLE: Person[] = [
  { id: "caio", name: "Dr. Caio H. Pádua", role: "Endocrinologia · Diretor Clínico", tag: "Concierge", Icon: Crown, director: true },
  { id: "marina", name: "Dra. Marina Alves", role: "Endocrinologia", tag: "Ver agenda", Icon: Stethoscope },
  { id: "camila", name: "Enf. Camila Rocha", role: "Enfermagem · Aplicações", tag: "Ver agenda", Icon: Syringe },
  { id: "rafael", name: "Dr. Rafael Nunes", role: "Clínica Geral", tag: "Ver agenda", Icon: HeartPulse },
  { id: "vazio", name: "—", role: "—", tag: "Ver agenda", Icon: User, empty: true },
];

function PersonCard({ theme, p }: { theme: Theme; p: Person }) {
  return (
    <div className={`relative p-3 ${p.director ? "panel-3d panel-3d-hero" : "panel-3d"}`} style={{ minHeight: 92 }}>
      {p.director && (
        <span
          className="mt-seal absolute right-2 top-2 rounded px-1.5 py-0.5 text-[8px] font-bold tracking-[0.12em]"
        >
          DIRETOR
        </span>
      )}
      <div className="flex items-center gap-3 h-full">
        {/* avatar em moldura côncava (slot fixo) */}
        <div
          className="concave-3d flex items-center justify-center shrink-0"
          style={{ width: 46, height: 46 }}
        >
          <p.Icon size={20} style={{ color: p.director ? "#b9923f" : theme === "dark" ? "#7f93b3" : "#5a6a86" }} />
        </div>
        {/* bloco de texto (slots fixos) */}
        <div className="min-w-0 flex-1">
          <div
            className="text-[13px] font-semibold truncate"
            style={{ color: theme === "dark" ? "#eef3fb" : "#1b2b47", opacity: p.empty ? 0.5 : 1 }}
          >
            {p.name}
          </div>
          <div
            className="text-[10px] truncate mt-0.5"
            style={{ color: theme === "dark" ? "#93a4bd" : "#6b7689", opacity: p.empty ? 0.5 : 1 }}
          >
            {p.role}
          </div>
          <div className="mt-2">
            <button
              className={`${p.director ? "btn-3d" : "btn-3d-soft"} inline-flex items-center gap-1 rounded px-2.5 py-1 text-[10px] font-semibold`}
            >
              {p.tag}
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function EntradaScreen({ theme }: { theme: Theme }) {
  return (
    <Shell theme={theme}>
      <Header theme={theme} />

      <div className="px-4 pt-1 pb-2">
        <h1
          className="text-[17px] font-bold tracking-[0.02em]"
          style={{ color: theme === "dark" ? "#f4e2a8" : "#1b2b47" }}
        >
          MARCAR CONSULTA
        </h1>
        <p className="text-[11px] mt-0.5" style={{ color: theme === "dark" ? "#93a4bd" : "#6b7689" }}>
          Escolha com quem deseja se consultar.
        </p>
      </div>

      {/* KPIs */}
      <div className="px-4 grid grid-cols-2 gap-2 mb-3">
        {[
          { l: "PRÓXIMA VAGA", v: "Amanhã" },
          { l: "UNIDADES", v: "2" },
        ].map((k) => (
          <div key={k.l} className="leva-kpi px-3 py-2">
            <div className="leva-kpi-label text-[8px] tracking-[0.14em] font-semibold">{k.l}</div>
            <div className="leva-kpi-value text-[15px] font-bold leading-tight">{k.v}</div>
          </div>
        ))}
      </div>

      <StepBar theme={theme} pct={25} step="PASSO 1 DE 4 · PROFISSIONAL" />

      {/* grade de cards ALINHADOS (Dr. Caio na mesma grade) */}
      <div className="px-4 pt-3 pb-6 space-y-2.5">
        {PEOPLE.map((p) => (
          <PersonCard key={p.id} theme={theme} p={p} />
        ))}
      </div>
    </Shell>
  );
}

/* ================= TELA 2 — DIA / HORÁRIO ================= */
const DAYS = [
  { d: "SEG", n: "14" },
  { d: "TER", n: "15", active: true },
  { d: "QUA", n: "16" },
  { d: "QUI", n: "17" },
  { d: "SEX", n: "18" },
];
const SLOTS = ["09:00", "09:30", "10:00", "10:30", "11:00", "14:00", "14:30", "15:00"];
const ACTIVE_SLOT = "10:00";

export function PassoScreen({ theme }: { theme: Theme }) {
  return (
    <Shell theme={theme}>
      <Header theme={theme} />

      <div className="px-4 pt-1 pb-2 flex items-center gap-2">
        <button
          className="btn-3d-soft flex items-center justify-center rounded"
          style={{ width: 30, height: 30 }}
          aria-label="Voltar"
        >
          <ArrowLeft size={15} />
        </button>
        <div>
          <h1 className="text-[15px] font-bold" style={{ color: theme === "dark" ? "#f4e2a8" : "#1b2b47" }}>
            ESCOLHA DIA E HORÁRIO
          </h1>
        </div>
      </div>

      {/* resumo do profissional escolhido */}
      <div className="px-4 mb-3">
        <div className="leva-band flex items-center gap-3 p-3">
          <div className="concave-3d flex items-center justify-center shrink-0" style={{ width: 40, height: 40 }}>
            <Stethoscope size={18} style={{ color: "#b9923f" }} />
          </div>
          <div className="min-w-0">
            <div className="text-[12px] font-semibold" style={{ color: theme === "dark" ? "#eef3fb" : "#1b2b47" }}>
              Dra. Marina Alves
            </div>
            <div className="text-[10px]" style={{ color: theme === "dark" ? "#93a4bd" : "#6b7689" }}>
              Endocrinologia · Clínica Tatuapé
            </div>
          </div>
        </div>
      </div>

      <StepBar theme={theme} pct={66} step="PASSO 3 DE 4 · DIA E HORÁRIO" />

      {/* dias */}
      <div className="px-4 pt-3">
        <div className="flex items-center gap-1.5 mb-2">
          <Calendar size={13} style={{ color: theme === "dark" ? "#93a4bd" : "#6b7689" }} />
          <span
            className="text-[9px] font-bold tracking-[0.16em]"
            style={{ color: theme === "dark" ? "#93a4bd" : "#6b7689" }}
          >
            ESCOLHA O DIA
          </span>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {DAYS.map((d) => (
            <button
              key={d.n}
              data-active={d.active ? "true" : "false"}
              className="leva-chip flex flex-col items-center justify-center py-2"
            >
              <span className="text-[9px] tracking-[0.1em] opacity-80">{d.d}</span>
              <span className="text-[15px] font-bold leading-tight">{d.n}</span>
            </button>
          ))}
        </div>
      </div>

      {/* horários */}
      <div className="px-4 pt-4 pb-6">
        <div className="flex items-center gap-1.5 mb-2">
          <Clock size={13} style={{ color: theme === "dark" ? "#93a4bd" : "#6b7689" }} />
          <span
            className="text-[9px] font-bold tracking-[0.16em]"
            style={{ color: theme === "dark" ? "#93a4bd" : "#6b7689" }}
          >
            HORÁRIOS DISPONÍVEIS
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {SLOTS.map((s) => {
            const on = s === ACTIVE_SLOT;
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                className="screen-3d flex items-center justify-center py-2 text-[12px] font-semibold"
                style={{
                  color: on ? "#8a6d2f" : theme === "dark" ? "#cdd8ea" : "#3b4860",
                  outline: on ? "2px solid rgba(185,146,63,0.75)" : "none",
                  outlineOffset: on ? 1 : 0,
                }}
              >
                {s}
              </button>
            );
          })}
        </div>

        <button className="btn-3d-ok mt-5 flex w-full items-center justify-center gap-2 rounded py-3 text-[13px] font-bold">
          <Check size={16} />
          CONFIRMAR CONSULTA
        </button>
      </div>
    </Shell>
  );
}

/* ============================================================
   TELA — Fluxo Dr. Caio (Concierge / agenda do Diretor)
   ============================================================ */
export function ConciergeScreen({ theme }: { theme: Theme }) {
  const sub = theme === "dark" ? "#93a4bd" : "#6b7689";
  const ttl = theme === "dark" ? "#f4e2a8" : "#8a6d2f";
  const body = theme === "dark" ? "#cdd8ea" : "#3b4860";
  return (
    <Shell theme={theme}>
      <Header theme={theme} />

      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <button
          type="button"
          aria-label="Voltar"
          className="screen-3d flex h-8 w-8 items-center justify-center rounded"
          style={{ color: sub }}
        >
          <ArrowLeft size={16} />
        </button>
        <h1
          className="text-[15px] font-extrabold tracking-[0.06em]"
          style={{ color: ttl }}
        >
          AGENDA DO DIRETOR
        </h1>
      </div>

      {/* profissional */}
      <div className="px-4 pb-1">
        <div className="leva-band flex items-center gap-3 rounded-md px-3 py-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded"
            style={{
              background:
                theme === "dark"
                  ? "linear-gradient(160deg,#1a3055,#0f1c35)"
                  : "linear-gradient(160deg,#faf2df,#efe3c9)",
              border: "1px solid rgba(138,109,47,0.45)",
              color: "#b9923f",
            }}
          >
            <Crown size={20} />
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-bold" style={{ color: theme === "dark" ? "#eaf1fb" : "#1a2740" }}>
              Dr. Caio H. Pádua
            </div>
            <div className="text-[10px]" style={{ color: sub }}>
              Endocrinologia · Diretor Clínico
            </div>
          </div>
        </div>
      </div>

      {/* aviso de escassez — vidro jateado */}
      <div className="px-4 pt-3">
        <div
          className="panel-3d rounded-md px-4 py-4 text-center"
          style={{
            background:
              theme === "dark"
                ? "linear-gradient(180deg,rgba(26,48,85,0.55),rgba(15,28,53,0.75))"
                : "linear-gradient(180deg,rgba(255,255,255,0.7),rgba(239,227,201,0.55))",
          }}
        >
          <div className="mb-2 flex items-center justify-center gap-1.5">
            <Hourglass size={15} style={{ color: "#b9923f" }} />
            <span className="text-[10px] font-bold tracking-[0.16em]" style={{ color: ttl }}>
              SEM VAGA IMEDIATA
            </span>
          </div>
          <p className="text-[12px] leading-snug" style={{ color: body }}>
            A agenda do Diretor abre novas vagas em aproximadamente 90 dias.
            Escolha um caminho abaixo para prosseguir.
          </p>
        </div>
      </div>

      {/* opções */}
      <div className="grid gap-3 px-4 pt-4 pb-6">
        <div className="panel-3d rounded-md px-4 py-4">
          <div className="mb-1 flex items-center gap-2">
            <Sparkles size={16} style={{ color: "#b9923f" }} />
            <span className="text-[12px] font-extrabold tracking-[0.06em]" style={{ color: ttl }}>
              CONCIERGE
            </span>
          </div>
          <p className="mb-3 text-[11px] leading-snug" style={{ color: body }}>
            Fale com o concierge e entre na lista de prioridade do Diretor.
          </p>
          <button className="btn-3d flex w-full items-center justify-center gap-2 rounded py-2.5 text-[12px] font-bold">
            <PhoneCall size={15} />
            FALAR COM CONCIERGE
          </button>
        </div>

        <div className="panel-3d rounded-md px-4 py-4">
          <div className="mb-1 flex items-center gap-2">
            <Hourglass size={16} style={{ color: "#b9923f" }} />
            <span className="text-[12px] font-extrabold tracking-[0.06em]" style={{ color: ttl }}>
              GARANTIR EM ~90 DIAS
            </span>
          </div>
          <p className="mb-3 text-[11px] leading-snug" style={{ color: body }}>
            Reserve sua vaga futura com um sinal. O valor entra no protocolo.
          </p>
          <button className="btn-3d-soft flex w-full items-center justify-center gap-2 rounded py-2.5 text-[12px] font-bold">
            <Check size={15} />
            RESERVAR COM SINAL
          </button>
        </div>

        <button
          type="button"
          className="screen-3d mt-1 flex items-center justify-center gap-2 rounded py-2 text-[11px] font-semibold"
          style={{ color: sub }}
        >
          <Video size={14} />
          VER MENSAGEM DO DIRETOR
        </button>
      </div>
    </Shell>
  );
}

/* ============================================================
   TELA — Confirmação / Sucesso
   ============================================================ */
export function ConfirmacaoScreen({ theme }: { theme: Theme }) {
  const sub = theme === "dark" ? "#93a4bd" : "#6b7689";
  const ttl = theme === "dark" ? "#f4e2a8" : "#8a6d2f";
  const val = theme === "dark" ? "#eaf1fb" : "#1a2740";
  const rows: { icon: React.ReactNode; label: string; value: string }[] = [
    { icon: <Stethoscope size={15} />, label: "PROFISSIONAL", value: "Dra. Marina Alves" },
    { icon: <Calendar size={15} />, label: "DATA E HORA", value: "Ter, 15/07 · 10:00" },
    { icon: <MapPin size={15} />, label: "UNIDADE", value: "Clínica Tatuapé" },
    { icon: <Timer size={15} />, label: "DURAÇÃO", value: "30 minutos" },
  ];
  return (
    <Shell theme={theme}>
      <Header theme={theme} />

      {/* selo de sucesso */}
      <div className="flex flex-col items-center px-4 pt-6 pb-2">
        <div
          className="mb-3 flex h-16 w-16 items-center justify-center rounded-full"
          style={{
            background:
              theme === "dark"
                ? "radial-gradient(circle at 35% 30%,#1e3a2c,#0f2018)"
                : "radial-gradient(circle at 35% 30%,#e6f4ea,#cfe9d6)",
            border: "1px solid rgba(46,138,87,0.5)",
            boxShadow: "inset 0 2px 6px rgba(0,0,0,0.25)",
            color: "#2e8a57",
          }}
        >
          <CheckCircle2 size={34} />
        </div>
        <h1 className="text-[16px] font-extrabold tracking-[0.06em]" style={{ color: ttl }}>
          CONSULTA CONFIRMADA
        </h1>
        <p className="mt-1 text-[11px]" style={{ color: sub }}>
          Enviamos os detalhes por e-mail e WhatsApp.
        </p>
      </div>

      <div className="px-4 pt-2">
        <StepBarInline pct={100} theme={theme} />
      </div>

      {/* resumo */}
      <div className="px-4 pt-4">
        <div className="leva-band rounded-md px-3 py-2">
          {rows.map((r, i) => (
            <div
              key={r.label}
              className="flex items-center gap-3 py-2.5"
              style={{
                borderTop: i === 0 ? "none" : `1px solid ${theme === "dark" ? "rgba(255,255,255,0.06)" : "rgba(15,28,53,0.08)"}`,
              }}
            >
              <span
                className="flex h-8 w-8 items-center justify-center rounded"
                style={{ background: theme === "dark" ? "rgba(0,0,0,0.25)" : "rgba(15,28,53,0.05)", color: "#b9923f" }}
              >
                {r.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[9px] font-bold tracking-[0.14em]" style={{ color: sub }}>
                  {r.label}
                </div>
                <div className="text-[13px] font-semibold" style={{ color: val }}>
                  {r.value}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ações */}
      <div className="grid gap-2.5 px-4 pt-5 pb-6">
        <button className="btn-3d-ok flex w-full items-center justify-center gap-2 rounded py-3 text-[13px] font-bold">
          <Check size={16} />
          CONCLUIR
        </button>
        <button className="btn-3d-soft flex w-full items-center justify-center gap-2 rounded py-2.5 text-[12px] font-bold">
          <Calendar size={15} />
          ADICIONAR À MINHA AGENDA
        </button>
      </div>
    </Shell>
  );
}

function StepBarInline({ pct, theme }: { pct: number; theme: Theme }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[9px] font-bold tracking-[0.14em]" style={{ color: theme === "dark" ? "#93a4bd" : "#6b7689" }}>
          PASSO 4 DE 4 · CONCLUÍDO
        </span>
        <span className="text-[9px] font-bold" style={{ color: "#b9923f" }}>
          {pct}%
        </span>
      </div>
      <div className="paxter-bar-track">
        <div className="paxter-bar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
