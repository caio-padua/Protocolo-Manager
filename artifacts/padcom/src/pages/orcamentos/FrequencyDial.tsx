import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";

// Seletor de frequencia "Console Clinico": setas nas EXTREMIDADES, texto no
// centro (numero + por extenso) e, abaixo, uma BARRA SEGMENTADA de COR UNICA
// (ciano) cujo preenchimento representa a EFICIENCIA — menor intervalo = mais
// cheio. Mesmo formato da barra de Sessoes, porem sem o arco-iris. A palavra
// "Frequencia" NAO se repete aqui (fica no rotulo do bloco).
// Contrato identico ao anterior: value:number|null, onChange(days).

export type FreqStop = { label: string; spell: string; days: number | null; custom?: boolean };

export const FREQ_STOPS: FreqStop[] = [
  { label: "Todo dia", spell: "todos os dias", days: 1 },
  { label: "2 / 2 dias", spell: "a cada dois dias", days: 2 },
  { label: "1x / semana", spell: "uma vez por semana", days: 7 },
  { label: "15 / 15 dias", spell: "a cada quinze dias", days: 15 },
  { label: "21 / 21 dias", spell: "a cada vinte e um dias", days: 21 },
  { label: "30 / 30 dias", spell: "uma vez por mês", days: 30 },
  { label: "45 / 45 dias", spell: "a cada quarenta e cinco dias", days: 45 },
  { label: "60 / 60 dias", spell: "a cada dois meses", days: 60 },
  { label: "90 / 90 dias", spell: "a cada três meses", days: 90 },
  { label: "180 / 180 dias", spell: "a cada seis meses", days: 180 },
  { label: "365 / 365 dias", spell: "uma vez por ano", days: 365 },
  { label: "Eu digito", spell: "intervalo personalizado", days: null, custom: true },
];

// Apenas os intervalos reais (sem o "Eu digito"), em ordem crescente de dias.
const REAL_STOPS = FREQ_STOPS.filter((s) => !s.custom);
const REAL_DAYS = REAL_STOPS.map((s) => s.days as number);

// Numero de segmentos da barra = numero de intervalos reais (equalizador 1:1).
export const FREQ_SEGMENTS = REAL_STOPS.length;

// Legenda canonica da barra de frequencia (reuso no modo leitura).
export const FREQ_LEGEND = "Menor intervalo = mais eficiente";

function indexFromValue(value: number | null): number {
  if (value == null) return FREQ_STOPS.length - 1;
  const exact = FREQ_STOPS.findIndex((s) => s.days === value);
  if (exact >= 0) return exact;
  return FREQ_STOPS.length - 1;
}

// Indice do intervalo real mais proximo de um numero de dias qualquer.
function nearestRealIndex(days: number): number {
  let best = 0;
  let bestDiff = Number.POSITIVE_INFINITY;
  REAL_DAYS.forEach((d, i) => {
    const diff = Math.abs(d - days);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  });
  return best;
}

// Quantos segmentos acesos: menor intervalo (mais frequente) = mais cheio.
// idx 0 (todo dia) -> todos acesos; ultimo (uma vez por ano) -> 1 aceso.
export function frequencyFill(days: number | null): number {
  if (days == null) return Math.ceil(FREQ_SEGMENTS / 2);
  return FREQ_SEGMENTS - nearestRealIndex(days);
}

// Rotulo (numero + por extenso) para exibir a frequencia em modo leitura.
export function frequencyLabel(days: number | null): { num: string; spell: string } {
  if (days == null) return { num: "Sob demanda", spell: "intervalo personalizado" };
  const stop = FREQ_STOPS.find((s) => s.days === days);
  if (stop) return { num: stop.label, spell: stop.spell };
  return { num: `A cada ${days} dias`, spell: `a cada ${days} dias` };
}

// ============================================================
// FrequencyBar — barra segmentada de cor unica (ciano). Sem onPick = leitura.
// Com onPick = interativa (clique/arraste mapeia para o intervalo real).
// ============================================================
export function FrequencyBar({
  days,
  onPick,
  ariaLabel = "Frequência das aplicações",
}: {
  days: number | null;
  onPick?: (days: number | null) => void;
  ariaLabel?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const interactive = !!onPick;
  const lit = frequencyFill(days);

  function pick(clientX: number) {
    const el = trackRef.current;
    if (!el || !onPick) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    // direita = mais segmentos = mais eficiente = menor intervalo (idx 0).
    const idx = Math.round((1 - ratio) * (FREQ_SEGMENTS - 1));
    onPick(REAL_DAYS[idx]);
  }

  function handleDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!interactive) return;
    draggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    pick(e.clientX);
  }
  function handleMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!interactive || !draggingRef.current) return;
    pick(e.clientX);
  }
  function handleUp() {
    draggingRef.current = false;
  }

  const common = "flex h-5 w-full items-stretch gap-[3px] rounded-[2px]";

  return (
    <div
      ref={trackRef}
      className={
        interactive
          ? `${common} cursor-pointer touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400`
          : common
      }
      onPointerDown={interactive ? handleDown : undefined}
      onPointerMove={interactive ? handleMove : undefined}
      onPointerUp={interactive ? handleUp : undefined}
      onPointerCancel={interactive ? handleUp : undefined}
      role={interactive ? "slider" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-valuemin={interactive ? 1 : undefined}
      aria-valuemax={interactive ? FREQ_SEGMENTS : undefined}
      aria-valuenow={interactive ? lit : undefined}
      aria-label={interactive ? ariaLabel : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              const idx = days == null ? 0 : nearestRealIndex(days);
              if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                e.preventDefault();
                onPick?.(REAL_DAYS[Math.min(FREQ_SEGMENTS - 1, idx + 1)]);
              } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                e.preventDefault();
                onPick?.(REAL_DAYS[Math.max(0, idx - 1)]);
              }
            }
          : undefined
      }
    >
      {Array.from({ length: FREQ_SEGMENTS }).map((_, i) => {
        const on = i < lit;
        return (
          <div
            key={i}
            aria-hidden="true"
            className={`h-full flex-1 rounded-[2px] transition-colors duration-150 ${
              on ? "" : "bg-black/[0.06] dark:bg-white/10 shadow-[inset_0_1px_2px_rgba(7,22,43,0.10)]"
            }`}
            style={
              on
                ? {
                    background: "linear-gradient(180deg, hsl(187 80% 52%) 0%, hsl(187 78% 42%) 100%)",
                    boxShadow:
                      "inset 0 1px 0 rgba(255,255,255,0.7), inset 0 -1px 1px rgba(0,0,0,0.10), 0 1px 1.5px rgba(7,22,43,0.30)",
                  }
                : undefined
            }
          />
        );
      })}
    </div>
  );
}

const ARROW =
  "shrink-0 h-10 w-10 grid place-items-center rounded-[6px] border bg-white text-primary shadow-sm transition active:scale-95 hover:bg-muted disabled:opacity-30 disabled:active:scale-100";

export function FrequencyDial({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (days: number | null) => void;
}) {
  const selected = indexFromValue(value);
  const stop = FREQ_STOPS[selected];
  const isCustom = !!stop.custom;
  const numText = isCustom ? (value != null ? `A cada ${value} dias` : "Eu digito") : stop.label;
  const spellText = isCustom ? "intervalo personalizado" : stop.spell;

  // Navegacao por VALOR (nao por indice): a partir de qualquer intervalo —
  // inclusive um personalizado — a seta caminha para o stop real imediatamente
  // menor/maior, evitando o salto para o fim da lista.
  const effective = value ?? Number.POSITIVE_INFINITY;
  const prevStop = [...REAL_STOPS].reverse().find((s) => (s.days ?? 0) < effective);
  const nextStop = REAL_STOPS.find((s) => (s.days ?? 0) > effective);
  const goPrev = () => {
    if (prevStop) onChange(prevStop.days);
  };
  const goNext = () => {
    if (nextStop) onChange(nextStop.days);
  };

  return (
    <div className="flex w-full flex-1 flex-col gap-2.5 select-none">
      {/* CONTROL (h-60): setas nas extremidades, texto no centro. */}
      <div className="flex h-[60px] items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Diminuir intervalo (mais frequente)"
          onClick={goPrev}
          disabled={!prevStop}
          className={ARROW}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="screen-3d flex h-full min-w-[60px] flex-1 flex-col items-center justify-center px-2">
          <div
            key={numText}
            className="text-lg font-bold leading-tight text-foreground animate-in fade-in zoom-in-95 duration-300"
          >
            {numText}
          </div>
          <div className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{spellText}</div>
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

      {/* BARRA SEGMENTADA (h-5) — cor unica ciano, preenchimento = eficiencia. */}
      <FrequencyBar days={value} onPick={onChange} />

      {/* LEGENDA (h-4). */}
      <div className="flex h-4 items-center justify-center text-[9px] font-semibold uppercase tracking-wide text-cyan-600 dark:text-cyan-400">
        {FREQ_LEGEND}
      </div>

      {/* AFFORDANCE DE INTERVALO PERSONALIZADO (compacto). */}
      {isCustom ? (
        <div className="flex items-center justify-center gap-2">
          <Input
            type="number"
            min={1}
            value={value ?? ""}
            className="h-8 w-20 text-center"
            aria-label="Dias entre aplicações"
            onChange={(e) => {
              const raw = e.target.value;
              if (!raw) return onChange(null);
              const parsed = parseInt(raw);
              onChange(Number.isFinite(parsed) && parsed >= 1 ? parsed : 1);
            }}
          />
          <span className="text-[10px] text-muted-foreground">dias entre aplicações</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onChange(10)}
          className="mx-auto flex items-center gap-1 text-[10px] font-medium text-muted-foreground transition hover:text-cyan-600"
        >
          <Pencil className="h-3 w-3" />
          Eu digito um intervalo
        </button>
      )}
    </div>
  );
}
