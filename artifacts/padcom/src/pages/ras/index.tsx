import { useListRAS } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FileText, ChevronRight, CheckCircle2, Clock } from "lucide-react";

export default function RAS() {
  const { data: rasList, isLoading } = useListRAS();
  const [, setLocation] = useLocation();

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">RAS</h1>
        <p className="text-muted-foreground">Registro de Administração de Substâncias por sessão.</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : !rasList?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Nenhum RAS gerado</p>
            <p className="text-muted-foreground text-sm">Os RAS são gerados manualmente em cada sessão confirmada.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rasList.map(ras => (
            <Card
              key={ras.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setLocation(`/ras/${ras.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0">
                    {ras.professionalSignature && ras.patientSignature
                      ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                      : <Clock className="h-5 w-5 text-amber-500" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold">{ras.clientName}</span>
                      <span className="text-xs text-muted-foreground">CPF: {ras.clientCpf}</span>
                      <Badge variant={ras.professionalSignature ? "default" : "secondary"} className="text-xs">
                        {ras.professionalSignature && ras.patientSignature ? "Assinado" : "Pendente"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{format(new Date(ras.serviceDate), "dd/MM/yyyy", { locale: ptBR })}</span>
                      <span>{ras.professionalName}</span>
                      <span>{ras.unit}</span>
                      <span>{ras.substances.length} substância{ras.substances.length !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
