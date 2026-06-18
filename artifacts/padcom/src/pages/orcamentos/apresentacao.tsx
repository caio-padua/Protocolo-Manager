import { useEffect, useMemo, useRef, useState } from "react";
import { useRoute, Link } from "wouter";
import {
  useGetBudget,
  useListSubstances,
  useListBudgetCatalog,
  useCalculateBudget,
  useUpdateBudget,
  type BudgetCalcResult,
  type Substance,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, TrendingDown, CheckCircle2, CalendarDays, Wallet, Sparkles } from "lucide-react";
import { fmt } from "./money";
import { VitrineCard } from "./VitrineCard";

export default function ApresentacaoOrcamento() {
  const { toast } = useToast();
  const [, params] = useRoute("/orcamentos/:id/apresentacao");
  const id = parseInt(params?.id || "0", 10);

  const { data: budget, isLoading, refetch } = useGetBudget(id);
  const { data: substances } = useListSubstances();
  const { data: catalog } = useListBudgetCatalog();
  const calc = useCalculateBudget();
  const update = useUpdateBudget({
    mutation: {
      onSuccess: () => refetch(),
      onError: () => toast({ title: "Erro ao atualizar orcamento", variant: "destructive" }),
    },
  });

  const [result, setResult] = useState<BudgetCalcResult | null>(null);
  const [downPct, setDownPct] = useState("0");
  const [installments, setInstallments] = useState("1");
  const [passFee, setPassFee] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);

  const calcRef = useRef(calc.mutateAsync);
  calcRef.current = calc.mutateAsync;
  const presentedRef = useRef(false);

  const includedItems = useMemo(
    () => (budget?.items ?? []).filter((i) => i.include),
    [budget],
  );

  // Reidrata escada de volume por substancia (override) a partir do catalogo atual,
  // para o calculo da Apresentacao bater identico ao da Montagem.
  const tiersByCatalogId = useMemo(() => {
    const m = new Map<number, { minSessions: number; discountPct: number }[]>();
    (catalog ?? []).forEach((c) => { if (c.itemVolumeTiers && c.itemVolumeTiers.length) m.set(c.id, c.itemVolumeTiers); });
    return m;
  }, [catalog]);

  useEffect(() => {
    if (budget) {
      setPassFee(budget.repassarTaxa);
      setChosen(budget.chosenScenario ?? null);
    }
  }, [budget]);

  // Marca como apresentado uma vez ao abrir (virar a tela).
  useEffect(() => {
    if (budget && budget.status === "draft" && !presentedRef.current) {
      presentedRef.current = true;
      update.mutate({ id, data: { status: "presented" } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budget]);

  useEffect(() => {
    if (includedItems.length === 0) { setResult(null); return; }
    const payload = {
      items: includedItems.map((i) => ({ unitPriceCents: i.unitPriceCents, sessions: i.sessions, include: true, volumeTiers: i.catalogId ? tiersByCatalogId.get(i.catalogId) : undefined })),
      freeCalc: { downPaymentPct: Number(downPct), installments: Number(installments), passCardFee: passFee },
    };
    const t = setTimeout(() => {
      calcRef.current({ data: payload }).then(setResult).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [includedItems, downPct, installments, passFee, tiersByCatalogId]);

  const subsById = useMemo(() => {
    const m = new Map<number, Substance>();
    (substances ?? []).forEach((s) => m.set(s.id, s));
    return m;
  }, [substances]);

  const vitrineItems = includedItems.filter((i) => i.substanceId && subsById.has(i.substanceId));

  function registrarAceite(scenario: string) {
    if (!result) return;
    const detail =
      scenario === "A" ? result.scenarioA :
      scenario === "B" ? result.scenarioB :
      scenario === "C" ? result.scenarioC :
      result.free ?? {};
    setChosen(scenario);
    update.mutate({
      id,
      data: {
        status: "accepted",
        chosenScenario: scenario,
        chosenDetail: detail as unknown as Record<string, unknown>,
      },
    });
    toast({ title: `Aceite registrado — cenario ${scenario}` });
  }

  if (isLoading || !budget) {
    return <div className="space-y-4"><Skeleton className="h-32 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div>;
  }

  const recommended = result?.recommendedScenario ?? "A";
  const recScenario =
    recommended === "A" ? result?.scenarioA :
    recommended === "B" ? result?.scenarioB :
    result?.scenarioC;
  const recSavings = recScenario?.savingsCents ?? 0;
  const recPerDay = recScenario?.perspective.perDayCents ?? 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <Link href="/orcamentos">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" /> Voltar</Button>
        </Link>
        <Badge variant="outline" className="text-xs">
          {budget.status === "accepted" ? "Aceito" : budget.status === "presented" ? "Em apresentacao" : "Rascunho"}
        </Badge>
      </div>

      {/* TITULO */}
      <div className="text-center space-y-1">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{budget.title || "Seu Protocolo Personalizado"}</h1>
        {budget.clientName ? <p className="text-lg text-muted-foreground">{budget.clientName}</p> : null}
        <p className="text-sm text-muted-foreground">{result?.totalSessions ?? 0} sessoes · {includedItems.length} itens</p>
      </div>

      {/* HERO ECONOMIA */}
      <Card className="bg-gradient-to-br from-primary to-cyan-600 text-white border-0 shadow-xl">
        <CardContent className="p-8 text-center">
          <div className="flex items-center justify-center gap-2 text-white/80 uppercase tracking-widest text-xs mb-2">
            <TrendingDown className="h-4 w-4" /> Economia a vista
          </div>
          <div className="text-5xl md:text-6xl font-black mb-2">{fmt(recSavings)}</div>
          <p className="text-white/90">
            Pagando a vista voce investe <strong>{fmt(recScenario && "finalCents" in recScenario ? recScenario.finalCents : recScenario?.discountedCents ?? 0)}</strong>
            {" "}em vez de {fmt(result?.totalCents ?? 0)}
          </p>
          <div className="mt-4 inline-flex items-center gap-2 bg-white/15 rounded-full px-4 py-1.5 text-sm">
            <CalendarDays className="h-4 w-4" /> Menos de <strong>{fmt(recPerDay)}</strong> por dia
          </div>
        </CardContent>
      </Card>

      {/* ANCORAGEM POR VOLUME */}
      {result && result.volumeDiscountCents > 0 && (
        <Card className="border-l-4 border-l-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20">
          <CardContent className="p-5 flex flex-col md:flex-row items-center justify-between gap-3 text-center md:text-left">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-emerald-100 dark:bg-emerald-900/40 p-2">
                <TrendingDown className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-widest text-emerald-700 font-semibold">Desconto por volume aplicado</div>
                <div className="text-sm text-muted-foreground">
                  Preco de tabela <span className="line-through">{fmt(result.totalCents)}</span> &rarr;{" "}
                  <strong className="text-emerald-700">{fmt(result.volumeDiscountedCents)}</strong>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-black text-emerald-700">-{fmt(result.volumeDiscountCents)}</div>
              <div className="text-[11px] uppercase tracking-wide text-emerald-600 font-medium">{result.volumeDiscountPct.toFixed(1)}% so pelo tamanho do protocolo</div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3 CAMINHOS */}
      <div>
        <h2 className="text-center text-sm uppercase tracking-widest text-muted-foreground mb-4">Escolha seu caminho</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {result && (
            <>
              <CaminhoCard
                titulo="A vista"
                destaque={recommended === "A"}
                preco={result.scenarioA.finalCents}
                economia={result.scenarioA.savingsCents}
                desconto={result.scenarioA.discountPct}
                perDia={result.scenarioA.perspective.perDayCents}
                onAceitar={() => registrarAceite("A")}
                aceito={chosen === "A"}
                linha="Pagamento unico"
              />
              <CaminhoCard
                titulo="Entrada 50%"
                destaque={recommended === "B"}
                decoy={recommended !== "B"}
                preco={result.scenarioB.discountedCents}
                economia={result.scenarioB.savingsCents}
                desconto={result.scenarioB.discountPct}
                perDia={result.scenarioB.perspective.perDayCents}
                onAceitar={() => registrarAceite("B")}
                aceito={chosen === "B"}
                linha={`Entrada ${fmt(result.scenarioB.downPaymentCents)} + saldo ${fmt(result.scenarioB.balanceCents)}`}
              />
              <CaminhoCard
                titulo="Entrada 30%"
                destaque={recommended === "C"}
                preco={result.scenarioC.discountedCents}
                economia={result.scenarioC.savingsCents}
                desconto={result.scenarioC.discountPct}
                perDia={result.scenarioC.perspective.perDayCents}
                onAceitar={() => registrarAceite("C")}
                aceito={chosen === "C"}
                linha={`Entrada ${fmt(result.scenarioC.downPaymentCents)} + saldo ${fmt(result.scenarioC.balanceCents)}`}
              />
            </>
          )}
        </div>
      </div>

      {/* CALCULADORA LIVRE */}
      <Card className="border-l-4 border-l-cyan-500">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base uppercase tracking-wide">
            <Wallet className="h-4 w-4" /> Monte o parcelamento
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Entrada</Label>
              <Select value={downPct} onValueChange={setDownPct}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Sem entrada</SelectItem>
                  <SelectItem value="30">Entrada 30%</SelectItem>
                  <SelectItem value="50">Entrada 50%</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Parcelas</Label>
              <Select value={installments} onValueChange={setInstallments}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[...Array(12)].map((_, i) => <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}x</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Taxa de cartao</Label>
              <div className="h-9 flex items-center gap-2">
                <Switch checked={passFee} onCheckedChange={setPassFee} />
                <span className="text-sm text-muted-foreground">{passFee ? "Repassada ao cliente" : "Absorvida pela clinica"}</span>
              </div>
            </div>
          </div>

          {result?.free && (
            <div className="rounded-lg bg-muted/40 p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <Metric label="Entrada" value={fmt(result.free.downPaymentCents)} />
              <Metric label="Saldo" value={fmt(result.free.balanceCents)} />
              <Metric label={`${result.free.installments}x de`} value={fmt(result.free.installmentCents)} highlight />
              <Metric label={`Total${passFee ? ` (taxa ${result.free.feePct}%)` : ""}`} value={fmt(result.free.totalWithFeeCents)} />
            </div>
          )}

          <Button
            variant="outline"
            className="w-full"
            onClick={() => registrarAceite("free")}
            disabled={update.isPending || !result?.free}
          >
            {chosen === "free" ? <><CheckCircle2 className="h-4 w-4 mr-2 text-emerald-500" /> Parcelamento aceito</> : "Registrar aceite deste parcelamento"}
          </Button>
        </CardContent>
      </Card>

      {/* VITRINE */}
      {vitrineItems.length > 0 && (
        <div>
          <h2 className="flex items-center justify-center gap-2 text-sm uppercase tracking-widest text-muted-foreground mb-4">
            <Sparkles className="h-4 w-4" /> O que esta incluso no seu protocolo
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {vitrineItems.map((it) => (
              <VitrineCard key={it.substanceId} substance={subsById.get(it.substanceId!)!} priceCents={it.unitPriceCents} sessions={it.sessions} />
            ))}
          </div>
        </div>
      )}

      {chosen && (
        <div className="text-center text-sm text-emerald-600 font-medium flex items-center justify-center gap-2">
          <CheckCircle2 className="h-4 w-4" /> Cenario {chosen} registrado como aceito.
        </div>
      )}
    </div>
  );
}

function CaminhoCard(props: {
  titulo: string; destaque: boolean; preco: number; economia: number; desconto: number; perDia: number;
  linha: string; onAceitar: () => void; aceito: boolean; decoy?: boolean;
}) {
  return (
    <Card className={`relative ${props.destaque ? "border-2 border-primary shadow-lg md:scale-105" : props.decoy ? "border border-cyan-400/60 shadow-md" : ""} ${props.aceito ? "ring-2 ring-emerald-500" : ""}`}>
      {props.destaque && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-primary">Recomendado</Badge>
        </div>
      )}
      {!props.destaque && props.decoy && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge variant="secondary" className="bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40">Mais escolhido</Badge>
        </div>
      )}
      <CardContent className="p-5 text-center space-y-3">
        <div className="uppercase tracking-wide text-sm font-semibold">{props.titulo}</div>
        <div>
          <div className="text-3xl font-black">{fmt(props.preco)}</div>
          {props.desconto > 0 ? <div className="text-xs text-emerald-600 font-medium">{props.desconto}% de desconto · economiza {fmt(props.economia)}</div> : null}
        </div>
        <div className="text-xs text-muted-foreground">{props.linha}</div>
        <div className="text-xs bg-muted rounded-full px-3 py-1 inline-flex items-center gap-1">
          <CalendarDays className="h-3 w-3" /> {fmt(props.perDia)} / dia
        </div>
        <Button className="w-full" variant={props.aceito ? "secondary" : props.destaque ? "default" : "outline"} onClick={props.onAceitar}>
          {props.aceito ? <><CheckCircle2 className="h-4 w-4 mr-2 text-emerald-500" /> Aceito</> : "Escolher este"}
        </Button>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`font-bold ${highlight ? "text-primary text-lg" : ""}`}>{value}</div>
    </div>
  );
}
