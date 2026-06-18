import { useEffect, useState } from "react";
import {
  useGetBudgetSettings,
  useUpdateBudgetSettings,
  useListBudgetCatalog,
  useCreateBudgetCatalogItem,
  useUpdateBudgetCatalogItem,
  useDeleteBudgetCatalogItem,
  useSeedBudgetCatalog,
  type BudgetCatalogItem,
  type CardFee,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Save, Trash2, Plus, Sparkles, SlidersHorizontal, CreditCard, Tag } from "lucide-react";
import { centsToReais, reaisToCents } from "./money";

type SettingsDraft = {
  cashDiscountPct: number;
  down50DiscountPct: number;
  down30DiscountPct: number;
  maxNoInterestInstallments: number;
  planMonths: number;
  planWeeks: number;
  planDays: number;
  recommendedScenario: string;
  passCardFeeDefault: boolean;
  cardFees: CardFee[];
};

export default function Parametrizacao() {
  const { toast } = useToast();
  const { data: settings, isLoading: loadingSettings, refetch: refetchSettings } = useGetBudgetSettings();
  const { data: catalog, isLoading: loadingCatalog, refetch: refetchCatalog } = useListBudgetCatalog();

  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [items, setItems] = useState<BudgetCatalogItem[]>([]);
  const [newItem, setNewItem] = useState({ name: "", kind: "substance", priceReais: "", sessions: "12" });

  useEffect(() => {
    if (settings) {
      setDraft({
        cashDiscountPct: settings.cashDiscountPct,
        down50DiscountPct: settings.down50DiscountPct,
        down30DiscountPct: settings.down30DiscountPct,
        maxNoInterestInstallments: settings.maxNoInterestInstallments,
        planMonths: settings.planMonths,
        planWeeks: settings.planWeeks,
        planDays: settings.planDays,
        recommendedScenario: settings.recommendedScenario,
        passCardFeeDefault: settings.passCardFeeDefault,
        cardFees: settings.cardFees ?? [],
      });
    }
  }, [settings]);

  useEffect(() => {
    if (catalog) setItems(catalog);
  }, [catalog]);

  const updateSettings = useUpdateBudgetSettings({
    mutation: {
      onSuccess: () => { toast({ title: "Parametros salvos" }); refetchSettings(); },
      onError: () => toast({ title: "Erro ao salvar parametros", variant: "destructive" }),
    },
  });
  const createItem = useCreateBudgetCatalogItem({
    mutation: {
      onSuccess: () => { toast({ title: "Item adicionado" }); setNewItem({ name: "", kind: "substance", priceReais: "", sessions: "12" }); refetchCatalog(); },
      onError: () => toast({ title: "Erro ao adicionar item", variant: "destructive" }),
    },
  });
  const updateItem = useUpdateBudgetCatalogItem({
    mutation: {
      onSuccess: () => { toast({ title: "Item salvo" }); refetchCatalog(); },
      onError: () => toast({ title: "Erro ao salvar item", variant: "destructive" }),
    },
  });
  const deleteItem = useDeleteBudgetCatalogItem({
    mutation: {
      onSuccess: () => { toast({ title: "Item removido" }); refetchCatalog(); },
      onError: () => toast({ title: "Erro ao remover item", variant: "destructive" }),
    },
  });
  const seed = useSeedBudgetCatalog({
    mutation: {
      onSuccess: (r) => { toast({ title: `Catalogo populado (${r.catalogInserted} novos)` }); refetchCatalog(); refetchSettings(); },
      onError: () => toast({ title: "Erro ao popular catalogo", variant: "destructive" }),
    },
  });

  function setDraftField<K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  function setLocalItem(id: number, patch: Partial<BudgetCatalogItem>) {
    setItems((arr) => arr.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function saveSettings() {
    if (!draft) return;
    updateSettings.mutate({ data: draft });
  }

  function saveItem(it: BudgetCatalogItem) {
    updateItem.mutate({
      id: it.id,
      data: {
        name: it.name,
        kind: it.kind,
        unitPriceCents: it.unitPriceCents,
        defaultSessions: it.defaultSessions,
        frequencyDays: it.frequencyDays ?? undefined,
        active: it.active,
      },
    });
  }

  function addItem() {
    if (!newItem.name.trim()) { toast({ title: "Informe o nome do item", variant: "destructive" }); return; }
    createItem.mutate({
      data: {
        name: newItem.name.trim(),
        kind: newItem.kind,
        unitPriceCents: reaisToCents(newItem.priceReais || "0"),
        defaultSessions: parseInt(newItem.sessions || "1") || 1,
      },
    });
  }

  const KIND_LABELS: Record<string, string> = {
    substance: "Substancia", service: "Servico", formula: "Formula", consultation: "Consulta", diet: "Dieta",
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Parametrizacao do Orcamento</h1>
          <p className="text-muted-foreground">Descontos, taxas de cartao, duracao do plano e precos do catalogo. Editavel somente aqui.</p>
        </div>
        <Button variant="outline" onClick={() => seed.mutate()} disabled={seed.isPending}>
          <Sparkles className="h-4 w-4 mr-2" /> Popular catalogo inicial
        </Button>
      </div>

      {/* DESCONTOS E PLANO */}
      <Card className="border-l-4 border-l-primary">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base uppercase tracking-wide">
            <SlidersHorizontal className="h-4 w-4" /> Descontos e Plano
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingSettings || !draft ? (
            <Skeleton className="h-40 rounded" />
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="Desconto a vista (%)">
                  <Input type="number" step="0.01" value={draft.cashDiscountPct}
                    onChange={(e) => setDraftField("cashDiscountPct", parseFloat(e.target.value) || 0)} />
                </Field>
                <Field label="Desconto entrada 50% (%)">
                  <Input type="number" step="0.01" value={draft.down50DiscountPct}
                    onChange={(e) => setDraftField("down50DiscountPct", parseFloat(e.target.value) || 0)} />
                </Field>
                <Field label="Desconto entrada 30% (%)">
                  <Input type="number" step="0.01" value={draft.down30DiscountPct}
                    onChange={(e) => setDraftField("down30DiscountPct", parseFloat(e.target.value) || 0)} />
                </Field>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Field label="Parcelas s/ juros (max)">
                  <Input type="number" value={draft.maxNoInterestInstallments}
                    onChange={(e) => setDraftField("maxNoInterestInstallments", parseInt(e.target.value) || 1)} />
                </Field>
                <Field label="Plano (meses)">
                  <Input type="number" value={draft.planMonths}
                    onChange={(e) => setDraftField("planMonths", parseInt(e.target.value) || 1)} />
                </Field>
                <Field label="Plano (semanas)">
                  <Input type="number" value={draft.planWeeks}
                    onChange={(e) => setDraftField("planWeeks", parseInt(e.target.value) || 1)} />
                </Field>
                <Field label="Plano (dias)">
                  <Input type="number" value={draft.planDays}
                    onChange={(e) => setDraftField("planDays", parseInt(e.target.value) || 1)} />
                </Field>
                <Field label="Cenario recomendado">
                  <Select value={draft.recommendedScenario} onValueChange={(v) => setDraftField("recommendedScenario", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A">A — a vista</SelectItem>
                      <SelectItem value="B">B — entrada 50%</SelectItem>
                      <SelectItem value="C">C — entrada 30%</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={draft.passCardFeeDefault} onCheckedChange={(v) => setDraftField("passCardFeeDefault", v)} />
                <Label>Repassar taxa de cartao por padrao (calculadora livre)</Label>
              </div>
              <Button onClick={saveSettings} disabled={updateSettings.isPending}>
                <Save className="h-4 w-4 mr-2" /> Salvar parametros
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* TAXAS DE CARTAO */}
      <Card className="border-l-4 border-l-cyan-500">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base uppercase tracking-wide">
            <CreditCard className="h-4 w-4" /> Taxas de Cartao por Parcela
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!draft ? <Skeleton className="h-24 rounded" /> : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-2">
                {draft.cardFees.map((cf, idx) => (
                  <div key={cf.installments} className="border rounded p-2 text-center">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{cf.installments}x</div>
                    <Input type="number" step="0.01" value={cf.feePct} className="h-8 text-center text-sm"
                      onChange={(e) => {
                        const v = parseFloat(e.target.value) || 0;
                        setDraft((d) => d ? { ...d, cardFees: d.cardFees.map((c, i) => i === idx ? { ...c, feePct: v } : c) } : d);
                      }} />
                  </div>
                ))}
              </div>
              <Button onClick={saveSettings} disabled={updateSettings.isPending} variant="secondary">
                <Save className="h-4 w-4 mr-2" /> Salvar taxas
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* CATALOGO DE PRECOS */}
      <Card className="border-l-4 border-l-emerald-500">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base uppercase tracking-wide">
            <Tag className="h-4 w-4" /> Catalogo de Precos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingCatalog ? (
            <Skeleton className="h-40 rounded" />
          ) : (
            <div className="space-y-3">
              <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_0.8fr_0.8fr_auto] gap-2 px-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                <span>Nome</span><span>Tipo</span><span>Preco (R$)</span><span>Sessoes</span><span>Freq (dias)</span><span>Acoes</span>
              </div>
              {items.map((it) => (
                <div key={it.id} className="grid grid-cols-2 md:grid-cols-[2fr_1fr_1fr_0.8fr_0.8fr_auto] gap-2 items-center border rounded p-2">
                  <Input value={it.name} onChange={(e) => setLocalItem(it.id, { name: e.target.value })} className="h-9" />
                  <Select value={it.kind} onValueChange={(v) => setLocalItem(it.id, { kind: v })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(KIND_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input type="number" step="0.01" value={centsToReais(it.unitPriceCents)}
                    onChange={(e) => setLocalItem(it.id, { unitPriceCents: reaisToCents(e.target.value) })} className="h-9" />
                  <Input type="number" value={it.defaultSessions}
                    onChange={(e) => setLocalItem(it.id, { defaultSessions: parseInt(e.target.value) || 1 })} className="h-9" />
                  <Input type="number" value={it.frequencyDays ?? ""}
                    onChange={(e) => setLocalItem(it.id, { frequencyDays: e.target.value ? parseInt(e.target.value) : null })} className="h-9" />
                  <div className="flex items-center gap-1 justify-end">
                    {it.substanceId ? <Badge variant="outline" className="text-[9px]">vitrine</Badge> : null}
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => saveItem(it)} disabled={updateItem.isPending}>
                      <Save className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={() => deleteItem.mutate({ id: it.id })} disabled={deleteItem.isPending}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}

              {/* NOVO ITEM */}
              <div className="grid grid-cols-2 md:grid-cols-[2fr_1fr_1fr_0.8fr_0.8fr_auto] gap-2 items-center border-2 border-dashed rounded p-2">
                <Input placeholder="Novo item" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} className="h-9" />
                <Select value={newItem.kind} onValueChange={(v) => setNewItem({ ...newItem, kind: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(KIND_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input type="number" step="0.01" placeholder="0,00" value={newItem.priceReais} onChange={(e) => setNewItem({ ...newItem, priceReais: e.target.value })} className="h-9" />
                <Input type="number" value={newItem.sessions} onChange={(e) => setNewItem({ ...newItem, sessions: e.target.value })} className="h-9" />
                <span className="hidden md:block" />
                <div className="flex justify-end">
                  <Button size="icon" className="h-8 w-8" onClick={addItem} disabled={createItem.isPending}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
