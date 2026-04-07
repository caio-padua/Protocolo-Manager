import { useListSubstances } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Beaker, AlertTriangle, Info } from "lucide-react";
import { formatStatus } from "@/lib/status";

export default function Substances() {
  const { data: substances, isLoading } = useListSubstances();

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Catálogo de Substâncias</h1>
          <p className="text-muted-foreground">Gerencie as substâncias e seus parâmetros de aplicação.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : substances?.length === 0 ? (
        <div className="text-center py-20 border border-dashed rounded-lg bg-card">
          <Beaker className="mx-auto h-12 w-12 text-muted-foreground opacity-20 mb-4" />
          <h3 className="text-lg font-medium">Nenhuma substância cadastrada</h3>
          <p className="text-sm text-muted-foreground">O sistema precisa ser populado com substâncias.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {substances?.map((substance) => (
            <Card key={substance.id} className="overflow-hidden border-t-4" style={{ borderTopColor: substance.color }}>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{substance.name}</CardTitle>
                    <CardDescription>{substance.category}</CardDescription>
                  </div>
                  <div 
                    className="w-6 h-6 rounded-full shadow-sm"
                    style={{ backgroundColor: substance.color }}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm bg-muted/30 p-2 rounded-md">
                  <div>
                    <span className="text-xs text-muted-foreground block">Dose Padrão</span>
                    <span className="font-medium">{substance.defaultDose || "-"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Intervalo</span>
                    <span className="font-medium">{substance.intervalDays ? `${substance.intervalDays} dias` : "-"}</span>
                  </div>
                </div>
                
                <div className="flex justify-between items-center pt-2 border-t text-sm">
                  <span className="text-muted-foreground">Estoque Atual:</span>
                  <div className="flex items-center gap-1.5 font-medium">
                    {substance.stockQuantity <= 10 && (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    )}
                    <span className={substance.stockQuantity <= 10 ? "text-amber-600 dark:text-amber-400" : ""}>
                      {substance.stockQuantity} {substance.stockUnit || "un."}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}