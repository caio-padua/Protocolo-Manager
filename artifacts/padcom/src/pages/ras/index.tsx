import { useListRAS } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
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
        <h1 className="text-3xl font-black tracking-tight uppercase">RAS</h1>
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">
          Registro de Administração de Substâncias por sessão.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 panel-3d-sub" />)}
        </div>
      ) : !rasList?.length ? (
        <Card className="panel-3d">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="concave-3d p-6 mb-4">
              <FileText className="h-10 w-10 text-muted-foreground opacity-30" />
            </div>
            <p className="text-base font-black uppercase tracking-tight text-primary">Nenhum RAS gerado</p>
            <p className="text-[11px] font-medium text-muted-foreground mt-1 uppercase tracking-wider">
              Os RAS são gerados manualmente em cada sessão confirmada.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rasList.map(ras => (
            <Card
              key={ras.id}
              className="panel-3d-sub neon-hover cursor-pointer transition-all"
              onClick={() => setLocation(`/ras/${ras.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0 concave-3d p-2">
                    {ras.professionalSignature && ras.patientSignature
                      ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                      : <Clock className="h-5 w-5 text-amber-500" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap mb-1">
                      <span className="font-black uppercase tracking-tight text-foreground">{ras.clientName}</span>
                      <span className="concave-3d px-2 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
                        CPF: {ras.clientCpf}
                      </span>
                      <span className={`bevel-3d px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${
                        ras.professionalSignature && ras.patientSignature
                          ? "text-green-600"
                          : "text-amber-600"
                      }`}>
                        {ras.professionalSignature && ras.patientSignature ? "ASSINADO" : "PENDENTE"}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex-wrap">
                      <span>{format(new Date(ras.serviceDate), "dd/MM/yyyy", { locale: ptBR })}</span>
                      <span>·</span>
                      <span>{ras.professionalName}</span>
                      <span>·</span>
                      <span>{ras.unit}</span>
                      <span>·</span>
                      <span>{ras.substances.length} substância{ras.substances.length !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
