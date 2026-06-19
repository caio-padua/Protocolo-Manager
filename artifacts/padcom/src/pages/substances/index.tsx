import { useState } from "react";
import { useListSubstances } from "@workspace/api-client-react";
import { CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Beaker, AlertTriangle, Clock, Syringe, Star, ChevronDown, ChevronUp,
  Heart, Brain, Zap, Moon, Dumbbell, Shield, Sparkles, Leaf, Eye, FlaskRound, Info,
  Pencil, Search, Activity,
} from "lucide-react";
import {
  BODY_SYSTEM_LABELS, getProcedureLabel, getProcedureColor, getCategoryStyle,
  BodySystemBar, BlendComposition, parseComposicao, CategoryMetersShowcase,
} from "./shared";
import { SubstanceEditSheet } from "./SubstanceEditSheet";

function BenefitItem({ icon: Icon, label, value, color }: {
  icon: typeof Heart;
  label: string;
  value: string | null | undefined;
  color: string;
}) {
  if (!value) return null;
  return (
    <div className={`panel-3d-sub p-3 border-l-4 ${color} transition-all hover:scale-[1.01]`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-4 w-4" />
        <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-xs leading-relaxed opacity-90">{value}</p>
    </div>
  );
}

export default function Substances() {
  const { data: substances, isLoading } = useListSubstances();
  const [expanded, setExpanded] = useState<number | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [query, setQuery] = useState("");

  const openEdit = (substance: any) => {
    setEditing(substance);
    setSheetOpen(true);
  };

  const q = query.trim().toLowerCase();
  const filtered = (substances ?? []).filter((s: any) => {
    if (!q) return true;
    return [s.name, s.category, s.categoryType, s.composicao]
      .filter(Boolean)
      .some((v: string) => v.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight uppercase">Substâncias</h1>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">
            Informações completas — benefícios e sistemas corporais impactados.
          </p>
        </div>
        <div className="concave-3d px-3 py-1.5 flex items-center gap-2 self-start">
          <Beaker className="h-4 w-4 text-primary" />
          <span className="text-[10px] font-black uppercase tracking-widest text-primary">
            {substances?.length || 0} substâncias
          </span>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, categoria ou composição..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9 field-engraved"
        />
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-64 panel-3d-sub" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="panel-3d flex flex-col items-center justify-center py-20">
          <div className="concave-3d p-6 mb-4">
            <Beaker className="mx-auto h-10 w-10 text-muted-foreground opacity-20" />
          </div>
          <h3 className="text-base font-black uppercase tracking-tight text-primary">Nenhuma substância encontrada</h3>
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mt-1">Ajuste a busca ou cadastre substâncias.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((substance: any) => {
            const isOpen = expanded === substance.id;
            const catStyle = getCategoryStyle(substance.categoryType || substance.category);
            const CatIcon = catStyle.icon;
            const bodyEffects = substance.bodySystemEffects && typeof substance.bodySystemEffects === "object"
              ? Object.entries(substance.bodySystemEffects as Record<string, number>).sort((a, b) => (b[1] as number) - (a[1] as number))
              : [];
            const hasBlend = parseComposicao(substance.composicao).length > 0;

            return (
              <div
                key={substance.id}
                className={`panel-3d overflow-hidden transition-all duration-300`}
                style={{
                  borderLeftWidth: "5px",
                  borderLeftColor: substance.color,
                }}
              >
                <div className="flex items-start">
                  <div
                    className="cursor-pointer flex-1 min-w-0 neon-hover"
                    onClick={() => setExpanded(isOpen ? null : substance.id)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <div
                              className="bevel-3d w-10 h-10 flex items-center justify-center text-white flex-shrink-0"
                              style={{ backgroundColor: substance.color }}
                            >
                              <CatIcon className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="text-xl font-black uppercase tracking-tight text-foreground">{substance.name}</p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <span className={`concave-3d px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${catStyle.text}`}>
                                  {substance.categoryType || substance.category}
                                </span>
                                <span className={`concave-3d px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide flex items-center gap-1 ${getProcedureColor(substance.procedureType)}`}>
                                  <Syringe className="h-3 w-3" />
                                  {getProcedureLabel(substance.procedureType)}
                                </span>
                                {hasBlend && (
                                  <span className="concave-3d px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-teal-700">
                                    BLEND
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
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

                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-3 concave-3d p-3">
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Valor Ampola</span>
                          <span className="screen-3d px-2 py-0.5 text-sm font-black text-primary tabular-nums">
                            {substance.pricePerUnit > 0
                              ? `R$ ${Number(substance.pricePerUnit).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                              : "—"}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Dose Padrão</span>
                          <span className="font-black text-sm">{substance.defaultDose || "—"}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Intervalo</span>
                          <span className="font-black text-sm">{substance.intervalDays ? `${substance.intervalDays} dias` : "—"}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1 flex items-center gap-0.5"><Clock className="h-3 w-3" />Duração</span>
                          <span className="font-black text-sm">{substance.durationMinutes ?? 30} min</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Estoque</span>
                          <div className="flex items-center gap-1 font-black text-sm">
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

                  <div className="p-3">
                    <Button
                      className="btn-3d-soft"
                      size="sm"
                      onClick={() => openEdit(substance)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar
                    </Button>
                  </div>
                </div>

                {isOpen && (
                  <div className="px-6 pb-6 space-y-5 animate-in fade-in slide-in-from-top-2 duration-300 border-t pt-5">
                    <CategoryMetersShowcase meters={substance.categoryMeters} />
                    {hasBlend && <BlendComposition composicao={substance.composicao} />}

                    {substance.mainFunction && (
                      <div className="panel-3d-sub border-l-4 border-primary/40 p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <Info className="h-4 w-4 text-primary" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-primary">Função Principal</span>
                        </div>
                        <p className="text-sm">{substance.mainFunction}</p>
                      </div>
                    )}

                    {bodyEffects.length > 0 && (
                      <div>
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
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
                      <BenefitItem icon={Leaf} label="Longevidade" value={substance.longevityBenefit} color="border-emerald-400" />
                      <BenefitItem icon={Sparkles} label="Qualidade de Vida" value={substance.qualityOfLifeImpact} color="border-violet-400" />
                      <BenefitItem icon={Moon} label="Sono" value={substance.sleepBenefit} color="border-indigo-400" />
                      <BenefitItem icon={Zap} label="Energia" value={substance.energyBenefit} color="border-amber-400" />
                      <BenefitItem icon={Heart} label="Libido" value={substance.libidoBenefit} color="border-rose-400" />
                      <BenefitItem icon={Dumbbell} label="Performance Física" value={substance.physicalPerformance} color="border-orange-400" />
                      <BenefitItem icon={Dumbbell} label="Força Muscular" value={substance.muscleStrength} color="border-red-400" />
                      <BenefitItem icon={Brain} label="Clareza Mental" value={substance.mentalClarity} color="border-purple-400" />
                      <BenefitItem icon={Sparkles} label="Pele, Cabelo e Unhas" value={substance.skinHairNails} color="border-pink-400" />
                      <BenefitItem icon={Shield} label="Imunidade" value={substance.immuneSupport} color="border-blue-400" />
                    </div>

                    {substance.perceivedEffects && (
                      <div className="panel-3d-sub border-l-4 border-cyan-400 p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <Eye className="h-4 w-4 text-cyan-600" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-cyan-700">Efeitos Percebidos pelo Cliente</span>
                        </div>
                        <p className="text-sm">{substance.perceivedEffects}</p>
                      </div>
                    )}

                    {substance.timeToEffect && (
                      <div className="panel-3d-sub border-l-4 border-amber-400 p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <Clock className="h-4 w-4 text-amber-600" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-amber-700">Tempo Médio para Resultado</span>
                        </div>
                        <p className="text-sm">{substance.timeToEffect}</p>
                      </div>
                    )}

                    <div className="flex gap-3 flex-col sm:flex-row">
                      {substance.contraindications && (
                        <div className="flex-1 panel-3d-sub border-l-4 border-red-500 p-4">
                          <div className="flex items-center gap-2 mb-1">
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-red-600">Contraindicações</span>
                          </div>
                          <p className="text-xs">{substance.contraindications}</p>
                        </div>
                      )}
                      {substance.scientificEvidence && (
                        <div className="flex-1 panel-3d-sub border-l-4 border-slate-400 p-4">
                          <div className="flex items-center gap-2 mb-1">
                            <FlaskRound className="h-4 w-4 text-slate-500" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">Evidência Científica</span>
                          </div>
                          <p className="text-xs">{substance.scientificEvidence}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <SubstanceEditSheet substance={editing} open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}
