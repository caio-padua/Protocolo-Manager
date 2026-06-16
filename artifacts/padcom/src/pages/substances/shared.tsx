import {
  Heart, Brain, Zap, Moon, Dumbbell, Shield, Sparkles, Leaf, Activity,
  TrendingUp, FlaskRound, Beaker, Droplet, Flame, HeartPulse, Gem,
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

// ============================================================================
// Categorias-medidor tematicas (Nº2): graus 0-5 por objetivo + legenda.
// "Ouro e diamante" para impressionar o cliente na apresentacao.
// ============================================================================

export interface CategoryMeterDef {
  label: string;
  icon: typeof Heart;
  from: string;
  to: string;
  text: string;
  legend: string;
}

export const CATEGORY_METER_ORDER = [
  "emagrecimento",
  "hipertrofia",
  "recuperacao_muscular",
  "neurocognicao",
] as const;

export const CATEGORY_METERS: Record<string, CategoryMeterDef> = {
  emagrecimento: {
    label: "Emagrecimento",
    icon: Flame,
    from: "from-rose-500",
    to: "to-orange-400",
    text: "text-rose-600",
    legend:
      "O quanto este ativo auxilia na queima de gordura, no controle do apetite e na aceleração do metabolismo.",
  },
  hipertrofia: {
    label: "Hipertrofia",
    icon: Dumbbell,
    from: "from-amber-500",
    to: "to-yellow-400",
    text: "text-amber-600",
    legend:
      "O quanto contribui para o ganho e a construção de massa muscular.",
  },
  recuperacao_muscular: {
    label: "Recuperação Muscular",
    icon: HeartPulse,
    from: "from-teal-500",
    to: "to-emerald-400",
    text: "text-teal-600",
    legend:
      "O quanto acelera a recuperação e reduz a dor muscular após o treino.",
  },
  neurocognicao: {
    label: "Neurocognição",
    icon: Brain,
    from: "from-violet-500",
    to: "to-fuchsia-400",
    text: "text-violet-600",
    legend:
      "Aprimoramento cognitivo: Foco e Atenção, Memória e Aprendizado, Saúde Cerebral e Agilidade Mental.",
  },
};

export function CategoryMetersShowcase({
  meters,
}: {
  meters: Record<string, number> | null | undefined;
}) {
  const m = meters && typeof meters === "object" ? meters : {};
  const items = CATEGORY_METER_ORDER.map((k) => ({
    key: k,
    def: CATEGORY_METERS[k],
    score: Number(m[k]) || 0,
  })).filter((i) => i.def && i.score > 0);

  if (items.length === 0) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-300/70 dark:border-amber-500/30 bg-gradient-to-br from-amber-50 via-white to-amber-50/40 dark:from-amber-950/20 dark:via-background dark:to-amber-950/10 p-5 shadow-[0_2px_24px_-6px_rgba(212,175,55,0.45)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(212,175,55,0.14),transparent_60%)]" />
      <div className="relative">
        <div className="flex items-center gap-2 mb-4">
          <Gem className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-bold uppercase tracking-[0.18em] bg-gradient-to-r from-amber-600 to-yellow-500 bg-clip-text text-transparent">
            Resultados que você vai sentir
          </span>
        </div>

        {/* Barrinhas proximas umas das outras */}
        <div className="space-y-2.5">
          {items.map(({ key, def, score }) => {
            const Icon = def.icon;
            const pct = (score / 5) * 100;
            return (
              <div key={key} className="flex items-center gap-3">
                <Icon className={`h-4 w-4 flex-shrink-0 ${def.text}`} />
                <span className="text-xs font-semibold w-36 truncate">{def.label}</span>
                <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden ring-1 ring-black/5">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${def.from} ${def.to} transition-all duration-700`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs font-bold w-9 text-right tabular-nums">{score}/5</span>
              </div>
            );
          })}
        </div>

        {/* Legendas na parte de baixo */}
        <div className="mt-4 pt-3 border-t border-amber-200/60 dark:border-amber-500/20 space-y-1.5">
          {items.map(({ key, def }) => (
            <p key={key} className="text-[11px] leading-snug text-muted-foreground">
              <span className={`font-bold ${def.text}`}>{def.label}:</span> {def.legend}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
