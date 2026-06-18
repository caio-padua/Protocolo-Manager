import { ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";

// Seletor de frequencia "Console Clinico": display digital central + setas
// grandes (gostoso de tocar no celular) + trilha de 12 ticks para saltar
// direto numa parada. Substitui o antigo fader vertical (termostato).
// Contrato identico ao anterior: value:number|null, onChange(days).

export type FreqStop = { label: string; days: number | null; custom?: boolean };

export const FREQ_STOPS: FreqStop[] = [
  { label: "Todo dia", days: 1 },
  { label: "2 / 2 dias", days: 2 },
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
  return FREQ_STOPS.length - 1;
}

const BTN =
  "shrink-0 w-10 grid place-items-center rounded-md border border-white/10 bg-gradient-to-b from-[#0c2626] to-[#06191a] text-cyan-200 transition-transform active:scale-95 hover:border-cyan-400/40 disabled:opacity-30 disabled:active:scale-100";

export function FrequencyDial({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (days: number | null) => void;
}) {
  const n = FREQ_STOPS.length;
  const selected = indexFromValue(value);
  const stop = FREQ_STOPS[selected];
  const isCustom = !!stop.custom;
  const display = isCustom ? (value != null ? `A cada ${value} dias` : "Eu digito") : stop.label;

  function selectIndex(i: number) {
    const clamped = Math.min(n - 1, Math.max(0, i));
    const s = FREQ_STOPS[clamped];
    if (s.custom) {
      const keep = value != null && !FREQ_STOPS.some((x) => x.days === value);
      onChange(keep ? value : 10);
    } else {
      onChange(s.days);
    }
  }

  return (
    <div className="w-full max-w-[260px] select-none">
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          aria-label="Diminuir intervalo (mais frequente)"
          onClick={() => selectIndex(selected - 1)}
          disabled={selected === 0}
          className={BTN}
          style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07), 0 4px 12px -4px rgba(0,0,0,0.6)" }}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div
          className="relative flex-1 overflow-hidden rounded-md border border-white/10 bg-gradient-to-b from-[#0c2626] to-[#06191a] px-3 py-2 ring-1 ring-cyan-400/20"
          style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -3px 8px rgba(0,0,0,0.55), 0 0 18px -4px rgba(69,184,204,0.4)" }}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/[0.06] to-transparent" />
          <div className="relative text-center">
            <div className="text-[9px] uppercase tracking-[0.18em] text-cyan-300/60">Frequencia</div>
            <div
              key={display}
              className="mt-0.5 font-mono text-base font-bold leading-tight text-cyan-200 animate-in fade-in zoom-in-95 duration-300"
              style={{ textShadow: "0 0 10px rgba(69,184,204,0.45)" }}
            >
              {display}
            </div>
          </div>
        </div>

        <button
          type="button"
          aria-label="Aumentar intervalo (menos frequente)"
          onClick={() => selectIndex(selected + 1)}
          disabled={selected === n - 1}
          className={BTN}
          style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07), 0 4px 12px -4px rgba(0,0,0,0.6)" }}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div
        className="mt-2 flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 rounded"
        role="slider"
        tabIndex={0}
        aria-valuemin={0}
        aria-valuemax={n - 1}
        aria-valuenow={selected}
        aria-valuetext={display}
        aria-label="Frequencia"
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
            e.preventDefault();
            selectIndex(selected - 1);
          } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
            e.preventDefault();
            selectIndex(selected + 1);
          }
        }}
      >
        {FREQ_STOPS.map((s, i) => {
          const on = i === selected;
          const passed = i < selected;
          return (
            <div
              key={s.label}
              aria-hidden="true"
              title={s.label}
              onClick={() => selectIndex(i)}
              className={`h-2.5 flex-1 cursor-pointer rounded-[2px] transition-all ${on ? "" : passed ? "bg-cyan-500/40" : "bg-muted"}`}
              style={on ? { backgroundColor: "#45B8CC", boxShadow: "0 0 8px rgba(69,184,204,0.7)" } : {}}
            />
          );
        })}
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
