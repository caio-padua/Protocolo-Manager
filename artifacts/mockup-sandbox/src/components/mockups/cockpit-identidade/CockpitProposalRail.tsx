import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ABAS, type AbaId } from "./_source/CockpitTabs";
import "./CockpitProposalRail.css";

type RailMode = "tabs" | "anchors";

interface CockpitProposalRailProps {
  active: AbaId;
  onChange: (id: AbaId) => void;
  mode?: RailMode;
  className?: string;
  label?: string;
}

export function CockpitProposalRail({
  active,
  onChange,
  mode = "tabs",
  className = "",
  label = "Ferramentas do Cockpit",
}: CockpitProposalRailProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ left: false, right: false });

  const updateOverflow = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    setOverflow({
      left: rail.scrollLeft > 4,
      right: rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 4,
    });
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    updateOverflow();
    rail.addEventListener("scroll", updateOverflow, { passive: true });
    const observer = new ResizeObserver(updateOverflow);
    observer.observe(rail);
    return () => {
      rail.removeEventListener("scroll", updateOverflow);
      observer.disconnect();
    };
  }, [updateOverflow]);

  useEffect(() => {
    const rail = railRef.current;
    const selected = rail?.querySelector<HTMLElement>(`[data-tool="${active}"]`);
    if (!rail || !selected) return;
    const bounds = rail.getBoundingClientRect();
    const selectedBounds = selected.getBoundingClientRect();
    const displacement = selectedBounds.left < bounds.left
      ? selectedBounds.left - bounds.left
      : selectedBounds.right > bounds.right
        ? selectedBounds.right - bounds.right
        : 0;
    if (displacement) rail.scrollBy({ left: displacement, behavior: "smooth" });
  }, [active]);

  const moveRail = (direction: -1 | 1) => {
    railRef.current?.scrollBy({ left: direction * 220, behavior: "smooth" });
  };

  const selectByKeyboard = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % ABAS.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + ABAS.length) % ABAS.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = ABAS.length - 1;
    else return;
    event.preventDefault();
    const next = ABAS[nextIndex];
    onChange(next.id);
    requestAnimationFrame(() => document.getElementById(`cockpit-proposal-tool-${next.id}`)?.focus({ preventScroll: true }));
  };

  const rail = (
    <div
      className={`cpr-shell panel-3d-sub${overflow.left ? " has-left-overflow" : ""}${overflow.right ? " has-right-overflow" : ""} ${className}`}
    >
      <button
        type="button"
        className="cpr-arrow"
        aria-label="Rolar ferramentas para a esquerda"
        disabled={!overflow.left}
        onClick={() => moveRail(-1)}
      >
        <ChevronLeft size={17} aria-hidden="true" />
      </button>
      <div className="cpr-rail" role="presentation" ref={railRef}>
        {ABAS.map((tool, index) => {
          const Icon = tool.Icon;
          const selected = active === tool.id;
          return (
            <button
              type="button"
              key={tool.id}
              id={`cockpit-proposal-tool-${tool.id}`}
              data-tool={tool.id}
              role={mode === "tabs" ? "tab" : undefined}
              aria-selected={mode === "tabs" ? selected : undefined}
              aria-current={mode === "anchors" && selected ? "location" : undefined}
              aria-controls={mode === "tabs" ? "cockpit-proposal-tool-content" : undefined}
              tabIndex={mode === "tabs" ? (selected ? 0 : -1) : 0}
              className={selected ? "is-active" : ""}
              title={`Ferramenta ${index + 1}: ${tool.rotulo}`}
              onClick={() => onChange(tool.id)}
              onKeyDown={(event) => selectByKeyboard(event, index)}
            >
              <span className="cpr-index">{String(index + 1).padStart(2, "0")}</span>
              <Icon size={13} strokeWidth={1.9} aria-hidden="true" />
              <span className="cpr-label">{tool.rotulo}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="cpr-arrow"
        aria-label="Rolar ferramentas para a direita"
        disabled={!overflow.right}
        onClick={() => moveRail(1)}
      >
        <ChevronRight size={17} aria-hidden="true" />
      </button>
    </div>
  );

  return mode === "tabs"
    ? <div role="tablist" aria-label={label}>{rail}</div>
    : <nav aria-label={label}>{rail}</nav>;
}
