import { useEffect, useState } from "react";
import { useGetReconciliation, type ReconciliationItem } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { RefreshCw, Scale, ExternalLink, CheckCircle2, AlertTriangle, CircleDollarSign, CircleSlash, ChevronDown } from "lucide-react";
import { fmtBRL } from "@/components/settings/SettingsUI";

const PAGE = 100;

type MatchKind = ReconciliationItem["match"];

const MATCH_LABEL: Record<MatchKind, string> = {
  ok: "Bate",
  missing_local: "So no gateway",
  missing_remote: "So no sistema",
  status_mismatch: "Status diverge",
  value_mismatch: "Valor diverge",
};

const MATCH_STYLE: Record<MatchKind, string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  missing_local: "text-amber-600 dark:text-amber-400",
  missing_remote: "text-cyan-600 dark:text-cyan-400",
  status_mismatch: "text-red-600 dark:text-red-400",
  value_mismatch: "text-red-600 dark:text-red-400",
};

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="screen-3d p-3">
      <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

export default function FinanceiroConciliacao() {
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<ReconciliationItem[]>([]);
  const q = useGetReconciliation({ offset, limit: PAGE });
  const data = q.data;

  // Acumula as paginas: a 1a (offset 0) substitui; as seguintes anexam.
  // Deduplica por chave estavel (asaasChargeId|paymentId) para nao duplicar
  // se a query refizer fetch automatico (refocus/reconnect) na mesma pagina.
  useEffect(() => {
    if (!data) return;
    setItems((prev) => {
      const base = offset === 0 ? [] : prev;
      const seen = new Set(base.map((it) => `${it.asaasChargeId ?? ""}|${it.paymentId ?? ""}`));
      const merged = [...base];
      for (const it of data.items) {
        const k = `${it.asaasChargeId ?? ""}|${it.paymentId ?? ""}`;
        if (!seen.has(k)) {
          seen.add(k);
          merged.push(it);
        }
      }
      return merged;
    });
  }, [data, offset]);

  function reload() {
    if (offset === 0) q.refetch();
    else setOffset(0); // volta a primeira pagina (dispara novo fetch)
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Conciliacao</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cruza as cobrancas do gateway (Asaas) com os pagamentos do sistema. Mostra o que bate, o que falta de
            cada lado e onde valor ou status divergem.
          </p>
        </div>
        <Button variant="outline" className="btn-3d-soft shrink-0" onClick={reload} disabled={q.isFetching}>
          <RefreshCw className={`w-4 h-4 mr-2 ${q.isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </header>

      {q.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : q.isError ? (
        <div className="panel-3d p-6 text-center">
          <AlertTriangle className="w-8 h-8 mx-auto text-amber-500 mb-2" />
          <p className="font-semibold">Nao foi possivel consultar o gateway.</p>
          <p className="text-sm text-muted-foreground mt-1">
            Verifique a chave de API em Configuracoes &rarr; Portas de Pagamento e tente novamente.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard label="Total" value={data?.summary.total ?? 0} color="text-foreground" />
            <KpiCard label="Batem" value={data?.summary.ok ?? 0} color="text-emerald-600 dark:text-emerald-400" />
            <KpiCard label="So gateway" value={data?.summary.missingLocal ?? 0} color="text-amber-600 dark:text-amber-400" />
            <KpiCard label="So sistema" value={data?.summary.missingRemote ?? 0} color="text-cyan-600 dark:text-cyan-400" />
            <KpiCard label="Status diverge" value={data?.summary.statusMismatch ?? 0} color="text-red-600 dark:text-red-400" />
            <KpiCard label="Valor diverge" value={data?.summary.valueMismatch ?? 0} color="text-red-600 dark:text-red-400" />
          </div>

          <section className="panel-3d p-5">
            <div className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5 mb-4">
              <Scale className="w-4 h-4 text-primary" />
              <span className="text-[12px] font-semibold uppercase tracking-[0.12em]">Divergencias e Cobrancas</span>
            </div>

            {items.length === 0 ? (
              <div className="text-center py-10">
                <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
                <p className="font-semibold">Tudo conciliado.</p>
                <p className="text-sm text-muted-foreground">Nenhuma cobranca pendente de conferencia.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="hidden lg:grid grid-cols-[1.4fr_1fr_0.9fr_0.9fr_1.1fr_auto] gap-2 px-3 text-[10px] uppercase tracking-[0.1em] text-muted-foreground border border-transparent">
                  <span>Cliente / Cobranca</span>
                  <span>Situacao</span>
                  <span className="text-right">Gateway</span>
                  <span className="text-right">Sistema</span>
                  <span>Status</span>
                  <span className="text-right">Acao</span>
                </div>
                {items.map((it, idx) => (
                  <div
                    key={(it.asaasChargeId ?? "") + (it.paymentId ?? "") + idx}
                    className="panel-3d-sub p-3 grid grid-cols-2 lg:grid-cols-[1.4fr_1fr_0.9fr_0.9fr_1.1fr_auto] gap-2 items-center"
                  >
                    <div className="col-span-2 lg:col-span-1 min-w-0">
                      <div className="font-medium truncate">{it.clientName || "—"}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{it.asaasChargeId || `#${it.paymentId}`}</div>
                    </div>
                    <div className={`flex items-center gap-1.5 text-[12px] font-semibold ${MATCH_STYLE[it.match]}`}>
                      {it.match === "ok" ? <CheckCircle2 className="w-3.5 h-3.5" /> : it.match === "missing_remote" ? <CircleDollarSign className="w-3.5 h-3.5" /> : it.match === "missing_local" ? <CircleSlash className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                      <span>{MATCH_LABEL[it.match]}</span>
                    </div>
                    <div className="text-right tabular-nums text-sm">
                      <span className="lg:hidden text-[10px] uppercase text-muted-foreground mr-1">Gateway:</span>
                      {it.asaasValue != null ? fmtBRL(it.asaasValue) : "—"}
                    </div>
                    <div className="text-right tabular-nums text-sm">
                      <span className="lg:hidden text-[10px] uppercase text-muted-foreground mr-1">Sistema:</span>
                      {it.localAmount != null ? fmtBRL(it.localAmount) : "—"}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      <span className="font-medium">{it.asaasStatus || "—"}</span>
                      {it.localStatus ? <> · {it.localStatus}</> : null}
                    </div>
                    <div className="col-span-2 lg:col-span-1 flex justify-end">
                      {it.invoiceUrl ? (
                        <a href={it.invoiceUrl} target="_blank" rel="noreferrer">
                          <Button variant="ghost" size="sm" className="text-primary">
                            <ExternalLink className="w-4 h-4 mr-1" /> Fatura
                          </Button>
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </div>
                  </div>
                ))}

                <div className="flex items-center justify-between pt-2">
                  <span className="text-[12px] text-muted-foreground">
                    Mostrando {items.length} de {data?.summary.total ?? items.length}
                  </span>
                  {data?.hasMore ? (
                    <Button
                      variant="outline"
                      className="btn-3d-soft"
                      onClick={() => data.nextOffset != null && setOffset(data.nextOffset)}
                      disabled={q.isFetching}
                    >
                      <ChevronDown className={`w-4 h-4 mr-2 ${q.isFetching ? "animate-pulse" : ""}`} />
                      Carregar mais
                    </Button>
                  ) : null}
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
