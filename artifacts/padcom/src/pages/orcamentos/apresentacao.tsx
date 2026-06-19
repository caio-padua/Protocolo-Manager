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
    return <div className="space-y-4"><Skeleton className="h-32 rounded-[6px]" /><Skeleton className="h-64 rounded-[6px]" /></div>;
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
          <Button variant="ghost" size="sm" className="btn-3d-soft"><ArrowLeft className="h-4 w-4 mr-2" /> Voltar</Button>
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
      <Card className="bg-gradient-to-br from-primary to-cyan-600 text-white border-0 shadow-xl rounded-[8px]">
        <CardContent className="p-8 text-center">
          <div className="flex items-center justify-center gap-2 text-white/80 uppercase tracking-widest text-xs mb-2">
            <TrendingDown className="h-4 w-4" /> Economia a vista
          </div>
          <div className="text-5xl md:text-6xl font-black mb-2">{fmt(recSavings)}</div>
          <p className="text-white/90">
            Pagando a vista voce investe <strong>{fmt(recScenario && "finalCents" in recScenario ? recScenario.finalCents : recScenario?.discountedCents ?? 0)}</strong>
            {" "}em vez de {fmt(result?.totalCents ?? 0)}
          </p>
          <div className="mt-4 inline-flex items-center gap-2 bg-white/15 rounded-[6px] px-4 py-1.5 text-sm">
            <CalendarDays className="h-4 w-4" /> Menos de <strong>{fmt(recPerDay)}</strong> por dia
          </div>
        </CardContent>
      </Card>

      {/* ANCORAGEM POR VOLUME */}
      {result && result.volumeDiscountCents > 0 && (
        <Card className="panel-3d bg-emerald-50/50 dark:bg-emerald-950/20">
          <CardContent className="p-5 flex flex-col md:flex-row items-center justify-between gap-3 text-center md:text-left">
            <div className="flex items-center gap-3">
              <div className="screen-3d grid h-10 w-10 place-items-center text-emerald-600">
                <TrendingDown className="h-5 w-5" />
              </div>
              <div>
                <span className="bevel-3d inline-flex px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-400">Desconto por volume aplicado</span>
                <div className="mt-1.5 text-sm text-muted-foreground">
                  Preco de tabela <span className="line-through">{fmt(result.totalCents)}</span> &rarr;{" "}
                  <strong className="text-emerald-700">{fmt(result.volumeDiscountedCents)}</strong>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="screen-3d px-3 py-1.5 text-2xl font-black text-emerald-700 tabular-nums">-{fmt(result.volumeDiscountCents)}</div>
              <div className="mt-1 text-[11px] uppercase tracking-wide text-emerald-600 font-medium">{result.volumeDiscountPct.toFixed(1)}% so pelo tamanho do protocolo</div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3 CAMINHOS */}
      <div>
        <h2 className="text-center text-sm uppercase tracking-widest text-muted-foreground mb-6">Escolha seu caminho</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
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
                entradaCents={result.scenarioB.downPaymentCents}
                saldoCents={result.scenarioB.balanceCents}
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
                entradaCents={result.scenarioC.downPaymentCents}
                saldoCents={result.scenarioC.balanceCents}
              />
            </>
          )}
        </div>
      </div>

      {/* CALCULADORA LIVRE */}
      <Card className="panel-3d">
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
                <SelectTrigger className="field-engraved"><SelectValue /></SelectTrigger>
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
                <SelectTrigger className="field-engraved"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[...Array(12)].map((_, i) => <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}x</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Taxa de cartao</Label>
              <div className="concave-3d flex h-9 items-center gap-2 px-3">
                <Switch checked={passFee} onCheckedChange={setPassFee} />
                <span className="text-sm text-muted-foreground">{passFee ? "Repassada ao cliente" : "Absorvida pela clinica"}</span>
              </div>
            </div>
          </div>

          {result?.free && (
            <div className="panel-3d-sub p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <Metric label="Entrada" value={fmt(result.free.downPaymentCents)} />
              <Metric label="Saldo" value={fmt(result.free.balanceCents)} />
              <Metric label={`${result.free.installments}x de`} value={fmt(result.free.installmentCents)} highlight />
              <Metric label={`Total${passFee ? ` (taxa ${result.free.feePct}%)` : ""}`} value={fmt(result.free.totalWithFeeCents)} />
            </div>
          )}

          <Button
            variant="outline"
            className="btn-3d-soft w-full"
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
  onAceitar: () => void; aceito: boolean; decoy?: boolean; entradaCents?: number; saldoCents?: number;
}) {
  const parcelado = props.entradaCents != null && props.saldoCents != null;
  return (
    <Card
      className={`panel-3d relative ${props.destaque ? "panel-3d-rec md:scale-[1.04]" : ""} ${props.aceito ? "ring-2 ring-emerald-500 ring-offset-2 ring-offset-background" : ""}`}
    >
      {/* FAIXA SUPERIOR em relevo 3D (selo do cenario recomendado / mais escolhido) */}
      {props.destaque && (
        <div className="absolute -top-3.5 left-1/2 z-10 -translate-x-1/2">
          <span className="bevel-3d inline-flex items-center gap-1.5 whitespace-nowrap px-3.5 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary">
            <span className="paxter-led paxter-led-green paxter-led-on" aria-hidden="true" /> Recomendado para voce
          </span>
        </div>
      )}
      {!props.destaque && props.decoy && (
        <div className="absolute -top-3.5 left-1/2 z-10 -translate-x-1/2">
          <span className="bevel-3d inline-flex whitespace-nowrap px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-300">
            Mais escolhido
          </span>
        </div>
      )}

      <CardContent className="space-y-4 p-5 pt-7 text-center">
        {/* NOME DO CENARIO */}
        <div className="flex justify-center">
          <span className="concave-3d px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-primary">{props.titulo}</span>
        </div>

        {/* PRECO PRINCIPAL */}
        <div className="screen-3d px-3 py-2.5 text-3xl font-black tabular-nums">{fmt(props.preco)}</div>

        {/* ECONOMIA — empilhada e bem nitida (valor embaixo de valor) */}
        {props.desconto > 0 && (
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              <TrendingDown className="h-3 w-3" /> {props.desconto}% de desconto
            </span>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">voce economiza</div>
              <div className="text-lg font-black tabular-nums text-emerald-600 dark:text-emerald-400">{fmt(props.economia)}</div>
            </div>
          </div>
        )}

        {/* DETALHE DO PAGAMENTO — valor embaixo de valor */}
        {parcelado ? (
          <div className="concave-3d divide-y divide-border/60 text-left">
            <div className="flex items-center justify-between px-3 py-1.5">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Entrada</span>
              <span className="text-sm font-bold tabular-nums">{fmt(props.entradaCents!)}</span>
            </div>
            <div className="flex items-center justify-between px-3 py-1.5">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Saldo</span>
              <span className="text-sm font-bold tabular-nums">{fmt(props.saldoCents!)}</span>
            </div>
          </div>
        ) : (
          <div className="text-xs font-medium text-muted-foreground">Pagamento unico</div>
        )}

        {/* POR DIA */}
        <div className="flex justify-center">
          <span className="concave-3d inline-flex items-center gap-1 px-3 py-1 text-xs tabular-nums text-muted-foreground">
            <CalendarDays className="h-3 w-3" /> {fmt(props.perDia)} / dia
          </span>
        </div>

        {/* ACAO — mesma cor (soft) em TODOS os cards; verde solido SO quando aceito */}
        <Button
          className={`w-full ${props.aceito ? "btn-3d-ok" : "btn-3d-soft"}`}
          variant={props.aceito ? "secondary" : "outline"}
          onClick={props.onAceitar}
        >
          {props.aceito ? <><CheckCircle2 className="mr-2 h-4 w-4" /> Aceito</> : "Escolher este"}
        </Button>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="bevel-3d px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
      <div className={`concave-3d w-full px-2 py-1.5 font-bold tabular-nums ${highlight ? "text-primary text-lg" : ""}`}>{value}</div>
    </div>
  );
}
