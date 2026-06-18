import { type ComponentType } from "react";

// Mostrador retroiluminado "Console Clinico": fundo verde-petroleo escuro,
// digito em fonte mono com brilho (neon discreto), relevo 3D. Sempre escuro
// (igual a um aparelho), entao fica identico em tema claro/escuro do app.

type Tone = "cyan" | "emerald" | "amber" | "slate";
type Size = "sm" | "md" | "lg" | "xl";

const TONES: Record<Tone, { text: string; glow: string; ring: string; chip: string }> = {
  cyan: { text: "text-cyan-200", glow: "rgba(69,184,204,0.45)", ring: "ring-cyan-400/40", chip: "text-cyan-300/70" },
  emerald: { text: "text-emerald-200", glow: "rgba(16,185,129,0.45)", ring: "ring-emerald-400/40", chip: "text-emerald-300/70" },
  amber: { text: "text-amber-200", glow: "rgba(251,191,36,0.40)", ring: "ring-amber-400/40", chip: "text-amber-300/70" },
  slate: { text: "text-slate-200", glow: "rgba(148,163,184,0.0)", ring: "ring-slate-400/30", chip: "text-slate-400" },
};

const VALUE_SIZE: Record<Size, string> = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-3xl",
  xl: "text-4xl sm:text-5xl",
};

const PAD: Record<Size, string> = {
  sm: "px-3 py-2",
  md: "px-4 py-3",
  lg: "px-4 py-3.5",
  xl: "px-5 py-4",
};

export function DigitalDisplay({
  label,
  value,
  sub,
  tone = "cyan",
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
  const t = TONES[tone];
  return (
    <div
      className={`relative overflow-hidden rounded-md border border-white/10 bg-gradient-to-b from-[#0c2626] to-[#06191a] ${PAD[size]} ${recommended ? `ring-2 ${t.ring}` : ""} ${className}`}
      style={{
        boxShadow: recommended
          ? `inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -3px 10px rgba(0,0,0,0.55), 0 0 22px -2px ${t.glow}, 0 8px 20px -6px rgba(0,0,0,0.6)`
          : "inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -3px 8px rgba(0,0,0,0.55), 0 8px 20px -6px rgba(0,0,0,0.6)",
      }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/[0.06] to-transparent" />
      <div className="relative flex items-center justify-between gap-2">
        <span className={`text-[10px] font-medium uppercase tracking-[0.18em] ${t.chip}`}>{label}</span>
        {Icon ? <Icon className={`h-3.5 w-3.5 ${t.chip}`} /> : null}
      </div>
      <div
        key={value}
        className={`relative mt-1 font-mono font-bold tabular-nums slashed-zero leading-none animate-in fade-in slide-in-from-bottom-1 duration-300 ${VALUE_SIZE[size]} ${t.text}`}
        style={{ textShadow: tone === "slate" ? "none" : `0 0 10px ${t.glow}` }}
      >
        {value}
      </div>
      {sub ? <div className={`relative mt-1 text-[11px] font-medium tabular-nums ${t.chip}`}>{sub}</div> : null}
      {badge ? (
        <div className="relative mt-2 inline-flex items-center rounded-sm bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
          {badge}
        </div>
      ) : null}
    </div>
  );
}
