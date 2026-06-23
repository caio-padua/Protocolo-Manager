import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { Minus, Plus } from "lucide-react";

// Seletor de sessoes "Console Clinico" — barra HORIZONTAL SEGMENTADA (quadradinhos),
// estilo equalizador/tecnologico. Cada segmento aceso caminha do marrom/vermelho
// (esquerda = pior preco) ao azul (direita = melhor faixa). Numero grande numa
// "mini tela" convexa + botoes - / +. Contrato (value, onChange, max) intacto.
//
// Alturas fixas (control h-[60px] / bar h-5 / legend h-4) para alinhar em MATRIZ
// com os blocos Frequencia e Subtotal. Segmentos com relevo ELEVADO (corrige o
// "relevo pra baixo" reportado pelo CEO).

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
    <div className="flex w-full flex-1 flex-col gap-2.5 select-none">
      {/* CONTROL (h-60): numero grande na mini tela convexa, com botoes nas laterais. */}
      <div className="flex h-[60px] items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Diminuir sessões"
          className="h-10 w-10 shrink-0 grid place-items-center rounded-[6px] border bg-white text-primary shadow-sm transition active:scale-95 hover:bg-muted disabled:opacity-30"
          onClick={() => onChange(Math.max(1, value - 1))}
        >
          <Minus className="h-4 w-4" />
        </button>
        <div className="screen-3d grid h-full min-w-[60px] flex-1 place-items-center px-3">
          <span className="text-4xl font-bold leading-none tabular-nums text-primary">{value}</span>
        </div>
        <button
          type="button"
          aria-label="Aumentar sessões"
          className="h-10 w-10 shrink-0 grid place-items-center rounded-[6px] border bg-white text-primary shadow-sm transition active:scale-95 hover:bg-muted"
          onClick={() => onChange(value + 1)}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* BARRA SEGMENTADA (h-5, clique/arraste). Quadradinhos ELEVADOS que acendem
          do quente ao azul. */}
      <div
        ref={trackRef}
        className="flex h-5 w-full cursor-pointer touch-none items-stretch gap-[3px] rounded-[2px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
        aria-label="Número de sessões"
      >
        {Array.from({ length: segments }).map((_, i) => {
          const ratio = segments > 1 ? i / (segments - 1) : 0;
          const on = i < value;
          return (
            <div
              key={i}
              aria-hidden="true"
              className={`h-full flex-1 rounded-[2px] transition-colors duration-150 ${on ? "" : "bg-black/[0.06] dark:bg-white/10 shadow-[inset_0_1px_2px_rgba(7,22,43,0.10)]"}`}
              style={
                on
                  ? {
                      background: `linear-gradient(180deg, hsl(${hueAt(ratio)} 82% 56%) 0%, hsl(${hueAt(ratio)} 80% 46%) 100%)`,
                      boxShadow:
                        "inset 0 1px 0 rgba(255,255,255,0.7), inset 0 -1px 1px rgba(0,0,0,0.10), 0 1px 1.5px rgba(7,22,43,0.30)",
                    }
                  : undefined
              }
            />
          );
        })}
      </div>

      {/* LEGENDA (h-4) — central, sem "MENOS"/"MAIS". */}
      <div className="flex h-4 items-center justify-center text-[9px] font-semibold uppercase tracking-wide text-primary">
        Azul = melhor preço
      </div>
    </div>
  );
}
