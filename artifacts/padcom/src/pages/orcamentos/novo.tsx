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
import { Presentation, Save, Calculator, Lock, TrendingDown, ArrowRight, Plus } from "lucide-react";
import { fmt } from "./money";
import { SessionStacker } from "./SessionStacker";
import { FrequencyDial, FrequencyBar, frequencyLabel, FREQ_LEGEND } from "./FrequencyDial";
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

// LED de luz latente (acende/apaga). So apresentacao — chama a atencao.
// tone: cyan (padrao) | amber (Agora) | green (Meta / melhor faixa). Todas as
// LEDs acesas usam a mesma cadencia, logo piscam EM SINCRONIA.
function Led({ on, tone = "cyan" }: { on: boolean; tone?: "cyan" | "amber" | "green" }) {
  const toneClass = tone === "amber" ? "paxter-led-amber" : tone === "green" ? "paxter-led-green" : "";
  return <span className={`paxter-led ${toneClass} ${on ? "paxter-led-on" : "paxter-led-off"}`} aria-hidden="true" />;
}

// Pintura padrao das barras acesas (mesma das barras de Sessoes/Frequencia).
const TIER_FILL = {
  background: "linear-gradient(180deg, hsl(187 80% 52%) 0%, hsl(187 78% 42%) 100%)",
  boxShadow:
    "inset 0 1px 0 rgba(255,255,255,0.7), inset 0 -1px 1px rgba(0,0,0,0.10), 0 1px 1.5px rgba(7,22,43,0.30)",
} as const;

// Barra de evolucao HORIZONTAL das faixas de desconto (mesmo padrao das barras
// de Sessoes/Frequencia): segmentos preenchidos ate a faixa ATUAL, a faixa atual
// PULSA uma luz por detras (sem bolinha por cima) e, abaixo, DOIS inserts concavos
// lado a lado por faixa (% + limiar de sessoes). So apresentacao — o motor nao muda.
function TierTrack({ tiers, currentSessions }: { tiers: { minSessions: number; discountPct: number }[]; currentSessions: number }) {
  let curIdx = -1;
  tiers.forEach((t, i) => { if (currentSessions >= t.minSessions) curIdx = i; });
  return (
    <div className="w-full pt-1.5">
      <div className="flex w-full items-stretch gap-[3px]">
        {tiers.map((t, i) => {
          const reached = i <= curIdx;
          const isCurrent = i === curIdx;
          return (
            <div key={i} className="relative flex-1">
              {/* sem bolinha por cima: a faixa atual PULSA a luz por detras */}
              <div
                className={`h-4 rounded-[2px] transition-all duration-200 ${
                  reached ? "" : "bg-black/[0.06] shadow-[inset_0_1px_2px_rgba(7,22,43,0.10)] dark:bg-white/10"
                } ${isCurrent ? "paxter-tier-live ring-2 ring-cyan-400" : ""}`}
                style={reached ? TIER_FILL : undefined}
              />
            </div>
          );
        })}
      </div>
      {/* rotulos por faixa: DOIS inserts concavos LADO A LADO (% | >=N), nunca empilhados */}
      <div className="mt-2 flex w-full gap-[3px]">
        {tiers.map((t, i) => {
          const reached = i <= curIdx;
          return (
            <div key={i} className="flex flex-1 items-center justify-center gap-1">
              <span className={`concave-3d px-1 py-0.5 text-[9px] font-extrabold tabular-nums ${reached ? "text-primary" : "text-muted-foreground/70"}`}>
                {t.discountPct > 0 ? `-${t.discountPct}%` : "0%"}
              </span>
              <span className="concave-3d px-1 py-0.5 text-[8px] font-bold uppercase tabular-nums text-muted-foreground">≥{t.minSessions}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
      onError: () => toast({ title: "Erro ao salvar orçamento", variant: "destructive" }),
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
  function clinicalAlert(r: Row): { kind: "over" | "under"; left: string; right: string } | null {
    if (r.repeticaoLivre || !r.frequencyDays || r.frequencyDays <= 0) return null;
    const perMonth = 30 / r.frequencyDays;
    if (r.maxAplicacoesMes && perMonth > r.maxAplicacoesMes + 0.001) {
      const minDias = Math.ceil(30 / r.maxAplicacoesMes);
      return { kind: "over", left: `Excede o teto clínico de ${r.maxAplicacoesMes} por mês`, right: `Espace para no mínimo ${minDias} dias` };
    }
    if (r.minAplicacoesMes && perMonth < r.minAplicacoesMes - 0.001) {
      const maxDias = Math.floor(30 / r.minAplicacoesMes);
      return { kind: "under", left: `Abaixo do mínimo clínico de ${r.minAplicacoesMes} por mês`, right: `Use no máximo ${maxDias} dias entre aplicações` };
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
    toast({ title: "Orçamento salvo" });
    if (goPresent) navigate(`/orcamentos/${created.id}/apresentacao`);
    else navigate("/orcamentos");
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Montagem do Orçamento</h1>
        <p className="text-muted-foreground">Escolha os itens, sessões e frequência. Preview ao vivo. Tela interna.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* COLUNA ITENS */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="panel-3d">
            <CardHeader><CardTitle className="text-base uppercase tracking-wide">Dados do Orçamento</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Título</Label>
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
            <CardHeader><CardTitle className="text-base uppercase tracking-wide">Itens do Catálogo</CardTitle></CardHeader>
            <CardContent>
              {loadingCatalog ? (
                <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 rounded" />)}</div>
              ) : (
                <div className="space-y-7">
                  {rows.map((r) => {
                    const sub = r.substanceId ? subsById.get(r.substanceId) : undefined;
                    const doseDisplay = (sub?.defaultDose || sub?.posologia || r.dose || "").trim();
                    const doseMain = doseDisplay.split("—")[0].trim() || doseDisplay;
                    return (
                    <div key={r.catalogId} className={`neon-hover p-4 sm:p-5 transition-all duration-300 ${r.include ? "panel-3d panel-3d-active" : "rounded-[6px] border bg-muted/20"}`}>
                      {/* CABECALHO: toggle + nome · dose + chip de preco */}
                      <div className="flex items-center gap-3">
                        <Switch checked={r.include} onCheckedChange={(v) => setRow(r.catalogId, { include: v })} />
                        {sub ? <Ampola color={sub.color} width={20} /> : null}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">{r.name}</span>
                            {doseMain ? <span title={doseDisplay} className="concave-3d inline-flex max-w-[180px] items-center truncate px-2 py-0.5 text-[11px] font-semibold tabular-nums text-foreground/75">{doseMain}</span> : null}
                            {r.substanceId ? <Badge variant="outline" className="text-[9px]">vitrine</Badge> : null}
                          </div>
                        </div>
                        <div className="screen-3d shrink-0 px-3 py-1.5 text-center">
                          <div className="text-sm font-bold tabular-nums text-foreground">{fmt(r.unitPriceCents)}</div>
                          <div className="text-[10px] tracking-wide text-muted-foreground">por sessão</div>
                        </div>
                      </div>

                      {r.include && (
                        <>
                          {/* TRES BLOCOS LADO A LADO (MATRIZ): Sessoes | Frequencia | Subtotal.
                              Todos compartilham a mesma malha: titulo h-7, controle h-[60px],
                              barra h-5, legenda h-4, com gap-2.5 — alinhamento por linhas. */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
                            {/* 1) SESSOES */}
                            <div className="panel-3d-sub paxter-attention flex flex-1 flex-col gap-2.5 p-3">
                              <div className="concave-3d flex h-7 items-center justify-center px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Sessões</div>
                              <SessionStacker value={r.sessions} onChange={(n) => setRow(r.catalogId, { sessions: n })} />
                            </div>

                            {/* 2) FREQUENCIA */}
                            <div className="panel-3d-sub flex flex-1 flex-col gap-2.5 p-3">
                              <div className="concave-3d flex h-7 items-center justify-center px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Frequência</div>
                              {liberarFrequencia ? (
                                <FrequencyDial value={r.frequencyDays} onChange={(d) => setRow(r.catalogId, { frequencyDays: d })} />
                              ) : (() => {
                                const f = frequencyLabel(r.frequencyDays);
                                return (
                                  <div className="flex flex-1 flex-col gap-2.5">
                                    <div className="screen-3d flex h-[60px] flex-col items-center justify-center overflow-hidden px-1.5 text-center">
                                      <div className="max-w-full truncate whitespace-nowrap text-base font-bold leading-tight text-foreground">{f.num}</div>
                                      <div className="max-w-full truncate whitespace-nowrap text-[9px] leading-tight text-muted-foreground">{f.spell}</div>
                                    </div>
                                    <FrequencyBar days={r.frequencyDays} />
                                    <div className="flex h-4 items-center justify-center text-[9px] font-semibold uppercase tracking-wide text-cyan-600 dark:text-cyan-400">{FREQ_LEGEND}</div>
                                    <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
                                      <Lock className="h-3 w-3" /> definido no catálogo
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>

                            {/* 3) SUBTOTAL — preco final (controle), preco cheio riscado (barra)
                                e o desconto do pacote (legenda), alinhados as outras colunas. */}
                            {(() => {
                              const v = volumeByCatalogId.get(r.catalogId);
                              const hasDisc = !!v && v.discountPct > 0;
                              const fullSubtotal = r.unitPriceCents * r.sessions;
                              const finalSubtotal = hasDisc ? v!.effectiveUnitCents * r.sessions : fullSubtotal;
                              return (
                                <div className="panel-3d-sub flex flex-1 flex-col gap-2.5 p-3">
                                  <div className="concave-3d flex h-7 items-center justify-center px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Subtotal</div>
                                  <div className="screen-3d flex h-[60px] items-center justify-center px-2 text-center">
                                    <div key={finalSubtotal} className="text-3xl font-bold leading-none tabular-nums text-primary animate-in fade-in slide-in-from-bottom-1 duration-300">
                                      {fmt(finalSubtotal)}
                                    </div>
                                  </div>
                                  {hasDisc ? (() => {
                                    const full = fmt(fullSubtotal);
                                    const sp = full.indexOf(" ");
                                    const fullSym = sp > 0 ? full.slice(0, sp) : "R$";
                                    const fullNum = sp > 0 ? full.slice(sp + 1) : full;
                                    return (
                                      <div className="mx-auto mt-1.5 flex w-full max-w-[150px] flex-col gap-1">
                                        {/* PRECO CHEIO CANCELADO: selo de PROIBIDO compacto (quadrado,
                                            circulo + trave) centralizado por cima — SEM risco.
                                            R$ na guia esquerda, ultimo zero na guia direita. */}
                                        <div className="relative flex items-center justify-between text-sm font-bold tabular-nums text-slate-500 dark:text-slate-400">
                                          <span>{fullSym}</span>
                                          <span>{fullNum}</span>
                                          <svg viewBox="0 0 24 24" aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 h-[22px] w-[22px] -translate-x-1/2 -translate-y-1/2 text-red-500/85">
                                            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.4" />
                                            <line x1="5.7" y1="5.7" x2="18.3" y2="18.3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                                          </svg>
                                        </div>
                                        {/* DESCONTO DO PACOTE: -X% na guia esquerda, "no pacote" na guia
                                            direita — mesma largura, formando as linhas verticais. */}
                                        <div className="flex items-center justify-between text-[12px] font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                                          <span>-{v!.discountPct}%</span>
                                          <span>no pacote</span>
                                        </div>
                                      </div>
                                    );
                                  })() : null}
                                </div>
                              );
                            })()}
                          </div>

                          {/* ORGANOGRAMA DE DESCONTO POR PACOTE (cofrinho) + ALERTA CLINICO */}
                          {(() => {
                            const v = volumeByCatalogId.get(r.catalogId);
                            const alert = clinicalAlert(r);
                            const falta = v?.nextTierSessions ?? null;
                            const nowPct = v?.discountPct ?? 0;
                            const effTiers = (r.itemVolumeTiers ?? settings?.itemVolumeTiers ?? [])
                              .slice()
                              .sort((a, b) => a.minSessions - b.minSessions);
                            return (
                              <div className="mt-4 space-y-2">
                                <div className="incentive-banner flex flex-col gap-3.5 p-4">
                                  {/* TITULO SALIENTE (bevel/alto-relevo) do bloco de desconto */}
                                  <div className="screen-3d flex items-center justify-center gap-2 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-primary">
                                    <TrendingDown className="h-4 w-4" />
                                    Desconto por Volume do Protocolo
                                  </div>
                                  <div className="flex flex-wrap items-end gap-3">
                                    {/* cofrinho de PERFIL — vetor achatado (nao 3D), nos tons da marca
                                        (verde-petroleo + ciano). Sem dependencia de imagem externa. */}
                                    <svg
                                      viewBox="0 0 64 64"
                                      role="img"
                                      aria-label="Cofrinho de economia"
                                      className="h-14 w-14 shrink-0 drop-shadow-[0_6px_8px_rgba(7,22,43,0.18)]"
                                    >
                                      <defs>
                                        <linearGradient id="pigBody" x1="0" y1="0" x2="0" y2="1">
                                          <stop offset="0%" stopColor="hsl(187 72% 55%)" />
                                          <stop offset="100%" stopColor="hsl(180 32% 34%)" />
                                        </linearGradient>
                                      </defs>
                                      {/* rabinho (atras) */}
                                      <path d="M9 33 q-5 -1 -4 -5 q1 -3 4 -1.5" fill="none" stroke="hsl(180 34% 26%)" strokeWidth="2" strokeLinecap="round" />
                                      {/* pernas (atras do corpo) */}
                                      <rect x="16" y="46" width="7" height="11" rx="2.5" fill="hsl(180 34% 30%)" />
                                      <rect x="39" y="46" width="7" height="11" rx="2.5" fill="hsl(180 34% 30%)" />
                                      {/* orelha (atras do corpo) */}
                                      <path d="M41 17 L49 14 L46 25 Z" fill="hsl(180 34% 30%)" />
                                      {/* corpo */}
                                      <ellipse cx="31" cy="36" rx="23" ry="16" fill="url(#pigBody)" stroke="hsl(180 34% 26%)" strokeWidth="2" />
                                      {/* focinho de perfil */}
                                      <ellipse cx="52" cy="38" rx="7.5" ry="8.5" fill="hsl(187 55% 50%)" stroke="hsl(180 34% 26%)" strokeWidth="2" />
                                      <ellipse cx="53" cy="35" rx="1.3" ry="1.8" fill="hsl(180 36% 18%)" />
                                      <ellipse cx="53" cy="41" rx="1.3" ry="1.8" fill="hsl(180 36% 18%)" />
                                      {/* fenda da moeda + moeda entrando */}
                                      <rect x="23" y="20" width="16" height="3" rx="1.5" transform="rotate(-10 31 21)" fill="hsl(180 36% 18%)" />
                                      <circle cx="31" cy="11" r="5" fill="hsl(187 75% 60%)" stroke="hsl(180 34% 26%)" strokeWidth="1.5" />
                                      {/* olho */}
                                      <circle cx="44" cy="31" r="2.3" fill="hsl(180 36% 16%)" />
                                      {/* brilho achatado */}
                                      <ellipse cx="24" cy="29" rx="6" ry="3" fill="rgba(255,255,255,0.32)" />
                                    </svg>
                                    {/* organograma AGORA -> META: rotulo em RELEVO (sobressalente),
                                        valor no CONCAVO (profundo) e a seta como 3o subbloco 3D */}
                                    <div className="flex flex-1 items-end justify-center gap-2.5">
                                      {/* AGORA: rotulo em RELEVO grosso (bevel) com LED + valor CONCAVO
                                          com a porcentagem em cima e as sessoes embaixo */}
                                      <div className="flex flex-col items-center gap-1">
                                        <span className="bevel-3d flex items-center gap-1.5 px-3 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                                          <Led on={nowPct > 0} tone="amber" /> Agora
                                        </span>
                                        <span className="concave-3d flex h-12 min-w-[78px] flex-col items-center justify-center px-3 leading-none">
                                          <span className="text-xl font-extrabold tabular-nums text-primary">{nowPct > 0 ? `-${nowPct}%` : "0%"}</span>
                                          <span className="mt-0.5 text-[8px] font-bold uppercase tracking-wide tabular-nums text-muted-foreground">{r.sessions} {r.sessions === 1 ? "sessão" : "sessões"}</span>
                                        </span>
                                      </div>
                                      {falta ? (
                                        <>
                                          <span className="screen-3d grid h-9 w-9 shrink-0 place-items-center text-primary">
                                            <ArrowRight className="h-4 w-4" />
                                          </span>
                                          {/* META: mesma leitura, com LED latente puxando para a proxima faixa */}
                                          <div className="flex flex-col items-center gap-1">
                                            <span className="bevel-3d flex items-center gap-1.5 px-3 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                                              <Led on={true} tone="green" /> Meta
                                            </span>
                                            <span className="concave-3d flex h-12 min-w-[78px] flex-col items-center justify-center px-3 leading-none">
                                              <span className="text-xl font-extrabold tabular-nums text-primary">-{v!.nextTierPct}%</span>
                                              <span className="mt-0.5 text-[8px] font-bold uppercase tracking-wide tabular-nums text-muted-foreground">≥{r.sessions + falta} {r.sessions + falta === 1 ? "sessão" : "sessões"}</span>
                                            </span>
                                          </div>
                                        </>
                                      ) : (
                                        <span className="bevel-3d flex h-12 items-center gap-2 px-4 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                                          <Led on={true} tone="green" /> Melhor faixa atingida
                                        </span>
                                      )}
                                    </div>
                                    {falta ? (
                                      <Button
                                        size="sm"
                                        className="btn-3d w-full shrink-0 font-semibold sm:w-auto"
                                        onClick={() => setRow(r.catalogId, { sessions: r.sessions + falta })}
                                      >
                                        Adicionar {falta} {falta === 1 ? "sessão" : "sessões"} <Plus className="h-4 w-4 ml-1" />
                                      </Button>
                                    ) : null}
                                  </div>

                                  {/* BARRA DE EVOLUCAO HORIZONTAL: segmentos preenchidos ate a faixa
                                      atual (padrao das barras de Sessoes/Frequencia), LED pulsante na
                                      faixa atual e, abaixo, % + limiar de sessoes por faixa.
                                      Renderizada do catalogo (override do item ou escada global);
                                      o motor de calculo continua intacto. */}
                                  {effTiers.length >= 2 ? (
                                    <TierTrack tiers={effTiers} currentSessions={r.sessions} />
                                  ) : null}
                                </div>

                                {alert ? (
                                  <div className={`flex items-center justify-between gap-3 rounded-[6px] border px-3 py-2 text-xs font-medium ${alert.kind === "over" ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300" : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"}`}>
                                    <span className="text-left">{alert.left}</span>
                                    <span className="text-right">{alert.right}</span>
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
                <StatPanel size="sm" tone="slate" label="Sessões" value={String(result?.totalSessions ?? 0)} />
              </div>

              <StatPanel
                size="xl"
                tone="teal"
                label="Preço do protocolo"
                value={fmt(result && result.volumeDiscountCents > 0 ? result.volumeDiscountedCents : (result?.totalCents ?? 0))}
                sub={result && result.volumeDiscountCents > 0 ? `de ${fmt(result.totalCents)} • -${result.volumeDiscountPct.toFixed(1).replace(".", ",")}% no pacote` : undefined}
              />

              {result && (result.itemVolumeDiscountCents > 0 || result.cartBonusCents > 0 || result.cartNextTierSessions) && (
                <div className="space-y-1.5 text-xs">
                  {result.itemVolumeDiscountCents > 0 && (
                    <div className="flex items-center justify-between"><span className="text-muted-foreground">Desconto por item</span><span className="text-emerald-700 dark:text-emerald-400 font-medium">-{fmt(result.itemVolumeDiscountCents)}</span></div>
                  )}
                  {result.cartBonusCents > 0 && (
                    <div className="flex items-center justify-between"><span className="text-muted-foreground">Bônus de carrinho ({result.cartBonusPct}%)</span><span className="text-emerald-700 dark:text-emerald-400 font-medium">-{fmt(result.cartBonusCents)}</span></div>
                  )}
                  {result.cartNextTierSessions ? (
                    <div className="incentive-banner px-3 py-2 text-[11px] font-medium text-foreground">
                      Faltam <strong className="text-primary">{result.cartNextTierSessions}</strong> sessões no total para <strong className="text-primary">+{result.cartNextTierPct}%</strong> de bônus de carrinho
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
                    <EconomiaCard label="A - à vista" sav={result.scenarioA.savingsCents} final={result.scenarioA.finalCents} recommended={result.recommendedScenario === "A"} />
                    <EconomiaCard label="B - entrada 50%" sav={result.scenarioB.savingsCents} final={result.scenarioB.discountedCents} recommended={result.recommendedScenario === "B"} />
                    <EconomiaCard label="C - entrada 30%" sav={result.scenarioC.savingsCents} final={result.scenarioC.discountedCents} recommended={result.recommendedScenario === "C"} />
                  </div>
                </div>
              )}

              <div className="space-y-3 border-t pt-3">
                <div className="flex items-center gap-2">
                  <Switch checked={liberarFrequencia} onCheckedChange={setLiberarFrequencia} />
                  <Label className="text-sm">Liberar frequência</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={repassarTaxa} onCheckedChange={setRepassarTaxa} />
                  <Label className="text-sm">Repassar taxa de cartão</Label>
                </div>
              </div>

              <div className="space-y-2 border-t pt-3">
                <Button className="btn-3d w-full font-semibold" onClick={() => salvar(true)} disabled={createBudget.isPending}>
                  <Presentation className="h-4 w-4 mr-2" /> Salvar e Apresentar
                </Button>
                <Button variant="outline" className="btn-3d-soft w-full font-semibold" onClick={() => salvar(false)} disabled={createBudget.isPending}>
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
