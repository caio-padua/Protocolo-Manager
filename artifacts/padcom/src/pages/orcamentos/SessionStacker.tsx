import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { Minus, Plus } from "lucide-react";

// Seletor de sessoes "Console Clinico" — agora HORIZONTAL.
// Barra em DEGRADE espectro: marrom -> vermelho -> laranja -> amarelo ->
// verde agua -> verde -> azul. Azul (direita) = melhor faixa de preco; marrom/
// vermelho (esquerda) = pior. Quanto mais sessoes, mais a barra avanca rumo ao
// azul. Numero grande + botoes - / +. Contrato (value, onChange, max) intacto.

// Degrade do espectro (mesma escala usada no trilho e no preenchimento).
const SPECTRUM =
  "linear-gradient(90deg, #8a5a2b 0%, #d23b2e 16%, #ef8b2c 33%, #f4c430 50%, #1fb6a6 67%, #2faa55 83%, #2f6fed 100%)";

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

  // Posicao 0..100 do thumb na barra (value>max trava no fim).
  const pct = Math.min(100, Math.max(0, ((value - 1) / Math.max(1, max - 1)) * 100));

  function levelFromX(clientX: number): number {
    const el = trackRef.current;
    if (!el) return value;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    return Math.min(max, Math.max(1, Math.round(ratio * (max - 1)) + 1));
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
      {/* Numero grande no centro, com botoes nas laterais. */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          aria-label="Diminuir sessoes"
          className="h-9 w-9 shrink-0 grid place-items-center rounded-lg border bg-white text-primary shadow-sm transition active:scale-95 hover:bg-muted disabled:opacity-30"
          onClick={() => onChange(Math.max(1, value - 1))}
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="text-4xl font-bold leading-none tabular-nums text-primary">{value}</span>
        <button
          type="button"
          aria-label="Aumentar sessoes"
          className="h-9 w-9 shrink-0 grid place-items-center rounded-lg border bg-white text-primary shadow-sm transition active:scale-95 hover:bg-muted"
          onClick={() => onChange(value + 1)}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Barra horizontal em degrade (clique/arraste). */}
      <div className="relative w-full py-1.5">
        <div
          ref={trackRef}
          className="relative h-3.5 w-full cursor-pointer touch-none overflow-hidden rounded-full ring-1 ring-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
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
          {/* Espectro apagado (potencial). */}
          <div aria-hidden="true" className="absolute inset-0" style={{ background: SPECTRUM, opacity: 0.22 }} />
          {/* Espectro vivido ate a posicao atual. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 transition-[clip-path] duration-200"
            style={{ background: SPECTRUM, clipPath: `inset(0 ${100 - pct}% 0 0)` }}
          />
        </div>
        {/* Thumb branco marcando a posicao. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border-2 border-primary bg-white shadow-md transition-[left] duration-200"
          style={{ left: `clamp(0px, calc(${pct}% - 10px), calc(100% - 20px))` }}
        />
      </div>

      <div className="flex items-center justify-between text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
        <span>menos</span>
        <span className="text-primary">azul = melhor preco</span>
        <span>mais</span>
      </div>
    </div>
  );
}
