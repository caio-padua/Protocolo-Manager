import { type ComponentType } from "react";

// Painel de valor CLEAN (estilo mock ChatGPT): "mini tela" convexa (.screen-3d)
// que se afasta da folha, com rotulo pequeno em maiusculas, numero grande
// colorido pelo "tom" e linha auxiliar opcional. Os numeros saltam em 3D.

type Tone = "teal" | "red" | "green" | "slate";
type Size = "sm" | "md" | "lg" | "xl";

const VALUE_TONE: Record<Tone, string> = {
  teal: "text-primary",
  red: "text-red-600 dark:text-red-400",
  green: "text-emerald-600 dark:text-emerald-400",
  slate: "text-foreground",
};

const VALUE_SIZE: Record<Size, string> = {
  sm: "text-xl",
  md: "text-2xl",
  lg: "text-3xl",
  xl: "text-4xl",
};

const PAD: Record<Size, string> = {
  sm: "px-3 py-2.5",
  md: "px-4 py-3",
  lg: "px-4 py-4",
  xl: "px-5 py-5",
};

export function StatPanel({
  label,
  value,
  sub,
  tone = "teal",
  size = "md",
  icon: Icon,
  recommended = false,
  badge,
  className = "",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
  size?: Size;
  icon?: ComponentType<{ className?: string }>;
  recommended?: boolean;
  badge?: string;
  className?: string;
}) {
  return (
    <div className={`screen-3d ${PAD[size]} ${recommended ? "ring-2 ring-primary/40" : ""} ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
        {Icon ? <Icon className="h-3.5 w-3.5 text-muted-foreground" /> : null}
      </div>
      <div
        key={value}
        className={`mt-1 font-bold tabular-nums slashed-zero leading-none animate-in fade-in slide-in-from-bottom-1 duration-300 ${VALUE_SIZE[size]} ${VALUE_TONE[tone]}`}
      >
        {value}
      </div>
      {sub ? <div className="mt-1.5 text-[11px] font-medium tabular-nums text-muted-foreground">{sub}</div> : null}
      {badge ? (
        <div className="mt-2 inline-flex items-center rounded-sm bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
          {badge}
        </div>
      ) : null}
    </div>
  );
}
