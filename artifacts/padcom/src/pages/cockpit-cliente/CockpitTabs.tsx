// CockpitTabs — régua de abas com 2 grupos visuais + fade lateral + badge de contagem.
// Corrige problema do Manus: scroll invisível → usuário não percebe mais abas.
// Design: skill-layout-paxter · navy/ouro · sem infantilidades.

import { useRef, useEffect, useState } from "react";
import {
  FlaskConical, Syringe, Gem, ClipboardList, TrendingUp,
  FileText, ClipboardCheck, Activity, DollarSign, User,
} from "lucide-react";

export type AbaId =
  | "prescricao" | "injetaveis" | "implantes" | "exames" | "evolucao"
  | "documentos" | "anamnese" | "protocolos" | "financeiro" | "cadastro";

interface TabDef {
  id: AbaId;
  rotulo: string;
  Icon: typeof FlaskConical;
  grupo: "clinico" | "gestao";
  plano?: "basico" | "premium";
}

const ABAS: TabDef[] = [
  { id: "prescricao",  rotulo: "Prescrição",    Icon: FlaskConical,   grupo: "clinico" },
  { id: "injetaveis",  rotulo: "Injetáveis",    Icon: Syringe,        grupo: "clinico" },
  { id: "implantes",   rotulo: "Implantes",      Icon: Gem,            grupo: "clinico" },
  { id: "exames",      rotulo: "Exames",         Icon: ClipboardList,  grupo: "clinico", plano: "premium" },
  { id: "evolucao",    rotulo: "Evolução",       Icon: TrendingUp,     grupo: "clinico", plano: "premium" },
  { id: "anamnese",    rotulo: "Anamnese",       Icon: ClipboardCheck, grupo: "clinico" },
  { id: "documentos",  rotulo: "Documentos",     Icon: FileText,       grupo: "gestao" },
  { id: "protocolos",  rotulo: "Protocolos",     Icon: Activity,       grupo: "gestao" },
  { id: "financeiro",  rotulo: "Financeiro",     Icon: DollarSign,     grupo: "gestao", plano: "premium" },
  { id: "cadastro",    rotulo: "Cadastro",       Icon: User,           grupo: "gestao" },
];

const NAVY = "#16294a";
const GOLD = "#9a7b32";

interface CockpitTabsProps {
  aba: AbaId;
  onAba: (aba: AbaId) => void;
  protocolCount?: number;
  paymentCount?: number;
}

export default function CockpitTabs({ aba, onAba, protocolCount, paymentCount }: CockpitTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fadeLeft, setFadeLeft]   = useState(false);
  const [fadeRight, setFadeRight] = useState(false);

  // Detecta overflow para os fade-indicadores
  function updateFade() {
    const el = scrollRef.current;
    if (!el) return;
    setFadeLeft(el.scrollLeft > 8);
    setFadeRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }

  useEffect(() => {
    updateFade();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateFade, { passive: true });
    const ro = new ResizeObserver(updateFade);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", updateFade); ro.disconnect(); };
  }, []);

  // Scroll automático para manter aba ativa visível
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const activeBtn = el.querySelector("[data-active='true']") as HTMLElement | null;
    if (activeBtn) {
      const left = activeBtn.offsetLeft - el.offsetWidth / 2 + activeBtn.offsetWidth / 2;
      el.scrollTo({ left, behavior: "smooth" });
    }
  }, [aba]);

  const grupoAtivo = ABAS.find(a => a.id === aba)?.grupo ?? "clinico";
  const badgeMap: Partial<Record<AbaId, number>> = {
    protocolos: protocolCount ?? 0,
    financeiro: paymentCount ?? 0,
  };

  return (
    <nav
      className="relative"
      style={{
        background: "linear-gradient(180deg,#0f1e3a 0%,#13233f 100%)",
        borderBottom: "2px solid rgba(231,205,143,0.22)",
      }}
      aria-label="Abas do cockpit"
    >
      {/* Fade esquerdo */}
      {fadeLeft && (
        <div
          className="absolute left-0 top-0 bottom-0 w-10 z-10 pointer-events-none"
          style={{ background: "linear-gradient(90deg, #0f1e3a 0%, transparent 100%)" }}
        />
      )}
      {/* Fade direito */}
      {fadeRight && (
        <div
          className="absolute right-0 top-0 bottom-0 w-10 z-10 pointer-events-none"
          style={{ background: "linear-gradient(270deg, #0f1e3a 0%, transparent 100%)" }}
        />
      )}

      {/* Scroll container */}
      <div
        ref={scrollRef}
        className="flex items-end gap-0 px-3 pt-2 overflow-x-auto"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
      >
        {/* Separador de grupo CLÍNICO */}
        <div
          className="flex items-center gap-0.5 shrink-0 mr-1 pb-0 self-end mb-1"
          style={{ borderRight: "1px solid rgba(255,255,255,0.08)", paddingRight: 6 }}
        >
          <div
            className="text-[8px] font-black uppercase tracking-[0.28em] px-1.5 py-0.5 rounded-[3px] self-end mb-1"
            style={{
              color: grupoAtivo === "clinico" ? "#45B8CC" : "rgba(148,163,184,0.45)",
              background: grupoAtivo === "clinico" ? "rgba(69,184,204,0.08)" : "transparent",
              borderBottom: grupoAtivo === "clinico" ? "1px solid rgba(69,184,204,0.35)" : "1px solid transparent",
              transition: "all 0.15s",
            }}
          >
            CLÍNICO
          </div>
        </div>

        {/* Abas clínicas */}
        {ABAS.filter(a => a.grupo === "clinico").map(tab => (
          <TabButton
            key={tab.id}
            tab={tab}
            ativo={aba === tab.id}
            badge={badgeMap[tab.id]}
            onClick={() => onAba(tab.id)}
          />
        ))}

        {/* Separador de grupo GESTÃO */}
        <div
          className="flex items-center gap-0.5 shrink-0 mx-1 self-end mb-1"
          style={{ borderLeft: "1px solid rgba(255,255,255,0.08)", paddingLeft: 8 }}
        >
          <div
            className="text-[8px] font-black uppercase tracking-[0.28em] px-1.5 py-0.5 rounded-[3px]"
            style={{
              color: grupoAtivo === "gestao" ? "#45B8CC" : "rgba(148,163,184,0.45)",
              background: grupoAtivo === "gestao" ? "rgba(69,184,204,0.08)" : "transparent",
              borderBottom: grupoAtivo === "gestao" ? "1px solid rgba(69,184,204,0.35)" : "1px solid transparent",
              transition: "all 0.15s",
            }}
          >
            GESTÃO
          </div>
        </div>

        {/* Abas de gestão */}
        {ABAS.filter(a => a.grupo === "gestao").map(tab => (
          <TabButton
            key={tab.id}
            tab={tab}
            ativo={aba === tab.id}
            badge={badgeMap[tab.id]}
            onClick={() => onAba(tab.id)}
          />
        ))}
      </div>
    </nav>
  );
}

function TabButton({
  tab, ativo, badge, onClick,
}: {
  tab: TabDef;
  ativo: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-active={ativo}
      onClick={onClick}
      className="relative flex shrink-0 items-center gap-1.5 rounded-t-[7px] px-3.5 py-2.5 text-[10px] font-black uppercase tracking-wide transition-all duration-150"
      style={
        ativo
          ? {
              background: "linear-gradient(180deg,#fffbf0 0%,#f1e7cf 100%)",
              borderTop: `2px solid ${GOLD}`,
              boxShadow: "0 -4px 14px -2px rgba(231,205,143,0.45), 0 4px 0 #f1e7cf, inset 0 2px 0 rgba(255,255,255,0.95)",
              color: "#16294a",
              transform: "translateY(-2px)",
            }
          : {
              background: "rgba(255,255,255,0.04)",
              boxShadow: "inset 0 2px 6px rgba(0,0,0,0.32), inset 0 -1px 0 rgba(255,255,255,0.04)",
              color: "rgba(148,163,184,0.75)",
            }
      }
    >
      <tab.Icon className="h-3 w-3" />
      {tab.rotulo}

      {/* Badge de contagem (somente quando > 0) */}
      {badge != null && badge > 0 && (
        <span
          className="absolute -top-1 -right-1 min-w-[14px] h-3.5 flex items-center justify-center text-[8px] font-black px-1 rounded-full"
          style={{
            background: ativo ? GOLD : "rgba(154,123,50,0.75)",
            color: ativo ? "#fff" : "#fffbf0",
            border: "1.5px solid #0f1e3a",
          }}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

export { ABAS };
export type { TabDef };
