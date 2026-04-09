import { useRoute, useLocation } from "wouter";
import { useGetProtocol, useValidateProtocol, useGenerateProtocolICS } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatStatus, getStatusColor } from "@/lib/status";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, Clock, Download, Home, Building2, User, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ProtocolDetail() {
  const [, params] = useRoute("/protocols/:id");
  const [, setLocation] = useLocation();
  const id = params ? parseInt(params.id) : 0;
  const { toast } = useToast();

  const { data: protocol, isLoading, refetch } = useGetProtocol(id, {
    query: { enabled: !!id }
  });

  const validateMutation = useValidateProtocol({
    mutation: {
      onSuccess: () => {
        toast({ title: "Protocolo validado!", description: "Sessões geradas com consolidação semanal." });
        refetch();
      },
      onError: () => {
        toast({ title: "Erro ao validar protocolo", variant: "destructive" });
      }
    }
  });

  const icsMutation = useGenerateProtocolICS({
    mutation: {
      onSuccess: (data) => {
        const blob = new Blob([data.icsContent], { type: "text/calendar" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = data.filename;
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: "ICS gerado!", description: `Arquivo ${data.filename} baixado.` });
      }
    }
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!protocol) return <div className="p-8 text-muted-foreground">Protocolo não encontrado.</div>;

  const progressPct = protocol.totalSessions > 0
    ? (protocol.completedSessions / protocol.totalSessions) * 100 : 0;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/protocols")}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Voltar
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{protocol.title}</h1>
            <Badge className={`text-xs border ${getStatusColor(protocol.status)}`}>
              {formatStatus(protocol.status)}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">{protocol.clientName} — CPF: {protocol.clientCpf}</p>
        </div>
        <div className="flex gap-2">
          {(protocol.status === "suggested" || protocol.status === "validated") && (
            <Button variant="outline" onClick={() => validateMutation.mutate({ id })} disabled={validateMutation.isPending}>
              <Zap className="h-4 w-4 mr-1" />
              {validateMutation.isPending ? "Validando..." : "Validar e Gerar Sessões"}
            </Button>
          )}
          {protocol.sessions.length > 0 && (
            <Button variant="outline" onClick={() => icsMutation.mutate({ id })} disabled={icsMutation.isPending}>
              <Download className="h-4 w-4 mr-1" />
              Baixar ICS (Agendamento)
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Sessões</p>
          <p className="text-2xl font-bold">{protocol.completedSessions}/{protocol.totalSessions}</p>
          <div className="mt-2 h-1.5 bg-muted rounded-full"><div className="h-full bg-primary rounded-full" style={{ width: `${progressPct}%` }} /></div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Valor Total</p>
          <p className="text-2xl font-bold">R$ {protocol.totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Atendimento</p>
          <div className="flex items-center gap-1 mt-1">
            {protocol.serviceType === "homecare" ? <Home className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
            <p className="font-semibold">{protocol.serviceType === "homecare" ? "Nurse Care" : "Clínica"}</p>
          </div>
          {protocol.unit && <p className="text-xs text-muted-foreground mt-1">{protocol.unit}</p>}
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Início</p>
          <p className="font-semibold">{format(new Date(protocol.startDate), "dd/MM/yyyy", { locale: ptBR })}</p>
          {protocol.professionalName && (
            <div className="flex items-center gap-1 mt-1">
              <User className="h-3 w-3 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">{protocol.professionalName}</p>
            </div>
          )}
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Substâncias do Protocolo</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-4">
            {protocol.items.map(item => (
              <div key={item.id} className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.substanceColor }} />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">{item.substanceName}</span>
                    <span className="text-sm text-muted-foreground">{item.completedSessions}/{item.totalSessions} sessões — {item.dose}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${item.totalSessions > 0 ? (item.completedSessions / item.totalSessions) * 100 : 0}%`, backgroundColor: item.substanceColor }} />
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                    <span>Intervalo: {item.intervalDays}d</span>
                    <span>Freq: {item.frequency}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {protocol.sessions.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Sessões ({protocol.sessions.length} semanas)</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {protocol.sessions.map(session => (
                <div key={session.id} className="flex items-start gap-4 p-3 rounded-lg border bg-card">
                  <div className="flex-shrink-0 text-center w-12">
                    <div className="text-xs text-muted-foreground uppercase">{format(new Date(session.scheduledDate), "MMM", { locale: ptBR })}</div>
                    <div className="text-xl font-bold leading-none">{format(new Date(session.scheduledDate), "dd")}</div>
                    <div className="text-xs text-muted-foreground">S{session.weekNumber}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm">{session.scheduledTime}</span>
                      <Badge className={`text-xs border ${getStatusColor(session.status)}`}>{formatStatus(session.status)}</Badge>
                      {session.professionalName && (
                        <span className="text-xs text-muted-foreground ml-auto">{session.professionalName}</span>
                      )}
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {session.substanceApplications.filter(a => a.availability === "disp" && a.sessionNumber > 0).map(app => (
                        <span
                          key={app.id}
                          className="inline-flex items-center text-xs px-2 py-0.5 rounded-full text-white font-medium"
                          style={{ backgroundColor: app.status === "applied" ? "#2563eb" : app.substanceColor }}
                        >
                          {app.substanceName} {app.sessionNumber}/{app.totalSessions} {app.status === "applied" ? "(APLICADA)" : "(DISP)"}
                        </span>
                      ))}
                      {session.substanceApplications.filter(a => a.availability === "prox").map(app => (
                        <span key={app.id} className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                          {app.substanceName} (PROX)
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
