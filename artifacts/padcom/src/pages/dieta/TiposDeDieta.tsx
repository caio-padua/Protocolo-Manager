import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Utensils, Plus, Pencil, X, Save, Target, Moon } from "lucide-react";
import { Field, ToggleSwitch, type Protocolo, parseApiError } from "./shared";

// -------------------------------------------------------------------------------
// ABA "TIPOS DE DIETA" (Task 234) — CRUD sobre dieta_protocolos, os "modelos
// reutilizaveis de dieta" que ja existiam no motor (usados por MontarCardapio).
// Populado no boot com Low Carb / Cetogenica / Mediterranea / Carnivora /
// Hiperproteica; esta tela permite editar e cadastrar novos tipos.
// -------------------------------------------------------------------------------

interface FormState {
  nome: string;
  objetivo: string;
  estiloAlimentar: string;
  descricao: string;
  jejumIntermitente: boolean;
  jejumJanelaInicio: string;
  jejumJanelaFim: string;
  fatorAjusteObjetivo: string;
}

const BLANK: FormState = {
  nome: "",
  objetivo: "",
  estiloAlimentar: "",
  descricao: "",
  jejumIntermitente: false,
  jejumJanelaInicio: "12:00",
  jejumJanelaFim: "20:00",
  fatorAjusteObjetivo: "",
};

function toForm(p: Protocolo): FormState {
  return {
    nome: p.nome,
    objetivo: p.objetivo ?? "",
    estiloAlimentar: p.estiloAlimentar ?? "",
    descricao: p.descricao ?? "",
    jejumIntermitente: p.jejumIntermitente,
    jejumJanelaInicio: p.jejumJanelaInicio ?? "12:00",
    jejumJanelaFim: p.jejumJanelaFim ?? "20:00",
    fatorAjusteObjetivo: p.fatorAjusteObjetivo != null ? String(p.fatorAjusteObjetivo) : "",
  };
}

export default function TiposDeDieta() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<number | "new" | null>(null);

  const { data: protocolos, isLoading } = useQuery<Protocolo[]>({
    queryKey: ["dieta", "protocolos"],
    queryFn: async () => {
      const r = await fetch("/api/dieta/protocolos");
      if (!r.ok) throw new Error("Falha ao carregar tipos de dieta");
      return r.json();
    },
  });

  const salvar = useMutation({
    mutationFn: async ({ id, form }: { id: number | "new"; form: FormState }) => {
      const body = {
        nome: form.nome.trim(),
        objetivo: form.objetivo.trim() || null,
        estiloAlimentar: form.estiloAlimentar.trim() || null,
        descricao: form.descricao.trim() || null,
        jejumIntermitente: form.jejumIntermitente,
        jejumJanelaInicio: form.jejumIntermitente ? form.jejumJanelaInicio : null,
        jejumJanelaFim: form.jejumIntermitente ? form.jejumJanelaFim : null,
        fatorAjusteObjetivo: form.fatorAjusteObjetivo ? parseFloat(form.fatorAjusteObjetivo.replace(",", ".")) : null,
      };
      const r = await fetch(id === "new" ? "/api/dieta/protocolos" : `/api/dieta/protocolos/${id}`, {
        method: id === "new" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await parseApiError(r, "Falha ao salvar tipo de dieta"));
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Tipo de dieta salvo" });
      qc.invalidateQueries({ queryKey: ["dieta", "protocolos"] });
      setEditingId(null);
    },
    onError: (e: Error) => {
      toast({ title: "Não foi possível salvar", description: e.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="concave-3d px-3 py-1.5 flex items-center gap-2">
          <Utensils className="h-4 w-4 text-primary" />
          <span className="text-[10px] font-black uppercase tracking-widest text-primary">
            {protocolos?.length ?? 0} tipos de dieta
          </span>
        </div>
        {editingId === null && (
          <Button className="btn-3d-soft gap-1.5" size="sm" onClick={() => setEditingId("new")}>
            <Plus className="h-3.5 w-3.5" /> Novo tipo de dieta
          </Button>
        )}
      </div>

      {editingId === "new" && (
        <ProtocoloForm
          initial={BLANK}
          saving={salvar.isPending}
          onCancel={() => setEditingId(null)}
          onSave={(form) => salvar.mutate({ id: "new", form })}
        />
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-40 panel-3d-sub" />
          ))}
        </div>
      ) : (protocolos ?? []).length === 0 ? (
        <div className="panel-3d flex flex-col items-center justify-center gap-2 p-12 text-center">
          <Utensils className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Nenhum tipo de dieta cadastrado ainda.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(protocolos ?? []).map((p) =>
            editingId === p.id ? (
              <ProtocoloForm
                key={p.id}
                initial={toForm(p)}
                saving={salvar.isPending}
                onCancel={() => setEditingId(null)}
                onSave={(form) => salvar.mutate({ id: p.id, form })}
              />
            ) : (
              <div key={p.id} className="panel-3d p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-black uppercase tracking-tight text-foreground">{p.nome}</h3>
                    {p.objetivo && (
                      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                        <Target className="h-3 w-3 shrink-0" /> {p.objetivo}
                      </p>
                    )}
                  </div>
                  <Button variant="outline" size="sm" className="bevel-3d shrink-0 gap-1.5" onClick={() => setEditingId(p.id)}>
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </Button>
                </div>
                {p.descricao && <p className="text-sm text-muted-foreground leading-relaxed">{p.descricao}</p>}
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <span className="concave-3d px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-primary">
                    {p.codigo}
                  </span>
                  {p.jejumIntermitente && (
                    <span className="concave-3d px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide flex items-center gap-1">
                      <Moon className="h-3 w-3" /> Jejum {p.jejumJanelaInicio}–{p.jejumJanelaFim}
                    </span>
                  )}
                  {p.fatorAjusteObjetivo != null && (
                    <span className="concave-3d px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide">
                      Fator {p.fatorAjusteObjetivo}
                    </span>
                  )}
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function ProtocoloForm({
  initial,
  saving,
  onCancel,
  onSave,
}: {
  initial: FormState;
  saving: boolean;
  onCancel: () => void;
  onSave: (form: FormState) => void;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const patch = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }));
  const podeSalvar = form.nome.trim().length > 0;

  return (
    <div className="panel-3d p-4 space-y-3 border-l-4 border-primary/50">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome do tipo de dieta">
          <Input
            value={form.nome}
            onChange={(e) => patch({ nome: e.target.value })}
            placeholder="Ex.: Low Carb"
            className="field-engraved"
          />
        </Field>
        <Field label="Estilo alimentar (interno)">
          <Input
            value={form.estiloAlimentar}
            onChange={(e) => patch({ estiloAlimentar: e.target.value })}
            placeholder="Ex.: low_carb"
            className="field-engraved"
          />
        </Field>
      </div>
      <Field label="Objetivo">
        <Input
          value={form.objetivo}
          onChange={(e) => patch({ objetivo: e.target.value })}
          placeholder="Ex.: Emagrecimento e controle glicêmico"
          className="field-engraved"
        />
      </Field>
      <Field label="Descrição">
        <Textarea
          value={form.descricao}
          onChange={(e) => patch({ descricao: e.target.value })}
          placeholder="Explique a lógica da dieta e quando indicá-la…"
          className="field-engraved min-h-[80px]"
        />
      </Field>

      <div className="concave-3d p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Jejum intermitente
          </span>
          <ToggleSwitch checked={form.jejumIntermitente} onChange={(v) => patch({ jejumIntermitente: v })} />
        </div>
        {form.jejumIntermitente && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Janela início">
              <Input type="time" value={form.jejumJanelaInicio} onChange={(e) => patch({ jejumJanelaInicio: e.target.value })} className="field-engraved" />
            </Field>
            <Field label="Janela fim">
              <Input type="time" value={form.jejumJanelaFim} onChange={(e) => patch({ jejumJanelaFim: e.target.value })} className="field-engraved" />
            </Field>
          </div>
        )}
      </div>

      <Field label="Fator de ajuste do objetivo (opcional — ex.: 0.8 déficit, 1.15 superávit)">
        <Input
          value={form.fatorAjusteObjetivo}
          onChange={(e) => patch({ fatorAjusteObjetivo: e.target.value })}
          placeholder="Ex.: 0.85"
          className="field-engraved max-w-[160px]"
        />
      </Field>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" className="bevel-3d gap-1.5" onClick={onCancel} disabled={saving}>
          <X className="h-3.5 w-3.5" /> Cancelar
        </Button>
        <Button size="sm" className="btn-3d gap-1.5" disabled={!podeSalvar || saving} onClick={() => onSave(form)}>
          <Save className="h-3.5 w-3.5" /> {saving ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </div>
  );
}
