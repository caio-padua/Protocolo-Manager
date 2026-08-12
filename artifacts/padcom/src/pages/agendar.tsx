import { useState, useMemo, useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  useListSiteContent,
  useListSchedulingAreas,
  useListSchedulingProfessionals,
  useGetAgendaSlots,
  useCreateSchedulingRequest,
  useCreateConciergeCharge,
  useGetSchedulingPaymentStatus,
  getGetSchedulingPaymentStatusQueryKey,
  useUpdateSchedulingRequest,
  getGetAgendaSlotsQueryKey,
} from "@workspace/api-client-react";
import { PaxterLockup } from "@/components/layout/paxter-fx/PaxterLockup";
import { PaxterSymbolGlass } from "@/components/layout/paxter-fx/PaxterSymbolGlass";
import { PaxterWordmarkArt } from "@/components/layout/paxter-fx/PaxterWordmarkArt";
import { PadconWordmark } from "@/components/layout/paxter-fx/PadconWordmark";
import { useScreenTheme } from "@/components/theme/useScreenTheme";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import {
  Loader2,
  ChevronRight,
  ArrowLeft,
  CalendarDays,
  Copy,
  Check,
  CheckCircle,
  AlertCircle,
  Syringe,
  Sparkles,
  User,
  Clock,
  CreditCard,
  Stethoscope,
  HeartPulse,
  ArrowRight,
  Crown,
  ShieldCheck
} from "lucide-react";

// --- Helpers ---
function addMonths(date: Date, months: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// "Terça-feira, 07/10" (pt-BR, sem ano — nunca revela a distância em meses)
function formatSlotDay(date: Date) {
  const weekday = date.toLocaleDateString("pt-BR", { weekday: "long" });
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${dd}/${mm}`;
}

// ISO local (YYYY-MM-DD) sem deslize de fuso (não usar toISOString, que vira UTC)
function isoLocal(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Próximo dia >= "from" que caia no dia-da-semana alvo (0-6); se alvo nulo,
// devolve o próximo dia ÚTIL (segunda a sexta).
function nextWeekday(from: Date, target: number | null) {
  const d = new Date(from);
  for (let i = 0; i < 14; i++) {
    const wd = d.getDay();
    if (target != null ? wd === target : wd >= 1 && wd <= 5) return d;
    d.setDate(d.getDate() + 1);
  }
  return d;
}

const formatCpf = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
};

const formatPhone = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

// Remove um prefixo "Consulta com (nossos)" do rótulo — o cartão já traz o eyebrow "CONSULTA COM",
// então o nome fica só com o essencial (evita duplicar e caber sem quebrar linha no celular).
function stripConsultaCom(s: string) {
  return s.replace(/^consulta\s+com\s+(nossos?\s+)?/i, "").trim();
}

// Paleta por tema — MESMA estrutura visual nos dois; só as cores mudam.
function flagshipTokens(theme: "dark" | "light") {
  if (theme === "dark") {
    return {
      cardBg: "linear-gradient(155deg,#142744 0%,#0f1f39 55%,#0b1830 100%)",
      border: "rgba(184,146,77,0.42)",
      shadow: "0 22px 40px -16px rgba(0,0,0,0.66), inset 0 1px 0 rgba(255,255,255,0.06)",
      goldBand: "linear-gradient(90deg,#8a6d2f,#f4e2a8,#8a6d2f)",
      wellBg: "linear-gradient(160deg,#1c3358,#0f1c35)",
      wellBorder: "rgba(184,146,77,0.5)",
      gold: "#f4e2a8",
      accent: "#cbb98a",
      name: "#f6f0e0",
      sub: "#c9b98f",
      text: "#b9c4d8",
      badgeText: "#1a2b4a",
      chip: "linear-gradient(180deg,#f4e2a8,#c2a05a)",
      ctaText: "#1a2b4a",
      cta: "linear-gradient(180deg,#f4e2a8,#c2a05a)",
      ctaShadow: "0 10px 20px -9px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.5)",
      hair: "rgba(184,146,77,0.26)",
    };
  }
  return {
    cardBg: "linear-gradient(155deg,#ffffff 0%,#fbf8f1 60%,#f5eede 100%)",
    border: "rgba(168,130,60,0.5)",
    shadow: "0 18px 34px -18px rgba(90,68,24,0.32), inset 0 1px 0 rgba(255,255,255,0.9)",
    goldBand: "linear-gradient(90deg,#c2a05a,#8a6d2f,#c2a05a)",
    wellBg: "linear-gradient(160deg,#fbf5e7,#efe4cb)",
    wellBorder: "rgba(168,130,60,0.55)",
    gold: "#8a6d2f",
    accent: "#8a6d2f",
    name: "#16284a",
    sub: "#6f6142",
    text: "#55617a",
    badgeText: "#2a2410",
    chip: "linear-gradient(180deg,#f0d998,#c2a05a)",
    ctaText: "#241d08",
    cta: "linear-gradient(180deg,#f0d998,#c2a05a)",
    ctaShadow: "0 12px 22px -11px rgba(120,90,30,0.5), inset 0 1px 0 rgba(255,255,255,0.7)",
    hair: "rgba(168,130,60,0.32)",
  };
}

// --- Menu de entrada: cartão do Dr. Caio (destaque). MESMO layout nos 2 temas, só a cor muda. ---
function FlagshipDrCaio({ theme, name, onClick }: { theme: "dark" | "light"; name: string; onClick: () => void }) {
  const t = flagshipTokens(theme);
  const displayName = stripConsultaCom(name);
  return (
    <button onClick={onClick} className="w-full text-left group">
      <div
        className="relative rounded-xl overflow-hidden p-5 transition-transform duration-300 group-hover:-translate-y-0.5"
        style={{ background: t.cardBg, border: `1px solid ${t.border}`, boxShadow: t.shadow }}
      >
        {/* Faixa dourada (topo do cartão) */}
        <div className="absolute top-0 left-0 right-0" style={{ height: 3, background: t.goldBand }} />
        {/* Cabeçalho: coroa + selo DIRETOR */}
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center justify-center shrink-0 rounded-lg" style={{ width: 46, height: 46, background: t.wellBg, border: `1px solid ${t.wellBorder}` }}>
            <Crown className="w-[22px] h-[22px]" style={{ color: t.gold }} />
          </div>
          <span className="px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] rounded" style={{ color: t.badgeText, background: t.chip }}>DIRETOR</span>
        </div>
        {/* Eyebrow + nome (sem quebra de linha no celular) + faixa dourada do nome */}
        <div className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: t.accent }}>CONSULTA COM</div>
        <div
          className="font-serif font-semibold mt-1 whitespace-nowrap overflow-hidden text-ellipsis"
          style={{ color: t.name, fontSize: "clamp(14px,4.3vw,20px)", lineHeight: 1.2 }}
        >
          {displayName}
        </div>
        <div className="mt-2 rounded-full" style={{ height: 3, width: 56, background: t.goldBand }} />
        <div className="text-[11px] mt-2" style={{ color: t.sub }}>Endocrinologia · Diretor Clínico</div>
        {/* Texto do concierge — enxuto */}
        <p className="text-[11.5px] leading-relaxed mt-3" style={{ color: t.text }}>Consulta premium com prioridade de agenda.</p>
        {/* CTA alto, maiúsculo, mais saliente */}
        <div
          className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-lg text-[12.5px] font-black uppercase tracking-[0.12em] transition-transform duration-150 group-active:translate-y-0.5"
          style={{ color: t.ctaText, background: t.cta, boxShadow: t.ctaShadow, minHeight: 52 }}
        >
          <Sparkles className="w-4 h-4" /> CONCIERGE EXCLUSIVO <ChevronRight className="w-4 h-4" />
        </div>
        {/* Rodapé único e discreto */}
        <div className="mt-3.5 pt-3 flex items-center gap-1.5" style={{ borderTop: `1px solid ${t.hair}` }}>
          <ShieldCheck className="w-3.5 h-3.5" style={{ color: t.accent }} />
          <span className="text-[9.5px] font-bold uppercase tracking-[0.16em]" style={{ color: t.accent }}>AGENDA RESTRITA</span>
        </div>
      </div>
    </button>
  );
}

// --- Menu de entrada: cartão irmão (botão alto, maiúsculo, 3D saliente) — igual nos 2 temas ---
function CardGrupo({ Icon, eyebrow, name, role, onClick }: { Icon: typeof Stethoscope; eyebrow?: string; name: string; role?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-left group">
      <div className="panel-3d-hero rounded-xl px-4 flex items-center gap-3.5 transition-all duration-300 group-hover:panel-3d-active group-hover:-translate-y-0.5" style={{ minHeight: 84 }}>
        <div className="field-engraved flex items-center justify-center shrink-0 rounded-md" style={{ width: 48, height: 48 }}>
          <Icon className="w-5 h-5 text-accent" />
        </div>
        <div className="min-w-0 flex-1">
          {eyebrow ? <div className="text-[9px] font-black uppercase tracking-[0.18em] text-accent mb-0.5">{eyebrow}</div> : null}
          <div className="text-[13px] font-black uppercase tracking-[0.06em] text-primary leading-snug truncate">{name}</div>
          {role ? <div className="text-[11px] text-muted-foreground mt-1 truncate">{role}</div> : null}
        </div>
        <ChevronRight className="w-5 h-5 text-accent transition-colors shrink-0" />
      </div>
    </button>
  );
}

// --- Menu de entrada: rótulo de seção (MESMA cor nos dois rótulos, MAIÚSCULO, à esquerda) ---
function MenuSectionLabel({ theme, children }: { theme: "dark" | "light"; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-2 pb-1">
      <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: theme === "dark" ? "#f4e2a8" : "#8a6d2f" }}>{children}</span>
      <span className="flex-1 h-px bg-border" />
    </div>
  );
}

export default function Agendar({ _variant = "novo" }: { _variant?: "novo" | "antigo" } = {}) {
  const [, setLocation] = useLocation();
  const { theme, toggle } = useScreenTheme();
  const themeClass = theme === "dark" ? "dark" : "";
  const [flow, setFlow] = useState<"menu" | "estetico" | "drcaio" | "assistente" | "outras">("menu");

  const { data: contents = [], isLoading: isLoadingContents } = useListSiteContent();

  const getPhrase = (key: string, fallback: string) => {
    const item = contents.find((c) => c.category === "button_phrase" && c.contentKey === key);
    return item?.body || fallback;
  };

  const getText = (key: string, fallback: string) => {
    const item = contents.find((c) => c.category === "payment_text" && c.contentKey === key);
    return item?.body || fallback;
  };

  const getLink = (key: string) => {
    const item = contents.find((c) => c.category === "payment_link" && c.contentKey === key);
    return (item?.body || "").trim();
  };

  const videoItem = contents.find((c) => c.category === "video" && c.contentKey === "video_apresentacao_geral");

  const btnInjetavel = getPhrase("btn_entrada_injetavel", "PROTOCOLOS INJETÁVEIS");
  const btnEstetico = getPhrase("btn_entrada_estetico", "PROTOCOLOS ESTÉTICOS");
  const btnDrCaio = getPhrase("btn_entrada_drcaio", "DR. CAIO HENRIQUE FERNANDES PÁDUA");
  const btnAssistente = getPhrase("btn_entrada_assistentes", "Médicos Assistentes");
  const btnOutras = getPhrase("btn_entrada_outras", "Outras Categorias");

  const txtEstetico = getText("pay_text_estetico", "Procedimentos estéticos são acertados presencialmente.");
  const txtConcierge = getText("pay_text_concierge", "O serviço Concierge garante encaixe prioritário.");
  const txtAssistente = getText("pay_text_assistente", "Sinal de 25% para reserva da agenda.");

  const linkEstetico = getLink("pay_link_estetico");
  const linkConcierge = getLink("pay_link_concierge");
  const linkAssistente = getLink("pay_link_assistente");

  if (isLoadingContents) {
    return (
      <div className={themeClass}>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-accent animate-spin" />
        </div>
      </div>
    );
  }

  // ── Fluxos compartilhados entre os dois modelos (sem hooks — só JSX) ─────
  const flows = (
    <>
      {flow === "menu" && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="text-center space-y-2 mt-4">
            <h2 className="text-2xl font-serif text-primary">Como podemos ajudar?</h2>
            <p className="text-sm text-muted-foreground">Escolha o serviço desejado para iniciar seu atendimento.</p>
          </div>

          {videoItem?.mediaUrl && <VideoPlayer url={videoItem.mediaUrl} />}

          {/* Dr. Caio — destaque máximo, mais largo (muda por tema) */}
          <FlagshipDrCaio theme={theme} name={btnDrCaio} onClick={() => setFlow("drcaio")} />

          {/* Corpo Clínico — agrupador recuado (mais estreito que o Dr. Caio) */}
          <div className="px-2 space-y-3">
            <MenuSectionLabel theme={theme}>CORPO CLÍNICO</MenuSectionLabel>
            <CardGrupo
              Icon={Stethoscope}
              name={stripConsultaCom(btnAssistente)}
              role="Escolha o profissional para consulta"
              onClick={() => setFlow("assistente")}
            />
          </div>

          {/* Outros serviços — agrupador recuado */}
          <div className="px-2 space-y-3">
            <MenuSectionLabel theme={theme}>OUTROS SERVIÇOS</MenuSectionLabel>
            <CardGrupo
              Icon={Sparkles}
              name={stripConsultaCom(btnOutras)}
              role="Injetáveis, estética e mais"
              onClick={() => setFlow("outras")}
            />
          </div>
        </div>
      )}

      {flow === "outras" && (
        <div className="space-y-6 animate-in slide-in-from-right-8 duration-300">
          <div className="flex items-center gap-3 mb-2">
            <button onClick={() => setFlow("menu")} className="w-8 h-8 shrink-0 rounded-md bg-card border border-border flex items-center justify-center text-primary hover:bg-muted transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h2 className="font-serif text-xl text-primary truncate">Outras Categorias</h2>
          </div>
          <div className="space-y-3">
            <CardGrupo
              Icon={Syringe}
              eyebrow="INJETÁVEIS"
              name={btnInjetavel}
              role="Protocolos e anamnese"
              onClick={() => setLocation("/anamnese/v2")}
            />
            <CardGrupo
              Icon={Sparkles}
              eyebrow="ESTÉTICA"
              name={btnEstetico}
              role="Procedimentos estéticos"
              onClick={() => setFlow("estetico")}
            />
          </div>
        </div>
      )}

      {flow === "estetico" && (
        <EsteticoFlow
          onBack={() => setFlow("menu")}
          title={btnEstetico}
          payText={txtEstetico}
          payLink={linkEstetico}
        />
      )}

      {flow === "drcaio" && (
        <DrCaioFlow
          onBack={() => setFlow("menu")}
          title={btnDrCaio}
          payTextConcierge={txtConcierge}
          payLink={linkConcierge}
          theme={theme}
        />
      )}

      {flow === "assistente" && (
        <AssistenteFlow
          onBack={() => setFlow("menu")}
          title={btnAssistente}
          payText={txtAssistente}
          payLink={linkAssistente}
        />
      )}
    </>
  );

  // ── MODELO ANTIGO — preservado sem exclusão (ordem CEO 11/08/2026). ────────
  // Terno risca de giz no HEADER (panel-3d), corpo neutro bg-background.
  // Acessível via /agendar-antigo | menu "Marcação (Modelo Antigo)".
  if (_variant === "antigo") {
    return (
      <div className={themeClass}>
      <div className="min-h-[100dvh] bg-background text-foreground font-sans flex flex-col">
        <header
          className="relative overflow-hidden panel-3d sticky top-0 z-20 px-3 sm:px-4 py-3 border-b border-border rounded-none rounded-b-lg"
          style={{ background: theme === "dark"
            ? "linear-gradient(180deg, #13233f 0%, #0d1830 100%)"
            : "linear-gradient(180deg, #faf6ee 0%, #f1e9d8 100%)" }}
        >
          <div className="leva-fabric" aria-hidden="true" />
          <div className="relative z-[1] flex items-center justify-between gap-2 min-w-0 max-w-5xl mx-auto w-full">
            <div className="flex items-center gap-2.5 min-w-0">
              <PaxterLockup orientation="horizontal" symbolPx={34} wordWidth={130} showTagline tone="dark" />
            </div>
            <ThemeToggle theme={theme} onToggle={toggle} />
          </div>
        </header>
        <main className="flex-1 w-full max-w-lg mx-auto p-4 sm:p-6 pb-20 flex flex-col gap-6">
          {flows}
        </main>
      </div>
      </div>
    );
  }

  // ── MODELO NOVO (padrão desde 11/08/2026) — mesmo DNA visual da Área do Cliente. ──
  // Corpo recebe champanhe-linho (#f3ecdd) com leva-fabric; header panel-3d igual ao /area.
  const isDark = theme === "dark";
  return (
    <div
      className={`${themeClass} agendar-novo relative`}
      style={{
        minHeight: "100vh",
        background: isDark
          ? "linear-gradient(160deg,#0b1e3a 0%,#0e2244 55%,#122a50 100%)"
          : "#f3ecdd",
      }}
    >
      <div className="leva-fabric" aria-hidden="true" />
      <div className="relative z-[1] flex flex-col min-h-screen">
        {/* Header panel-3d — mesmo padrão do /area (Área do Paciente) */}
        <header className="panel-3d px-4 py-5 flex items-center justify-between border-b border-border/60 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <PaxterSymbolGlass size={52} tone={isDark ? "dark" : "light"} sharp={true} />
            <div className="flex flex-col items-start gap-1">
              {/* Wordmark PAXTER — arte oficial */}
              <img
                src="/brand/paxter-wordmark.png"
                alt="PAXTER"
                style={{ height: 24, width: "auto", objectFit: "contain" }}
                draggable={false}
              />
              <p
                className="text-accent"
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontWeight: 600, fontSize: 10,
                  letterSpacing: "0.10em",
                }}
              >
                AGENDAMENTO
              </p>
            </div>
          </div>
          <ThemeToggle theme={theme} onToggle={toggle} />
        </header>
        <main className="flex-1 w-full max-w-lg mx-auto p-4 sm:p-6 pb-20 flex flex-col gap-6">
          {flows}
        </main>
        <AgendarTernoFooter theme={theme} />
      </div>
      <AgendarPadconWatermark />
    </div>
  );
}

// ── Rodapé de assinatura terno (idêntico ao da Área do Cliente) ──────────────
function AgendarTernoFooter({ theme = "light" }: { theme?: string }) {
  const isDark = theme === "dark";
  return (
    <footer
      style={{
        position: "relative", overflow: "hidden",
        background: isDark ? "#0d1f3a" : "#f0e8d4",
        borderTop:    `1px solid ${isDark ? "rgba(194,160,90,0.30)" : "rgba(138,109,47,0.35)"}`,
        borderBottom: `2px solid ${isDark ? "rgba(194,160,90,0.65)" : "rgba(138,109,47,0.55)"}`,
        padding: "9px 16px 10px",
      }}
    >
      <div className="leva-fabric" aria-hidden="true" style={{ opacity: isDark ? 0.70 : 0.55 }} />
      <div className="relative z-10 flex items-center justify-between max-w-lg mx-auto" style={{ gap: 12 }}>
        <img
          src="/brand/padaxor-wordmark-trim.png" alt="PADAXOR"
          style={{ height: 18, width: "auto", objectFit: "contain", opacity: isDark ? 0.92 : 0.85 }}
          draggable={false}
        />
        <div style={{ flex: 1, height: 1, background: isDark
          ? "linear-gradient(90deg,rgba(194,160,90,0.10),rgba(194,160,90,0.30),rgba(194,160,90,0.10))"
          : "linear-gradient(90deg,rgba(138,109,47,0.10),rgba(138,109,47,0.25),rgba(138,109,47,0.10))" }}
        />
        <PaxterWordmarkArt width={72} tone={isDark ? "dark" : "light"} />
      </div>
    </footer>
  );
}

// ── Carimbo PADCON — canto inferior direito ───────────────────────────────────
function AgendarPadconWatermark() {
  return (
    <div className="fixed right-3 z-50 pointer-events-none select-none" style={{ bottom: "76px" }} aria-hidden="true">
      <div className="flex flex-col items-end gap-0.5 opacity-70">
        <PadconWordmark height={20} outlined />
        <p className="text-muted-foreground text-right" style={{ fontSize: 7, letterSpacing: "0.07em", lineHeight: 1.2 }}>
          Advanced Systems Architecture
        </p>
      </div>
    </div>
  );
}

/** Modelo anterior — preservado sem exclusão (ordem CEO 11/08/2026).
 *  Terno risca de giz no header (panel-3d), corpo neutro bg-background.
 *  Rota: /agendar-antigo | Menu: "Marcação (Modelo Antigo)". */
export function AgendarAntigo() {
  return <Agendar _variant="antigo" />;
}

// ── SELECT PAXTER — substitui <select> nativo; visual Paxter up-bevel ────────
function PaxterSelect({
  value, onChange, options, isDark, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  isDark: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const label = options.find(o => o.value === value)?.label ?? placeholder ?? "Selecionar";
  const bg = isDark
    ? "linear-gradient(180deg, #243860 0%, #1a2e52 55%, #122244 100%)"
    : "linear-gradient(180deg, #ffffff 0%, #f3ead8 55%, #e4d6bc 100%)";
  const border = isDark ? "rgba(100,148,210,0.22)" : "rgba(184,146,77,0.36)";
  const shadow = isDark
    ? "0 3px 8px rgba(0,0,0,0.44), inset 0 2px 0 rgba(255,255,255,0.11), inset 0 -3px 6px rgba(0,0,0,0.30)"
    : "0 3px 7px rgba(7,22,43,0.17), inset 0 2px 0 rgba(255,255,255,0.96), inset 0 -3px 6px rgba(7,22,43,0.07)";
  const textColor = isDark ? "rgba(200,218,245,0.88)" : "rgba(22,40,74,0.82)";

  return (
    <div style={{ position: "relative", zIndex: open ? 40 : "auto" }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{
        width: "100%", background: bg, border: `1px solid ${border}`,
        borderRadius: open ? "8px 8px 0 0" : 8, boxShadow: shadow,
        padding: "11px 14px", color: textColor, fontSize: 14, textAlign: "left",
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between",
        transition: "all 0.18s ease",
      }}>
        <span>{label}</span>
        <span style={{ color: "#c2a05a", fontSize: 11, marginLeft: 8 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0,
          background: isDark ? "linear-gradient(180deg, #1e3464 0%, #152850 100%)" : "linear-gradient(180deg, #fdfbf5 0%, #f6eddb 100%)",
          border: `1px solid ${border}`, borderTop: "none",
          borderRadius: "0 0 8px 8px", overflow: "hidden",
          boxShadow: isDark ? "0 10px 24px rgba(0,0,0,0.6)" : "0 8px 20px rgba(7,22,43,0.18)",
          zIndex: 50,
        }}>
          {options.map((opt, i) => {
            const isSel = opt.value === value;
            return (
              <button key={opt.value} type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                style={{
                  width: "100%", textAlign: "left", padding: "11px 14px",
                  background: isSel
                    ? "linear-gradient(180deg, #f4e2a8 0%, #c2a05a 55%, #8a6d2f 100%)"
                    : "transparent",
                  color: isSel ? "#16284a" : textColor,
                  border: "none",
                  borderTop: i > 0 ? `1px solid ${isDark ? "rgba(100,148,210,0.12)" : "rgba(184,146,77,0.18)"}` : "none",
                  cursor: "pointer", fontSize: 14, fontWeight: isSel ? 600 : 400,
                  transition: "background 0.12s ease",
                }}
              >{opt.label}</button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── CALENDÁRIO PAXTER — substitui <input type="date"> nativo; visual Paxter ──
function PaxterCalendar({
  value, onChange, isDark, minDate,
}: {
  value: string;       // "YYYY-MM-DD" ou ""
  onChange: (v: string) => void;
  isDark: boolean;
  minDate?: string;    // "YYYY-MM-DD"; default = hoje
}) {
  const todayStr = isoLocal(new Date());
  const min = minDate ?? todayStr;
  const parsed = value ? new Date(value + "T12:00:00") : new Date();
  const [viewYear, setViewYear] = useState(parsed.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed.getMonth());

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const monthLabel = new Date(viewYear, viewMonth, 1)
    .toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const DOW = ["D", "S", "T", "Q", "Q", "S", "S"];
  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: Array<number | null> = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const c = {
    bg:     isDark ? "#0c1d38" : "#fdf8f0",
    border: isDark ? "rgba(100,148,210,0.26)" : "rgba(184,146,77,0.42)",
    text:   isDark ? "#c8d7f0" : "#16284a",
    muted:  isDark ? "rgba(100,148,210,0.40)" : "rgba(22,40,74,0.30)",
    navBg:  isDark ? "rgba(255,255,255,0.07)" : "rgba(22,40,74,0.05)",
  };

  return (
    <div style={{
      background: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: 10,
      padding: "14px 12px 12px",
      boxShadow: isDark
        ? "inset 0 3px 8px rgba(0,0,0,0.52), inset 0 -1px 0 rgba(255,255,255,0.07)"
        : "inset 0 3px 6px rgba(7,22,43,0.20), inset 0 -1px 0 rgba(255,255,255,0.94)",
    }}>
      {/* Navegação mês */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button type="button" onClick={prevMonth} style={{
          width: 30, height: 30, borderRadius: 6, border: `1px solid ${c.border}`,
          background: c.navBg, color: "#c2a05a", cursor: "pointer",
          fontSize: 18, lineHeight: "1", display: "flex", alignItems: "center", justifyContent: "center",
        }}>‹</button>
        <span style={{
          fontFamily: "'Playfair Display', Georgia, serif", fontStyle: "italic", fontSize: 14,
          background: "linear-gradient(135deg, #f4e2a8 0%, #c2a05a 50%, #8a6d2f 100%)",
          WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent",
          textTransform: "capitalize",
        }}>{monthLabel}</span>
        <button type="button" onClick={nextMonth} style={{
          width: 30, height: 30, borderRadius: 6, border: `1px solid ${c.border}`,
          background: c.navBg, color: "#c2a05a", cursor: "pointer",
          fontSize: 18, lineHeight: "1", display: "flex", alignItems: "center", justifyContent: "center",
        }}>›</button>
      </div>

      {/* Cabeçalho D S T Q Q S S */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
        {DOW.map((d, i) => (
          <div key={i} style={{
            textAlign: "center", fontSize: 10, fontWeight: 700,
            letterSpacing: "0.12em", color: c.muted, paddingBottom: 4,
          }}>{d}</div>
        ))}
      </div>

      {/* Grade de dias */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={i} style={{ height: 32 }} />;
          const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isSel   = iso === value;
          const isToday = iso === todayStr;
          const isPast  = iso < min;
          return (
            <button
              key={i}
              type="button"
              disabled={isPast}
              onClick={() => onChange(iso)}
              style={{
                height: 32, borderRadius: 6, border: "none",
                cursor: isPast ? "default" : "pointer",
                fontSize: 13, fontWeight: isSel ? 700 : 400,
                opacity: isPast ? 0.26 : 1,
                transition: "all 0.14s ease",
                background: isSel
                  ? "linear-gradient(180deg, #f4e2a8 0%, #c2a05a 55%, #8a6d2f 100%)"
                  : isToday
                  ? (isDark ? "rgba(194,160,90,0.18)" : "rgba(194,160,90,0.13)")
                  : "transparent",
                color: isSel ? "#16284a" : isToday ? "#c2a05a" : c.text,
                boxShadow: isSel
                  ? "0 2px 6px rgba(194,160,90,0.50), inset 0 1px 0 rgba(255,255,255,0.62)"
                  : isToday
                  ? "0 0 0 1px rgba(194,160,90,0.55)"
                  : "none",
              }}
            >{day}</button>
          );
        })}
      </div>

      {/* Limpar */}
      {value && (
        <div style={{ textAlign: "right", marginTop: 8 }}>
          <button type="button" onClick={() => onChange("")} style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 11, color: c.muted, letterSpacing: "0.08em", textDecoration: "underline",
          }}>Limpar</button>
        </div>
      )}
    </div>
  );
}

// --- DOOR 2: ESTETICOS ---
function EsteticoFlow({ onBack, title, payText, payLink }: { onBack: () => void; title: string; payText: string; payLink: string }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [desire, setDesire] = useState("");
  const [prefWeekday, setPrefWeekday] = useState<string>("");
  const [prefPeriod, setPrefPeriod] = useState<string>("");

  const createReq = useCreateSchedulingRequest();
  const [success, setSuccess] = useState(false);

  const handleSubmit = () => {
    if (!name || phone.replace(/\D/g,"").length < 10) return;
    createReq.mutate({
      data: {
        entrada: "estetico",
        patientName: name,
        patientPhone: phone.replace(/\D/g,""),
        patientEmail: email || undefined,
        patientCpf: cpf.replace(/\D/g,"") || undefined,
        desire: desire || undefined,
        preferredWeekday: prefWeekday ? parseInt(prefWeekday, 10) : undefined,
        preferredPeriod: prefPeriod || undefined,
      }
    }, {
      onSuccess: () => setSuccess(true)
    });
  };

  if (success) return <SuccessState onBack={onBack} />;

  return (
    <div className="space-y-6 animate-in slide-in-from-right-8 duration-300">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="w-8 h-8 shrink-0 rounded-md bg-card border border-border flex items-center justify-center text-primary hover:bg-muted transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h2 className="font-serif text-xl text-primary truncate">{title}</h2>
      </div>

      <div className="panel-3d-sub p-5 space-y-4">
        <div className="bg-muted/50 p-4 rounded border border-border">
          <p className="text-xs text-foreground leading-relaxed">{payText}</p>
          <PaymentLinkButton url={payLink} label="Combinar pagamento" />
        </div>

        <div className="space-y-3">
          <Field label="NOME COMPLETO *" value={name} onChange={setName} placeholder="Seu nome" />
          <Field label="TELEFONE (WHATSAPP) *" value={phone} onChange={(v) => setPhone(formatPhone(v))} placeholder="(00) 00000-0000" type="tel" />
          <Field label="CPF (OPCIONAL)" value={cpf} onChange={(v) => setCpf(formatCpf(v))} placeholder="000.000.000-00" type="tel" />
          <Field label="EMAIL (OPCIONAL)" value={email} onChange={setEmail} placeholder="seu@email.com" type="email" />
          
          <div className="pt-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-primary mb-1.5">O QUE VOCÊ DESEJA FAZER?</label>
            <textarea
              className="field-engraved w-full p-3 rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none min-h-[80px]"
              placeholder="Ex: botox, preenchimento..."
              value={desire}
              onChange={(e) => setDesire(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-primary mb-1.5">DIA PREFERIDO</label>
              <select 
                className="field-engraved w-full h-10 px-3 rounded-md text-sm text-foreground focus:outline-none bg-transparent"
                value={prefWeekday} onChange={(e) => setPrefWeekday(e.target.value)}
              >
                <option value="">Qualquer dia</option>
                <option value="1">Segunda-feira</option>
                <option value="2">Terça-feira</option>
                <option value="3">Quarta-feira</option>
                <option value="4">Quinta-feira</option>
                <option value="5">Sexta-feira</option>
                <option value="6">Sábado</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-primary mb-1.5">PERÍODO</label>
              <select 
                className="field-engraved w-full h-10 px-3 rounded-md text-sm text-foreground focus:outline-none bg-transparent"
                value={prefPeriod} onChange={(e) => setPrefPeriod(e.target.value)}
              >
                <option value="">Qualquer horário</option>
                <option value="manha">Manhã</option>
                <option value="tarde">Tarde</option>
                <option value="noite">Noite</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={!name || phone.replace(/\D/g,"").length < 10 || createReq.isPending}
        className="btn-3d w-full h-12 flex items-center justify-center gap-2 font-black uppercase tracking-widest text-sm disabled:opacity-50"
      >
        {createReq.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "SOLICITAR ATENDIMENTO"}
      </button>
    </div>
  );
}

// --- DOOR 3: DR CAIO ---
// Fluxo concierge (Revisao 3, 02/07/2026): a agenda REAL e confrontada ANTES do
// pagamento (estagio "oferta"), entao o horario ja esta escolhido quando o senhor
// paga. O antigo "Motor #2" pos-pagamento (teatro que revelava vagas fabricadas)
// foi removido — pagar e o ultimo passo e leva direto ao sucesso.
const MOTOR1_MS = 3000; // espera curta do Motor #1 (verificacao da agenda)
const FAROL_MS = 10000; // farol (stage "vias"): % sobe de 0 a 100 ate o verde (Helena disponivel)

// MOLDURA "terno azul-marinho" — reaproveitada por motor1 / vias para que o
// simbolo respirando (topo) e as mensagens do farol (faixa de baixo) fiquem CONCORRENTES.
// O wrapper .dark forca as classes 3D (panel-3d/concave-3d/bevel-3d) para a variante navy,
// independente do tema da pagina, igual a tela "foto do paciente" elogiada pelo CEO.
function TernoFarol({ pct, children, band, fill, isDark }: { pct: number; children: ReactNode; band?: ReactNode; fill?: boolean; isDark: boolean }) {
  return (
    <div className={isDark ? "dark" : ""}>
      <div
        className={`relative overflow-hidden panel-3d rounded-xl p-6 sm:p-7 flex flex-col gap-6 ${fill ? "min-h-[calc(100dvh-10rem)]" : "min-h-[380px]"}`}
        style={{ background: isDark
          ? "linear-gradient(180deg, #13233f 0%, #0d1830 100%)"
          : "linear-gradient(180deg, #faf6ee 0%, #f1e9d8 100%)" }}
      >
        {/* TOPO: simbolo respirando + texto editorial, SEMPRE visivel */}
        <div className="relative z-[1] flex-1 flex flex-col items-center justify-center text-center gap-4">{children}</div>
        {/* BAIXO: faixa de status (cor = estado) a esquerda + WELL da % FIXO no canto
            inferior direito. O well tem largura/altura FIXAS para que a posicao nunca
            mude com o numero de digitos (5 -> 49 -> 100) nem com o tamanho da frase. */}
        <div className="relative z-[1] flex items-end gap-4">
          <div className="flex-1 min-w-0">{band}</div>
          <div className="concave-3d rounded-md w-[86px] h-[60px] shrink-0 flex items-baseline justify-center gap-0.5">
            <span className="dc-serif dc-gold text-3xl tabular-nums leading-none">{Math.round(pct)}</span>
            <span className="text-[11px] leading-none" style={{ color: "#c2a05a" }}>%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function DrCaioFlow({ onBack, title, payTextConcierge, payLink, theme }: { onBack: () => void; title: string; payTextConcierge: string; payLink: string; theme: "dark" | "light" }) {
  const isDark = theme === "dark";
  // REVISAO 3 — maquina de estagios do fluxo Dr. Caio:
  // form -> motor1 -> vias -> (comum | oferta -> pay)
  type Stage = "form" | "motor1" | "vias" | "comum" | "oferta" | "pay";
  const [stage, setStage] = useState<Stage>("form");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [desire, setDesire] = useState("");

  // Passo 1: data desejada (alimenta a janela DISTANTE: Motor #1 + Via Comum).
  const [earliestDate, setEarliestDate] = useState("");
  // Preferencia do concierge (coletada no estagio "oferta"): filtra a agenda REAL.
  const [prefWeekday, setPrefWeekday] = useState("");
  const [prefPeriod, setPrefPeriod] = useState<"" | "manha" | "tarde">("");

  // Slot concreto escolhido (data + hora) — vale para Via Comum e Concierge.
  const [chosenSlotDate, setChosenSlotDate] = useState("");
  const [chosenSlotTime, setChosenSlotTime] = useState("");

  // Via escolhida na tela das duas possibilidades.
  const [via, setVia] = useState<"comum" | "concierge" | "">("");

  // Motores: porcentagem animada + mensagem encadeada (so Motor #2) + faixa vermelha transitoria.
  const [pct, setPct] = useState(0);
  // Faixa de status do Ato IV: 0=vermelho (sem vaga) -> 1=amarelo (verificando concierge) -> 2=verde (Helena disponivel).
  const [viaPhase, setViaPhase] = useState<0 | 1 | 2>(0);

  const createReq = useCreateSchedulingRequest();
  const conciergeCharge = useCreateConciergeCharge();
  const updateReq = useUpdateSchedulingRequest();
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Estado do modal de verificação de contato (requiresVerification).
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState("");

  // Pagamento real Concierge (Asaas): id da solicitacao + pagina hospedada + status ao vivo.
  const [requestId, setRequestId] = useState<number | null>(null);
  // Crachá HMAC desta solicitacao (emitido na criacao). Vai em todas as rotas
  // de cobranca/status/confirmacao; sem ele o servidor nega (403).
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [invoiceUrl, setInvoiceUrl] = useState("");
  // Meio de pagamento escolhido ANTES de gerar a cobrança (spec cartão):
  // "pix" = QR embutido no Paxter; "card" = fatura hospedada do Asaas.
  const [payMethod, setPayMethod] = useState<"pix" | "card">("pix");
  // QR PIX embutido (pago DENTRO do Paxter). Se o Asaas nao devolver o QR,
  // caimos honestamente no invoiceUrl (link hospedado) — sem fingir QR.
  const [pixQrImage, setPixQrImage] = useState<string | null>(null);
  const [pixPayload, setPixPayload] = useState<string | null>(null);
  const [pixCopied, setPixCopied] = useState(false);
  const [payStatus, setPayStatus] = useState<
    "idle" | "aguardando" | "pago" | "expirado" | "cancelado"
  >("idle");

  // Polling do status real da cobranca (a cada 4s, so enquanto aguardando).
  // O crachá viaja no header x-scheduling-token (rota GET nao tem corpo).
  const paymentStatusQuery = useGetSchedulingPaymentStatus(requestId ?? 0, {
    query: {
      queryKey: getGetSchedulingPaymentStatusQueryKey(requestId ?? 0),
      enabled:
        requestId != null &&
        !!invoiceUrl &&
        !!accessToken &&
        payStatus === "aguardando",
      refetchInterval: 4000,
    },
    request: {
      headers: accessToken ? { "x-scheduling-token": accessToken } : {},
    },
  });

  // Oferta REAL do concierge: confronta a agenda de verdade (escassez / dia
  // vizinho / contiguidade) ANTES do pagamento. So dispara no estagio "oferta".
  // Inclui CPF na query para a trava de escassez verificar penalidade no servidor.
  const cpfDigitsOffer = cpf.replace(/\D/g, "");
  const offerQuery = useQuery({
    queryKey: [
      "concierge-offer",
      prefWeekday,
      prefPeriod,
      earliestDate,
      cpfDigitsOffer,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (prefWeekday) params.set("weekday", prefWeekday);
      if (prefPeriod) params.set("period", prefPeriod);
      if (earliestDate) params.set("earliest", earliestDate);
      if (cpfDigitsOffer.length >= 11) params.set("cpf", cpfDigitsOffer);
      const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
      const res = await fetch(
        `${BASE}/api/scheduling/concierge-offer?${params.toString()}`,
      );
      if (!res.ok) throw new Error("Falha ao buscar oferta");
      return res.json() as Promise<{
        blocked?: boolean;
        throttled?: boolean;
        requiresVerification?: boolean;
        motivo?: string;
        mensagem?: string;
        tentativas?: number;
        penalidade_dias?: number;
        days?: { date: string; times: { time: string }[] }[];
      }>;
    },
    enabled: stage === "oferta",
  });

  // Confirmacao automatica: ao Asaas confirmar o PIX, confirma o horario ja
  // escolhido (PATCH) e vai direto ao sucesso — sem teatro pos-pagamento.
  useEffect(() => {
    const s = paymentStatusQuery.data?.status;
    if (!s || s === payStatus) return;
    if (s === "pago") {
      setPayStatus("pago");
    } else if (s === "expirado" || s === "cancelado") {
      setPayStatus(s);
    }
  }, [paymentStatusQuery.data?.status, payStatus]);

  // Gera a cobranca real: cria a solicitacao (uma vez) e abre a pagina hospedada.
  // O token e passado explicitamente (o state pode nao ter atualizado ainda no
  // fluxo criar->cobrar dentro do mesmo clique).
  const doCharge = (id: number, cpfDigits: string, token: string | null) => {
    conciergeCharge.mutate(
      {
        id,
        data: {
          patientCpf: cpfDigits,
          accessToken: token ?? undefined,
          method: payMethod,
        },
      },
      {
        onSuccess: (r) => {
          setInvoiceUrl(r.invoiceUrl);
          setPixQrImage(r.pixQrImage ?? null);
          setPixPayload(r.pixPayload ?? null);
          if (r.status === "pago") {
            setPayStatus("pago");
          } else {
            setPayStatus("aguardando");
          }
          // Cartão: abrimos a fatura hospedada do Asaas em nova aba (cartão +
          // parcelamento na página segura); o polling segue confirmando.
          if (payMethod === "card" && r.invoiceUrl) {
            window.open(r.invoiceUrl, "_blank", "noopener,noreferrer");
          }
        },
        onError: (err: any) =>
          setErrorMsg(err.message || "Erro ao gerar a cobrança."),
      },
    );
  };

  const handleGenerateCharge = () => {
    setErrorMsg("");
    const cpfDigits = cpf.replace(/\D/g, "");
    if (cpfDigits.length < 11) {
      setErrorMsg("Informe um CPF válido para gerar a cobrança.");
      return;
    }
    if (requestId != null) {
      doCharge(requestId, cpfDigits, accessToken);
      return;
    }
    const preferredPeriod = prefPeriod || undefined;
    createReq.mutate(
      {
        data: {
          entrada: "dr_caio",
          path: "concierge",
          patientName: name,
          patientPhone: phone.replace(/\D/g, ""),
          patientEmail: email || undefined,
          patientCpf: cpfDigits,
          desire: desire || undefined,
          earliestDate: earliestDate || undefined,
          preferredWeekday: prefWeekday ? parseInt(prefWeekday, 10) : undefined,
          preferredPeriod,
        },
      },
      {
        onSuccess: (created) => {
          setRequestId(created.id);
          const token = created.accessToken ?? null;
          setAccessToken(token);
          doCharge(created.id, cpfDigits, token);
        },
        onError: (err: any) =>
          setErrorMsg(err.message || "Erro ao criar a solicitação."),
      },
    );
  };

  // Confirmacao final do horario (Concierge): PATCH na solicitacao ja paga.
  const confirmConcierge = () => {
    if (requestId == null) {
      setErrorMsg("Sessão de pagamento perdida. Recomece o agendamento.");
      return;
    }
    setErrorMsg("");
    updateReq.mutate(
      {
        id: requestId,
        data: {
          chosenDate: chosenSlotDate || undefined,
          chosenTime: chosenSlotTime || undefined,
          accessToken: accessToken ?? undefined,
        },
      },
      {
        onSuccess: () => setSuccess(true),
        onError: (err: any) =>
          setErrorMsg(err.message || "Erro ao confirmar o horário."),
      },
    );
  };

  // --- Persistencia do fluxo de pagamento (Bloco A / R3) ---
  // O celular costuma trocar de app (banco) e voltar; guardamos o minimo em
  // sessionStorage para NAO perder a solicitacao ja paga/gerada. So persiste
  // enquanto ha pagamento em andamento (estagio "pay" com cobranca gerada).
  const FLOW_KEY = "dc_concierge_flow_v1";

  // Restaura um pagamento em andamento ao montar (uma unica vez).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(FLOW_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s?.stage === "pay" && s?.requestId && s?.invoiceUrl) {
        setStage("pay");
        setVia("concierge");
        setName(s.name || "");
        setPhone(s.phone || "");
        setEmail(s.email || "");
        setCpf(s.cpf || "");
        setDesire(s.desire || "");
        setEarliestDate(s.earliestDate || "");
        setPrefWeekday(s.prefWeekday || "");
        setPrefPeriod(s.prefPeriod || "");
        setChosenSlotDate(s.chosenSlotDate || "");
        setChosenSlotTime(s.chosenSlotTime || "");
        setRequestId(s.requestId);
        setAccessToken(s.accessToken || null);
        setInvoiceUrl(s.invoiceUrl || "");
        setPixQrImage(s.pixQrImage || null);
        setPixPayload(s.pixPayload || null);
        setPayStatus(s.payStatus || "aguardando");
      }
    } catch {
      /* sessionStorage indisponivel/corrompido: segue o fluxo normal */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Salva o instantaneo enquanto o pagamento esta em andamento; limpa ao concluir.
  useEffect(() => {
    if (success) {
      try { sessionStorage.removeItem(FLOW_KEY); } catch { /* noop */ }
      return;
    }
    if (stage === "pay" && requestId != null && invoiceUrl) {
      try {
        sessionStorage.setItem(
          FLOW_KEY,
          JSON.stringify({
            stage, requestId, accessToken, invoiceUrl, pixQrImage, pixPayload,
            payStatus, chosenSlotDate, chosenSlotTime, name, phone, email, cpf,
            desire, earliestDate, prefWeekday, prefPeriod,
          }),
        );
      } catch {
        /* quota/indisponivel: apenas nao persiste */
      }
    }
  }, [
    success, stage, requestId, accessToken, invoiceUrl, pixQrImage, pixPayload,
    payStatus, chosenSlotDate, chosenSlotTime, name, phone, email, cpf, desire,
    earliestDate, prefWeekday, prefPeriod,
  ]);

  // Confirmacao automatica UNICA: quando o pagamento e "pago" e temos a
  // solicitacao, confirma o horario uma vez (vale tanto para o pagamento ao
  // vivo quanto para um fluxo restaurado). A falha cai na tela de recuperacao.
  const autoConfirmedRef = useRef(false);
  useEffect(() => {
    if (
      payStatus === "pago" &&
      !success &&
      requestId != null &&
      !autoConfirmedRef.current
    ) {
      autoConfirmedRef.current = true;
      confirmConcierge();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payStatus, success, requestId]);

  // Rotulo do horario reservado (usado na tela final).
  const reservedSlotLabel = useMemo(() => {
    if (!chosenSlotDate) return "";
    try {
      const d = new Date(`${chosenSlotDate}T12:00:00`);
      const dia = formatSlotDay(d);
      return chosenSlotTime ? `${dia} às ${chosenSlotTime}` : dia;
    } catch {
      return "";
    }
  }, [chosenSlotDate, chosenSlotTime]);

  const chargePending = createReq.isPending || conciergeCharge.isPending;

  // --- Janela DISTANTE (Via Comum): segunda a sexta, ~3 meses a frente, sem revelar prazo. ---
  // Cai depois de HOJE+3 meses e nunca antes da data desejada; jitter deterministico evita
  // o "3 meses redondos". Cada dia traz 1 horario de manha + 1 de tarde, com minutos
  // "quebrados" (08:40, 14:20...) para parecer COLADO a consultas ja existentes.
  const viaComum = useMemo(() => {
    const today = new Date();
    const base3m = addMonths(today, 3);
    const picked = earliestDate ? new Date(`${earliestDate}T12:00:00`) : base3m;
    let anchor = picked > base3m ? picked : base3m;
    const jitter = (today.getDate() % 6) + 2; // 2..7 dias
    anchor = addDays(anchor, jitter);
    const monday = nextWeekday(anchor, 1); // proxima segunda >= anchor
    const mornings = ["08:40", "09:20", "11:10", "08:00", "10:30"];
    const afternoons = ["14:20", "16:40", "13:30", "15:50", "15:00"];
    const days = [0, 1, 2, 3, 4].map((i) => {
      const d = addDays(monday, i);
      return {
        date: isoLocal(d),
        label: formatSlotDay(d),
        morning: mornings[i % mornings.length],
        afternoon: afternoons[i % afternoons.length],
      };
    });
    return { earliestLabel: formatSlotDay(monday), days };
  }, [earliestDate]);

  // A janela PROXIMA (Concierge) agora vem da agenda REAL via offerQuery — nao ha
  // mais grade fabricada. Ver estagio "oferta" no render.

  // Passo 1 -> Motor #1: exige nome + telefone + data desejada.
  const handleNext = () => {
    if (!name || phone.replace(/\D/g, "").length < 10 || !earliestDate) {
      setErrorMsg("Preencha nome, telefone e a data desejada.");
      return;
    }
    setErrorMsg("");
    setVia("");
    setChosenSlotDate("");
    setChosenSlotTime("");
    setStage("motor1");
  };

  // Tela das duas vias -> destino.
  const handleViaContinue = () => {
    setErrorMsg("");
    setChosenSlotDate("");
    setChosenSlotTime("");
    if (via === "comum") setStage("comum");
    else if (via === "concierge") setStage("oferta");
  };

  // Botao de voltar, sensivel ao estagio atual.
  const goBack = () => {
    setErrorMsg("");
    if (stage === "form") return onBack();
    if (stage === "motor1") return setStage("form");
    if (stage === "vias") return setStage("form");
    if (stage === "comum" || stage === "oferta") return setStage("vias");
    if (stage === "pay") return setStage("oferta");
  };

  // Motor #1 (~3s): verifica a agenda e revela que nao ha vaga no dia desejado.
  useEffect(() => {
    if (stage !== "motor1") return;
    setPct(0);
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(100, ((now - start) / MOTOR1_MS) * 100);
      setPct(p);
      if (p < 100) raf = requestAnimationFrame(tick);
      else setStage("vias");
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stage]);

  // Faixa de status do Ato IV: vermelho (0-4s) -> amarelo "verificando" (4-10s) -> verde "Helena disponivel" (10s, permanente).
  // Tempos calibrados por atencao: ~4s para ler o problema, ~6s de suspense (com spinner) e o verde fica fixo.
  useEffect(() => {
    if (stage !== "vias") { setViaPhase(0); return; }
    setViaPhase(0);
    setPct(0);
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(100, ((now - start) / FAROL_MS) * 100);
      setPct(p);
      if (p < 100) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const t1 = setTimeout(() => setViaPhase(1), 4000);   // amarelo: verificando o concierge
    const t2 = setTimeout(() => setViaPhase(2), 10000);  // verde: Helena disponivel (revela as vias)
    return () => { clearTimeout(t1); clearTimeout(t2); cancelAnimationFrame(raf); };
  }, [stage]);

  const submit = (finalPath: "concierge" | "fila") => {
    setErrorMsg("");
    const preferredPeriod = prefPeriod || undefined;
    createReq.mutate({
      data: {
        entrada: "dr_caio",
        path: finalPath,
        patientName: name,
        patientPhone: phone.replace(/\D/g, ""),
        patientEmail: email || undefined,
        patientCpf: cpf.replace(/\D/g, "") || undefined,
        desire: desire || undefined,
        earliestDate: earliestDate || undefined,
        preferredWeekday: prefWeekday ? parseInt(prefWeekday, 10) : undefined,
        preferredPeriod,
        chosenDate: chosenSlotDate || undefined,
        chosenTime: chosenSlotTime || undefined,
      }
    }, {
      onSuccess: () => setSuccess(true),
      onError: (err: any) => {
        setErrorMsg(err.message || "Erro ao processar solicitação.");
      }
    });
  };

  if (success)
    return (
      <SuccessState
        onBack={onBack}
        isExclusive
        booking={
          payStatus === "pago" && chosenSlotDate
            ? { date: chosenSlotDate, time: chosenSlotTime, email }
            : undefined
        }
      />
    );

  return (
    <div className={`dc-luxo space-y-10 animate-in fade-in duration-500 ${isDark ? "dc-dark" : "dc-light"}`}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400;1,500;1,600&display=swap');
        .dc-luxo .dc-serif { font-family: 'Playfair Display', Georgia, serif; }
        .dc-luxo .dc-gold {
          background: linear-gradient(135deg, #f4e2a8 0%, #c2a05a 50%, #8a6d2f 100%);
          -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
        }
        .dc-luxo .dc-input {
          width: 100%;
          background: ${isDark
            ? "linear-gradient(180deg, hsl(215 52% 8%) 0%, hsl(215 46% 13%) 45%)"
            : "linear-gradient(180deg, #ece6d6 0%, #faf6ec 42%)"};
          border: 1px solid ${isDark ? "rgba(100,148,210,0.26)" : "rgba(184,146,77,0.42)"};
          border-radius: 8px;
          box-shadow: ${isDark
            ? "inset 0 3px 8px rgba(0,0,0,0.58), inset 0 8px 14px rgba(0,0,0,0.28), inset 0 -1px 0 rgba(255,255,255,0.08)"
            : "inset 0 3px 6px rgba(7,22,43,0.22), inset 0 8px 12px rgba(7,22,43,0.09), inset 0 -1px 0 rgba(255,255,255,0.92)"};
          padding: 12px 14px; font-size: 15px; color: ${isDark ? "#e8edf6" : "#16284a"};
          outline: none; transition: border-color .3s ease, box-shadow .3s ease;
        }
        .dc-luxo .dc-input:focus {
          border-color: #c2a05a;
          box-shadow: ${isDark
            ? "inset 0 3px 8px rgba(0,0,0,0.58), inset 0 8px 14px rgba(0,0,0,0.28), inset 0 -1px 0 rgba(255,255,255,0.08), 0 0 0 2px rgba(194,160,90,0.22)"
            : "inset 0 3px 6px rgba(7,22,43,0.22), inset 0 8px 12px rgba(7,22,43,0.09), inset 0 -1px 0 rgba(255,255,255,0.92), 0 0 0 2px rgba(194,160,90,0.25)"};
        }
        .dc-luxo .dc-input::placeholder {
          color: ${isDark ? "rgba(255,255,255,0.28)" : "rgba(22,40,74,0.38)"};
          font-family: 'Playfair Display', Georgia, serif; font-style: italic;
        }
        .dc-luxo .dc-input:disabled { opacity: 0.55; cursor: not-allowed; }
        .dc-luxo .dc-select {
          appearance: none;
          background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${isDark ? "%23c2a05a" : "%238a6d2f"}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
          background-repeat: no-repeat; background-position: right 2px center; background-size: 1em; padding-right: 22px;
        }
        .dc-luxo .dc-chip {
          background: ${isDark
            ? "linear-gradient(180deg, #243860 0%, #1a2e52 55%, #122244 100%)"
            : "linear-gradient(180deg, #ffffff 0%, #f3ead8 55%, #e4d6bc 100%)"};
          border: 1px solid ${isDark ? "rgba(100,148,210,0.22)" : "rgba(184,146,77,0.36)"};
          box-shadow: ${isDark
            ? "0 3px 8px rgba(0,0,0,0.44), inset 0 2px 0 rgba(255,255,255,0.11), inset 0 -3px 6px rgba(0,0,0,0.30)"
            : "0 3px 7px rgba(7,22,43,0.17), inset 0 2px 0 rgba(255,255,255,0.96), inset 0 -3px 6px rgba(7,22,43,0.07)"};
          color: ${isDark ? "rgba(200,218,245,0.82)" : "rgba(22,40,74,0.76)"};
          transition: all .18s ease; border-radius: 8px;
        }
        .dc-luxo .dc-chip[data-active="true"] {
          background: linear-gradient(180deg, #9a7832 0%, #b8922a 40%, #c2a05a 100%);
          border-color: rgba(138,109,47,0.72);
          color: #fff8e8;
          box-shadow: inset 0 3px 7px rgba(80,50,10,0.42), inset 0 1px 3px rgba(0,0,0,0.20), 0 1px 0 rgba(255,255,255,0.28);
          transform: translateY(1px);
        }
        .dc-luxo .dc-concierge {
          background: ${isDark ? "linear-gradient(180deg, #1d335c 0%, #16284a 100%)" : "linear-gradient(180deg, #ffffff 0%, #f4f2ee 100%)"};
          border: 1px solid rgba(194,160,90,${isDark ? "0.35" : "0.45"});
          box-shadow: ${isDark ? "0 12px 32px -12px rgba(0,0,0,0.55)" : "0 12px 32px -12px rgba(22,40,74,0.12)"};
          border-radius: 8px;
        }
        .dc-luxo .dc-reveal { animation: dcReveal .6s cubic-bezier(0.16,1,0.3,1) both; }
        @keyframes dcReveal { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .dc-luxo .dc-breathe { display: inline-flex; animation: dcBreathe 3.5s ease-in-out infinite; }
        @keyframes dcBreathe { 0%, 100% { transform: scale(0.78); opacity: .80; } 50% { transform: scale(1.20); opacity: 1; } }
        .dc-luxo .dc-amber {
          background: ${isDark ? "linear-gradient(180deg, rgba(194,160,90,0.16), rgba(138,109,47,0.07))" : "linear-gradient(180deg, rgba(244,226,168,0.5), rgba(194,160,90,0.14))"};
          border: 1px solid rgba(194,160,90,0.4);
          backdrop-filter: blur(7px); -webkit-backdrop-filter: blur(7px);
          border-radius: 12px;
        }
        .dc-luxo .dc-status { transition: background-color .8s ease, border-color .8s ease; }
        .dc-luxo .dc-dot { transition: all .5s ease; }
        .dc-luxo .dc-dot-live { animation: dcDotPulse 1.2s ease-in-out infinite; }
        @keyframes dcDotPulse { 0%,100% { transform: scale(1); opacity: .9; } 50% { transform: scale(1.4); opacity: 1; } }
      `}</style>

      {/* Cabeçalho editorial */}
      <div className="flex items-center gap-3">
        <button onClick={goBack} className={`w-9 h-9 shrink-0 rounded-md border flex items-center justify-center transition-colors ${isDark ? "border-[#2a4470] text-stone-300 hover:bg-white/5" : "border-stone-300 text-[#16284a] hover:bg-black/5"}`}>
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] dc-gold mb-1">Acesso Exclusivo</p>
          <h2 className={`dc-serif text-2xl leading-none truncate ${isDark ? "text-white" : "text-[#16284a]"}`}>{title}</h2>
        </div>
      </div>

      {stage === "form" ? (
        <div className="flex flex-col gap-5">
          {/* ── PAINEL I — Suas Credenciais ─────────────────────────────── */}
          <div className={`panel-3d rounded-xl overflow-hidden ${isDark ? "dark" : ""}`}>
            <div className="login-card-topbar px-5 py-3 flex items-center gap-2 border-b border-border/60">
              <span className="dc-serif italic dc-gold text-base tracking-wide">I. Suas Credenciais</span>
            </div>
            <div className="login-card-body px-5 py-4 space-y-2">
              <input className="dc-input" placeholder="Nome completo" value={name} onChange={(e) => setName(e.target.value)} />
              <input className="dc-input" type="tel" placeholder="Telefone / WhatsApp" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} />
              <div className="grid grid-cols-2 gap-3">
                <input className="dc-input" type="tel" placeholder="CPF (opcional)" value={cpf} onChange={(e) => setCpf(formatCpf(e.target.value))} />
                <input className="dc-input" type="email" placeholder="E-mail (opcional)" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
          </div>

          {/* ── PAINEL II — O Desejo ─────────────────────────────────────── */}
          <div className={`panel-3d rounded-xl overflow-hidden ${isDark ? "dark" : ""}`}>
            <div className="login-card-topbar px-5 py-3 flex items-center gap-2 border-b border-border/60">
              <span className="dc-serif italic dc-gold text-base tracking-wide">II. O Desejo</span>
            </div>
            <div className="login-card-body px-5 py-4 space-y-4">
              <p className={`text-[11px] uppercase tracking-widest font-semibold ${isDark ? "text-stone-500" : "text-stone-400"}`}>O que motiva sua busca?</p>
              <div className="flex flex-wrap gap-2.5">
                {["Harmonização", "Rejuvenescimento", "Toxina Botulínica", "Protocolos Corporais", "Avaliação Exclusiva"].map((m) => (
                  <button key={m} type="button" onClick={() => setDesire(m)} data-active={desire === m} className="dc-chip px-4 py-2.5 text-sm">{m}</button>
                ))}
              </div>
              <input className="dc-input" placeholder="Ou descreva em suas próprias palavras..." value={desire} onChange={(e) => setDesire(e.target.value)} />
            </div>
          </div>

          {/* ── PAINEL III — O Tempo ─────────────────────────────────────── */}
          <div className={`panel-3d rounded-xl overflow-hidden ${isDark ? "dark" : ""}`}>
            <div className="login-card-topbar px-5 py-3 flex items-center gap-2 border-b border-border/60">
              <span className="dc-serif italic dc-gold text-base tracking-wide">III. O Tempo</span>
            </div>
            <div className="login-card-body px-5 py-4 space-y-3">
              <span className={`text-[10px] uppercase tracking-wider ${isDark ? "text-stone-500" : "text-stone-400"}`}>Para quando você gostaria? *</span>
              <PaxterCalendar
                value={earliestDate}
                onChange={(v) => { setEarliestDate(v); setChosenSlotDate(""); setChosenSlotTime(""); }}
                isDark={isDark}
              />
            </div>
          </div>

          {errorMsg && (
            <div className={`p-3 rounded text-xs flex items-start gap-2 ${isDark ? "bg-red-950/40 border border-red-900 text-red-400" : "bg-red-50 border border-red-200 text-red-700"}`}>
              <AlertCircle className="w-4 h-4 shrink-0" />
              <p>{errorMsg}</p>
            </div>
          )}

          <button
            onClick={handleNext}
            disabled={!name || phone.replace(/\D/g,"").length < 10 || !earliestDate}
            className="w-full py-4 bg-gradient-to-b from-[#f4e2a8] via-[#c2a05a] to-[#8a6d2f] text-[#16284a] rounded-lg font-bold uppercase tracking-[0.2em] text-xs shadow-[0_4px_14px_rgba(194,160,90,0.3)] hover:brightness-105 active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-3"
          >
            Prosseguir <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-8 animate-in fade-in duration-500">

          {/* MOTOR #1 — verificação curta da agenda (mesma moldura terno do farol) */}
          {stage === "motor1" && (
            <TernoFarol pct={pct} fill isDark={isDark}>
              <span className="dc-breathe"><PaxterSymbolGlass size={104} tone={isDark ? "dark" : "light"} /></span>
              <p className={`dc-serif italic text-lg ${isDark ? "text-stone-200" : "text-[#16284a]"}`}>Consultando a agenda do Dr. Caio…</p>
            </TernoFarol>
          )}

          {/* VIAS — não há vaga no dia + faixa vermelha + duas possibilidades */}
          {stage === "vias" && (
            <div className="flex flex-col gap-7">
              {/* FAROL — terno azul-marinho: simbolo respirando no topo + faixa de status embaixo, CONCORRENTES */}
              <TernoFarol
                pct={pct}
                isDark={isDark}
                fill={viaPhase !== 2}
                band={
                  <div
                    className={`dc-status relative overflow-hidden rounded-md min-h-[60px] flex items-center pl-5 pr-4 py-3 ${
                      viaPhase === 0 ? "paxter-alert paxter-alert-red"
                      : viaPhase === 1 ? "paxter-alert paxter-alert-amber"
                      : "bevel-3d bevel-3d-ok"
                    }`}
                    style={
                      viaPhase === 0 ? { background: "linear-gradient(180deg, rgba(220,38,38,0.26), rgba(127,29,29,0.16))" }
                      : viaPhase === 1 ? { background: "linear-gradient(180deg, rgba(245,158,11,0.24), rgba(146,98,7,0.14))" }
                      : undefined
                    }
                  >
                    {/* o "farol" e a COR do painel: borda lateral colorida (sem lampadas, sem icones) */}
                    <span
                      aria-hidden
                      className="absolute left-0 top-0 h-full w-[3px]"
                      style={{ background: viaPhase === 0 ? "#ef4444" : viaPhase === 1 ? "#f59e0b" : "#34d399" }}
                    />
                    <p key={viaPhase} className={`dc-reveal text-sm leading-relaxed ${
                      viaPhase === 0 ? (isDark ? "text-red-100" : "text-red-800")
                      : viaPhase === 1 ? (isDark ? "text-amber-50" : "text-amber-900")
                      : (isDark ? "text-emerald-50" : "text-emerald-800")
                    }`}>
                      {viaPhase === 0 && "Sua data preferida está esgotada — não há horário livre nela."}
                      {viaPhase === 1 && "Verificando se o Concierge pode abrir uma exceção para o seu caso…"}
                      {viaPhase === 2 && "A Helena, sua concierge particular, conseguiu. A sua prioridade foi liberada."}
                    </p>
                  </div>
                }
              >
                <span className="dc-breathe"><PaxterSymbolGlass size={104} tone={isDark ? "dark" : "light"} /></span>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.28em] dc-gold mb-1">IV. A Agenda</p>
                  <p className={`dc-serif italic text-lg ${isDark ? "text-stone-200" : "text-[#16284a]"}`}>
                    {viaPhase === 0
                      ? "Conferindo a agenda do Dr. Caio…"
                      : viaPhase === 1
                        ? "Acionando o serviço de Concierge…"
                        : "A sua prioridade foi liberada."}
                  </p>
                </div>
              </TernoFarol>

              {viaPhase === 2 && (
              <div className={`dc-reveal flex flex-col gap-7 ${isDark ? "dark" : ""}`}>
              <div className="flex flex-col gap-5">
                {/* Via Concierge — MESMO padrao 3D (panel-3d) da Via comum, SEM indicio de preferencia */}
                <button type="button" onClick={() => setVia("concierge")} className={`panel-3d w-full p-6 sm:p-7 rounded-lg text-left transition-all ${via === "concierge" ? "panel-3d-active" : ""}`}>
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2.5">
                      <h4 className="dc-serif text-2xl dc-gold">Via Concierge</h4>
                      <span aria-hidden className="block h-px w-full" style={{ background: isDark ? "linear-gradient(90deg, transparent, rgba(194,160,90,0.5), transparent)" : "linear-gradient(90deg, transparent, rgba(138,109,47,0.45), transparent)", boxShadow: isDark ? "0 1px 0 rgba(255,255,255,0.05)" : "0 1px 0 rgba(255,255,255,0.7)" }} />
                    </div>
                    <p className={`text-[14px] leading-relaxed ${isDark ? "text-stone-300" : "text-[#16284a]"}`}>
                      A <strong className="dc-gold font-semibold">Helena</strong> é a sua concierge particular: quando não há vaga, ela abre uma exceção e organiza pessoalmente o seu atendimento prioritário.
                    </p>
                    <ul className={`flex flex-col gap-2 text-[14px] leading-relaxed ${isDark ? "text-stone-300" : "text-[#16284a]"}`}>
                      <li className="flex gap-2"><span className="text-[#c2a05a]">•</span> Horário já na próxima semana, conforme a sua preferência.</li>
                      <li className="flex gap-2"><span className="text-[#c2a05a]">•</span> A Helena acompanha o seu encaixe do início ao fim.</li>
                      <li className="flex gap-2"><span className="text-[#c2a05a]">•</span> O senhor antecipa R$ 150,00 (20% da consulta de R$ 750,00); o restante é pago no dia.</li>
                    </ul>
                  </div>
                </button>

                <div className="flex items-center justify-center gap-5 my-1">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-stone-500/30 to-transparent" />
                  <span className="dc-serif italic text-base text-stone-500">ou</span>
                  <div className="h-px flex-1 bg-gradient-to-l from-transparent via-stone-500/30 to-transparent" />
                </div>

                {/* Via Comum — MESMO padrao 3D (panel-3d), equilibrada com a Concierge */}
                <button type="button" onClick={() => setVia("comum")} className={`panel-3d w-full p-6 sm:p-7 rounded-lg text-left transition-all ${via === "comum" ? "panel-3d-active" : ""}`}>
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2.5">
                      <h4 className="dc-serif text-2xl dc-gold">Via comum</h4>
                      <span aria-hidden className="block h-px w-full" style={{ background: isDark ? "linear-gradient(90deg, transparent, rgba(194,160,90,0.5), transparent)" : "linear-gradient(90deg, transparent, rgba(138,109,47,0.45), transparent)", boxShadow: isDark ? "0 1px 0 rgba(255,255,255,0.05)" : "0 1px 0 rgba(255,255,255,0.7)" }} />
                    </div>
                    <ul className={`flex flex-col gap-2 text-[14px] leading-relaxed ${isDark ? "text-stone-300" : "text-[#16284a]"}`}>
                      <li className="flex gap-2"><span className="text-[#c2a05a]">•</span> Sem custo.</li>
                      <li className="flex gap-2"><span className="text-[#c2a05a]">•</span> Horários a partir de {viaComum.earliestLabel}.</li>
                      <li className="flex gap-2"><span className="text-[#c2a05a]">•</span> Segunda a sexta, manhã ou tarde.</li>
                    </ul>
                  </div>
                </button>
              </div>

              <button
                onClick={handleViaContinue}
                disabled={!via}
                className="w-full py-4 bg-gradient-to-b from-[#f4e2a8] via-[#c2a05a] to-[#8a6d2f] text-[#16284a] rounded-lg font-bold uppercase tracking-[0.2em] text-xs shadow-[0_4px_14px_rgba(194,160,90,0.3)] hover:brightness-105 active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-3"
              >
                Continuar <ArrowRight className="w-4 h-4" />
              </button>
              </div>
              )}
            </div>
          )}

          {/* VIA COMUM — grade distante seg-sex */}
          {stage === "comum" && (
            <div className={`panel-3d rounded-xl overflow-hidden ${isDark ? "dark" : ""}`}>
              <div className="login-card-topbar px-5 py-3 flex items-center gap-2 border-b border-border/60">
                <span className="dc-serif italic dc-gold text-base tracking-wide">V. Via Comum</span>
              </div>
              <div className="login-card-body px-5 py-5 flex flex-col gap-5">
                <p className={`text-sm ${isDark ? "text-stone-400" : "text-stone-500"}`}>Escolha um horário disponível.</p>

                <div className="flex flex-col gap-4">
                  {viaComum.days.map((d) => (
                    <div key={d.date} className="flex flex-col gap-2">
                      <p className={`text-[11px] uppercase tracking-widest font-semibold ${isDark ? "text-stone-400" : "text-stone-500"}`}>{d.label}</p>
                      <div className="flex flex-wrap gap-2.5">
                        {[d.morning, d.afternoon].map((t) => {
                          const active = chosenSlotDate === d.date && chosenSlotTime === t;
                          return (
                            <button
                              key={`${d.date}-${t}`}
                              type="button"
                              onClick={() => { setChosenSlotDate(d.date); setChosenSlotTime(t); }}
                              data-active={active}
                              className="dc-chip px-5 py-2.5 text-sm font-medium tracking-wide"
                            >
                              {t}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {errorMsg && (
                  <div className={`p-3 rounded text-xs flex items-start gap-2 ${isDark ? "bg-red-950/40 border border-red-900 text-red-400" : "bg-red-50 border border-red-200 text-red-700"}`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <p>{errorMsg}</p>
                  </div>
                )}

                <button
                  onClick={() => submit("fila")}
                  disabled={!chosenSlotTime || createReq.isPending}
                  className="w-full py-4 bg-gradient-to-b from-[#f4e2a8] via-[#c2a05a] to-[#8a6d2f] text-[#16284a] rounded-lg font-bold uppercase tracking-[0.2em] text-xs shadow-[0_4px_14px_rgba(194,160,90,0.3)] hover:brightness-105 active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                >
                  {createReq.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Confirmar meu horário <ArrowRight className="w-4 h-4" /></>}
                </button>
              </div>
            </div>
          )}

          {/* PAY — concierge: pagamento + preferência (dia + horário) */}
          {stage === "pay" && (
            <div className={`panel-3d rounded-xl overflow-hidden ${isDark ? "dark" : ""}`}>
              <div className="login-card-topbar px-5 py-3 flex items-center gap-2 border-b border-border/60">
                <span className="dc-serif italic dc-gold text-base tracking-wide">VI. A Prioridade</span>
              </div>
            <div className="login-card-body px-5 py-5 flex flex-col gap-5">
              <div className={`flex flex-col gap-3 text-[15px] leading-relaxed ${isDark ? "text-stone-300" : "text-[#16284a]"}`}>
                <p>{payTextConcierge}</p>
                <p>Para reservar seu horário com prioridade, o senhor antecipa <strong className="dc-gold font-semibold">R$ 150,00</strong> — 20% do valor da consulta (total de R$ 750,00). O restante é pago no dia do atendimento.</p>
              </div>

              {/* Resumo do horario ja escolhido no estagio "oferta" (agenda REAL). */}
              {chosenSlotDate && chosenSlotTime && (
                <div className={`panel-3d rounded-lg p-4 flex items-center gap-3 ${isDark ? "dark" : ""}`}>
                  <CalendarDays className="w-5 h-5 text-[#c2a05a] shrink-0" />
                  <div className="flex flex-col">
                    <span className={`text-[10px] uppercase tracking-wider ${isDark ? "text-stone-500" : "text-stone-400"}`}>Horário reservado para o senhor</span>
                    <span className={`text-sm font-semibold ${isDark ? "text-stone-100" : "text-[#16284a]"}`}>
                      {formatSlotDay(new Date(`${chosenSlotDate}T12:00:00`))} às {chosenSlotTime}
                    </span>
                  </div>
                </div>
              )}

              {/* CPF — obrigatorio para emitir a cobranca real no Asaas. */}
              <div className="flex flex-col gap-1">
                <span className={`text-[10px] uppercase tracking-wider ${isDark ? "text-stone-500" : "text-stone-400"}`}>CPF (para a cobrança)</span>
                <input
                  className="dc-input"
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  value={cpf}
                  onChange={(e) => setCpf(e.target.value)}
                  disabled={!!invoiceUrl}
                />
              </div>

              {/* Seletor de meio (spec cartão): escolha ANTES de gerar a
                  cobrança. PIX = QR embutido; Cartão = fatura hospedada. */}
              <div className="grid grid-cols-2 gap-2">
                {([
                  { key: "pix", label: "PIX" },
                  { key: "card", label: "Cartão de crédito" },
                ] as const).map((opt) => {
                  const activeOpt = payMethod === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      disabled={!!invoiceUrl}
                      onClick={() => setPayMethod(opt.key)}
                      className={`py-2.5 rounded-lg text-[11px] uppercase tracking-widest font-semibold border transition-all disabled:opacity-50 ${
                        activeOpt
                          ? "border-[#c2a05a] text-[#c2a05a] bg-[#c2a05a]/10"
                          : isDark
                            ? "border-white/10 text-stone-400"
                            : "border-stone-200 text-stone-500"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <p className={`text-[10px] ${isDark ? "text-stone-500" : "text-stone-400"}`}>
                {payMethod === "card"
                  ? "O cartão e o parcelamento são feitos na página segura do Asaas — nunca digitamos seu cartão aqui."
                  : "PIX pago aqui mesmo, com QR e copia-e-cola."}
              </p>

              {errorMsg && (
                <div className={`p-3 rounded text-xs flex items-start gap-2 ${isDark ? "bg-red-950/40 border border-red-900 text-red-400" : "bg-red-50 border border-red-200 text-red-700"}`}>
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <p>{errorMsg}</p>
                </div>
              )}

              {!invoiceUrl ? (
                /* Passo 1: gerar a cobranca real */
                <div className="flex flex-col gap-3">
                  <button
                    onClick={handleGenerateCharge}
                    disabled={chargePending}
                    className="w-full py-4 bg-gradient-to-b from-[#f4e2a8] via-[#c2a05a] to-[#8a6d2f] text-[#16284a] rounded-lg font-bold uppercase tracking-[0.2em] text-xs shadow-[0_4px_14px_rgba(194,160,90,0.3)] hover:brightness-105 active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                  >
                    {chargePending ? <Loader2 className="w-5 h-5 animate-spin" /> : <>{payMethod === "card" ? "Pagar com cartão — R$ 150,00" : "Gerar cobrança PIX de R$ 150,00"} <ArrowRight className="w-4 h-4" /></>}
                  </button>
                  {/* Saída segura: voltar para escolher outro horário.
                      Aviso: ao voltar e não concluir o pagamento, a data
                      selecionada pode ser afastada nas próximas tentativas. */}
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => { setErrorMsg(""); setStage("oferta"); }}
                      className={`text-xs text-center underline-offset-4 hover:underline ${isDark ? "text-stone-500 hover:text-stone-300" : "text-stone-400 hover:text-stone-600"}`}
                    >
                      ← Voltar e escolher outro horário
                    </button>
                    <p className={`text-[10px] text-center leading-relaxed ${isDark ? "text-stone-600" : "text-stone-400"}`}>
                      Se a cobrança for gerada mas não paga, as próximas datas disponíveis serão mais distantes.
                    </p>
                  </div>
                </div>
              ) : (
                /* Passo 2: pagar DENTRO do Paxter — QR + copia-e-cola PIX inline */
                <div className="flex flex-col gap-4">
                  {pixQrImage || pixPayload ? (
                    <div className={`panel-3d rounded-xl p-5 flex flex-col items-center gap-4 ${isDark ? "dark" : ""}`}>
                      <span className="text-[10px] uppercase tracking-widest text-[#c2a05a] font-semibold">Pague com PIX — R$ 150,00</span>
                      {pixQrImage && (
                        <img
                          src={`data:image/png;base64,${pixQrImage}`}
                          alt="QR Code PIX para pagamento"
                          className="w-52 h-52 rounded-lg bg-white p-2 shadow-[0_4px_14px_rgba(0,0,0,0.25)]"
                        />
                      )}
                      {pixPayload && (
                        <div className="w-full flex flex-col gap-2">
                          <span className={`text-[10px] uppercase tracking-wider ${isDark ? "text-stone-500" : "text-stone-400"}`}>PIX copia e cola</span>
                          <div className="flex items-stretch gap-2">
                            <code className={`flex-1 min-w-0 truncate text-[11px] px-3 py-2.5 rounded-md ${isDark ? "bg-black/30 text-stone-300 border border-white/10" : "bg-stone-100 text-stone-600 border border-stone-200"}`}>
                              {pixPayload}
                            </code>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard?.writeText(pixPayload).then(() => {
                                  setPixCopied(true);
                                  setTimeout(() => setPixCopied(false), 2000);
                                });
                              }}
                              className="shrink-0 px-3 rounded-md bg-gradient-to-b from-[#f4e2a8] via-[#c2a05a] to-[#8a6d2f] text-[#16284a] flex items-center justify-center hover:brightness-105 active:scale-[0.98] transition-all"
                              aria-label="Copiar código PIX"
                            >
                              {pixCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Fallback honesto: Asaas nao devolveu o QR — link hospedado */
                    <button
                      onClick={() => window.open(invoiceUrl, "_blank", "noopener,noreferrer")}
                      className="w-full py-4 bg-gradient-to-b from-[#f4e2a8] via-[#c2a05a] to-[#8a6d2f] text-[#16284a] rounded-lg font-bold uppercase tracking-[0.2em] text-xs shadow-[0_4px_14px_rgba(194,160,90,0.3)] hover:brightness-105 active:scale-[0.99] transition-all flex items-center justify-center gap-3"
                    >
                      {payMethod === "card" ? "Abrir pagamento no cartão" : "Abrir pagamento PIX"} <ArrowRight className="w-4 h-4" />
                    </button>
                  )}

                  {(payStatus === "expirado" || payStatus === "cancelado") ? (
                    <div className={`p-3 rounded text-xs flex items-start gap-2 ${isDark ? "bg-red-950/40 border border-red-900 text-red-400" : "bg-red-50 border border-red-200 text-red-700"}`}>
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <p>{payStatus === "expirado" ? "A cobrança venceu. Abra novamente para pagar." : "A cobrança foi cancelada. Fale com a clínica."}</p>
                    </div>
                  ) : payStatus === "pago" ? (
                    /* R1: pagamento ja caiu — mostramos o estado honesto de
                       "recebido, confirmando o horario" (nao mais "aguardando"). */
                    <div className={`p-4 rounded-lg flex items-center gap-3 ${isDark ? "bg-emerald-950/30 border border-emerald-900/60 text-emerald-300" : "bg-emerald-50 border border-emerald-200 text-emerald-800"}`}>
                      {errorMsg ? <AlertCircle className="w-4 h-4 shrink-0" /> : <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                      <p className="text-sm">
                        {errorMsg
                          ? "Pagamento recebido. Tivemos um problema ao reservar seu horário — toque abaixo para recuperar."
                          : "Pagamento recebido! Confirmando seu horário..."}
                      </p>
                    </div>
                  ) : (
                    <div className={`p-4 rounded-lg flex items-center gap-3 ${isDark ? "bg-amber-950/30 border border-amber-900/60 text-amber-300" : "bg-amber-50 border border-amber-200 text-amber-800"}`}>
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      <p className="text-sm">Aguardando a confirmação do pagamento... assim que cair, seguimos automaticamente.</p>
                    </div>
                  )}

                  {/* Saída segura: cancelar ANTES do pagamento ser confirmado */}
                  {payStatus !== "pago" && (
                    <button
                      type="button"
                      onClick={() => {
                        setInvoiceUrl("");
                        setPixQrImage(null);
                        setPixPayload(null);
                        setPayStatus("aguardando");
                        setErrorMsg("");
                      }}
                      className={`text-xs text-center underline-offset-4 hover:underline ${isDark ? "text-stone-500 hover:text-stone-300" : "text-stone-400 hover:text-stone-600"}`}
                    >
                      ← Cancelar e mudar forma de pagamento
                    </button>
                  )}

                  {/* R2: se a confirmacao do horario falhou (pago mas sem reservar),
                      oferecemos uma acao explicita para reexecutar a confirmacao. */}
                  {payStatus === "pago" && errorMsg ? (
                    <button
                      type="button"
                      onClick={() => confirmConcierge()}
                      disabled={updateReq.isPending}
                      className="w-full py-3 bg-gradient-to-b from-[#f4e2a8] via-[#c2a05a] to-[#8a6d2f] text-[#16284a] rounded-lg font-bold uppercase tracking-[0.2em] text-xs shadow-[0_4px_14px_rgba(194,160,90,0.3)] hover:brightness-105 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {updateReq.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Recuperar meu agendamento <ArrowRight className="w-4 h-4" /></>}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => paymentStatusQuery.refetch()}
                      disabled={paymentStatusQuery.isFetching}
                      className={`text-xs underline-offset-4 hover:underline disabled:opacity-50 ${isDark ? "text-stone-400" : "text-stone-500"}`}
                    >
                      {paymentStatusQuery.isFetching ? "Verificando..." : "Já paguei, verificar agora"}
                    </button>
                  )}
                </div>
              )}
            </div>
            </div>
          )}

          {/* OFERTA — agenda REAL confrontada ANTES do pagamento */}
          {stage === "oferta" && (
            <div className={`dc-reveal panel-3d rounded-xl overflow-hidden ${isDark ? "dark" : ""}`}>
              <div className="login-card-topbar px-5 py-3 flex items-center gap-2 border-b border-border/60">
                <span className="dc-serif italic dc-gold text-base tracking-wide">V. O Encaixe</span>
              </div>
              <div className="login-card-body px-5 py-5 flex flex-col gap-5">

                {/* THROTTLE — teto rígido antiautomação (50 ofertas/dia por dispositivo) */}
                {offerQuery.data?.throttled ? (
                  <div className="flex flex-col gap-4">
                    <div className={`p-4 rounded-lg flex items-start gap-3 ${isDark ? "bg-red-950/40 border border-red-800 text-red-300" : "bg-red-50 border border-red-200 text-red-700"}`}>
                      <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                      <div className="flex flex-col gap-1">
                        <p className="text-sm font-semibold">Limite de acessos atingido</p>
                        <p className="text-xs leading-relaxed">
                          Limite de acessos atingido. Tente novamente amanhã.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : offerQuery.data?.requiresVerification ? (
                  /* VERIFICAÇÃO DE CONTATO — 6ª oferta do dia pede código do canal */
                  <div className="flex flex-col gap-4">
                    <div className={`p-4 rounded-lg flex items-start gap-3 ${isDark ? "bg-amber-950/40 border border-amber-800/60 text-amber-300" : "bg-amber-50 border border-amber-200 text-amber-800"}`}>
                      <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" />
                      <p className="text-xs leading-relaxed">
                        Para seguir com a reserva, confirme seu contato — enviamos um código para o seu WhatsApp.
                      </p>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <span className={`text-[10px] uppercase tracking-wider ${isDark ? "text-stone-500" : "text-stone-400"}`}>
                        Código de confirmação
                      </span>
                      <input
                        className="dc-input"
                        type="text"
                        inputMode="numeric"
                        placeholder="000000"
                        maxLength={8}
                        value={verifyCode}
                        onChange={(e) => { setVerifyCode(e.target.value.replace(/\D/g, "")); setVerifyError(""); }}
                        autoComplete="one-time-code"
                      />
                      {verifyError && (
                        <p className={`text-xs ${isDark ? "text-red-400" : "text-red-600"}`}>{verifyError}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={verifyCode.length < 4 || verifyLoading}
                      onClick={async () => {
                        if (!verifyCode) return;
                        setVerifyLoading(true);
                        setVerifyError("");
                        try {
                          const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
                          const res = await fetch(`${BASE}/api/scheduling/verify-device`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ code: verifyCode, cpf: cpfDigitsOffer }),
                          });
                          if (res.ok) {
                            // Código aceito — revalidar a oferta (o backend libera o dispositivo).
                            await offerQuery.refetch();
                            setVerifyCode("");
                          } else {
                            const body = await res.json().catch(() => ({}));
                            setVerifyError((body as { message?: string }).message ?? "Código inválido. Verifique e tente novamente.");
                          }
                        } catch {
                          setVerifyError("Falha ao verificar. Tente novamente.");
                        } finally {
                          setVerifyLoading(false);
                        }
                      }}
                      className="w-full py-3 rounded-lg border border-stone-300 text-sm font-medium tracking-wide hover:bg-stone-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {verifyLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                      Confirmar contato
                    </button>
                  </div>
                ) : offerQuery.data?.blocked ? (
                  /* BLOQUEIO PERMANENTE — concierge indisponível após 3+ tentativas */
                  <div className="flex flex-col gap-4">
                    <div className={`p-4 rounded-lg flex items-start gap-3 ${isDark ? "bg-red-950/40 border border-red-800 text-red-300" : "bg-red-50 border border-red-200 text-red-700"}`}>
                      <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                      <div className="flex flex-col gap-1">
                        <p className="text-sm font-semibold">Concierge indisponível</p>
                        <p className="text-xs leading-relaxed">
                          {offerQuery.data.mensagem ??
                            "Após múltiplas tentativas não concluídas, o acesso ao Concierge foi suspenso. Por favor, utilize a Via Comum para agendar."}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setVia(""); setStage("vias"); }}
                      className="w-full py-3 rounded-lg border border-stone-300 text-sm font-medium tracking-wide hover:bg-stone-50 transition-colors"
                    >
                      Ir para a Via Comum
                    </button>
                  </div>
                ) : (
                  <>
                    {/* AVISO DE PENALIDADE — datas afastadas por tentativas anteriores */}
                    {(offerQuery.data?.penalidade_dias ?? 0) > 0 && (
                      <div className={`p-3 rounded-lg flex items-start gap-2.5 text-xs leading-relaxed ${isDark ? "bg-amber-950/40 border border-amber-800/60 text-amber-300" : "bg-amber-50 border border-amber-200 text-amber-800"}`}>
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <p>
                          Devido a tentativas anteriores não concluídas, as datas disponíveis foram
                          avançadas em <strong>{offerQuery.data!.penalidade_dias} dia{offerQuery.data!.penalidade_dias !== 1 ? "s" : ""}</strong>.
                          {offerQuery.data!.tentativas === 2 &&
                            " Uma nova tentativa cancelada suspenderá o Concierge permanentemente."}
                        </p>
                      </div>
                    )}

                    {/* CPF leve — coletado ANTES dos selects para que a trava de escassez */}
                    {/* verifique a penalidade já na primeira visita ao estágio oferta.    */}
                    <div className="flex flex-col gap-1.5">
                      <span className={`text-[10px] uppercase tracking-wider ${isDark ? "text-stone-500" : "text-stone-400"}`}>
                        Seu CPF <span className={`normal-case ${isDark ? "text-stone-600" : "text-stone-400"}`}>(para verificar disponibilidade)</span>
                      </span>
                      <input
                        className="dc-input"
                        type="tel"
                        placeholder="000.000.000-00"
                        value={cpf}
                        onChange={(e) => setCpf(formatCpf(e.target.value))}
                        inputMode="numeric"
                        autoComplete="off"
                      />
                    </div>

                    <p className={`text-sm ${isDark ? "text-stone-400" : "text-stone-500"}`}>
                      A Helena confrontou a agenda. Diga a sua preferência e ela revela as aberturas reais:
                    </p>

                    {/* Preferencia (dia + periodo) que filtra a agenda REAL. */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <span className={`text-[10px] uppercase tracking-wider ${isDark ? "text-stone-500" : "text-stone-400"}`}>Dia da semana</span>
                        <PaxterSelect
                          isDark={isDark}
                          value={prefWeekday}
                          onChange={(v) => { setPrefWeekday(v); setChosenSlotDate(""); setChosenSlotTime(""); }}
                          placeholder="Qualquer dia"
                          options={[
                            { value: "", label: "Qualquer dia" },
                            { value: "1", label: "Segunda-feira" },
                            { value: "2", label: "Terça-feira" },
                            { value: "3", label: "Quarta-feira" },
                            { value: "4", label: "Quinta-feira" },
                            { value: "5", label: "Sexta-feira" },
                            { value: "6", label: "Sábado" },
                          ]}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <span className={`text-[10px] uppercase tracking-wider ${isDark ? "text-stone-500" : "text-stone-400"}`}>Período</span>
                        <PaxterSelect
                          isDark={isDark}
                          value={prefPeriod}
                          onChange={(v) => { setPrefPeriod(v as "" | "manha" | "tarde"); setChosenSlotDate(""); setChosenSlotTime(""); }}
                          placeholder="Qualquer período"
                          options={[
                            { value: "", label: "Qualquer período" },
                            { value: "manha", label: "Manhã" },
                            { value: "tarde", label: "Tarde" },
                          ]}
                        />
                      </div>
                    </div>

                    {/* Aberturas reais vindas do motor (offerQuery). */}
                    {offerQuery.isFetching ? (
                      <div className={`p-4 rounded-lg flex items-center gap-3 ${isDark ? "bg-amber-950/30 border border-amber-900/60 text-amber-300" : "bg-amber-50 border border-amber-200 text-amber-800"}`}>
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        <p className="text-sm">Verificando as aberturas na agenda…</p>
                      </div>
                    ) : offerQuery.data?.days && offerQuery.data.days.length > 0 ? (
                      <div className="flex flex-col gap-4">
                        {offerQuery.data.days.map((d) => (
                          <div key={d.date} className="flex flex-col gap-2">
                            <p className={`text-[11px] uppercase tracking-widest font-semibold ${isDark ? "text-stone-400" : "text-stone-500"}`}>{formatSlotDay(new Date(`${d.date}T12:00:00`))}</p>
                            <div className="flex flex-wrap gap-2.5">
                              {d.times.map((t) => {
                                const active = chosenSlotDate === d.date && chosenSlotTime === t.time;
                                return (
                                  <button
                                    key={`${d.date}-${t.time}`}
                                    type="button"
                                    onClick={() => { setChosenSlotDate(d.date); setChosenSlotTime(t.time); }}
                                    data-active={active}
                                    className="dc-chip px-5 py-2.5 text-sm font-medium tracking-wide"
                                  >
                                    {t.time}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className={`p-4 rounded-lg text-sm ${isDark ? "bg-stone-900/40 border border-white/10 text-stone-400" : "bg-stone-50 border border-stone-200 text-stone-600"}`}>
                        Nenhuma abertura para essa preferência. Tente outro dia ou período.
                      </div>
                    )}

                    {errorMsg && (
                      <div className={`p-3 rounded text-xs flex items-start gap-2 ${isDark ? "bg-red-950/40 border border-red-900 text-red-400" : "bg-red-50 border border-red-200 text-red-700"}`}>
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <p>{errorMsg}</p>
                      </div>
                    )}

                    <button
                      onClick={() => { setErrorMsg(""); setStage("pay"); }}
                      disabled={!chosenSlotTime}
                      className="w-full py-4 bg-gradient-to-b from-[#f4e2a8] via-[#c2a05a] to-[#8a6d2f] text-[#16284a] rounded-lg font-bold uppercase tracking-[0.2em] text-xs shadow-[0_4px_14px_rgba(194,160,90,0.3)] hover:brightness-105 active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                    >
                      Reservar este horário <ArrowRight className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- DOOR 4: CORPO CLÍNICO / PROFISSIONAIS ---
// Fluxo estratificado em 4 passos: Área -> Especialização -> Profissional -> Horário.
function AssistenteFlow({ onBack, title, payText, payLink }: { onBack: () => void; title: string; payText: string; payLink: string }) {
  const { theme } = useScreenTheme();
  const isDark = theme === "dark";
  const { data: areas = [], isLoading: isLoadingAreas } = useListSchedulingAreas();
  const { data: professionals = [], isLoading: isLoadingPros } = useListSchedulingProfessionals();

  const [areaId, setAreaId] = useState<number | null>(null);
  const [specialtyId, setSpecialtyId] = useState<number | null>(null);
  const [proId, setProId] = useState<number | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");

  const area = useMemo(() => areas.find((a) => a.id === areaId), [areas, areaId]);
  const specialties = area?.specialties ?? [];

  const prosForSelection = useMemo(
    () => professionals.filter((p) => p.areaId === areaId && p.specialtyId === specialtyId),
    [professionals, areaId, specialtyId],
  );
  const pro = useMemo(() => professionals.find((p) => p.id === proId), [professionals, proId]);

  const { data: agendaData, isLoading: isLoadingAgenda } = useGetAgendaSlots(
    { resourceId: pro?.resourceId ?? 0, date },
    { query: { enabled: !!pro?.resourceId && !!date, queryKey: getGetAgendaSlotsQueryKey({ resourceId: pro?.resourceId ?? 0, date }) } },
  );

  const createReq = useCreateSchedulingRequest();
  const [success, setSuccess] = useState(false);

  const handleAreaChange = (id: number) => {
    setAreaId(id);
    setSpecialtyId(null);
    setProId(null);
    setDate("");
    setTime("");
  };

  const handleSpecialtyChange = (id: number) => {
    setSpecialtyId(id);
    setProId(null);
    setDate("");
    setTime("");
  };

  const handleProChange = (id: number) => {
    setProId(id);
    setDate("");
    setTime("");
  };

  const handleDateChange = (d: string) => {
    setDate(d);
    setTime("");
  };

  const handleSubmit = () => {
    if (!pro || !date || !time || !name || phone.replace(/\D/g, "").length < 10) return;
    createReq.mutate({
      data: {
        entrada: "assistente",
        professionalId: pro.id,
        resourceId: pro.resourceId,
        chosenDate: date,
        chosenTime: time,
        patientName: name,
        patientPhone: phone.replace(/\D/g, ""),
        patientEmail: email || undefined,
        patientCpf: cpf.replace(/\D/g, "") || undefined,
      },
    }, {
      onSuccess: () => setSuccess(true),
    });
  };

  if (success) return <SuccessState onBack={onBack} />;

  const isLoading = isLoadingAreas || isLoadingPros;
  const chipBg = isDark
    ? "linear-gradient(180deg, #243860 0%, #1a2e52 55%, #122244 100%)"
    : "linear-gradient(180deg, #ffffff 0%, #f3ead8 55%, #e4d6bc 100%)";
  const chipBorder = isDark ? "rgba(100,148,210,0.22)" : "rgba(184,146,77,0.36)";
  const chipShadow = isDark
    ? "0 3px 8px rgba(0,0,0,0.44), inset 0 2px 0 rgba(255,255,255,0.11), inset 0 -3px 6px rgba(0,0,0,0.30)"
    : "0 3px 7px rgba(7,22,43,0.17), inset 0 2px 0 rgba(255,255,255,0.96), inset 0 -3px 6px rgba(7,22,43,0.07)";
  const chipColor = isDark ? "rgba(200,218,245,0.82)" : "rgba(22,40,74,0.76)";

  return (
    <div className="asst-flow space-y-6 animate-in slide-in-from-right-8 duration-300">
      <style>{`
        .asst-flow .dc-chip {
          background: ${chipBg};
          border: 1px solid ${chipBorder};
          box-shadow: ${chipShadow};
          color: ${chipColor};
          transition: all .18s ease; border-radius: 8px; cursor: pointer;
        }
        .asst-flow .dc-chip[data-active="true"] {
          background: linear-gradient(180deg, #9a7832 0%, #b8922a 40%, #c2a05a 100%);
          border-color: rgba(138,109,47,0.72);
          color: #fff8e8;
          box-shadow: inset 0 3px 7px rgba(80,50,10,0.42), inset 0 1px 3px rgba(0,0,0,0.20), 0 1px 0 rgba(255,255,255,0.28);
          transform: translateY(1px);
        }
      `}</style>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="w-8 h-8 shrink-0 rounded-md bg-card border border-border flex items-center justify-center text-primary hover:bg-muted transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0">
          <h2 className="font-serif text-xl text-primary leading-none truncate">{title}</h2>
          <p className="text-[10px] font-black uppercase tracking-widest text-accent mt-1">Corpo Clínico / Profissionais</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-accent animate-spin" /></div>
      ) : areas.length === 0 ? (
        <div className="panel-3d-sub p-8 text-center text-muted-foreground">
          Nenhuma área disponível para agendamento no momento.
        </div>
      ) : (
        <div className="space-y-5">
          {/* Passo 1: Área */}
          <div className="panel-3d-sub p-5">
            <label className="block text-[10px] font-black uppercase tracking-widest text-primary mb-3">1. ESCOLHA A ÁREA</label>
            <div className="grid grid-cols-2 gap-2">
              {areas.map((a) => {
                const sel = areaId === a.id;
                const isMedico = a.professionalType === "medico";
                return (
                  <button
                    key={a.id}
                    onClick={() => handleAreaChange(a.id)}
                    data-active={sel}
                    className="dc-chip text-left p-3 rounded-lg flex items-center gap-2"
                  >
                    {isMedico
                      ? <Stethoscope className="w-4 h-4 shrink-0" style={{ color: sel ? "#fff8e8" : "#c2a05a" }} />
                      : <HeartPulse className="w-4 h-4 shrink-0" style={{ color: sel ? "#fff8e8" : "#c2a05a" }} />}
                    <span className="font-sans font-bold text-sm leading-tight">{a.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Passo 2: Especialização */}
          {area && (
            <div className="panel-3d-sub p-5 animate-in fade-in slide-in-from-top-4 duration-300">
              <label className="block text-[10px] font-black uppercase tracking-widest text-primary mb-3">
                2. ESCOLHA A {area.professionalType === "medico" ? "ESPECIALIDADE" : "ESPECIALIZAÇÃO"}
              </label>
              {specialties.length === 0 ? (
                <div className="p-3 bg-muted border border-border rounded text-sm text-muted-foreground text-center">
                  Nenhuma especialização cadastrada nesta área.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {specialties.map((s) => {
                    const sel = specialtyId === s.id;
                    return (
                      <button
                        key={s.id}
                        onClick={() => handleSpecialtyChange(s.id)}
                        data-active={sel}
                        className="dc-chip px-4 py-2 rounded-md text-sm font-semibold"
                      >
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Passo 3: Profissional */}
          {specialtyId && (
            <div className="panel-3d-sub p-5 animate-in fade-in slide-in-from-top-4 duration-300">
              <label className="block text-[10px] font-black uppercase tracking-widest text-primary mb-3">3. ESCOLHA O PROFISSIONAL</label>
              {prosForSelection.length === 0 ? (
                <div className="p-3 bg-muted border border-border rounded text-sm text-muted-foreground text-center">
                  Nenhum profissional disponível nesta especialização.
                </div>
              ) : (
                <div className="space-y-2">
                  {prosForSelection.map((p) => {
                    const sel = proId === p.id;
                    const registro = [p.registrationCouncil, p.registrationNumber].filter(Boolean).join(" ");
                    return (
                      <button
                        key={p.id}
                        onClick={() => handleProChange(p.id)}
                        data-active={sel}
                        className="dc-chip w-full text-left p-3 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center flex-wrap gap-2">
                            <span className="font-sans font-bold text-sm">{p.name}</span>
                            <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded"
                              style={{ background: sel ? "rgba(255,255,255,0.15)" : "rgba(194,160,90,0.18)", color: sel ? "#fff8e8" : "#c2a05a" }}>
                              {p.professionalType === "medico" ? "Médico" : "Não-médico"}
                            </span>
                          </div>
                          <div className="text-xs mt-0.5" style={{ opacity: 0.65 }}>
                            {p.specialtyName}{registro ? ` (${registro})` : ""}
                          </div>
                        </div>
                        {sel && <CheckCircle className="w-5 h-5 shrink-0" style={{ color: "#fff8e8" }} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Passo 4: Horário */}
          {pro && (
            <div className="panel-3d-sub p-5 space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
              <label className="block text-[10px] font-black uppercase tracking-widest text-primary">4. ESCOLHA O HORÁRIO</label>

              {!pro.resourceId ? (
                <div className="p-3 bg-muted border border-border rounded text-sm text-muted-foreground text-center">
                  Sem horários disponíveis para este profissional.
                </div>
              ) : (
                <>
                  <PaxterCalendar
                    value={date}
                    onChange={(v) => handleDateChange(v)}
                    isDark={isDark}
                  />

                  {date && (
                    <div className="pt-2">
                      {isLoadingAgenda ? (
                        <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 text-accent animate-spin" /></div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          {!agendaData?.slots?.length ? (
                            <div className="col-span-3 text-center py-4 text-xs text-muted-foreground">Nenhum horário livre neste dia.</div>
                          ) : (
                            agendaData.slots.map((s, i) => {
                              const isFree = ["free", "livre", "available"].includes(s.state.toLowerCase());
                              const isSel = time === s.time;
                              if (!isFree) {
                                return (
                                  <div key={i} className="h-10 rounded border border-border bg-muted flex items-center justify-center text-muted-foreground text-xs line-through opacity-70">
                                    {s.time}
                                  </div>
                                );
                              }
                              return (
                                <button
                                  key={i}
                                  onClick={() => setTime(s.time)}
                                  data-active={isSel}
                                  className="dc-chip h-10 text-sm font-semibold"
                                >
                                  {s.time}
                                </button>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Passo 5: Dados do paciente */}
          {time && (
            <div className="panel-3d-sub p-5 space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
              <label className="block text-[10px] font-black uppercase tracking-widest text-primary mb-2">5. SEUS DADOS</label>
              <div className="bg-muted/50 p-4 rounded border border-border mb-4">
                <p className="text-xs text-foreground leading-relaxed">{payText}</p>
                <PaymentLinkButton url={payLink} label="Pagar sinal de 25%" />
              </div>

              <div className="space-y-3">
                <Field label="NOME COMPLETO *" value={name} onChange={setName} placeholder="Seu nome" />
                <Field label="TELEFONE (WHATSAPP) *" value={phone} onChange={(v) => setPhone(formatPhone(v))} placeholder="(00) 00000-0000" type="tel" />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="CPF (OPCIONAL)" value={cpf} onChange={(v) => setCpf(formatCpf(v))} placeholder="000.000.000-00" type="tel" />
                  <Field label="EMAIL (OPCIONAL)" value={email} onChange={setEmail} placeholder="seu@email.com" type="email" />
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={!name || phone.replace(/\D/g, "").length < 10 || createReq.isPending}
                className="btn-3d w-full h-12 mt-4 flex items-center justify-center gap-2 font-black uppercase tracking-widest text-sm disabled:opacity-50"
              >
                {createReq.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "CONFIRMAR RESERVA"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Common UI Components ---

// Player do vídeo de apresentação. Escolhe o modo pela URL:
// 1) arquivo de vídeo ou Object Storage (nosso /api/storage) -> <video> nativo;
// 2) YouTube/Vimeo -> iframe embarcado; 3) qualquer outra -> link clicável.
function VideoPlayer({ url }: { url: string }) {
  const raw = (url || "").trim();
  if (!raw) return null;

  const embed = toEmbedUrl(raw);
  if (embed) {
    return (
      <div className="panel-3d rounded-xl overflow-hidden aspect-video bg-black">
        <iframe
          src={embed}
          title="Vídeo de apresentação"
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  const isFile = /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(raw) || raw.includes("/api/storage/objects/");
  if (isFile) {
    return (
      <div className="panel-3d rounded-xl overflow-hidden bg-black">
        <video src={raw} controls playsInline className="w-full aspect-video" />
      </div>
    );
  }

  return (
    <a
      href={raw}
      target="_blank"
      rel="noreferrer"
      className="panel-3d rounded-xl aspect-video bg-black flex items-center justify-center text-white/80 text-sm font-bold uppercase tracking-widest"
    >
      Assistir ao vídeo de apresentação
    </a>
  );
}

// Converte links de YouTube/Vimeo para a URL de incorporação (embed).
function toEmbedUrl(url: string): string | null {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{6,})/i);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}

function PaymentLinkButton({ url, label, dark = false }: { url: string; label: string; dark?: boolean }) {
  const enabled = /^https?:\/\//i.test((url || "").trim());

  if (!enabled) {
    return (
      <div
        aria-disabled="true"
        className={`w-full h-11 mt-3 flex items-center justify-center gap-2 rounded-md font-black uppercase tracking-widest text-xs opacity-60 cursor-not-allowed ${
          dark
            ? "border border-[#2a4470] text-slate-300/70"
            : "border border-border bg-muted text-muted-foreground"
        }`}
      >
        <CreditCard className="w-4 h-4" /> Pagamento em breve
      </div>
    );
  }

  return (
    <a
      href={url.trim()}
      target="_blank"
      rel="noreferrer"
      className={`w-full h-11 mt-3 flex items-center justify-center gap-2 rounded-md font-black uppercase tracking-widest text-xs transition-all active:translate-y-px ${
        dark
          ? "bg-gradient-to-b from-[#c2a05a] to-[#a3803c] text-[#152b2b] shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_4px_10px_rgba(0,0,0,0.3)] hover:brightness-110"
          : "btn-3d"
      }`}
    >
      <CreditCard className="w-4 h-4" /> {label}
    </a>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", dark = false }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; dark?: boolean }) {
  return (
    <div>
      <label className={`block text-[10px] font-black uppercase tracking-widest mb-1.5 ${dark ? "text-[#c2a05a]" : "text-primary"}`}>{label}</label>
      <input
        type={type}
        className={`w-full h-11 px-3 rounded-md text-sm focus:outline-none ${
          dark 
            ? "field-engraved placeholder:text-slate-400"
            : "field-engraved text-foreground placeholder:text-muted-foreground"
        }`}
        style={dark ? { background: "linear-gradient(180deg, #16284a 0%, #0b1a33 28%)", color: "#e2e8f0", borderColor: "#2a4470" } : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function SuccessState({
  onBack,
  isExclusive,
  booking,
}: {
  onBack: () => void;
  isExclusive?: boolean;
  booking?: { date: string; time: string; email: string };
}) {
  // R4: quando o horario ja foi reservado (pago), confirmamos o desfecho real —
  // horario reservado + pagamento recebido + acesso enviado por e-mail — em vez
  // do texto generico "entraremos em contato".
  const fmtDate = (iso: string): string => {
    const m = iso.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
  };
  return (
    <div className={`rounded-xl p-8 text-center space-y-6 animate-in zoom-in-95 duration-500 ${isExclusive ? "bg-[#0b1a33] text-slate-100 border border-[#2a4470]" : "panel-3d"}`}>
      <div className="flex justify-center">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center ${isExclusive ? "bg-[#c2a05a]/20" : "bg-accent/15"}`}>
          <CheckCircle className={`w-8 h-8 ${isExclusive ? "text-[#c2a05a]" : "text-accent"}`} />
        </div>
      </div>

      {booking ? (
        <>
          <div>
            <h3 className={`font-serif text-2xl mb-2 ${isExclusive ? "text-[#c2a05a]" : "text-primary"}`}>Horário Reservado</h3>
            <p className={`text-sm ${isExclusive ? "text-slate-200/80" : "text-muted-foreground"}`}>
              Pagamento recebido e seu horário está garantido.
            </p>
          </div>

          {/* Tabela — carro-chefe: o desfecho num relance */}
          <table className={`w-full text-sm text-left rounded-lg overflow-hidden border ${isExclusive ? "border-[#2a4470]" : "border-border"}`}>
            <tbody>
              <tr className={isExclusive ? "bg-[#12244a]" : "bg-slate-100"}>
                <td className="px-4 py-2.5 font-bold uppercase text-xs tracking-widest w-1/2">Data</td>
                <td className="px-4 py-2.5 font-mono">{fmtDate(booking.date)}</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-bold uppercase text-xs tracking-widest">Horário</td>
                <td className="px-4 py-2.5 font-mono">{booking.time || "—"}</td>
              </tr>
              <tr className={isExclusive ? "bg-[#12244a]" : "bg-slate-100"}>
                <td className="px-4 py-2.5 font-bold uppercase text-xs tracking-widest">Pagamento</td>
                <td className="px-4 py-2.5">Recebido</td>
              </tr>
            </tbody>
          </table>

          <p className={`text-xs ${isExclusive ? "text-slate-300/80" : "text-muted-foreground"}`}>
            {booking.email
              ? <>Enviamos os dados de acesso à sua área para <span className="font-semibold">{booking.email}</span>.</>
              : "Enviamos os dados de acesso à sua área para o seu e-mail."}
          </p>
        </>
      ) : (
        <div>
          <h3 className={`font-serif text-2xl mb-2 ${isExclusive ? "text-[#c2a05a]" : "text-primary"}`}>Solicitação Recebida</h3>
          <p className={`text-sm ${isExclusive ? "text-slate-200/80" : "text-muted-foreground"}`}>
            Nossa equipe entrará em contato em breve para confirmar seu atendimento.
          </p>
        </div>
      )}

      <button
        onClick={onBack}
        className={`h-11 px-6 rounded-md font-black uppercase tracking-widest text-sm transition-all ${
          isExclusive 
            ? "bg-transparent border border-[#2a4470] text-slate-300 hover:border-slate-500" 
            : "btn-3d-soft"
        }`}
      >
        VOLTAR AO INÍCIO
      </button>
    </div>
  );
}
