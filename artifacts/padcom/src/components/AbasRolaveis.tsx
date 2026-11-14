import { useCallback, useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type AbaItem = {
  value: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  disabled?: boolean;
};

/**
 * Barra de abas em UMA linha, sempre com a mesma altura (ativa ou nao).
 * Setas levam para um lado e para o outro; tambem desliza com o dedo, o mousepad ou a roda do mouse.
 * Sem barra de rolagem visivel.
 */
export function AbasRolaveis({ abas, ativa, onChange }: { abas: AbaItem[]; ativa: string; onChange: (v: string) => void }) {
  const lista = useRef<HTMLDivElement>(null);
  const [esq, setEsq] = useState(false);
  const [dir, setDir] = useState(false);

  const medir = useCallback(() => {
    const el = lista.current;
    if (!el) return;
    setEsq(el.scrollLeft > 2);
    setDir(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const el = lista.current;
    if (!el) return;
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [medir, abas.length]);

  // A aba ativa sempre fica a vista
  useEffect(() => {
    lista.current?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
  }, [ativa]);

  const rolar = (sentido: -1 | 1) => {
    const el = lista.current;
    if (el) el.scrollBy({ left: sentido * Math.max(160, el.clientWidth * 0.6), behavior: "smooth" });
  };

  const seta = "concave-3d flex h-9 w-8 shrink-0 items-center justify-center text-primary transition-opacity";

  return (
    <div className="panel-3d-sub flex items-center gap-1.5 p-2">
      <button type="button" aria-label="Abas anteriores" tabIndex={esq ? 0 : -1} onClick={() => rolar(-1)}
        className={`${seta} ${esq ? "" : "pointer-events-none opacity-25"}`}>
        <ChevronLeft className="h-4 w-4" />
      </button>
      <div
        ref={lista}
        role="tablist"
        onScroll={medir}
        className="flex min-w-0 flex-1 gap-2 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ touchAction: "pan-x" }}
      >
        {abas.map(({ value, label, Icon, disabled }) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={ativa === value}
            disabled={disabled}
            onClick={() => !disabled && onChange(value)}
            className={`${ativa === value ? "bevel-3d text-primary" : "concave-3d text-muted-foreground/60"} flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap px-4 text-[10px] font-black uppercase tracking-widest transition-colors disabled:cursor-not-allowed disabled:opacity-30`}
          >
            <Icon className="h-3 w-3" /> {label}
          </button>
        ))}
      </div>
      <button type="button" aria-label="Próximas abas" tabIndex={dir ? 0 : -1} onClick={() => rolar(1)}
        className={`${seta} ${dir ? "" : "pointer-events-none opacity-25"}`}>
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
