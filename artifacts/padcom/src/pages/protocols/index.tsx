import { useState } from "react";
import { useListProtocols } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatStatus, getStatusColor } from "@/lib/status";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, ChevronRight, Activity, Home, Building2, Calendar } from "lucide-react";

export default function Protocols() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const { data: protocols, isLoading } = useListProtocols(statusFilter ? { status: statusFilter } : {});
  const [, setLocation] = useLocation();

  const statuses = ["", "suggested", "validated", "active", "completed", "cancelled"];
  const statusLabels: Record<string, string> = {
    "": "Todos",
    suggested: "Sugeridos",
    validated: "Validados",
    active: "Ativos",
    completed: "Concluídos",
    cancelled: "Cancelados",
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Protocolos</h1>
          <p className="text-muted-foreground">Gerencie os protocolos de injeção dos pacientes.</p>
        </div>
        <Button onClick={() => setLocation("/protocols/new")}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Protocolo
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {statuses.map(s => (
          <Button
            key={s}
            variant={statusFilter === s ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(s)}
          >
            {statusLabels[s]}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      ) : !protocols?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Activity className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Nenhum protocolo encontrado</p>
            <p className="text-muted-foreground text-sm mb-4">Crie o primeiro protocolo para começar.</p>
            <Button onClick={() => setLocation("/protocols/new")}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Protocolo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {protocols.map(protocol => (
            <Card
              key={protocol.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setLocation(`/protocols/${protocol.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-base truncate">{protocol.title}</h3>
                      <Badge className={`text-xs border ${getStatusColor(protocol.status)}`}>
                        {formatStatus(protocol.status)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                      <span className="font-medium text-foreground">{protocol.clientName}</span>
                      <span>CPF: {protocol.clientCpf}</span>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>Início: {format(new Date(protocol.startDate), "dd/MM/yyyy", { locale: ptBR })}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {protocol.serviceType === "homecare" ? <Home className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
                        <span>{protocol.serviceType === "homecare" ? "Nurse Care" : "Clínica"}</span>
                      </div>
                      {protocol.professionalName && (
                        <span>Prof: {protocol.professionalName}</span>
                      )}
                    </div>
                    <div className="mt-3 flex items-center gap-4">
                      <div className="flex gap-1.5 flex-wrap">
                        {protocol.items.map(item => (
                          <span
                            key={item.id}
                            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full text-white font-medium"
                            style={{ backgroundColor: item.substanceColor }}
                          >
                            {item.substanceName}
                          </span>
                        ))}
                      </div>
                      <div className="ml-auto text-sm">
                        <span className="font-medium">{protocol.completedSessions}/{protocol.totalSessions}</span>
                        <span className="text-muted-foreground"> sessões</span>
                      </div>
                    </div>
                    {protocol.totalSessions > 0 && (
                      <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${(protocol.completedSessions / protocol.totalSessions) * 100}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="ml-4 flex flex-col items-end gap-1">
                    <span className="text-sm font-semibold">R$ {protocol.totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
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
