import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Plus, Pencil, X, Save, Trash2, Clock, Users } from "lucide-react";
import { Field, Metric, type Alimento, type Protocolo, type Receita, parseApiError } from "./shared";

// -------------------------------------------------------------------------------
// ABA "RECEITAS" (Task 234) — combinacoes prontas de alimentos do catalogo (ex.:
// "Omelete de claras com espinafre") que servem a 1+ tipos de dieta. Ingrediente
// e SEMPRE amarrado ao catalogo (sem texto livre) para a lista de compras
// conseguir somar por preco/unidade — ver dieta_receita_ingredientes.
// -------------------------------------------------------------------------------

interface IngredienteForm {
  uid: string;
  alimentoId: number | null;
  quantidadeG: string;
}
interface FormState {
  nome: string;
  modoPreparo: string;
  porcoes: string;
  tempoPreparoMin: string;
  observacao: string;
  ingredientes: IngredienteForm[];
  protocoloIds: number[];
}

function blankForm(): FormState {
  return {
    nome: "",
    modoPreparo: "",
    porcoes: "1",
    tempoPreparoMin: "",
    observacao: "",
    ingredientes: [{ uid: crypto.randomUUID(), alimentoId: null, quantidadeG: "" }],
    protocoloIds: [],
  };
}
function toForm(r: Receita): FormState {
  return {
    nome: r.nome,
    modoPreparo: r.modoPreparo ?? "",
    porcoes: String(r.porcoes ?? 1),
    tempoPreparoMin: r.tempoPreparoMin != null ? String(r.tempoPreparoMin) : "",
    observacao: r.observacao ?? "",
    ingredientes: r.ingredientes.map((i) => ({ uid: crypto.randomUUID(), alimentoId: i.alimentoId, quantidadeG: String(i.quantidadeG) })),
    protocoloIds: r.tipos.map((t) => t.protocoloId),
  };
}

export default function Receitas() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [filtroProtocoloId, setFiltroProtocoloId] = useState<string>("todos");
  const [editingId, setEditingId] = useState<number | "new" | null>(null);

  const { data: protocolos } = useQuery<Protocolo[]>({
    queryKey: ["dieta", "protocolos"],
    queryFn: async () => {
      const r = await fetch("/api/dieta/protocolos");
      if (!r.ok) throw new Error("Falha ao carregar tipos de dieta");
      return r.json();
    },
  });

  const { data: alimentos } = useQuery<Alimento[]>({
    queryKey: ["dieta", "alimentos"],
    queryFn: async () => {
      const r = await fetch("/api/dieta/catalogo/alimentos");
      if (!r.ok) throw new Error("Falha ao carregar alimentos");
      return r.json();
    },
  });

  const { data: receitas, isLoading } = useQuery<Receita[]>({
    queryKey: ["dieta", "receitas", filtroProtocoloId],
    queryFn: async () => {
      const qs = filtroProtocoloId !== "todos" ? `?protocoloId=${filtroProtocoloId}` : "";
      const r = await fetch(`/api/dieta/receitas${qs}`);
      if (!r.ok) throw new Error("Falha ao carregar receitas");
      return r.json();
    },
  });

  const alimentosPorGrupo = useMemo(() => {
    const grupos = new Map<string, Alimento[]>();
    for (const a of alimentos ?? []) {
      const g = a.grupo ?? "Outros";
      if (!grupos.has(g)) grupos.set(g, []);
      grupos.get(g)!.push(a);
    }
    return [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  }, [alimentos]);

  const salvar = useMutation({
    mutationFn: async ({ id, form }: { id: number | "new"; form: FormState }) => {
      const ingredientesValidos = form.ingredientes.filter((i) => i.alimentoId && i.quantidadeG);
      const body = {
        nome: form.nome.trim(),
        modoPreparo: form.modoPreparo.trim() || null,
        porcoes: form.porcoes ? parseInt(form.porcoes, 10) : 1,
        tempoPreparoMin: form.tempoPreparoMin ? parseInt(form.tempoPreparoMin, 10) : null,
        observacao: form.observacao.trim() || null,
        ingredientes: ingredientesValidos.map((i, idx) => ({
          alimentoId: i.alimentoId,
          quantidadeG: parseFloat(i.quantidadeG.replace(",", ".")),
          ordem: idx + 1,
        })),
        protocoloIds: form.protocoloIds,
      };
      const r = await fetch(id === "new" ? "/api/dieta/receitas" : `/api/dieta/receitas/${id}`, {
        method: id === "new" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await parseApiError(r, "Falha ao salvar receita"));
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Receita salva" });
      qc.invalidateQueries({ queryKey: ["dieta", "receitas"] });
      setEditingId(null);
    },
    onError: (e: Error) => {
      toast({ title: "Não foi possível salvar", description: e.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="concave-3d px-3 py-1.5 flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <span className="text-[10px] font-black uppercase tracking-widest text-primary">
              {receitas?.length ?? 0} receitas
            </span>
          </div>
          <Select value={filtroProtocoloId} onValueChange={setFiltroProtocoloId}>
            <SelectTrigger className="field-engraved w-[220px]">
              <SelectValue placeholder="Filtrar por tipo de dieta" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos de dieta</SelectItem>
              {(protocolos ?? []).map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {editingId === null && (
          <Button className="btn-3d-soft gap-1.5" size="sm" onClick={() => setEditingId("new")}>
            <Plus className="h-3.5 w-3.5" /> Nova receita
          </Button>
        )}
      </div>

      {editingId === "new" && (
        <ReceitaForm
          initial={blankForm()}
          protocolos={protocolos ?? []}
          alimentosPorGrupo={alimentosPorGrupo}
          saving={salvar.isPending}
          onCancel={() => setEditingId(null)}
          onSave={(form) => salvar.mutate({ id: "new", form })}
        />
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-52 panel-3d-sub" />
          ))}
        </div>
      ) : (receitas ?? []).length === 0 ? (
        <div className="panel-3d flex flex-col items-center justify-center gap-2 p-12 text-center">
          <BookOpen className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Nenhuma receita cadastrada para este filtro.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(receitas ?? []).map((r) =>
            editingId === r.id ? (
              <ReceitaForm
                key={r.id}
                initial={toForm(r)}
                protocolos={protocolos ?? []}
                alimentosPorGrupo={alimentosPorGrupo}
                saving={salvar.isPending}
                onCancel={() => setEditingId(null)}
                onSave={(form) => salvar.mutate({ id: r.id, form })}
              />
            ) : (
              <div key={r.id} className="panel-3d p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-black uppercase tracking-tight text-foreground">{r.nome}</h3>
                  <Button variant="outline" size="sm" className="bevel-3d shrink-0 gap-1.5" onClick={() => setEditingId(r.id)}>
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </Button>
                </div>

                <div className="flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {r.porcoes} porção(ões)</span>
                  {r.tempoPreparoMin != null && (
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {r.tempoPreparoMin} min</span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {r.tipos.map((t) => (
                    <span key={t.protocoloId} className="concave-3d px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-primary">
                      {t.nome}
                    </span>
                  ))}
                </div>

                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Ingredientes</p>
                  <ul className="text-sm text-muted-foreground space-y-0.5">
                    {r.ingredientes.map((i) => (
                      <li key={i.id}>
                        {i.alimentoNome ?? `Alimento #${i.alimentoId}`} — {i.quantidadeG} g
                      </li>
                    ))}
                  </ul>
                </div>

                {r.modoPreparo && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Modo de preparo</p>
                    <p className="text-sm leading-relaxed">{r.modoPreparo}</p>
                  </div>
                )}

                <div className="grid grid-cols-4 gap-2">
                  <Metric label="Kcal" value={String(r.totais.kcal)} unit="total" gold />
                  <Metric label="Prot" value={String(r.totais.proteinaG)} unit="g" />
                  <Metric label="Carb" value={String(r.totais.carboidratoG)} unit="g" />
                  <Metric label="Gord" value={String(r.totais.gorduraG)} unit="g" />
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function ReceitaForm({
  initial,
  protocolos,
  alimentosPorGrupo,
  saving,
  onCancel,
  onSave,
}: {
  initial: FormState;
  protocolos: Protocolo[];
  alimentosPorGrupo: Array<[string, Alimento[]]>;
  saving: boolean;
  onCancel: () => void;
  onSave: (form: FormState) => void;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const patch = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }));

  function addIngrediente() {
    patch({ ingredientes: [...form.ingredientes, { uid: crypto.randomUUID(), alimentoId: null, quantidadeG: "" }] });
  }
  function updIngrediente(uid: string, p: Partial<IngredienteForm>) {
    patch({ ingredientes: form.ingredientes.map((i) => (i.uid === uid ? { ...i, ...p } : i)) });
  }
  function delIngrediente(uid: string) {
    patch({ ingredientes: form.ingredientes.filter((i) => i.uid !== uid) });
  }
  function toggleProtocolo(id: number) {
    patch({
      protocoloIds: form.protocoloIds.includes(id)
        ? form.protocoloIds.filter((p) => p !== id)
        : [...form.protocoloIds, id],
    });
  }

  const ingredientesValidos = form.ingredientes.filter((i) => i.alimentoId && i.quantidadeG);
  const podeSalvar = form.nome.trim().length > 0 && ingredientesValidos.length > 0 && form.protocoloIds.length > 0;

  return (
    <div className="panel-3d p-4 space-y-4 border-l-4 border-primary/50">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <Field label="Nome da receita">
            <Input value={form.nome} onChange={(e) => patch({ nome: e.target.value })} placeholder="Ex.: Omelete de claras com espinafre" className="field-engraved" />
          </Field>
        </div>
        <Field label="Porções">
          <Input type="number" min={1} value={form.porcoes} onChange={(e) => patch({ porcoes: e.target.value })} className="field-engraved" />
        </Field>
        <Field label="Tempo de preparo (min)">
          <Input type="number" min={1} value={form.tempoPreparoMin} onChange={(e) => patch({ tempoPreparoMin: e.target.value })} className="field-engraved" />
        </Field>
      </div>

      <Field label="Modo de preparo">
        <Textarea value={form.modoPreparo} onChange={(e) => patch({ modoPreparo: e.target.value })} placeholder="Passo a passo…" className="field-engraved min-h-[80px]" />
      </Field>

      <div className="concave-3d p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Ingredientes (do catálogo)</span>
          <Button type="button" size="sm" variant="outline" className="bevel-3d gap-1.5" onClick={addIngrediente}>
            <Plus className="h-3 w-3" /> Adicionar
          </Button>
        </div>
        <div className="space-y-2">
          {form.ingredientes.map((ing) => (
            <div key={ing.uid} className="flex items-center gap-2">
              <Select value={ing.alimentoId ? String(ing.alimentoId) : ""} onValueChange={(v) => updIngrediente(ing.uid, { alimentoId: Number(v) })}>
                <SelectTrigger className="field-engraved flex-1">
                  <SelectValue placeholder="Selecionar alimento…" />
                </SelectTrigger>
                <SelectContent>
                  {alimentosPorGrupo.map(([grupo, itens]) => (
                    <SelectGroup key={grupo}>
                      <SelectLabel>{grupo}</SelectLabel>
                      {itens.map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {a.nome}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                min={0}
                value={ing.quantidadeG}
                onChange={(e) => updIngrediente(ing.uid, { quantidadeG: e.target.value })}
                placeholder="Qtd (g)"
                className="field-engraved w-28 shrink-0"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 h-8 w-8 text-destructive"
                onClick={() => delIngrediente(ing.uid)}
                disabled={form.ingredientes.length <= 1}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="concave-3d p-3 space-y-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Serve os tipos de dieta</span>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {protocolos.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={form.protocoloIds.includes(p.id)} onCheckedChange={() => toggleProtocolo(p.id)} />
              {p.nome}
            </label>
          ))}
        </div>
      </div>

      <Field label="Observação (opcional)">
        <Input value={form.observacao} onChange={(e) => patch({ observacao: e.target.value })} className="field-engraved" />
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
