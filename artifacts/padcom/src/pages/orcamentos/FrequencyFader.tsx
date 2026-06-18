import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { Input } from "@/components/ui/input";

// Fader vertical estilo potenciometro retro (mesa de som) para a frequencia.
// 12 paradas; a ultima e "eu digito o intervalo" (livre).

export type FreqStop = { label: string; days: number | null; custom?: boolean };

export const FREQ_STOPS: FreqStop[] = [
  { label: "Todo dia", days: 1 },
  { label: "3x / semana", days: 2 },
  { label: "1x / semana", days: 7 },
  { label: "15 / 15 dias", days: 15 },
  { label: "21 / 21 dias", days: 21 },
  { label: "30 / 30 dias", days: 30 },
  { label: "45 / 45 dias", days: 45 },
  { label: "60 / 60 dias", days: 60 },
  { label: "90 / 90 dias", days: 90 },
  { label: "180 / 180 dias", days: 180 },
  { label: "365 / 365 dias", days: 365 },
  { label: "Eu digito", days: null, custom: true },
];

function indexFromValue(value: number | null): number {
  if (value == null) return FREQ_STOPS.length - 1;
  const exact = FREQ_STOPS.findIndex((s) => s.days === value);
  if (exact >= 0) return exact;
  return FREQ_STOPS.length - 1; // valor que nao bate parada => livre
}

const H = 240;
const THUMB_H = 16;

export function FrequencyFader({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (days: number | null) => void;
}) {
  const n = FREQ_STOPS.length;
  const selected = indexFromValue(value);
  const isCustom = selected === n - 1;
  const rowH = H / n;
  const thumbTop = selected * rowH + (rowH - THUMB_H) / 2;

  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  function idxFromY(clientY: number): number {
    const el = trackRef.current;
    if (!el) return selected;
    const rect = el.getBoundingClientRect();
    const rel = clientY - rect.top;
    return Math.min(n - 1, Math.max(0, Math.floor(rel / rowH)));
  }

  function selectIndex(i: number) {
    const stop = FREQ_STOPS[i];
    if (stop.custom) {
      const keep = value != null && !FREQ_STOPS.some((s) => s.days === value);
      onChange(keep ? value : 10);
    } else {
      onChange(stop.days);
    }
  }

  function handleDown(e: ReactPointerEvent<HTMLDivElement>) {
    draggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    selectIndex(idxFromY(e.clientY));
  }
  function handleMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    selectIndex(idxFromY(e.clientY));
  }
  function handleUp() {
    draggingRef.current = false;
  }

  return (
    <div className="select-none">
      <div className="flex gap-3" style={{ height: H }}>
        {/* TRILHO + CURSOR (knob) */}
        <div className="relative" style={{ width: 40, height: H }}>
          <div
            ref={trackRef}
            className="absolute left-1/2 -translate-x-1/2 w-3 rounded-full shadow-inner cursor-pointer touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            style={{
              height: H,
              background: "linear-gradient(to bottom, hsl(180 30% 20%), hsl(187 42% 30%))",
            }}
            onPointerDown={handleDown}
            onPointerMove={handleMove}
            onPointerUp={handleUp}
            onPointerCancel={handleUp}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp") {
                e.preventDefault();
                selectIndex(Math.max(0, selected - 1));
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                selectIndex(Math.min(n - 1, selected + 1));
              }
            }}
            role="slider"
            tabIndex={0}
            aria-valuemin={0}
            aria-valuemax={n - 1}
            aria-valuenow={selected}
            aria-label="Frequencia"
          >
            <div className="absolute left-1/2 -translate-x-1/2 top-2 bottom-2 w-[2px] rounded bg-cyan-300/25" />
          </div>
          <div
            className="absolute left-1/2 -translate-x-1/2 pointer-events-none transition-[top] duration-150"
            style={{ top: thumbTop }}
          >
            <div className="h-4 w-8 rounded-[3px] border border-slate-500 bg-gradient-to-b from-slate-100 to-slate-400 shadow grid place-items-center">
              <div className="h-[2px] w-5 rounded bg-slate-600/70" />
            </div>
          </div>
        </div>

        {/* PARADAS (rotulos clicaveis) */}
        <div className="flex flex-col justify-between" style={{ height: H }}>
          {FREQ_STOPS.map((s, i) => {
            const on = i === selected;
            return (
              <button
                key={s.label}
                type="button"
                onClick={() => selectIndex(i)}
                className={`text-left text-[11px] leading-none whitespace-nowrap transition-colors ${
                  on ? "font-bold text-cyan-700 dark:text-cyan-400" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {isCustom && (
        <div className="mt-2 flex items-center gap-2">
          <Input
            type="number"
            min={1}
            value={value ?? ""}
            className="h-8 w-20"
            onChange={(e) => {
              const raw = e.target.value;
              if (!raw) return onChange(null);
              const parsed = parseInt(raw);
              onChange(Number.isFinite(parsed) && parsed >= 1 ? parsed : 1);
            }}
          />
          <span className="text-[11px] text-muted-foreground">dias entre aplicacoes</span>
        </div>
      )}
    </div>
  );
}
