import { ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";

// Seletor de frequencia clean (estilo mock ChatGPT): setas nas EXTREMIDADES e,
// no centro, so o texto — numero ("1x / semana") + por extenso ("uma vez por
// semana"). A palavra "Frequencia" NAO se repete aqui (fica no rotulo do bloco).
// Contrato identico ao anterior: value:number|null, onChange(days).

export type FreqStop = { label: string; spell: string; days: number | null; custom?: boolean };

export const FREQ_STOPS: FreqStop[] = [
  { label: "Todo dia", spell: "todos os dias", days: 1 },
  { label: "2 / 2 dias", spell: "a cada dois dias", days: 2 },
  { label: "1x / semana", spell: "uma vez por semana", days: 7 },
  { label: "15 / 15 dias", spell: "a cada quinze dias", days: 15 },
  { label: "21 / 21 dias", spell: "a cada vinte e um dias", days: 21 },
  { label: "30 / 30 dias", spell: "uma vez por mes", days: 30 },
  { label: "45 / 45 dias", spell: "a cada quarenta e cinco dias", days: 45 },
  { label: "60 / 60 dias", spell: "a cada dois meses", days: 60 },
  { label: "90 / 90 dias", spell: "a cada tres meses", days: 90 },
  { label: "180 / 180 dias", spell: "a cada seis meses", days: 180 },
  { label: "365 / 365 dias", spell: "uma vez por ano", days: 365 },
  { label: "Eu digito", spell: "intervalo personalizado", days: null, custom: true },
];

function indexFromValue(value: number | null): number {
  if (value == null) return FREQ_STOPS.length - 1;
  const exact = FREQ_STOPS.findIndex((s) => s.days === value);
  if (exact >= 0) return exact;
  return FREQ_STOPS.length - 1;
}

// Rotulo (numero + por extenso) para exibir a frequencia em modo leitura.
export function frequencyLabel(days: number | null): { num: string; spell: string } {
  if (days == null) return { num: "Sob demanda", spell: "intervalo personalizado" };
  const stop = FREQ_STOPS.find((s) => s.days === days);
  if (stop) return { num: stop.label, spell: stop.spell };
  return { num: `A cada ${days} dias`, spell: `a cada ${days} dias` };
}

const ARROW =
  "shrink-0 h-9 w-9 grid place-items-center rounded-lg border bg-white text-primary shadow-sm transition active:scale-95 hover:bg-muted disabled:opacity-30 disabled:active:scale-100";

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
  const numText = isCustom ? (value != null ? `A cada ${value} dias` : "Eu digito") : stop.label;
  const spellText = isCustom ? "intervalo personalizado" : stop.spell;

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

  // Navegacao por VALOR (nao por indice): a partir de qualquer intervalo —
  // inclusive um personalizado (ex.: 10 dias) — a seta caminha para o stop real
  // imediatamente menor/maior, evitando o salto para o fim da lista ("Eu digito").
  const realStops = FREQ_STOPS.filter((s) => !s.custom);
  const effective = value ?? Number.POSITIVE_INFINITY;
  const prevStop = [...realStops].reverse().find((s) => (s.days ?? 0) < effective);
  const nextStop = realStops.find((s) => (s.days ?? 0) > effective);
  const goPrev = () => { if (prevStop) onChange(prevStop.days); };
  const goNext = () => { if (nextStop) onChange(nextStop.days); };

  return (
    <div className="w-full select-none">
      {/* Setas nas extremidades, texto no centro. */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Diminuir intervalo (mais frequente)"
          onClick={goPrev}
          disabled={!prevStop}
          className={ARROW}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="flex-1 px-1 text-center">
          <div
            key={numText}
            className="text-base font-bold leading-tight text-foreground animate-in fade-in zoom-in-95 duration-300"
          >
            {numText}
          </div>
          <div className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{spellText}</div>
        </div>

        <button
          type="button"
          aria-label="Aumentar intervalo (menos frequente)"
          onClick={goNext}
          disabled={!nextStop}
          className={ARROW}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Trilha de saltos rapidos (clean). */}
      <div
        className="mt-3 flex items-center gap-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
        role="slider"
        tabIndex={0}
        aria-valuemin={0}
        aria-valuemax={n - 1}
        aria-valuenow={selected}
        aria-valuetext={`${numText} (${spellText})`}
        aria-label="Frequencia"
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
            e.preventDefault();
            goPrev();
          } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
            e.preventDefault();
            goNext();
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
              className={`h-2 flex-1 cursor-pointer rounded-full transition-all ${
                on ? "bg-primary" : passed ? "bg-primary/35" : "bg-muted"
              }`}
            />
          );
        })}
      </div>

      {isCustom && (
        <div className="mt-3 flex items-center gap-2">
          <Input
            type="number"
            min={1}
            value={value ?? ""}
            className="h-9 w-20"
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
