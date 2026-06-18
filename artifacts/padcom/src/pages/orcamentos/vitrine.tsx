import { useMemo } from "react";
import { Link } from "wouter";
import { useListBudgetCatalog, useListSubstances, type Substance } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Sparkles } from "lucide-react";
import { VitrineCard } from "./VitrineCard";

export default function Vitrine() {
  const { data: catalog, isLoading: loadingCatalog } = useListBudgetCatalog();
  const { data: substances, isLoading: loadingSubs } = useListSubstances();

  const subsById = useMemo(() => {
    const m = new Map<number, Substance>();
    (substances ?? []).forEach((s) => m.set(s.id, s));
    return m;
  }, [substances]);

  const vitrineItems = (catalog ?? []).filter((c) => c.active && c.substanceId && subsById.has(c.substanceId));
  const loading = loadingCatalog || loadingSubs;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <Link href="/orcamentos">
          <Button variant="ghost" size="sm" className="btn-3d-soft"><ArrowLeft className="h-4 w-4 mr-2" /> Voltar</Button>
        </Link>
      </div>

      <div className="text-center space-y-1">
        <h1 className="text-3xl font-bold tracking-tight flex items-center justify-center gap-2">
          <Sparkles className="h-6 w-6 text-cyan-500" /> Vitrine de Substancias
        </h1>
        <p className="text-muted-foreground">Beneficios e detalhes de cada substancia do catalogo.</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-40 rounded-[6px]" />)}
        </div>
      ) : vitrineItems.length === 0 ? (
        <Card className="panel-3d">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Sparkles className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Nenhuma substancia na vitrine</p>
            <p className="text-sm text-muted-foreground mt-1">Vincule itens do catalogo a substancias na Parametrizacao.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {vitrineItems.map((it) => (
            <VitrineCard key={it.id} substance={subsById.get(it.substanceId!)!} priceCents={it.unitPriceCents} sessions={it.defaultSessions} />
          ))}
        </div>
      )}
    </div>
  );
}
