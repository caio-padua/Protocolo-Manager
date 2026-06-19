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
          <p className="text-muted-foreground text-sm">Gerencie os protocolos de injeção dos pacientes.</p>
        </div>
        <Button className="btn-3d" onClick={() => setLocation("/protocols/new")}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Protocolo
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {statuses.map(s => (
          <Button
            key={s}
            variant={statusFilter === s ? "default" : "outline"}
            className={statusFilter === s ? "btn-3d" : "btn-3d-soft"}
            size="sm"
            onClick={() => setStatusFilter(s)}
          >
            {statusLabels[s]}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
        </div>
      ) : !protocols?.length ? (
        <Card className="panel-3d">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Activity className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Nenhum protocolo encontrado</p>
            <p className="text-muted-foreground text-sm mb-4">Crie o primeiro protocolo para começar.</p>
            <Button className="btn-3d" onClick={() => setLocation("/protocols/new")}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Protocolo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {protocols.map(protocol => (
            <Card
              key={protocol.id}
              className="panel-3d-sub cursor-pointer neon-hover transition-all"
              onClick={() => setLocation(`/protocols/${protocol.id}`)}
            >
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="font-bold text-lg truncate uppercase tracking-tight">{protocol.title}</h3>
                      <Badge className={`text-[10px] font-bold uppercase tracking-wider border ${getStatusColor(protocol.status)}`}>
                        {formatStatus(protocol.status)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                      <span className="font-bold text-foreground uppercase tracking-wide">{protocol.clientName}</span>
                      <span className="tabular-nums">CPF: {protocol.clientCpf}</span>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        <span className="tabular-nums">Início: {format(new Date(protocol.startDate), "dd/MM/yyyy", { locale: ptBR })}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {protocol.serviceType === "homecare" ? <Home className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
                        <span className="uppercase tracking-wide text-[11px] font-semibold">{protocol.serviceType === "homecare" ? "Nurse Care" : "Clínica"}</span>
                      </div>
                      {protocol.professionalName && (
                        <span className="uppercase tracking-wide text-[11px] font-semibold">Prof: {protocol.professionalName}</span>
                      )}
                    </div>
                    <div className="mt-4 flex items-center gap-4">
                      <div className="flex gap-2 flex-wrap">
                        {protocol.items.map(item => (
                          <span
                            key={item.id}
                            className="concave-3d inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full text-white font-extrabold shadow-sm"
                            style={{ backgroundColor: item.substanceColor }}
                          >
                            {item.substanceName}
                          </span>
                        ))}
                      </div>
                      <div className="ml-auto text-sm">
                        <span className="font-bold text-primary tabular-nums">{protocol.completedSessions}/{protocol.totalSessions}</span>
                        <span className="text-muted-foreground uppercase tracking-widest text-[10px] font-semibold"> sessões</span>
                      </div>
                    </div>
                    {protocol.totalSessions > 0 && (
                      <div className="mt-3 h-2 bg-muted/30 rounded-full overflow-hidden shadow-inner">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ 
                            width: `${(protocol.completedSessions / protocol.totalSessions) * 100}%`,
                            background: "linear-gradient(90deg, hsl(180 30% 28%) 0%, hsl(187 72% 48%) 100%)"
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="ml-6 flex flex-col items-end gap-2">
                    <div className="screen-3d px-3 py-1.5">
                      <span className="text-sm font-bold tabular-nums">R$ {protocol.totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
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
