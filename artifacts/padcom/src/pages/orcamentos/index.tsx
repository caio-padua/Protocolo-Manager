import { Link } from "wouter";
import { useListBudgets, type Budget } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, SlidersHorizontal, Sparkles, FileText, Presentation } from "lucide-react";
import { fmt } from "./money";

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Rascunho", cls: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300" },
  presented: { label: "Apresentado", cls: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300" },
  accepted: { label: "Aceito", cls: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300" },
  converted: { label: "Convertido", cls: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300" },
  cancelled: { label: "Cancelado", cls: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300" },
};

export default function OrcamentosList() {
  const { data: budgets, isLoading } = useListBudgets();

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Orcamentos</h1>
          <p className="text-muted-foreground">Simulador e negociador de protocolos.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/orcamentos/parametrizacao">
            <Button variant="outline"><SlidersHorizontal className="h-4 w-4 mr-2" /> Parametrizacao</Button>
          </Link>
          <Link href="/orcamentos/vitrine">
            <Button variant="outline"><Sparkles className="h-4 w-4 mr-2" /> Vitrine</Button>
          </Link>
          <Link href="/orcamentos/novo">
            <Button><Plus className="h-4 w-4 mr-2" /> Novo orcamento</Button>
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : !budgets?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Nenhum orcamento ainda</p>
            <Link href="/orcamentos/novo">
              <Button className="mt-4"><Plus className="h-4 w-4 mr-2" /> Criar primeiro orcamento</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader><CardTitle>Historico</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {budgets.map((b: Budget) => {
                const st = STATUS[b.status] ?? STATUS.draft;
                return (
                  <Link key={b.id} href={`/orcamentos/${b.id}/apresentacao`}>
                    <div className="flex items-center gap-4 p-3 rounded-lg border hover:bg-muted/30 transition-colors cursor-pointer">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-medium truncate">{b.title || `Orcamento #${b.id}`}</span>
                          <Badge variant="outline" className={st.cls}>{st.label}</Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {b.clientName ? `${b.clientName} · ` : ""}{b.items.filter((i) => i.include).length} itens · {format(new Date(b.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="font-bold">{fmt(b.totalCents)}</div>
                        {b.chosenScenario ? <div className="text-[11px] text-emerald-600">cenario {b.chosenScenario}</div> : null}
                      </div>
                      <Presentation className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
