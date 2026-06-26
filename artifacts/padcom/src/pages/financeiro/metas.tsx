import { useMemo, useState } from "react";
import {
  useListFinancialGoals,
  useUpsertFinancialGoal,
  useDeleteFinancialGoal,
  useGetFinancialGoalsSummary,
  type FinancialGoal,
  type FinancialGoalInputPeriodType,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Target, Save, Trash2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { fmtBRL, reaisFromInput, BlockTitle } from "@/components/settings/SettingsUI";

type PeriodType = FinancialGoalInputPeriodType;

const PERIOD_LABEL: Record<PeriodType, string> = {
  month: "Mes",
  semester: "Semestre",
  year: "Ano",
};

// Sugere a chave do periodo corrente para o tipo escolhido (padrao do back-end).
function currentKey(pt: PeriodType): string {
  const now = new Date();
  const y = now.getFullYear();
  if (pt === "year") return String(y);
  if (pt === "semester") return `${y}-S${now.getMonth() < 6 ? 1 : 2}`;
  return `${y}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

const KEY_HINT: Record<PeriodType, string> = {
  month: "Formato: AAAA-MM (ex.: 2026-06)",
  semester: "Formato: AAAA-S1 ou AAAA-S2 (ex.: 2026-S1)",
  year: "Formato: AAAA (ex.: 2026)",
};

function pctColor(p: number): string {
  if (p >= 100) return "text-emerald-600 dark:text-emerald-400";
  if (p >= 70) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

export default function FinanceiroMetas() {
  const { toast } = useToast();
  const [periodType, setPeriodType] = useState<PeriodType>("month");
  const [periodKey, setPeriodKey] = useState(currentKey("month"));
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");

  const goals = useListFinancialGoals({ periodType });
  const summary = useGetFinancialGoalsSummary({ periodType });

  const upsert = useUpsertFinancialGoal({
    mutation: {
      onSuccess: () => {
        toast({ title: "Meta salva" });
        setTarget("");
        setNote("");
        goals.refetch();
        summary.refetch();
      },
      onError: () => toast({ title: "Erro ao salvar meta", variant: "destructive" }),
    },
  });
  const del = useDeleteFinancialGoal({
    mutation: {
      onSuccess: () => {
        toast({ title: "Meta removida" });
        goals.refetch();
        summary.refetch();
      },
      onError: () => toast({ title: "Erro ao remover meta", variant: "destructive" }),
    },
  });

  function changePeriodType(pt: PeriodType) {
    setPeriodType(pt);
    setPeriodKey(currentKey(pt));
  }

  function persist() {
    const amount = reaisFromInput(target);
    if (amount <= 0) {
      toast({ title: "Informe um valor de meta maior que zero", variant: "destructive" });
      return;
    }
    upsert.mutate({ data: { periodType, periodKey: periodKey.trim(), targetAmount: amount, note: note.trim() || null } });
  }

  const list = (goals.data ?? []) as FinancialGoal[];
  const summaryRows = summary.data?.rows ?? [];

  const totals = useMemo(() => {
    const target = list.reduce((s, g) => s + g.targetAmount, 0);
    const realizado = list.reduce((s, g) => s + g.realizado, 0);
    const percent = target > 0 ? Math.round((realizado / target) * 1000) / 10 : 0;
    return { target, realizado, percent };
  }, [list]);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Metas & Crescimento</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Defina a meta de faturamento por mes, semestre ou ano. O realizado vem dos pagamentos quitados no periodo,
          e o crescimento compara um periodo com o anterior.
        </p>
      </header>

      {/* Cadastro de meta */}
      <section className="panel-3d p-5">
        <BlockTitle icon={Target} color="primary">Definir Meta</BlockTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Periodo</label>
            <Select value={periodType} onValueChange={(v) => changePeriodType(v as PeriodType)}>
              <SelectTrigger className="field-engraved"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Mes</SelectItem>
                <SelectItem value="semester">Semestre</SelectItem>
                <SelectItem value="year">Ano</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Chave do periodo</label>
            <Input className="field-engraved" value={periodKey} onChange={(e) => setPeriodKey(e.target.value)} />
            <span className="text-[11px] text-muted-foreground">{KEY_HINT[periodType]}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Meta (R$)</label>
            <Input className="field-engraved" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="50.000,00" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Observacao</label>
            <Input className="field-engraved" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button className="btn-3d" onClick={persist} disabled={upsert.isPending}>
            <Save className="w-4 h-4 mr-2" />
            {upsert.isPending ? "Salvando..." : "Salvar Meta"}
          </Button>
        </div>
      </section>

      {/* Consolidado do tipo selecionado */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="screen-3d p-4">
          <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Meta total ({PERIOD_LABEL[periodType]})</div>
          <div className="mt-1 text-xl font-bold tabular-nums">{fmtBRL(totals.target)}</div>
        </div>
        <div className="screen-3d p-4">
          <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Realizado total</div>
          <div className="mt-1 text-xl font-bold tabular-nums text-primary">{fmtBRL(totals.realizado)}</div>
        </div>
        <div className="screen-3d p-4">
          <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Atingido</div>
          <div className={`mt-1 text-xl font-bold tabular-nums ${pctColor(totals.percent)}`}>{totals.percent.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</div>
        </div>
      </div>

      {/* Lista de metas */}
      <section className="panel-3d p-5">
        <BlockTitle icon={Target} color="cyan">Metas Cadastradas</BlockTitle>
        {goals.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : list.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma meta cadastrada para {PERIOD_LABEL[periodType].toLowerCase()}.</p>
        ) : (
          <div className="space-y-2">
            {list.map((g) => (
              <div key={g.id} className="panel-3d-sub p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold tabular-nums">{g.periodKey}</div>
                    {g.note ? <div className="text-[12px] text-muted-foreground truncate">{g.note}</div> : null}
                  </div>
                  <Button variant="ghost" size="sm" className="text-red-600 shrink-0" onClick={() => del.mutate({ id: g.id })} disabled={del.isPending}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="concave-3d px-3 py-2">
                    <div className="text-[10px] uppercase text-muted-foreground">Meta</div>
                    <div className="text-sm font-semibold tabular-nums">{fmtBRL(g.targetAmount)}</div>
                  </div>
                  <div className="concave-3d px-3 py-2">
                    <div className="text-[10px] uppercase text-muted-foreground">Realizado</div>
                    <div className="text-sm font-semibold tabular-nums text-primary">{fmtBRL(g.realizado)}</div>
                  </div>
                  <div className="concave-3d px-3 py-2">
                    <div className="text-[10px] uppercase text-muted-foreground">Atingido</div>
                    <div className={`text-sm font-semibold tabular-nums ${pctColor(g.percent)}`}>{g.percent.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</div>
                  </div>
                </div>
                <div className="mt-2 h-2.5 w-full concave-3d overflow-hidden rounded-[3px]">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${Math.min(100, Math.max(0, g.percent))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Crescimento periodo a periodo */}
      <section className="panel-3d p-5">
        <BlockTitle icon={TrendingUp} color="emerald">Crescimento periodo a periodo</BlockTitle>
        {summary.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : summaryRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{summary.data?.message || "Sem dados de crescimento ainda."}</p>
        ) : (
          <div className="space-y-2">
            <div className="hidden sm:grid grid-cols-[1fr_1fr_1fr_1fr_1fr] gap-2 px-3 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              <span>Periodo</span>
              <span className="text-right">Meta</span>
              <span className="text-right">Realizado</span>
              <span className="text-right">Atingido</span>
              <span className="text-right">Crescimento</span>
            </div>
            {summaryRows.map((r) => (
              <div key={r.periodKey} className="panel-3d-sub p-3 grid grid-cols-2 sm:grid-cols-[1fr_1fr_1fr_1fr_1fr] gap-2 items-center">
                <div className="font-medium tabular-nums">{r.periodKey}</div>
                <div className="text-right tabular-nums text-sm"><span className="sm:hidden text-[10px] uppercase text-muted-foreground mr-1">Meta:</span>{fmtBRL(r.target)}</div>
                <div className="text-right tabular-nums text-sm text-primary"><span className="sm:hidden text-[10px] uppercase text-muted-foreground mr-1">Real:</span>{fmtBRL(r.realizado)}</div>
                <div className={`text-right tabular-nums text-sm font-semibold ${pctColor(r.percent)}`}>{r.percent.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</div>
                <div className="text-right">
                  {r.growthPct == null ? (
                    <span className="inline-flex items-center gap-1 text-muted-foreground text-sm justify-end"><Minus className="w-3.5 h-3.5" />—</span>
                  ) : r.growthPct >= 0 ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-sm font-semibold justify-end"><TrendingUp className="w-3.5 h-3.5" />{r.growthPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 text-sm font-semibold justify-end"><TrendingDown className="w-3.5 h-3.5" />{r.growthPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
