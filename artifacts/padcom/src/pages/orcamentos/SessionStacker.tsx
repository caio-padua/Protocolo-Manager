import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { Minus, Plus } from "lucide-react";

// Seletor de sessoes "Console Clinico" — barra HORIZONTAL SEGMENTADA (quadradinhos),
// estilo equalizador/tecnologico. Cada segmento aceso caminha do marrom/vermelho
// (esquerda = pior preco) ao azul (direita = melhor faixa). Numero grande numa
// "mini tela" convexa + botoes - / +. Contrato (value, onChange, max) intacto.

// Cor de cada quadradinho por posicao (0..1): vermelho-marrom -> ... -> azul.
function hueAt(ratio: number): number {
  return Math.round(14 + ratio * (212 - 14)); // 14 (quente) -> 212 (azul)
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
  const segments = Math.max(2, max);

  function levelFromX(clientX: number): number {
    const el = trackRef.current;
    if (!el) return value;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    return Math.min(max, Math.max(1, Math.round(ratio * (segments - 1)) + 1));
  }

  function handleDown(e: ReactPointerEvent<HTMLDivElement>) {
    draggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    onChange(levelFromX(e.clientX));
  }
  function handleMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    onChange(levelFromX(e.clientX));
  }
  function handleUp() {
    draggingRef.current = false;
  }

  return (
    <div className="flex w-full flex-col gap-3 select-none">
      {/* Numero grande numa mini tela convexa, com botoes nas laterais. */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Diminuir sessoes"
          className="h-9 w-9 shrink-0 grid place-items-center rounded-lg border bg-white text-primary shadow-sm transition active:scale-95 hover:bg-muted disabled:opacity-30"
          onClick={() => onChange(Math.max(1, value - 1))}
        >
          <Minus className="h-4 w-4" />
        </button>
        <div className="screen-3d grid min-w-[60px] flex-1 place-items-center px-3 py-1.5">
          <span className="text-4xl font-bold leading-none tabular-nums text-primary">{value}</span>
        </div>
        <button
          type="button"
          aria-label="Aumentar sessoes"
          className="h-9 w-9 shrink-0 grid place-items-center rounded-lg border bg-white text-primary shadow-sm transition active:scale-95 hover:bg-muted"
          onClick={() => onChange(value + 1)}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Barra SEGMENTADA (clique/arraste). Quadradinhos que acendem do quente ao azul. */}
      <div
        ref={trackRef}
        className="flex w-full cursor-pointer touch-none items-end gap-[3px] rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowUp") {
            e.preventDefault();
            onChange(value + 1);
          } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
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
        {Array.from({ length: segments }).map((_, i) => {
          const ratio = segments > 1 ? i / (segments - 1) : 0;
          const on = i < value;
          return (
            <div
              key={i}
              aria-hidden="true"
              className={`h-5 flex-1 rounded-[3px] transition-colors duration-150 ${on ? "" : "bg-black/[0.07] dark:bg-white/10"}`}
              style={
                on
                  ? {
                      background: `hsl(${hueAt(ratio)} 78% 50%)`,
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -2px 3px rgba(0,0,0,0.12)",
                    }
                  : undefined
              }
            />
          );
        })}
      </div>

      <div className="flex items-center justify-between text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
        <span>menos</span>
        <span className="text-primary">azul = melhor preco</span>
        <span>mais</span>
      </div>
    </div>
  );
}
