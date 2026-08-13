import { useState } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  useListProtocols, useListSessions,
} from "@workspace/api-client-react";
import { formatStatus, getStatusColor } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity, Plus, ChevronDown, ChevronRight,
  Calendar, Clock, ExternalLink,
} from "lucide-react";

const NAVY = "#16294a";
const GOLD = "#9a7b32";

interface Props { clientId: number; }

export default function ProtocolosPanel({ clientId }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data: protocols, isLoading: loadingProtocols } = useListProtocols(
    { clientId },
    { query: { enabled: !!clientId, queryKey: ["protocols", clientId] } },
  );

  const { data: sessions, isLoading: loadingSessions } = useListSessions(
    { clientId },
    { query: { enabled: !!clientId, queryKey: ["sessions", clientId] } },
  );

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total",      value: protocols?.length ?? 0,                                               color: NAVY    },
          { label: "Ativos",     value: protocols?.filter(p => p.status === "active").length ?? 0,            color: "#16a34a" },
          { label: "Concluídos", value: protocols?.filter(p => p.status === "completed").length ?? 0,         color: "#6b7280" },
        ].map(k => (
          <div key={k.label} className="panel-3d-sub p-4 text-center border-none">
            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">{k.label}</div>
            <div
              className="text-3xl font-black tabular-nums"
              style={{ color: k.color, fontFamily: "'EB Garamond', serif" }}
            >
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {/* Novo protocolo */}
      <div className="flex justify-end">
        <Link href={`/protocols/new?clientId=${clientId}`}>
          <Button className="btn-3d">
            <Plus className="w-4 h-4 mr-2" /> NOVO PROTOCOLO
          </Button>
        </Link>
      </div>

      {/* Lista com accordion */}
      {loadingProtocols ? (
        [...Array(2)].map((_, i) => <Skeleton key={i} className="h-28 rounded-lg panel-3d-sub" />)
      ) : !protocols?.length ? (
        <div className="text-center py-16 panel-3d border-none bg-white/50">
          <Activity className="mx-auto h-12 w-12 text-muted-foreground opacity-20 mb-4" />
          <p className="text-muted-foreground uppercase font-bold text-sm tracking-widest">Nenhum protocolo cadastrado.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {protocols.map(protocol => {
            const isExp = expanded === protocol.id;
            const protSessions = (sessions ?? []).filter(s => (s as any).protocolId === protocol.id);
            return (
              <div key={protocol.id} className="panel-3d-sub border-none overflow-hidden">
                <div
                  className="p-5 flex items-center justify-between cursor-pointer hover:bg-muted/20 transition-colors"
                  onClick={() => setExpanded(isExp ? null : protocol.id)}
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="concave-3d flex items-center justify-center w-10 h-10 shrink-0 border-none">
                      {isExp
                        ? <ChevronDown className="w-4 h-4" style={{ color: GOLD }} />
                        : <ChevronRight className="w-4 h-4" style={{ color: GOLD }} />}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-black text-primary uppercase tracking-tight truncate">{protocol.title}</h3>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Início: {format(new Date(protocol.startDate), "dd/MM/yyyy")}
                        </span>
                        <div className="screen-3d px-2 py-0.5 text-[10px] font-black tabular-nums">
                          {protocol.completedSessions} / {protocol.totalSessions} sessões
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex -space-x-1.5">
                      {protocol.items.slice(0, 5).map((item, i) => (
                        <div
                          key={i}
                          className="w-5 h-5 rounded-[3px] border-2 border-white shadow-sm ring-1 ring-black/5"
                          style={{ backgroundColor: item.substanceColor }}
                          title={item.substanceName}
                        />
                      ))}
                    </div>
                    <Badge
                      variant="outline"
                      className={`rounded-[4px] border-none px-2 py-1 text-[9px] font-extrabold uppercase tracking-widest shadow-sm ${getStatusColor(protocol.status)}`}
                    >
                      {formatStatus(protocol.status)}
                    </Badge>
                    <Link href={`/protocols/${protocol.id}`} onClick={e => e.stopPropagation()}>
                      <Button className="btn-3d-soft h-7 text-[9px] font-black px-2">
                        <ExternalLink className="w-3 h-3 mr-1" /> VER
                      </Button>
                    </Link>
                  </div>
                </div>

                {isExp && (
                  <div className="border-t border-border/30" style={{ background: "rgba(0,0,0,0.03)" }}>
                    {loadingSessions ? (
                      <div className="p-4"><Skeleton className="h-16" /></div>
                    ) : !protSessions.length ? (
                      <p className="p-5 text-[11px] text-muted-foreground uppercase font-bold tracking-widest text-center">
                        Nenhuma sessão registrada neste protocolo.
                      </p>
                    ) : (
                      <div className="divide-y divide-border/20">
                        {protSessions.map(session => (
                          <div key={session.id} className="px-6 py-3 flex items-center justify-between hover:bg-muted/10">
                            <div className="flex items-center gap-4">
                              <div className="concave-3d flex flex-col items-center justify-center w-12 h-12 shrink-0 border-none text-center">
                                <span className="text-[9px] uppercase font-black text-muted-foreground/60 leading-none">
                                  {format(new Date(session.scheduledDate), "MMM", { locale: ptBR })}
                                </span>
                                <span className="text-lg font-black text-primary leading-none tabular-nums">
                                  {format(new Date(session.scheduledDate), "dd")}
                                </span>
                              </div>
                              <div>
                                <p className="font-bold text-primary flex items-center gap-1.5 uppercase tracking-tight text-xs">
                                  <Clock className="w-3 h-3" /> {session.scheduledTime}
                                </p>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {session.substanceApplications?.slice(0, 4).map((app, i) => (
                                    <Badge key={i} variant="secondary" className="rounded-[4px] bg-muted/50 border-none text-[9px] py-0.5 px-1.5 font-extrabold uppercase tracking-wider text-muted-foreground shadow-sm">
                                      <div className="w-1.5 h-1.5 rounded-[2px] mr-1 shadow-sm" style={{ backgroundColor: app.substanceColor }} />
                                      {app.substanceName}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            </div>
                            <Badge
                              variant="outline"
                              className={`rounded-[4px] border-none px-2 py-1 text-[9px] font-extrabold uppercase tracking-widest shadow-sm ${getStatusColor(session.status)}`}
                            >
                              {formatStatus(session.status)}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
