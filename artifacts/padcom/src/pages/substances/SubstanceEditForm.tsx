import { useEffect, useState } from "react";
import { useUpdateSubstance, getListSubstancesQueryKey, useListCatalogOptions } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Star, X, Plus, Activity, Gem, Beaker, Syringe, Droplet, Info, Sparkles, ShieldAlert,
} from "lucide-react";
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

// Dropdown que puxa as opcoes gerenciaveis do Cadastros (catalog-options) por
// "kind". Mantem o valor atual da substancia mesmo que ainda nao esteja
// cadastrado, para nao perder dado legado.
function CatalogSelect({
  kind,
  value,
  onChange,
  placeholder,
}: {
  kind: string;
  value: string | null | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const { data } = useListCatalogOptions({ kind });
  const labels = (data ?? []).map((o) => o.label);
  const current = (value ?? "").trim();
  const merged = current && !labels.includes(current) ? [current, ...labels] : labels;
  return (
    <Select value={current || undefined} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder={placeholder ?? "Selecione..."} /></SelectTrigger>
      <SelectContent>
        {merged.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            Nenhuma opção. Cadastre em Cadastros &gt; Listas.
          </div>
        ) : (
          merged.map((l) => (
            <SelectItem key={l} value={l}>{l}</SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}

// ============================================================================
// Faixa premium: bloco com cabecalho (titulo + subtitulo explicativo) que fica
// DESTACADO quando esta selecionado/focado. Reaproveitado por todas as secoes.
// ============================================================================
function SectionCard({
  icon: Icon,
  title,
  subtitle,
  active,
  onActivate,
  accent,
  children,
}: {
  icon: typeof Star;
  title: string;
  subtitle: string;
  active: boolean;
  onActivate: () => void;
  accent?: { bg: string; text: string; band: string; ring: string };
  children: React.ReactNode;
}) {
  const a = accent ?? {
    bg: "bg-primary/10",
    text: "text-primary",
    band: "bg-primary/5",
    ring: "ring-primary/60 border-primary/40 shadow-primary/10",
  };
  return (
    <section
      onMouseDown={onActivate}
      onFocusCapture={onActivate}
      className={`rounded-xl border bg-card overflow-hidden transition-all duration-300 ${
        active
          ? `ring-2 ${a.ring} shadow-lg scale-[1.005]`
          : "border-border hover:border-primary/20 hover:shadow-sm"
      }`}
    >
      <header className={`flex items-start gap-3 px-4 py-3 border-b ${active ? a.band : "bg-muted/40"}`}>
        <div className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${a.bg}`}>
          <Icon className={`h-5 w-5 ${a.text}`} />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-bold uppercase tracking-wider leading-tight">{title}</h3>
          <p className="text-xs text-muted-foreground leading-snug mt-0.5">{subtitle}</p>
        </div>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
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

const TEXTAREAS_DESC: { key: string; label: string }[] = [
  { key: "description", label: "O que é (descrição)" },
  { key: "mainFunction", label: "Função principal" },
  { key: "perceivedEffects", label: "Efeitos percebidos pelo cliente" },
];

const TEXTAREAS_BENEFIT: { key: string; label: string }[] = [
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
];

const TEXTAREAS_SAFETY: { key: string; label: string }[] = [
  { key: "contraindications", label: "Contraindicações" },
  { key: "scientificEvidence", label: "Evidência científica" },
];

const ALL_TEXTAREAS = [...TEXTAREAS_DESC, ...TEXTAREAS_BENEFIT, ...TEXTAREAS_SAFETY];

export function SubstanceEditForm({
  substance,
  onClose,
}: {
  substance: any;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const update = useUpdateSubstance();
  const [form, setForm] = useState<Record<string, any>>({});
  const [activeSection, setActiveSection] = useState<string>("ident");

  useEffect(() => {
    if (substance) {
      const bse = substance.bodySystemEffects && typeof substance.bodySystemEffects === "object"
        ? (substance.bodySystemEffects as Record<string, number>)
        : {};
      const cm = substance.categoryMeters && typeof substance.categoryMeters === "object"
        ? (substance.categoryMeters as Record<string, number>)
        : {};
      setForm({ ...substance, bodySystemEffects: { ...bse }, categoryMeters: { ...cm } });
      setActiveSection("ident");
    }
  }, [substance]);

  const setField = (key: string, value: any) => setForm((f) => ({ ...f, [key]: value }));

  if (!substance) return null;

  const onSave = () => {
    const payload: Record<string, any> = {
      name: emptyToNull(form.name) ?? substance.name,
      category: emptyToNull(form.category) ?? substance.category,
      color: emptyToNull(form.color) ?? substance.color ?? "#16284a",
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
      concentrationMg: emptyToNull(form.concentrationMg),
      volumeAmpola: emptyToNull(form.volumeAmpola),
    };
    for (const { key } of ALL_TEXTAREAS) payload[key] = emptyToNull(form[key]);

    update.mutate(
      { id: substance.id, data: payload as any },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSubstancesQueryKey() });
          toast.success("Substância atualizada");
          onClose();
        },
        onError: (e: any) => toast.error("Erro ao salvar", { description: String(e?.message ?? e) }),
      },
    );
  };

  const is = (id: string) => activeSection === id;
  const go = (id: string) => () => setActiveSection(id);

  return (
    <div className="border-t pt-5 px-6 pb-6 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex items-center gap-3 mb-4">
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
          style={{ backgroundColor: form.color ?? substance.color ?? "#16284a" }}
        >
          <Beaker className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-bold leading-tight truncate">
            {form.name || substance.name || "Editar substância"}
          </h3>
          <p className="text-xs text-muted-foreground leading-snug">
            Tudo que você ajustar aqui entra no informativo do cliente e no RAS.
          </p>
        </div>
      </div>

      <div className="space-y-4">
            {/* 1 — IDENTIFICACAO */}
            <SectionCard
              icon={Beaker}
              title="Identificação"
              subtitle="Nome, cor, categoria e como a substância é aplicada."
              active={is("ident")}
              onActivate={go("ident")}
            >
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nome">
                  <Input value={form.name ?? ""} onChange={(e) => setField("name", e.target.value)} />
                </Field>
                <Field label="Cor">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.color ?? "#16284a"}
                      onChange={(e) => setField("color", e.target.value)}
                      className="h-9 w-12 rounded border cursor-pointer"
                    />
                    <Input value={form.color ?? ""} onChange={(e) => setField("color", e.target.value)} />
                  </div>
                </Field>
                <Field label="Categoria">
                  <CatalogSelect
                    kind="substance_category"
                    value={form.category}
                    onChange={(v) => setField("category", v)}
                  />
                </Field>
                <Field label="Tipo / Categoria (exibição)">
                  <CatalogSelect
                    kind="substance_type"
                    value={form.categoryType}
                    onChange={(v) => setField("categoryType", v)}
                  />
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
            </SectionCard>

            {/* 2 — POSOLOGIA & LOGISTICA */}
            <SectionCard
              icon={Syringe}
              title="Posologia & Logística"
              subtitle="Dose, intervalo entre sessões, duração e tempo até o resultado."
              active={is("posologia")}
              onActivate={go("posologia")}
              accent={{ bg: "bg-sky-500/10", text: "text-sky-600", band: "bg-sky-500/5", ring: "ring-sky-400/60 border-sky-300/50 shadow-sky-500/10" }}
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Field label="Concentração (mg)">
                  <Input
                    placeholder="ex.: 500mg"
                    value={form.concentrationMg ?? ""}
                    onChange={(e) => setField("concentrationMg", e.target.value)}
                  />
                </Field>
                <Field label="Volume da Ampola (mL)">
                  <Input
                    placeholder="ex.: 10mL"
                    value={form.volumeAmpola ?? ""}
                    onChange={(e) => setField("volumeAmpola", e.target.value)}
                  />
                </Field>
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
                <div className="col-span-2 sm:col-span-3">
                  <Field label="Posologia (como usar — sai na Carta de Tratamento)">
                    <Textarea
                      placeholder="ex.: Aplicar 1 ampola IM, 1x por semana, por 8 semanas."
                      value={form.posologia ?? ""}
                      onChange={(e) => setField("posologia", e.target.value)}
                      rows={2}
                    />
                  </Field>
                </div>
              </div>
            </SectionCard>

            {/* 3 — COMPOSICAO */}
            <SectionCard
              icon={Droplet}
              title="Composição do Blend"
              subtitle="Separe os ativos por vírgula. Ex.: L-CARNITINA 1 G, INOSITOL 500 MG."
              active={is("composicao")}
              onActivate={go("composicao")}
              accent={{ bg: "bg-amber-500/10", text: "text-amber-600", band: "bg-amber-500/5", ring: "ring-amber-400/60 border-amber-300/50 shadow-amber-500/10" }}
            >
              <Textarea
                value={form.composicao ?? ""}
                onChange={(e) => setField("composicao", e.target.value)}
                rows={2}
              />
            </SectionCard>

            {/* 4 — IMPACTO NOS SISTEMAS */}
            <SectionCard
              icon={Activity}
              title="Impacto nos Sistemas Corporais"
              subtitle="Clique nas barras (grau 0 a 5) para definir o quanto a substância age em cada sistema."
              active={is("sistemas")}
              onActivate={go("sistemas")}
            >
              <SystemEditor
                effects={(form.bodySystemEffects as Record<string, number>) ?? {}}
                setEffects={(next) => setField("bodySystemEffects", next)}
              />
            </SectionCard>

            {/* 5 — MEDIDORES DE RESULTADO (ouro e diamante) */}
            <SectionCard
              icon={Gem}
              title="Medidores de Resultado"
              subtitle="Aparecem em destaque ouro e diamante na apresentação ao cliente. Clique nas barras (0 a 5)."
              active={is("medidores")}
              onActivate={go("medidores")}
              accent={{ bg: "bg-amber-400/15", text: "text-amber-500", band: "bg-amber-400/10", ring: "ring-amber-400/70 border-amber-300/60 shadow-amber-500/15" }}
            >
              <CategoryMeterEditor
                meters={(form.categoryMeters as Record<string, number>) ?? {}}
                setMeters={(next) => setField("categoryMeters", next)}
              />
            </SectionCard>

            {/* 6 — DESCRICAO CLINICA */}
            <SectionCard
              icon={Info}
              title="Descrição Clínica"
              subtitle="O que é, função principal e os efeitos que o cliente percebe."
              active={is("descricao")}
              onActivate={go("descricao")}
            >
              <div className="space-y-4">
                {TEXTAREAS_DESC.map(({ key, label }) => (
                  <Field key={key} label={label}>
                    <Textarea
                      value={form[key] ?? NULLABLE_TEXT}
                      onChange={(e) => setField(key, e.target.value)}
                      rows={key === "description" || key === "mainFunction" ? 3 : 2}
                    />
                  </Field>
                ))}
              </div>
            </SectionCard>

            {/* 7 — BENEFICIOS POR AREA */}
            <SectionCard
              icon={Sparkles}
              title="Benefícios por Área"
              subtitle="Longevidade, energia, sono, libido, performance e demais ganhos percebidos."
              active={is("beneficios")}
              onActivate={go("beneficios")}
              accent={{ bg: "bg-violet-500/10", text: "text-violet-600", band: "bg-violet-500/5", ring: "ring-violet-400/60 border-violet-300/50 shadow-violet-500/10" }}
            >
              <div className="space-y-4">
                {TEXTAREAS_BENEFIT.map(({ key, label }) => (
                  <Field key={key} label={label}>
                    <Textarea
                      value={form[key] ?? NULLABLE_TEXT}
                      onChange={(e) => setField(key, e.target.value)}
                      rows={2}
                    />
                  </Field>
                ))}
              </div>
            </SectionCard>

            {/* 8 — SEGURANCA & EVIDENCIA */}
            <SectionCard
              icon={ShieldAlert}
              title="Segurança & Evidência"
              subtitle="Contraindicações e base científica que sustenta a indicação."
              active={is("seguranca")}
              onActivate={go("seguranca")}
              accent={{ bg: "bg-rose-500/10", text: "text-rose-600", band: "bg-rose-500/5", ring: "ring-rose-400/60 border-rose-300/50 shadow-rose-500/10" }}
            >
              <div className="space-y-4">
                {TEXTAREAS_SAFETY.map(({ key, label }) => (
                  <Field key={key} label={label}>
                    <Textarea
                      value={form[key] ?? NULLABLE_TEXT}
                      onChange={(e) => setField(key, e.target.value)}
                      rows={2}
                    />
                  </Field>
                ))}
              </div>
            </SectionCard>
          </div>

      <div className="mt-5 flex flex-row justify-end gap-2 border-t pt-4">
        <Button variant="outline" onClick={onClose} disabled={update.isPending}>
          Cancelar
        </Button>
        <Button onClick={onSave} disabled={update.isPending}>
          {update.isPending ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>
    </div>
  );
}
