import { useState } from "react";
import { useListSubstances } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Beaker, AlertTriangle, Clock, Syringe, Star, ChevronDown, ChevronUp,
  Heart, Brain, Zap, Moon, Dumbbell, Shield, Sparkles, Leaf, Activity,
  TrendingUp, Eye, FlaskRound, Info,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";

function getProcedureLabel(type: string | null): string {
  if (type === "im") return "Intramuscular";
  if (type === "implant") return "Implante";
  return "Endovenoso";
}

function getProcedureColor(type: string | null): string {
  if (type === "im") return "bg-blue-100 text-blue-700 border-blue-200";
  if (type === "implant") return "bg-purple-100 text-purple-700 border-purple-200";
  return "bg-amber-100 text-amber-700 border-amber-200";
}

function getCategoryStyle(cat: string | null): { bg: string; text: string; icon: typeof Heart } {
  const c = (cat || "").toLowerCase();
  if (c.includes("antioxidante")) return { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-400", icon: Shield };
  if (c.includes("vitamina")) return { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400", icon: Sparkles };
  if (c.includes("mineral")) return { bg: "bg-sky-100 dark:bg-sky-900/30", text: "text-sky-700 dark:text-sky-400", icon: FlaskRound };
  if (c.includes("metabol") || c.includes("metab")) return { bg: "bg-violet-100 dark:bg-violet-900/30", text: "text-violet-700 dark:text-violet-400", icon: Activity };
  if (c.includes("lipol")) return { bg: "bg-rose-100 dark:bg-rose-900/30", text: "text-rose-700 dark:text-rose-400", icon: TrendingUp };
  if (c.includes("oxid")) return { bg: "bg-cyan-100 dark:bg-cyan-900/30", text: "text-cyan-700 dark:text-cyan-400", icon: Zap };
  return { bg: "bg-slate-100 dark:bg-slate-900/30", text: "text-slate-700 dark:text-slate-400", icon: Beaker };
}

const BODY_SYSTEM_LABELS: Record<string, { label: string; icon: typeof Heart; color: string }> = {
  cardiovascular: { label: "Cardiovascular", icon: Heart, color: "text-red-500" },
  neurologico: { label: "Neurológico", icon: Brain, color: "text-purple-500" },
  metabolismo: { label: "Metabolismo", icon: Activity, color: "text-orange-500" },
  hepatico: { label: "Hepático", icon: Shield, color: "text-green-600" },
  imunologico: { label: "Imunológico", icon: Shield, color: "text-blue-500" },
  dermatologico: { label: "Dermatológico", icon: Sparkles, color: "text-pink-500" },
  muscular: { label: "Muscular", icon: Dumbbell, color: "text-amber-600" },
  endocrino: { label: "Endócrino", icon: Zap, color: "text-violet-500" },
  longevidade: { label: "Longevidade", icon: Leaf, color: "text-emerald-500" },
  osteoarticular: { label: "Osteoarticular", icon: Dumbbell, color: "text-sky-600" },
  articular: { label: "Articular", icon: Dumbbell, color: "text-teal-500" },
  hematologico: { label: "Hematológico", icon: Heart, color: "text-rose-600" },
  emagrecimento: { label: "Emagrecimento", icon: TrendingUp, color: "text-lime-600" },
  reprodutivo: { label: "Reprodutivo", icon: Heart, color: "text-fuchsia-500" },
};

function BodySystemBar({ system, score }: { system: string; score: number }) {
  const info = BODY_SYSTEM_LABELS[system] || { label: system, icon: Activity, color: "text-muted-foreground" };
  const Icon = info.icon;
  const pct = (score / 5) * 100;
  const barColors = [
    "bg-red-200",
    "bg-orange-300",
    "bg-yellow-400",
    "bg-lime-400",
    "bg-emerald-500",
  ];
  const barColor = barColors[Math.min(score - 1, 4)];

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

function BenefitItem({ icon: Icon, label, value, color }: {
  icon: typeof Heart;
  label: string;
  value: string | null | undefined;
  color: string;
}) {
  if (!value) return null;
  return (
    <div className={`p-3 rounded-xl border-2 ${color} transition-all hover:scale-[1.01]`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-xs leading-relaxed opacity-90">{value}</p>
    </div>
  );
}

export default function Substances() {
  const { data: substances, isLoading } = useListSubstances();
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Catálogo de Substâncias</h1>
          <p className="text-muted-foreground">Informações completas sobre cada substância, seus benefícios e sistemas corporais impactados.</p>
        </div>
        <Badge variant="outline" className="text-sm px-3 py-1.5 self-start">
          <Beaker className="h-4 w-4 mr-1.5" />
          {substances?.length || 0} substâncias
        </Badge>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : substances?.length === 0 ? (
        <div className="text-center py-20 border border-dashed rounded-lg bg-card">
          <Beaker className="mx-auto h-12 w-12 text-muted-foreground opacity-20 mb-4" />
          <h3 className="text-lg font-medium">Nenhuma substância cadastrada</h3>
          <p className="text-sm text-muted-foreground">O sistema precisa ser populado com substâncias.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {substances?.map((substance: any) => {
            const isOpen = expanded === substance.id;
            const catStyle = getCategoryStyle(substance.categoryType || substance.category);
            const CatIcon = catStyle.icon;
            const bodyEffects = substance.bodySystemEffects && typeof substance.bodySystemEffects === "object"
              ? Object.entries(substance.bodySystemEffects as Record<string, number>).sort((a, b) => b[1] - a[1])
              : [];

            return (
              <Card
                key={substance.id}
                className={`overflow-hidden transition-all duration-300 ${
                  isOpen ? "shadow-lg ring-2" : "hover:shadow-md"
                }`}
                style={{
                  borderLeftWidth: "5px",
                  borderLeftColor: substance.color,
                  ...(isOpen ? { ringColor: substance.color + "40" } : {}),
                }}
              >
                <div
                  className="cursor-pointer"
                  onClick={() => setExpanded(isOpen ? null : substance.id)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm flex-shrink-0"
                            style={{ backgroundColor: substance.color }}
                          >
                            <CatIcon className="h-5 w-5" />
                          </div>
                          <div>
                            <CardTitle className="text-xl">{substance.name}</CardTitle>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge className={`${catStyle.bg} ${catStyle.text} border-0 text-xs`}>
                                {substance.categoryType || substance.category}
                              </Badge>
                              <Badge variant="outline" className={`text-xs ${getProcedureColor(substance.procedureType)}`}>
                                <Syringe className="h-3 w-3 mr-1" />
                                {getProcedureLabel(substance.procedureType)}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {substance.starRating != null && (
                          <div className="flex items-center gap-0.5">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                className={`h-4 w-4 ${
                                  i < substance.starRating
                                    ? "fill-amber-400 text-amber-400"
                                    : "text-muted-foreground/20"
                                }`}
                              />
                            ))}
                          </div>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="pt-0 pb-3">
                    {substance.description && (
                      <p className={`text-sm text-muted-foreground ${isOpen ? "" : "line-clamp-2"}`}>
                        {substance.description}
                      </p>
                    )}

                    <div className="grid grid-cols-4 gap-3 mt-3 text-sm bg-muted/30 p-3 rounded-xl">
                      <div>
                        <span className="text-xs text-muted-foreground block">Dose Padrão</span>
                        <span className="font-semibold text-sm">{substance.defaultDose || "-"}</span>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground block">Intervalo</span>
                        <span className="font-semibold text-sm">{substance.intervalDays ? `${substance.intervalDays} dias` : "-"}</span>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground block flex items-center gap-0.5"><Clock className="h-3 w-3" />Duração</span>
                        <span className="font-semibold text-sm">{substance.durationMinutes ?? 30} min</span>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground block">Estoque</span>
                        <div className="flex items-center gap-1 font-semibold text-sm">
                          {substance.stockQuantity <= 10 && (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                          )}
                          <span className={substance.stockQuantity <= 10 ? "text-amber-600" : ""}>
                            {substance.stockQuantity} {substance.stockUnit || "un."}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </div>

                {isOpen && (
                  <div className="px-6 pb-6 space-y-5 animate-in fade-in slide-in-from-top-2 duration-300 border-t pt-5">
                    {substance.mainFunction && (
                      <div className="bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <Info className="h-4 w-4 text-primary" />
                          <span className="text-sm font-bold text-primary">Função Principal</span>
                        </div>
                        <p className="text-sm">{substance.mainFunction}</p>
                      </div>
                    )}

                    {bodyEffects.length > 0 && (
                      <div>
                        <h4 className="text-sm font-bold mb-3 flex items-center gap-2">
                          <Activity className="h-4 w-4 text-primary" />
                          Impacto nos Sistemas Corporais
                        </h4>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {bodyEffects.map(([system, score]) => (
                            <BodySystemBar key={system} system={system} score={score as number} />
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid gap-3 sm:grid-cols-2">
                      <BenefitItem
                        icon={Leaf}
                        label="Longevidade"
                        value={substance.longevityBenefit}
                        color="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-800"
                      />
                      <BenefitItem
                        icon={Sparkles}
                        label="Qualidade de Vida"
                        value={substance.qualityOfLifeImpact}
                        color="border-violet-200 bg-violet-50/50 dark:bg-violet-950/20 dark:border-violet-800"
                      />
                      <BenefitItem
                        icon={Moon}
                        label="Sono"
                        value={substance.sleepBenefit}
                        color="border-indigo-200 bg-indigo-50/50 dark:bg-indigo-950/20 dark:border-indigo-800"
                      />
                      <BenefitItem
                        icon={Zap}
                        label="Energia"
                        value={substance.energyBenefit}
                        color="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800"
                      />
                      <BenefitItem
                        icon={Heart}
                        label="Libido"
                        value={substance.libidoBenefit}
                        color="border-rose-200 bg-rose-50/50 dark:bg-rose-950/20 dark:border-rose-800"
                      />
                      <BenefitItem
                        icon={Dumbbell}
                        label="Performance Física"
                        value={substance.physicalPerformance}
                        color="border-orange-200 bg-orange-50/50 dark:bg-orange-950/20 dark:border-orange-800"
                      />
                      <BenefitItem
                        icon={Dumbbell}
                        label="Força Muscular"
                        value={substance.muscleStrength}
                        color="border-red-200 bg-red-50/50 dark:bg-red-950/20 dark:border-red-800"
                      />
                      <BenefitItem
                        icon={Brain}
                        label="Clareza Mental"
                        value={substance.mentalClarity}
                        color="border-purple-200 bg-purple-50/50 dark:bg-purple-950/20 dark:border-purple-800"
                      />
                      <BenefitItem
                        icon={Sparkles}
                        label="Pele, Cabelo e Unhas"
                        value={substance.skinHairNails}
                        color="border-pink-200 bg-pink-50/50 dark:bg-pink-950/20 dark:border-pink-800"
                      />
                      <BenefitItem
                        icon={Shield}
                        label="Imunidade"
                        value={substance.immuneSupport}
                        color="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800"
                      />
                    </div>

                    {substance.perceivedEffects && (
                      <div className="bg-gradient-to-r from-sky-50 to-cyan-50 dark:from-sky-950/20 dark:to-cyan-950/20 border border-sky-200 dark:border-sky-800 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <Eye className="h-4 w-4 text-sky-600" />
                          <span className="text-sm font-bold text-sky-700 dark:text-sky-400">Efeitos Percebidos pelo Cliente</span>
                        </div>
                        <p className="text-sm">{substance.perceivedEffects}</p>
                      </div>
                    )}

                    {substance.timeToEffect && (
                      <div className="bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <Clock className="h-4 w-4 text-amber-600" />
                          <span className="text-sm font-bold text-amber-700 dark:text-amber-400">Tempo Médio para Resultado</span>
                        </div>
                        <p className="text-sm">{substance.timeToEffect}</p>
                      </div>
                    )}

                    <div className="flex gap-3">
                      {substance.contraindications && (
                        <div className="flex-1 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-1">
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                            <span className="text-sm font-bold text-red-600 dark:text-red-400">Contraindicações</span>
                          </div>
                          <p className="text-xs">{substance.contraindications}</p>
                        </div>
                      )}
                      {substance.scientificEvidence && (
                        <div className="flex-1 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-1">
                            <FlaskRound className="h-4 w-4 text-slate-500" />
                            <span className="text-sm font-bold text-slate-600 dark:text-slate-400">Evidência Científica</span>
                          </div>
                          <p className="text-xs">{substance.scientificEvidence}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
