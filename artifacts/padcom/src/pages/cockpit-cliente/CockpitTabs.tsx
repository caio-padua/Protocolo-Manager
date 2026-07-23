// CockpitTabs — régua plana de abas (lista sem grupos).
// Pedido CEO 23/07/2026: remover agrupamento CLÍNICO/GESTÃO (não autorizado).
// Mantém: scroll horizontal, fade esquerdo/direito, aba ativa destaca em ouro,
//         badge de contagem, scroll automático para aba ativa.
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
}

const ABAS: TabDef[] = [
  { id: "prescricao",  rotulo: "Prescrição",      Icon: FlaskConical   },
  { id: "injetaveis",  rotulo: "Injetáveis",       Icon: Syringe        },
  { id: "implantes",   rotulo: "Implantes",        Icon: Gem            },
  { id: "exames",      rotulo: "Exames",           Icon: ClipboardList  },
  { id: "evolucao",    rotulo: "Evolução",         Icon: TrendingUp     },
  { id: "anamnese",    rotulo: "Anamnese Prévia",  Icon: ClipboardCheck },
  { id: "documentos",  rotulo: "Documentos",       Icon: FileText       },
  { id: "protocolos",  rotulo: "Protocolos",       Icon: Activity       },
  { id: "financeiro",  rotulo: "Financeiro",       Icon: DollarSign     },
  { id: "cadastro",    rotulo: "Cadastro",         Icon: User           },
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

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const activeBtn = el.querySelector("[data-active='true']") as HTMLElement | null;
    if (activeBtn) {
      const left = activeBtn.offsetLeft - el.offsetWidth / 2 + activeBtn.offsetWidth / 2;
      el.scrollTo({ left, behavior: "smooth" });
    }
  }, [aba]);

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
      {fadeLeft && (
        <div
          className="absolute left-0 top-0 bottom-0 w-10 z-10 pointer-events-none"
          style={{ background: "linear-gradient(90deg, #0f1e3a 0%, transparent 100%)" }}
        />
      )}
      {fadeRight && (
        <div
          className="absolute right-0 top-0 bottom-0 w-10 z-10 pointer-events-none"
          style={{ background: "linear-gradient(270deg, #0f1e3a 0%, transparent 100%)" }}
        />
      )}

      <div
        ref={scrollRef}
        className="flex items-end gap-0 px-3 pt-2 overflow-x-auto"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
      >
        {ABAS.map(tab => (
          <button
            key={tab.id}
            type="button"
            data-active={aba === tab.id}
            onClick={() => onAba(tab.id)}
            className="relative flex shrink-0 items-center gap-1.5 rounded-t-[7px] px-3.5 py-2.5 text-[10px] font-black uppercase tracking-wide transition-all duration-150"
            style={
              aba === tab.id
                ? {
                    background: "linear-gradient(180deg,#fffbf0 0%,#f1e7cf 100%)",
                    borderTop: `2px solid ${GOLD}`,
                    boxShadow: "0 -4px 14px -2px rgba(231,205,143,0.45), 0 4px 0 #f1e7cf, inset 0 2px 0 rgba(255,255,255,0.95)",
                    color: NAVY,
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

            {badgeMap[tab.id] != null && (badgeMap[tab.id] as number) > 0 && (
              <span
                className="absolute -top-1 -right-1 min-w-[14px] h-3.5 flex items-center justify-center text-[8px] font-black px-1 rounded-full"
                style={{
                  background: aba === tab.id ? GOLD : "rgba(154,123,50,0.75)",
                  color: aba === tab.id ? "#fff" : "#fffbf0",
                  border: "1.5px solid #0f1e3a",
                }}
              >
                {(badgeMap[tab.id] as number) > 99 ? "99+" : badgeMap[tab.id]}
              </span>
            )}
          </button>
        ))}
      </div>
    </nav>
  );
}

export { ABAS };
export type { TabDef };
