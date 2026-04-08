import { useListSubstances } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Beaker, AlertTriangle, Clock, Syringe, Star } from "lucide-react";

function getProcedureLabel(type: string | null): string {
  if (type === "im") return "Intramuscular";
  if (type === "implant") return "Implante";
  return "Endovenoso";
}

function getProcedureColor(type: string | null): string {
  if (type === "im") return "bg-blue-100 text-blue-700 border-blue-200";
  if (type === "implant") return "bg-purple-100 text-purple-700 border-purple-200";
  return "bg-amber-100 text-amber-700 border-amber-200";
}

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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : substances?.length === 0 ? (
        <div className="text-center py-20 border border-dashed rounded-lg bg-card">
          <Beaker className="mx-auto h-12 w-12 text-muted-foreground opacity-20 mb-4" />
          <h3 className="text-lg font-medium">Nenhuma substância cadastrada</h3>
          <p className="text-sm text-muted-foreground">O sistema precisa ser populado com substâncias.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {substances?.map((substance: any) => (
            <Card key={substance.id} className="overflow-hidden border-t-4 hover:shadow-md transition-shadow" style={{ borderTopColor: substance.color }}>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{substance.name}</CardTitle>
                    <CardDescription>{substance.category}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-xs ${getProcedureColor(substance.procedureType)}`}>
                      <Syringe className="h-3 w-3 mr-1" />
                      {getProcedureLabel(substance.procedureType)}
                    </Badge>
                    <div 
                      className="w-5 h-5 rounded-full shadow-sm flex-shrink-0"
                      style={{ backgroundColor: substance.color }}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {substance.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {substance.description}
                  </p>
                )}

                {substance.mainFunction && (
                  <div className="bg-primary/5 border border-primary/10 rounded-md p-2">
                    <p className="text-xs font-medium text-primary/80">{substance.mainFunction}</p>
                    {substance.starRating != null && (
                      <div className="flex items-center gap-0.5 mt-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={`h-3 w-3 ${i < substance.starRating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 text-sm bg-muted/30 p-2 rounded-md">
                  <div>
                    <span className="text-xs text-muted-foreground block">Dose</span>
                    <span className="font-medium text-xs">{substance.defaultDose || "-"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Intervalo</span>
                    <span className="font-medium text-xs">{substance.intervalDays ? `${substance.intervalDays}d` : "-"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block flex items-center gap-0.5"><Clock className="h-3 w-3" />Duração</span>
                    <span className="font-medium text-xs">{substance.durationMinutes ?? 30} min</span>
                  </div>
                </div>
                
                <div className="flex justify-between items-center pt-2 border-t text-sm">
                  <span className="text-muted-foreground text-xs">Estoque:</span>
                  <div className="flex items-center gap-1.5 font-medium text-xs">
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
