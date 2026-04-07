import { useState } from "react";
import { useListSessions, useConfirmSubstanceApplication } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatStatus, getStatusColor } from "@/lib/status";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Clock, Home, Building2, User, CheckCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Agenda() {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const { toast } = useToast();

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 });

  const { data: sessions, isLoading, refetch } = useListSessions({
    dateFrom: format(weekStart, "yyyy-MM-dd"),
    dateTo: format(weekEnd, "yyyy-MM-dd"),
  });

  const confirmMutation = useConfirmSubstanceApplication({
    mutation: {
      onSuccess: () => {
        toast({ title: "Substância confirmada!" });
        refetch();
      },
      onError: () => {
        toast({ title: "Erro ao confirmar substância", variant: "destructive" });
      }
    }
  });

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agenda Semanal</h1>
          <p className="text-muted-foreground">Sessões consolidadas por semana — uma visita por semana por paciente.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium px-3">
            {format(weekStart, "dd 'de' MMM", { locale: ptBR })} — {format(weekEnd, "dd 'de' MMM yyyy", { locale: ptBR })}
          </span>
          <Button variant="outline" size="sm" onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentWeek(new Date())}>Hoje</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      ) : !sessions?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Clock className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Nenhuma sessão esta semana</p>
            <p className="text-muted-foreground text-sm">Valide um protocolo para gerar sessões automaticamente.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1">
          {days.map(day => {
            const daySessions = sessions.filter(s => {
              const d = new Date(s.scheduledDate);
              return d.toDateString() === day.toDateString();
            });
            const isToday = day.toDateString() === new Date().toDateString();

            return (
              <div key={day.toISOString()}>
                <div className={`flex items-center gap-3 py-2 px-1 ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                  <span className={`text-sm font-semibold uppercase w-8`}>
                    {format(day, "EEE", { locale: ptBR })}
                  </span>
                  <span className={`text-lg font-bold leading-none ${isToday ? "bg-primary text-primary-foreground rounded-full w-8 h-8 flex items-center justify-center text-base" : ""}`}>
                    {format(day, "dd")}
                  </span>
                  {daySessions.length > 0 && (
                    <Badge variant="secondary" className="text-xs">{daySessions.length} sessão{daySessions.length !== 1 ? "s" : ""}</Badge>
                  )}
                </div>
                {daySessions.map(session => (
                  <Card key={session.id} className="mb-2 ml-14">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0">
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" />
                            {session.scheduledTime}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-semibold">{session.clientName}</span>
                            <span className="text-xs text-muted-foreground">CPF: {session.clientCpf}</span>
                            <Badge className={`text-xs border ${getStatusColor(session.status)}`}>{formatStatus(session.status)}</Badge>
                            {session.serviceType === "homecare"
                              ? <span className="flex items-center gap-0.5 text-xs text-muted-foreground"><Home className="h-3 w-3" />Nurse Care</span>
                              : <span className="flex items-center gap-0.5 text-xs text-muted-foreground"><Building2 className="h-3 w-3" />Clínica</span>
                            }
                          </div>
                          <p className="text-xs text-muted-foreground mb-2">{session.protocolTitle} — Semana {session.weekNumber}</p>
                          <div className="flex gap-2 flex-wrap">
                            {session.substanceApplications.map(app => (
                              <div key={app.id} className="flex items-center gap-1">
                                <span
                                  className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${
                                    app.availability === "prox"
                                      ? "bg-muted text-muted-foreground"
                                      : "text-white"
                                  }`}
                                  style={app.availability === "disp" ? { backgroundColor: app.substanceColor } : {}}
                                >
                                  {app.substanceName}
                                  {app.availability === "disp" && app.sessionNumber > 0
                                    ? ` ${app.sessionNumber}/${app.totalSessions} (DISP)`
                                    : " (PROX)"
                                  }
                                </span>
                                {app.availability === "disp" && !app.appliedAt && session.status !== "completed" && (
                                  <button
                                    className="text-xs underline text-primary hover:text-primary/80"
                                    onClick={() => confirmMutation.mutate({ id: session.id, data: { substanceId: app.substanceId, confirmed: true } })}
                                    disabled={confirmMutation.isPending}
                                  >
                                    confirmar
                                  </button>
                                )}
                                {app.appliedAt && (
                                  <CheckCheck className="h-3.5 w-3.5 text-green-500" />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                        {session.professionalName && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                            <User className="h-3 w-3" />
                            {session.professionalName}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
