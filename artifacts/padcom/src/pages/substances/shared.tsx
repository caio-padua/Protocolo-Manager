import {
  Heart, Brain, Zap, Moon, Dumbbell, Shield, Sparkles, Leaf, Activity,
  TrendingUp, FlaskRound, Beaker, Droplet,
} from "lucide-react";

export function getProcedureLabel(type: string | null): string {
  if (type === "im") return "Intramuscular";
  if (type === "implant") return "Implante";
  return "Endovenoso";
}

export function getProcedureColor(type: string | null): string {
  if (type === "im") return "bg-blue-100 text-blue-700 border-blue-200";
  if (type === "implant") return "bg-purple-100 text-purple-700 border-purple-200";
  return "bg-amber-100 text-amber-700 border-amber-200";
}

export function getCategoryStyle(cat: string | null): { bg: string; text: string; icon: typeof Heart } {
  const c = (cat || "").toLowerCase();
  if (c.includes("antioxidante")) return { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-400", icon: Shield };
  if (c.includes("vitamina") || c.includes("vitamin")) return { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400", icon: Sparkles };
  if (c.includes("mineral")) return { bg: "bg-sky-100 dark:bg-sky-900/30", text: "text-sky-700 dark:text-sky-400", icon: FlaskRound };
  if (c.includes("metabol") || c.includes("metab")) return { bg: "bg-violet-100 dark:bg-violet-900/30", text: "text-violet-700 dark:text-violet-400", icon: Activity };
  if (c.includes("lipol") || c.includes("lipo")) return { bg: "bg-rose-100 dark:bg-rose-900/30", text: "text-rose-700 dark:text-rose-400", icon: TrendingUp };
  if (c.includes("oxid")) return { bg: "bg-cyan-100 dark:bg-cyan-900/30", text: "text-cyan-700 dark:text-cyan-400", icon: Zap };
  if (c.includes("neuro")) return { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-400", icon: Brain };
  if (c.includes("dermato")) return { bg: "bg-pink-100 dark:bg-pink-900/30", text: "text-pink-700 dark:text-pink-400", icon: Sparkles };
  return { bg: "bg-slate-100 dark:bg-slate-900/30", text: "text-slate-700 dark:text-slate-400", icon: Beaker };
}

export const BODY_SYSTEM_LABELS: Record<string, { label: string; icon: typeof Heart; color: string }> = {
  cardiovascular: { label: "Cardiovascular", icon: Heart, color: "text-red-500" },
  respiratorio: { label: "Respiratório", icon: Activity, color: "text-cyan-500" },
  muscular_hipertrofia: { label: "Muscular / Hipertrofia", icon: Dumbbell, color: "text-orange-500" },
  emagrecimento: { label: "Emagrecimento / Sobrepeso", icon: TrendingUp, color: "text-lime-600" },
  neurocognicao: { label: "Neurocognição", icon: Brain, color: "text-purple-500" },
  metabolismo_tireoide: { label: "Metabolismo / Tireoide", icon: Activity, color: "text-amber-500" },
  libido_sexual: { label: "Libido / Sexual", icon: Heart, color: "text-pink-500" },
  performance_fisica: { label: "Performance Física", icon: Zap, color: "text-teal-500" },
  imunologico: { label: "Imunológico", icon: Shield, color: "text-blue-500" },
  dermatologico: { label: "Pele / Cabelo / Unhas", icon: Sparkles, color: "text-pink-400" },
  hepatico: { label: "Hepático / Detox", icon: Shield, color: "text-green-600" },
  longevidade: { label: "Longevidade", icon: Leaf, color: "text-emerald-500" },
  neurologico: { label: "Neurológico", icon: Brain, color: "text-purple-500" },
  metabolismo: { label: "Metabolismo", icon: Activity, color: "text-orange-500" },
  muscular: { label: "Muscular", icon: Dumbbell, color: "text-amber-600" },
  endocrino: { label: "Endócrino", icon: Zap, color: "text-violet-500" },
  osteoarticular: { label: "Osteoarticular", icon: Dumbbell, color: "text-sky-600" },
  articular: { label: "Articular", icon: Dumbbell, color: "text-teal-500" },
  hematologico: { label: "Hematológico", icon: Heart, color: "text-rose-600" },
  reprodutivo: { label: "Reprodutivo", icon: Heart, color: "text-pink-600" },
};

export const BAR_COLORS = [
  "bg-red-200",
  "bg-orange-300",
  "bg-yellow-400",
  "bg-lime-400",
  "bg-emerald-500",
];

export function barColorForScore(score: number): string {
  return BAR_COLORS[Math.min(Math.max(score - 1, 0), 4)];
}

export function BodySystemBar({ system, score }: { system: string; score: number }) {
  const info = BODY_SYSTEM_LABELS[system] || { label: system, icon: Activity, color: "text-muted-foreground" };
  const Icon = info.icon;
  const pct = (score / 5) * 100;
  const barColor = barColorForScore(score);

  return (
    <div className="flex items-center gap-2">
      <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${info.color}`} />
      <span className="text-xs w-24 truncate font-medium">{info.label}</span>
      <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-bold w-4 text-right">{score}</span>
    </div>
  );
}

export interface BlendComponent {
  name: string;
  dose: string;
}

const DOSE_REGEX = /(\d[\d.,]*\s*(?:mg|mcg|ug|µg|g|ml|ui|kui|amp|%|comp|cps|cap)\b.*)$/i;

export function parseComposicao(composicao: string | null | undefined): BlendComponent[] {
  if (!composicao) return [];
  return composicao
    .split(/[,;]/)
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(DOSE_REGEX);
      if (m && m.index !== undefined && m.index > 0) {
        return { name: part.slice(0, m.index).trim().replace(/[-–]\s*$/, "").trim(), dose: m[1].trim() };
      }
      return { name: part, dose: "" };
    });
}

export function BlendComposition({ composicao }: { composicao: string | null | undefined }) {
  const components = parseComposicao(composicao);
  if (components.length === 0) return null;

  return (
    <div className="rounded-xl border-2 border-teal-200 dark:border-teal-800 bg-teal-50/40 dark:bg-teal-950/20 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Droplet className="h-4 w-4 text-teal-600" />
        <span className="text-sm font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
          Composição do Blend
        </span>
        <span className="text-xs text-muted-foreground">({components.length} ativos)</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {components.map((c, i) => (
          <div
            key={`${c.name}-${i}`}
            className="flex items-center justify-between gap-2 rounded-lg border border-teal-200 dark:border-teal-800 bg-card px-3 py-2"
          >
            <span className="text-sm font-semibold truncate">{c.name}</span>
            {c.dose && (
              <span className="text-xs font-bold text-teal-700 dark:text-teal-400 whitespace-nowrap">
                {c.dose}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
