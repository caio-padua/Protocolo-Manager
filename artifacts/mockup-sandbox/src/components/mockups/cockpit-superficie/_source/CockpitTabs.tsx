// CockpitTabs — régua plana de abas (lista sem grupos).
// Pedido CEO 23/07/2026: remover agrupamento CLÍNICO/GESTÃO (não autorizado).
// Mantém: scroll horizontal, fade esquerdo/direito, aba ativa destaca em ouro,
//         badge de contagem, scroll automático para aba ativa.
// Design: skill-layout-paxter · navy/ouro · sem infantilidades.

import { useRef, useEffect, useState, useCallback, type KeyboardEvent } from "react";
import {
  FlaskConical, Syringe, Gem, ClipboardList, TrendingUp,
  FileText, ClipboardCheck, Activity, DollarSign, User, Utensils, MessageCircle,
  ChevronLeft, ChevronRight,
} from "lucide-react";

export type AbaId =
  | "telegram"
  | "prescricao" | "injetaveis" | "implantes" | "exames" | "evolucao"
  | "documentos" | "anamnese" | "protocolos" | "dieta-treino" | "financeiro" | "cadastro";

interface TabDef {
  id: AbaId;
  rotulo: string;
  Icon: typeof FlaskConical;
}

const ABAS: TabDef[] = [
  { id: "prescricao",   rotulo: "Prescrição",      Icon: FlaskConical   },
  { id: "injetaveis",   rotulo: "Injetáveis",       Icon: Syringe        },
  { id: "implantes",    rotulo: "Implantes",        Icon: Gem            },
  { id: "exames",       rotulo: "Exames",           Icon: ClipboardList  },
  { id: "evolucao",     rotulo: "Evolução",         Icon: TrendingUp     },
  { id: "anamnese",     rotulo: "Anamnese Prévia",  Icon: ClipboardCheck },
  { id: "documentos",   rotulo: "Documentos",       Icon: FileText       },
  { id: "protocolos",   rotulo: "Protocolos",       Icon: Activity       },
  { id: "dieta-treino", rotulo: "Dieta e Treino",   Icon: Utensils       },
  { id: "financeiro",   rotulo: "Financeiro",       Icon: DollarSign     },
  { id: "cadastro",     rotulo: "Cadastro",         Icon: User           },
  { id: "telegram",     rotulo: "Telegram",         Icon: MessageCircle  },
];

interface CockpitTabsProps {
  aba: AbaId;
  onAba: (aba: AbaId) => void;
  protocolCount?: number;
  paymentCount?: number;
  modo?: "abas" | "telas" | "ficha";
}

export default function CockpitTabs({ aba, onAba, protocolCount, paymentCount, modo = "abas" }: CockpitTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ left: false, right: false });

  const updateOverflow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setOverflow({
      left: el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
  }, []);

  useEffect(() => {
    updateOverflow();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateOverflow, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateOverflow);
    observer?.observe(el);
    window.addEventListener("resize", updateOverflow);
    return () => {
      el.removeEventListener("scroll", updateOverflow);
      window.removeEventListener("resize", updateOverflow);
      observer?.disconnect();
    };
  }, [updateOverflow]);

  useEffect(() => {
    const rail = scrollRef.current;
    const selected = rail?.querySelector<HTMLElement>(`[data-tool="${aba}"]`);
    if (!rail || !selected) return;
    const area = rail.getBoundingClientRect();
    const item = selected.getBoundingClientRect();
    const deslocamento = item.left < area.left ? item.left - area.left
      : item.right > area.right ? item.right - area.right : 0;
    if (deslocamento) rail.scrollBy({ left: deslocamento, behavior: "smooth" });
  }, [aba]);

  const badgeMap: Partial<Record<AbaId, number>> = {
    protocolos: protocolCount ?? 0,
    financeiro: paymentCount ?? 0,
  };

  function navegarTeclado(evento: KeyboardEvent<HTMLButtonElement>, indice: number) {
    let proximo = indice;
    if (evento.key === "ArrowRight") proximo = (indice + 1) % ABAS.length;
    else if (evento.key === "ArrowLeft") proximo = (indice - 1 + ABAS.length) % ABAS.length;
    else if (evento.key === "Home") proximo = 0;
    else if (evento.key === "End") proximo = ABAS.length - 1;
    else return;
    evento.preventDefault();
    const ferramenta = ABAS[proximo];
    onAba(ferramenta.id);
    requestAnimationFrame(() => {
      scrollRef.current?.querySelector<HTMLElement>(`[data-tool="${ferramenta.id}"]`)
        ?.focus({ preventScroll: true });
    });
  }

  return (
    <nav className="cc-rail" aria-label="Abas do cockpit">
      <button type="button" className="cc-rail-arrow" aria-label="Rolar ferramentas para a esquerda"
        disabled={!overflow.left} onClick={() => scrollRef.current?.scrollBy({ left: -220, behavior: "smooth" })}>
        <ChevronLeft size={17} aria-hidden="true" />
      </button>
      <div ref={scrollRef} className="cc-rail-list">
        {ABAS.map((tab, indice) => {
          const ativa = aba === tab.id;
          const count = badgeMap[tab.id];
          return (
            <button key={tab.id} type="button" data-tool={tab.id} data-active={ativa}
              aria-current={ativa ? (modo === "abas" ? "page" : "location") : undefined}
              className="cc-rail-item" onClick={() => onAba(tab.id)}
              onKeyDown={(evento) => navegarTeclado(evento, indice)}
              title={`Ferramenta ${indice + 1}: ${tab.rotulo}`}>
              <span className="cc-rail-index">{String(indice + 1).padStart(2, "0")}</span>
              <tab.Icon size={13} aria-hidden="true" />
              <span>{tab.rotulo}</span>
              {count != null && count > 0 && <span className="cc-rail-badge">{count > 99 ? "99+" : count}</span>}
            </button>
          );
        })}
      </div>
      <button type="button" className="cc-rail-arrow" aria-label="Rolar ferramentas para a direita"
        disabled={!overflow.right} onClick={() => scrollRef.current?.scrollBy({ left: 220, behavior: "smooth" })}>
        <ChevronRight size={17} aria-hidden="true" />
      </button>
    </nav>
  );
}

export { ABAS };
export type { TabDef };
