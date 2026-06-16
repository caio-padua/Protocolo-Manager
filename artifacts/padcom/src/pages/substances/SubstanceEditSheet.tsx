import { useEffect, useState } from "react";
import { useUpdateSubstance, getListSubstancesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Star, X, Plus, Activity, Gem } from "lucide-react";
import { BODY_SYSTEM_LABELS, barColorForScore, CATEGORY_METERS, CATEGORY_METER_ORDER } from "./shared";

const NULLABLE_TEXT = "";

function emptyToNull(v: any): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function numOrNull(v: any): number | null {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function EditableStars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n === value ? n - 1 : n)}
          className="transition-transform hover:scale-110"
          aria-label={`${n} estrelas`}
        >
          <Star className={`h-6 w-6 ${n <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
        </button>
      ))}
      <span className="ml-2 text-sm font-bold text-muted-foreground">{value}/5</span>
    </div>
  );
}

function SystemEditor({
  effects,
  setEffects,
}: {
  effects: Record<string, number>;
  setEffects: (next: Record<string, number>) => void;
}) {
  const [toAdd, setToAdd] = useState<string>("");
  const entries = Object.entries(effects).sort((a, b) => b[1] - a[1]);
  const available = Object.keys(BODY_SYSTEM_LABELS).filter((k) => !(k in effects));

  const setScore = (sys: string, score: number) => setEffects({ ...effects, [sys]: score });
  const remove = (sys: string) => {
    const next = { ...effects };
    delete next[sys];
    setEffects(next);
  };

  return (
    <div className="space-y-3">
      {entries.length === 0 && (
        <p className="text-xs text-muted-foreground italic">Nenhum sistema corporal definido. Adicione abaixo.</p>
      )}
      {entries.map(([sys, score]) => {
        const info = BODY_SYSTEM_LABELS[sys] || { label: sys, icon: Activity, color: "text-muted-foreground" };
        const Icon = info.icon;
        return (
          <div key={sys} className="flex items-center gap-2">
            <Icon className={`h-4 w-4 flex-shrink-0 ${info.color}`} />
            <span className="text-xs font-medium w-28 truncate">{info.label}</span>
            <div className="flex gap-1 flex-1">
              {[1, 2, 3, 4, 5].map((seg) => (
                <button
                  key={seg}
                  type="button"
                  onClick={() => setScore(sys, seg === score ? seg - 1 : seg)}
                  className={`h-5 flex-1 rounded transition-colors ${seg <= score ? barColorForScore(score) : "bg-muted hover:bg-muted-foreground/20"}`}
                  aria-label={`${info.label} grau ${seg}`}
                />
              ))}
            </div>
            <span className="text-xs font-bold w-4 text-right">{score}</span>
            <button
              type="button"
              onClick={() => remove(sys)}
              className="text-muted-foreground hover:text-destructive transition-colors"
              aria-label={`Remover ${info.label}`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}

      {available.length > 0 && (
        <div className="flex items-center gap-2 pt-1">
          <Select value={toAdd} onValueChange={setToAdd}>
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue placeholder="Adicionar sistema corporal..." />
            </SelectTrigger>
            <SelectContent>
              {available.map((k) => (
                <SelectItem key={k} value={k}>{BODY_SYSTEM_LABELS[k].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!toAdd}
            onClick={() => {
              if (toAdd) {
                setEffects({ ...effects, [toAdd]: 3 });
                setToAdd("");
              }
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> Adicionar
          </Button>
        </div>
      )}
    </div>
  );
}

function CategoryMeterEditor({
  meters,
  setMeters,
}: {
  meters: Record<string, number>;
  setMeters: (next: Record<string, number>) => void;
}) {
  const set = (k: string, v: number) => setMeters({ ...meters, [k]: v });
  return (
    <div className="space-y-3">
      {CATEGORY_METER_ORDER.map((k) => {
        const def = CATEGORY_METERS[k];
        const Icon = def.icon;
        const score = Number(meters[k]) || 0;
        return (
          <div key={k} className="flex items-center gap-2">
            <Icon className={`h-4 w-4 flex-shrink-0 ${def.text}`} />
            <span className="text-xs font-medium w-32 truncate">{def.label}</span>
            <div className="flex gap-1 flex-1">
              {[1, 2, 3, 4, 5].map((seg) => (
                <button
                  key={seg}
                  type="button"
                  onClick={() => set(k, seg === score ? seg - 1 : seg)}
                  className={`h-5 flex-1 rounded transition-colors ${seg <= score ? `bg-gradient-to-r ${def.from} ${def.to}` : "bg-muted hover:bg-muted-foreground/20"}`}
                  aria-label={`${def.label} grau ${seg}`}
                />
              ))}
            </div>
            <span className="text-xs font-bold w-4 text-right">{score}</span>
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

const TEXTAREAS: { key: string; label: string }[] = [
  { key: "description", label: "O que é (descrição)" },
  { key: "mainFunction", label: "Função principal" },
  { key: "perceivedEffects", label: "Efeitos percebidos pelo cliente" },
  { key: "longevityBenefit", label: "Longevidade" },
  { key: "qualityOfLifeImpact", label: "Qualidade de vida" },
  { key: "sleepBenefit", label: "Sono" },
  { key: "energyBenefit", label: "Energia" },
  { key: "libidoBenefit", label: "Libido" },
  { key: "physicalPerformance", label: "Performance física" },
  { key: "muscleStrength", label: "Força muscular" },
  { key: "mentalClarity", label: "Clareza mental" },
  { key: "skinHairNails", label: "Pele, cabelo e unhas" },
  { key: "immuneSupport", label: "Imunidade" },
  { key: "contraindications", label: "Contraindicações" },
  { key: "scientificEvidence", label: "Evidência científica" },
];

export function SubstanceEditSheet({
  substance,
  open,
  onOpenChange,
}: {
  substance: any | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const update = useUpdateSubstance();
  const [form, setForm] = useState<Record<string, any>>({});

  useEffect(() => {
    if (substance) {
      const bse = substance.bodySystemEffects && typeof substance.bodySystemEffects === "object"
        ? (substance.bodySystemEffects as Record<string, number>)
        : {};
      const cm = substance.categoryMeters && typeof substance.categoryMeters === "object"
        ? (substance.categoryMeters as Record<string, number>)
        : {};
      setForm({ ...substance, bodySystemEffects: { ...bse }, categoryMeters: { ...cm } });
    }
  }, [substance]);

  const setField = (key: string, value: any) => setForm((f) => ({ ...f, [key]: value }));

  if (!substance) return null;

  const onSave = () => {
    const payload: Record<string, any> = {
      name: emptyToNull(form.name) ?? substance.name,
      category: emptyToNull(form.category) ?? substance.category,
      color: emptyToNull(form.color) ?? substance.color ?? "#3D7A7A",
      categoryType: emptyToNull(form.categoryType),
      procedureType: form.procedureType || "iv",
      starRating: Number(form.starRating) || 0,
      defaultDose: emptyToNull(form.defaultDose),
      unit: emptyToNull(form.unit),
      intervalDays: numOrNull(form.intervalDays),
      durationMinutes: Number(form.durationMinutes) || 30,
      pricePerUnit: Number(form.pricePerUnit) || 0,
      stockQuantity: Number(form.stockQuantity) || 0,
      stockUnit: emptyToNull(form.stockUnit),
      timeToEffect: emptyToNull(form.timeToEffect),
      bodySystemEffects: form.bodySystemEffects ?? {},
      categoryMeters: form.categoryMeters ?? {},
      composicao: emptyToNull(form.composicao),
      posologia: emptyToNull(form.posologia),
    };
    for (const { key } of TEXTAREAS) payload[key] = emptyToNull(form[key]);

    update.mutate(
      { id: substance.id, data: payload as any },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSubstancesQueryKey() });
          toast.success("Substância atualizada");
          onOpenChange(false);
        },
        onError: (e: any) => toast.error("Erro ao salvar", { description: String(e?.message ?? e) }),
      },
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-2">
          <SheetTitle>Editar substância</SheetTitle>
          <SheetDescription>
            Ajuste as informações, as estrelas e as barras dos sistemas corporais. As alterações entram no informativo e no RAS.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 px-6">
          <div className="space-y-5 py-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nome">
                <Input value={form.name ?? ""} onChange={(e) => setField("name", e.target.value)} />
              </Field>
              <Field label="Cor">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.color ?? "#3D7A7A"}
                    onChange={(e) => setField("color", e.target.value)}
                    className="h-9 w-12 rounded border cursor-pointer"
                  />
                  <Input value={form.color ?? ""} onChange={(e) => setField("color", e.target.value)} />
                </div>
              </Field>
              <Field label="Categoria">
                <Input value={form.category ?? ""} onChange={(e) => setField("category", e.target.value)} />
              </Field>
              <Field label="Tipo / Categoria (exibição)">
                <Input value={form.categoryType ?? ""} onChange={(e) => setField("categoryType", e.target.value)} />
              </Field>
              <Field label="Procedimento">
                <Select value={form.procedureType ?? "iv"} onValueChange={(v) => setField("procedureType", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="iv">Endovenoso (IV) — 30 min</SelectItem>
                    <SelectItem value="im">Intramuscular (IM) — 15 min</SelectItem>
                    <SelectItem value="implant">Implante — 60 min</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Avaliação (estrelas)">
                <EditableStars value={Number(form.starRating) || 0} onChange={(n) => setField("starRating", n)} />
              </Field>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="Dose padrão">
                <Input value={form.defaultDose ?? ""} onChange={(e) => setField("defaultDose", e.target.value)} />
              </Field>
              <Field label="Intervalo (dias)">
                <Input type="number" value={form.intervalDays ?? ""} onChange={(e) => setField("intervalDays", e.target.value)} />
              </Field>
              <Field label="Duração (min)">
                <Input type="number" value={form.durationMinutes ?? 30} onChange={(e) => setField("durationMinutes", e.target.value)} />
              </Field>
              <Field label="Tempo p/ resultado">
                <Input value={form.timeToEffect ?? ""} onChange={(e) => setField("timeToEffect", e.target.value)} />
              </Field>
            </div>

            <Field label="Composição do blend (separe por vírgula; ex.: L-CARNITINA 1 G, INOSITOL 500 MG)">
              <Textarea
                value={form.composicao ?? ""}
                onChange={(e) => setField("composicao", e.target.value)}
                rows={2}
              />
            </Field>

            <div className="rounded-xl border bg-muted/30 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="h-4 w-4 text-primary" />
                <span className="text-sm font-bold">Impacto nos Sistemas Corporais (clique nas barras)</span>
              </div>
              <SystemEditor
                effects={(form.bodySystemEffects as Record<string, number>) ?? {}}
                setEffects={(next) => setField("bodySystemEffects", next)}
              />
            </div>

            <div className="rounded-xl border-2 border-amber-300/70 dark:border-amber-500/30 bg-amber-50/40 dark:bg-amber-950/20 p-4">
              <div className="flex items-center gap-2 mb-1">
                <Gem className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-bold">Medidores de Resultado (clique nas barras)</span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Estes medidores aparecem em destaque "ouro e diamante" na apresentação ao cliente.
              </p>
              <CategoryMeterEditor
                meters={(form.categoryMeters as Record<string, number>) ?? {}}
                setMeters={(next) => setField("categoryMeters", next)}
              />
            </div>

            <div className="space-y-4">
              {TEXTAREAS.map(({ key, label }) => (
                <Field key={key} label={label}>
                  <Textarea
                    value={form[key] ?? NULLABLE_TEXT}
                    onChange={(e) => setField(key, e.target.value)}
                    rows={key === "description" || key === "mainFunction" ? 3 : 2}
                  />
                </Field>
              ))}
            </div>
          </div>
        </ScrollArea>

        <SheetFooter className="px-6 py-4 border-t flex-row justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={update.isPending}>
            Cancelar
          </Button>
          <Button onClick={onSave} disabled={update.isPending}>
            {update.isPending ? "Salvando..." : "Salvar alterações"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
