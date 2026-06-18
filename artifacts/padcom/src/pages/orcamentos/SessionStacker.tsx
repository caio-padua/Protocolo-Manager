import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { Minus, Plus } from "lucide-react";

// Empilhador vertical de sessoes: retangulos que empilham ao clicar/arrastar.
// Base verde subindo para ciano (cores da marca); blocos ainda nao
// conquistados ficam apagados. Numero grande em destaque ao lado.

function blockColor(level: number, max: number): string {
  const t = max <= 1 ? 1 : (level - 1) / (max - 1);
  const h = Math.round(150 + t * (187 - 150));
  const s = Math.round(58 + t * 16);
  const l = Math.round(44 + t * 6);
  return `hsl(${h} ${s}% ${l}%)`;
}

export function SessionStacker({
  value,
  onChange,
  max = 20,
}: {
  value: number;
  onChange: (n: number) => void;
  max?: number;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const levels = Array.from({ length: max }, (_, i) => max - i); // topo..1

  function levelFromY(clientY: number): number {
    const el = trackRef.current;
    if (!el) return value;
    const rect = el.getBoundingClientRect();
    const rel = clientY - rect.top;
    const ratio = 1 - Math.min(Math.max(rel / rect.height, 0), 1);
    return Math.min(max, Math.max(1, Math.round(ratio * (max - 1)) + 1));
  }

  function handleDown(e: ReactPointerEvent<HTMLDivElement>) {
    draggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    onChange(levelFromY(e.clientY));
  }
  function handleMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    onChange(levelFromY(e.clientY));
  }
  function handleUp() {
    draggingRef.current = false;
  }

  return (
    <div className="flex items-center gap-3 select-none">
      <div
        ref={trackRef}
        className="flex flex-col gap-[2px] cursor-pointer touch-none rounded-md bg-muted/40 p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowRight") {
            e.preventDefault();
            onChange(value + 1);
          } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
            e.preventDefault();
            onChange(Math.max(1, value - 1));
          }
        }}
        role="slider"
        tabIndex={0}
        aria-valuemin={1}
        aria-valuemax={Math.max(max, value)}
        aria-valuenow={value}
        aria-label="Numero de sessoes"
      >
        {levels.map((lvl) => {
          const active = lvl <= value;
          return (
            <div
              key={lvl}
              className={`w-9 rounded-[2px] transition-colors ${active ? "" : "bg-muted"}`}
              style={{ height: 6, ...(active ? { backgroundColor: blockColor(lvl, max) } : {}) }}
            />
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-1">
        <span className="text-[9px] uppercase tracking-widest text-muted-foreground">Sessoes</span>
        <span className="text-4xl font-bold leading-none tabular-nums text-primary">{value}</span>
        <div className="flex gap-1 mt-1">
          <button
            type="button"
            aria-label="Diminuir sessoes"
            className="h-7 w-7 grid place-items-center rounded border bg-background hover:bg-muted"
            onClick={() => onChange(Math.max(1, value - 1))}
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Aumentar sessoes"
            className="h-7 w-7 grid place-items-center rounded border bg-background hover:bg-muted"
            onClick={() => onChange(value + 1)}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
