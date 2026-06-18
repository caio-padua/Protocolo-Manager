import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  useListBudgetCatalog,
  useGetBudgetSettings,
  useListClients,
  useCalculateBudget,
  useCreateBudget,
  type BudgetCatalogItem,
  type BudgetCalcResult,
  type BudgetItem,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Presentation, Save, Calculator } from "lucide-react";
import { fmt } from "./money";
import { SessionStacker } from "./SessionStacker";
import { FrequencyFader } from "./FrequencyFader";

type Row = {
  catalogId: number;
  kind: string;
  name: string;
  dose: string | null;
  sessions: number;
  frequencyDays: number | null;
  unitPriceCents: number;
  substanceId: number | null;
  include: boolean;
  repeticaoLivre: boolean;
  maxAplicacoesMes: number | null;
  minAplicacoesMes: number | null;
  itemVolumeTiers: { minSessions: number; discountPct: number }[] | null;
};

export default function MontagemOrcamento() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { data: catalog, isLoading: loadingCatalog } = useListBudgetCatalog();
  const { data: settings } = useGetBudgetSettings();
  const { data: clients } = useListClients();

  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState<string>("none");
  const [rows, setRows] = useState<Row[]>([]);
  const [liberarFrequencia, setLiberarFrequencia] = useState(false);
  const [repassarTaxa, setRepassarTaxa] = useState(false);
  const [result, setResult] = useState<BudgetCalcResult | null>(null);

  useEffect(() => {
    if (catalog) {
      setRows(catalog.filter((c) => c.active).map((c: BudgetCatalogItem) => ({
        catalogId: c.id,
        kind: c.kind,
        name: c.name,
        dose: c.defaultDose ?? null,
        sessions: c.defaultSessions,
        frequencyDays: c.frequencyDays ?? null,
        unitPriceCents: c.unitPriceCents,
        substanceId: c.substanceId ?? null,
        include: false,
        repeticaoLivre: c.repeticaoLivre,
        maxAplicacoesMes: c.maxAplicacoesMes ?? null,
        minAplicacoesMes: c.minAplicacoesMes ?? null,
        itemVolumeTiers: c.itemVolumeTiers ?? null,
      })));
    }
  }, [catalog]);

  useEffect(() => {
    if (settings) setRepassarTaxa(settings.passCardFeeDefault);
  }, [settings]);

  const calc = useCalculateBudget();
  const createBudget = useCreateBudget({
    mutation: {
      onError: () => toast({ title: "Erro ao salvar orcamento", variant: "destructive" }),
    },
  });

  const includedRows = useMemo(() => rows.filter((r) => r.include), [rows]);
  const calcRef = useRef(calc.mutateAsync);
  calcRef.current = calc.mutateAsync;

  // Resultado do volume por item: alinhado por INDICE aos itens incluidos.
  const volumeByCatalogId = useMemo(() => {
    const m = new Map<number, BudgetCalcResult["items"][number]>();
    if (result) includedRows.forEach((r, idx) => { const v = result.items[idx]; if (v) m.set(r.catalogId, v); });
    return m;
  }, [result, includedRows]);

  // Teto clinico mensal: aplicacoes/mes estimadas pela frequencia.
  function clinicalAlert(r: Row): { kind: "over" | "under"; msg: string } | null {
    if (r.repeticaoLivre || !r.frequencyDays || r.frequencyDays <= 0) return null;
    const perMonth = 30 / r.frequencyDays;
    if (r.maxAplicacoesMes && perMonth > r.maxAplicacoesMes + 0.001) {
      const minDias = Math.ceil(30 / r.maxAplicacoesMes);
      return { kind: "over", msg: `Excede o teto clinico de ${r.maxAplicacoesMes}/mes (cerca de ${perMonth.toFixed(1)}/mes). Espace para no minimo ${minDias} dias.` };
    }
    if (r.minAplicacoesMes && perMonth < r.minAplicacoesMes - 0.001) {
      const maxDias = Math.floor(30 / r.minAplicacoesMes);
      return { kind: "under", msg: `Abaixo do minimo clinico de ${r.minAplicacoesMes}/mes. Use no maximo ${maxDias} dias entre aplicacoes.` };
    }
    return null;
  }

  // Preview ao vivo (debounce). Motor e a fonte unica de calculo (servidor).
  useEffect(() => {
    if (includedRows.length === 0) { setResult(null); return; }
    const payload = {
      items: includedRows.map((r) => ({ unitPriceCents: r.unitPriceCents, sessions: r.sessions, include: true, volumeTiers: r.itemVolumeTiers ?? undefined })),
    };
    const t = setTimeout(() => {
      calcRef.current({ data: payload })
        .then((res) => setResult(res))
        .catch(() => {});
    }, 350);
    return () => clearTimeout(t);
  }, [includedRows]);

  function setRow(catalogId: number, patch: Partial<Row>) {
    setRows((arr) => arr.map((r) => (r.catalogId === catalogId ? { ...r, ...patch } : r)));
  }

  async function salvar(goPresent: boolean) {
    if (includedRows.length === 0) { toast({ title: "Inclua ao menos um item", variant: "destructive" }); return; }
    const items: BudgetItem[] = includedRows.map((r) => ({
      catalogId: r.catalogId,
      kind: r.kind,
      name: r.name,
      dose: r.dose,
      sessions: r.sessions,
      frequencyDays: r.frequencyDays,
      unitPriceCents: r.unitPriceCents,
      include: true,
      substanceId: r.substanceId,
    }));
    const created = await createBudget.mutateAsync({
      data: {
        title: title.trim() || undefined,
        clientId: clientId !== "none" ? Number(clientId) : undefined,
        status: "draft",
        items,
        settingsSnapshot: settings ? (settings as unknown as Record<string, unknown>) : undefined,
        totalsSnapshot: result ? (result as unknown as Record<string, unknown>) : undefined,
        totalCents: result?.totalCents ?? 0,
        liberarFrequencia,
        repassarTaxa,
      },
    });
    toast({ title: "Orcamento salvo" });
    if (goPresent) navigate(`/orcamentos/${created.id}/apresentacao`);
    else navigate("/orcamentos");
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Montagem do Orcamento</h1>
        <p className="text-muted-foreground">Escolha os itens, sessoes e frequencia. Preview ao vivo. Tela interna.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* COLUNA ITENS */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base uppercase tracking-wide">Dados do Orcamento</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Titulo</Label>
                <Input placeholder="Ex.: Protocolo Longevidade 6 meses" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Cliente (opcional)</Label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger><SelectValue placeholder="Sem cliente" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem cliente</SelectItem>
                    {clients?.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base uppercase tracking-wide">Itens do Catalogo</CardTitle></CardHeader>
            <CardContent>
              {loadingCatalog ? (
                <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 rounded" />)}</div>
              ) : (
                <div className="space-y-2">
                  {rows.map((r) => (
                    <div key={r.catalogId} className={`rounded-lg border p-3 transition-colors ${r.include ? "border-primary/50 bg-primary/5" : ""}`}>
                      <div className="flex items-center gap-3">
                        <Switch checked={r.include} onCheckedChange={(v) => setRow(r.catalogId, { include: v })} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{r.name}</span>
                            {r.substanceId ? <Badge variant="outline" className="text-[9px]">vitrine</Badge> : null}
                          </div>
                          <span className="text-xs text-muted-foreground">{fmt(r.unitPriceCents)} / sessao</span>
                        </div>
                      </div>
                      {r.include && (
                        <div className="flex flex-wrap items-start gap-x-8 gap-y-4 mt-4 pl-12">
                          <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Sessoes</Label>
                            <SessionStacker value={r.sessions} onChange={(n) => setRow(r.catalogId, { sessions: n })} />
                          </div>
                          {liberarFrequencia && (
                            <div className="space-y-1.5">
                              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Frequencia</Label>
                              <FrequencyFader value={r.frequencyDays} onChange={(d) => setRow(r.catalogId, { frequencyDays: d })} />
                            </div>
                          )}
                          <div className="flex flex-col gap-3">
                            <div className="space-y-1">
                              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Dose</Label>
                              <Input value={r.dose ?? ""} className="h-8 w-36"
                                onChange={(e) => setRow(r.catalogId, { dose: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Subtotal</Label>
                              <div className="text-lg font-semibold">{fmt(r.unitPriceCents * r.sessions)}</div>
                            </div>
                          </div>
                        </div>
                      )}
                      {r.include && (() => {
                        const v = volumeByCatalogId.get(r.catalogId);
                        const alert = clinicalAlert(r);
                        return (
                          <div className="mt-2 pl-12 space-y-1.5">
                            {v && v.discountPct > 0 ? (
                              <div className="text-xs flex items-center gap-2">
                                <span className="text-emerald-600 font-medium">-{v.discountPct}% volume</span>
                                <span className="text-muted-foreground line-through">{fmt(r.unitPriceCents)}</span>
                                <span className="font-semibold text-emerald-700">{fmt(v.effectiveUnitCents)} / sessao</span>
                              </div>
                            ) : null}
                            {v && v.nextTierSessions ? (
                              <div className="text-[11px] text-cyan-700 bg-cyan-50 dark:bg-cyan-950/30 rounded px-2 py-1 inline-block">
                                Faltam <strong>{v.nextTierSessions}</strong> sessoes para <strong>-{v.nextTierPct}%</strong> neste item
                              </div>
                            ) : null}
                            {alert ? (
                              <div className={`text-[11px] rounded px-2 py-1 ${alert.kind === "over" ? "bg-red-50 text-red-700 dark:bg-red-950/30" : "bg-amber-50 text-amber-700 dark:bg-amber-950/30"}`}>
                                {alert.msg}
                              </div>
                            ) : null}
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* COLUNA RESUMO */}
        <div className="space-y-4">
          <Card className="border-l-4 border-l-primary lg:sticky lg:top-4">
            <CardHeader>
              <CardTitle className="text-base uppercase tracking-wide flex items-center gap-2">
                <Calculator className="h-4 w-4" /> Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Itens incluidos</span>
                  <span className="font-semibold">{includedRows.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total de sessoes</span>
                  <span className="font-semibold">{result?.totalSessions ?? 0}</span>
                </div>
                <div className="flex items-center justify-between border-t pt-2">
                  <span className="text-sm text-muted-foreground">Total bruto</span>
                  <span className={`font-bold ${result && result.volumeDiscountCents > 0 ? "text-base text-muted-foreground line-through" : "text-xl"}`}>{fmt(result?.totalCents ?? 0)}</span>
                </div>
                {result && result.volumeDiscountCents > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-emerald-700 font-medium">Preco do protocolo (-{result.volumeDiscountPct.toFixed(1)}%)</span>
                    <span className="text-xl font-bold text-emerald-700">{fmt(result.volumeDiscountedCents)}</span>
                  </div>
                )}
              </div>

              {result && (result.itemVolumeDiscountCents > 0 || result.cartBonusCents > 0 || result.cartNextTierSessions) && (
                <div className="space-y-1.5 border-t pt-3 text-xs">
                  {result.itemVolumeDiscountCents > 0 && (
                    <div className="flex items-center justify-between"><span className="text-muted-foreground">Desconto por item</span><span className="text-emerald-700 font-medium">-{fmt(result.itemVolumeDiscountCents)}</span></div>
                  )}
                  {result.cartBonusCents > 0 && (
                    <div className="flex items-center justify-between"><span className="text-muted-foreground">Bonus de carrinho ({result.cartBonusPct}%)</span><span className="text-emerald-700 font-medium">-{fmt(result.cartBonusCents)}</span></div>
                  )}
                  {result.cartNextTierSessions ? (
                    <div className="text-cyan-700 bg-cyan-50 dark:bg-cyan-950/30 rounded px-2 py-1">
                      Faltam <strong>{result.cartNextTierSessions}</strong> sessoes no total para <strong>+{result.cartNextTierPct}%</strong> de bonus de carrinho
                    </div>
                  ) : null}
                </div>
              )}

              {result && (
                <div className="space-y-2 border-t pt-3">
                  <ScenarioLine label="A — a vista" final={result.scenarioA.finalCents} sav={result.scenarioA.savingsCents} recommended={result.recommendedScenario === "A"} />
                  <ScenarioLine label="B — entrada 50%" final={result.scenarioB.discountedCents} sav={result.scenarioB.savingsCents} recommended={result.recommendedScenario === "B"} />
                  <ScenarioLine label="C — entrada 30%" final={result.scenarioC.discountedCents} sav={result.scenarioC.savingsCents} recommended={result.recommendedScenario === "C"} />
                </div>
              )}

              <div className="space-y-3 border-t pt-3">
                <div className="flex items-center gap-2">
                  <Switch checked={liberarFrequencia} onCheckedChange={setLiberarFrequencia} />
                  <Label className="text-sm">Liberar frequencia</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={repassarTaxa} onCheckedChange={setRepassarTaxa} />
                  <Label className="text-sm">Repassar taxa de cartao</Label>
                </div>
              </div>

              <div className="space-y-2 border-t pt-3">
                <Button className="w-full" onClick={() => salvar(true)} disabled={createBudget.isPending}>
                  <Presentation className="h-4 w-4 mr-2" /> Salvar e Apresentar
                </Button>
                <Button variant="outline" className="w-full" onClick={() => salvar(false)} disabled={createBudget.isPending}>
                  <Save className="h-4 w-4 mr-2" /> Salvar rascunho
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ScenarioLine({ label, final, sav, recommended }: { label: string; final: number; sav: number; recommended: boolean }) {
  return (
    <div className={`flex items-center justify-between rounded px-2 py-1 ${recommended ? "bg-emerald-50 dark:bg-emerald-900/20" : ""}`}>
      <span className="text-sm flex items-center gap-1">
        {label}
        {recommended ? <Badge className="text-[9px] bg-emerald-600">sugerido</Badge> : null}
      </span>
      <span className="text-sm font-semibold">
        {fmt(final)} <span className="text-emerald-600 text-xs">(-{fmt(sav)})</span>
      </span>
    </div>
  );
}
