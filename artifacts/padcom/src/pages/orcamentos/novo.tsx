import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  useListBudgetCatalog,
  useGetBudgetSettings,
  useListClients,
  useListSubstances,
  useCalculateBudget,
  useCreateBudget,
  type BudgetCatalogItem,
  type BudgetCalcResult,
  type BudgetItem,
  type Substance,
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
import { Presentation, Save, Calculator, Lock, TrendingDown, Percent, Plus } from "lucide-react";
import { fmt } from "./money";
import { SessionStacker } from "./SessionStacker";
import { FrequencyDial, frequencyLabel } from "./FrequencyDial";
import { StatPanel } from "./StatPanel";
import { Ampola } from "./VitrineCard";

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
  const { data: substances } = useListSubstances();
  const subsById = useMemo(() => {
    const m = new Map<number, Substance>();
    (substances ?? []).forEach((s) => m.set(s.id, s));
    return m;
  }, [substances]);

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
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Montagem do Orcamento</h1>
        <p className="text-muted-foreground">Escolha os itens, sessoes e frequencia. Preview ao vivo. Tela interna.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* COLUNA ITENS */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="panel-3d">
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

          <Card className="panel-3d">
            <CardHeader><CardTitle className="text-base uppercase tracking-wide">Itens do Catalogo</CardTitle></CardHeader>
            <CardContent>
              {loadingCatalog ? (
                <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 rounded" />)}</div>
              ) : (
                <div className="space-y-7">
                  {rows.map((r) => {
                    const sub = r.substanceId ? subsById.get(r.substanceId) : undefined;
                    const doseDisplay = (sub?.defaultDose || sub?.posologia || r.dose || "").trim();
                    return (
                    <div key={r.catalogId} className={`p-4 sm:p-5 transition-all duration-300 ${r.include ? "panel-3d panel-3d-active" : "rounded-[0.875rem] border bg-muted/20"}`}>
                      {/* CABECALHO: toggle + nome · dose + chip de preco */}
                      <div className="flex items-center gap-3">
                        <Switch checked={r.include} onCheckedChange={(v) => setRow(r.catalogId, { include: v })} />
                        {sub ? <Ampola color={sub.color} width={20} /> : null}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">{r.name}</span>
                            {doseDisplay ? <span className="inline-flex items-center gap-1 text-sm text-muted-foreground"><span aria-hidden="true">·</span> {doseDisplay}</span> : null}
                            {r.substanceId ? <Badge variant="outline" className="text-[9px]">vitrine</Badge> : null}
                          </div>
                        </div>
                        <div className="panel-3d-sub shrink-0 px-3 py-1.5 text-right">
                          <div className="text-sm font-semibold tabular-nums text-foreground">{fmt(r.unitPriceCents)}</div>
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">/ sessao</div>
                        </div>
                      </div>

                      {r.include && (
                        <>
                          {/* TRES BLOCOS LADO A LADO: Sessoes | Frequencia | Valor */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
                            {/* 1) SESSOES */}
                            <div className="panel-3d-sub p-4 flex flex-col gap-2">
                              <Label className="text-center text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Sessoes</Label>
                              <SessionStacker value={r.sessions} onChange={(n) => setRow(r.catalogId, { sessions: n })} />
                            </div>

                            {/* 2) FREQUENCIA */}
                            <div className="panel-3d-sub p-4 flex flex-col gap-2">
                              <Label className="text-center text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Frequencia</Label>
                              {liberarFrequencia ? (
                                <div className="flex flex-1 items-center">
                                  <FrequencyDial value={r.frequencyDays} onChange={(d) => setRow(r.catalogId, { frequencyDays: d })} />
                                </div>
                              ) : (() => {
                                const f = frequencyLabel(r.frequencyDays);
                                return (
                                  <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
                                    <div className="text-lg font-bold leading-tight text-foreground">{f.num}</div>
                                    <div className="text-[11px] leading-tight text-muted-foreground">{f.spell}</div>
                                    <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                      <Lock className="h-3 w-3" /> definido no catalogo
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>

                            {/* 3) VALOR (SUBTOTAL) */}
                            {(() => {
                              const v = volumeByCatalogId.get(r.catalogId);
                              const hasDisc = !!v && v.discountPct > 0;
                              const fullSubtotal = r.unitPriceCents * r.sessions;
                              const finalSubtotal = hasDisc ? v!.effectiveUnitCents * r.sessions : fullSubtotal;
                              return (
                                <div className="panel-3d-sub p-4 flex flex-col items-center justify-center text-center">
                                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Subtotal</span>
                                  <div key={finalSubtotal} className="mt-1 text-3xl font-bold leading-none tabular-nums text-primary animate-in fade-in slide-in-from-bottom-1 duration-300">
                                    {fmt(finalSubtotal)}
                                  </div>
                                  {hasDisc ? (
                                    <div className="mt-1.5 text-[11px] font-medium text-muted-foreground">
                                      <span className="line-through">{fmt(fullSubtotal)}</span>
                                      <span className="ml-1 text-emerald-600 dark:text-emerald-400">-{v!.discountPct}% volume</span>
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })()}
                          </div>

                          {/* BANNER DE INCENTIVO + ALERTA CLINICO */}
                          {(() => {
                            const v = volumeByCatalogId.get(r.catalogId);
                            const alert = clinicalAlert(r);
                            const falta = v?.nextTierSessions ?? null;
                            const target = falta ? r.sessions + falta : 0;
                            const prog = target > 0 ? Math.min(100, Math.round((r.sessions / target) * 100)) : 100;
                            return (
                              <div className="mt-4 space-y-2">
                                <div className="incentive-banner flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/12 text-primary">
                                    <Percent className="h-5 w-5" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    {v && v.discountPct > 0 ? (
                                      <div className="text-sm font-semibold text-primary">Desconto por volume: -{v.discountPct}%</div>
                                    ) : (
                                      <div className="text-sm font-semibold text-primary">Aumente as sessoes e destrave desconto</div>
                                    )}
                                    {falta ? (
                                      <div className="text-sm font-medium text-foreground">
                                        Faltam <strong className="text-primary">{falta}</strong> sessoes para <strong className="text-primary">-{v!.nextTierPct}%</strong> neste item
                                      </div>
                                    ) : (
                                      <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Melhor faixa de desconto atingida</div>
                                    )}
                                    {falta ? (
                                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/60 dark:bg-black/30">
                                        <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-primary transition-all duration-300" style={{ width: `${prog}%` }} />
                                      </div>
                                    ) : null}
                                  </div>
                                  {falta ? (
                                    <Button
                                      size="sm"
                                      className="shrink-0"
                                      onClick={() => setRow(r.catalogId, { sessions: r.sessions + falta })}
                                    >
                                      Adicionar {falta} <Plus className="h-4 w-4 ml-1" />
                                    </Button>
                                  ) : null}
                                </div>

                                {alert ? (
                                  <div className={`rounded-[0.75rem] border px-3 py-2 text-xs font-medium ${alert.kind === "over" ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300" : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"}`}>
                                    {alert.msg}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })()}
                        </>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* COLUNA RESUMO */}
        <div className="space-y-6">
          <Card className="panel-3d-hero lg:sticky lg:top-4">
            <CardHeader>
              <CardTitle className="text-base uppercase tracking-wide flex items-center gap-2">
                <Calculator className="h-4 w-4" /> Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <StatPanel size="sm" tone="slate" label="Itens" value={String(includedRows.length)} />
                <StatPanel size="sm" tone="slate" label="Sessoes" value={String(result?.totalSessions ?? 0)} />
              </div>

              <StatPanel
                size="xl"
                tone="teal"
                label="Preco do protocolo"
                value={fmt(result && result.volumeDiscountCents > 0 ? result.volumeDiscountedCents : (result?.totalCents ?? 0))}
                sub={result && result.volumeDiscountCents > 0 ? `de ${fmt(result.totalCents)} • -${result.volumeDiscountPct.toFixed(1).replace(".", ",")}% volume` : undefined}
              />

              {result && (result.itemVolumeDiscountCents > 0 || result.cartBonusCents > 0 || result.cartNextTierSessions) && (
                <div className="space-y-1.5 text-xs">
                  {result.itemVolumeDiscountCents > 0 && (
                    <div className="flex items-center justify-between"><span className="text-muted-foreground">Desconto por item</span><span className="text-emerald-700 dark:text-emerald-400 font-medium">-{fmt(result.itemVolumeDiscountCents)}</span></div>
                  )}
                  {result.cartBonusCents > 0 && (
                    <div className="flex items-center justify-between"><span className="text-muted-foreground">Bonus de carrinho ({result.cartBonusPct}%)</span><span className="text-emerald-700 dark:text-emerald-400 font-medium">-{fmt(result.cartBonusCents)}</span></div>
                  )}
                  {result.cartNextTierSessions ? (
                    <div className="incentive-banner px-3 py-2 text-[11px] font-medium text-foreground">
                      Faltam <strong className="text-primary">{result.cartNextTierSessions}</strong> sessoes no total para <strong className="text-primary">+{result.cartNextTierPct}%</strong> de bonus de carrinho
                    </div>
                  ) : null}
                </div>
              )}

              {result && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
                    <TrendingDown className="h-3.5 w-3.5 text-emerald-600" /> Economia por forma de pagamento
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    <EconomiaCard label="A - a vista" sav={result.scenarioA.savingsCents} final={result.scenarioA.finalCents} recommended={result.recommendedScenario === "A"} />
                    <EconomiaCard label="B - entrada 50%" sav={result.scenarioB.savingsCents} final={result.scenarioB.discountedCents} recommended={result.recommendedScenario === "B"} />
                    <EconomiaCard label="C - entrada 30%" sav={result.scenarioC.savingsCents} final={result.scenarioC.discountedCents} recommended={result.recommendedScenario === "C"} />
                  </div>
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

function EconomiaCard({ label, sav, final, recommended }: { label: string; sav: number; final: number; recommended: boolean }) {
  return (
    <StatPanel
      size="md"
      tone="green"
      label={label}
      value={`- ${fmt(sav)}`}
      sub={`fica em ${fmt(final)}`}
      recommended={recommended}
      badge={recommended ? "Sugerido" : undefined}
    />
  );
}
