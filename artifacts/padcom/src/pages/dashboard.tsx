import { useGetDashboardSummary, useGetUpcomingSessions, useGetDashboardAlerts, useGetProtocolStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Activity, AlertTriangle, Calendar as CalendarIcon, CheckCircle2, Clock, ClipboardCheck, Info, Loader2, TrendingUp, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { formatStatus, getStatusColor } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type FilaItem = {
  id: number;
  clienteId: number | null;
  status: string;
  createdAt: string;
  clientName: string | null;
  totalItens: number;
  resumo: { escoreTotal?: number; gradeGlobal?: string; exames?: string[]; doencas?: string[] } | null;
};

function FilaValidacao() {
  const qc = useQueryClient();
  const [pendingId, setPendingId] = useState<number | null>(null);
  const { data: fila, isLoading } = useQuery<FilaItem[]>({
    queryKey: ["anamnese-fila"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/anamnese-portal/fila`);
      if (!res.ok) throw new Error("Erro ao carregar fila");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const decidir = useMutation({
    mutationFn: async ({ id, decisao }: { id: number; decisao: "validado" | "recusado" }) => {
      setPendingId(id);
      const res = await fetch(`${API_BASE}/api/anamnese-portal/sugestao/${id}/decidir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisao }),
      });
      if (!res.ok) throw new Error("Erro ao decidir");
      return res.json();
    },
    onSettled: () => {
      setPendingId(null);
      qc.invalidateQueries({ queryKey: ["anamnese-fila"] });
    },
  });

  return (
    <Card className="panel-3d overflow-hidden">
      <div className="flex h-full">
        <div className="w-1 shrink-0" style={{ backgroundColor: "hsl(38, 92%, 50%)" }} />
        <div className="flex-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div className="bevel-3d pw-title-serif px-3 py-1.5 uppercase tracking-wide text-sm font-semibold inline-flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" style={{ color: "hsl(38, 92%, 50%)" }} />
              Fila de Validação — Anamnese
            </div>
            {fila && fila.length > 0 && (
              <div className="concave-3d px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                {fila.length} aguardando
              </div>
            )}
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-16 rounded-[6px]" />)}
              </div>
            ) : !fila || fila.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border border-dashed rounded-[6px] concave-3d">
                <CheckCircle2 className="mx-auto h-8 w-8 mb-2 opacity-20 text-green-500" />
                <p className="text-sm">Nenhuma anamnese aguardando validação.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {fila.map((item) => {
                  const busy = pendingId === item.id && decidir.isPending;
                  return (
                    <div key={item.id} className="panel-3d-sub p-3 flex items-center justify-between gap-3 neon-hover">
                      <div className="min-w-0">
                        <p className="pw-client-name text-base truncate tracking-tight">{item.clientName ?? `Cliente #${item.clienteId ?? "?"}`}</p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground mt-1">
                          <span className="concave-3d px-1.5 py-0.5">{format(new Date(item.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                          {item.resumo?.gradeGlobal && (
                            <>
                              <span className="concave-3d px-1.5 py-0.5 uppercase tracking-wide font-bold">{item.resumo.gradeGlobal}</span>
                            </>
                          )}
                          <span className="concave-3d px-1.5 py-0.5 uppercase tracking-wide">{item.totalItens} exames sugeridos</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <button
                          onClick={() => decidir.mutate({ id: item.id, decisao: "validado" })}
                          disabled={busy}
                          className="btn-3d h-8 px-4 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider disabled:opacity-40"
                        >
                          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                          Validar
                        </button>
                        <button
                          onClick={() => decidir.mutate({ id: item.id, decisao: "recusado" })}
                          disabled={busy}
                          className="btn-3d-soft h-8 px-4 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider disabled:opacity-40"
                        >
                          <X className="h-3.5 w-3.5" /> Recusar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </div>
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary();
  const { data: sessions, isLoading: loadingSessions } = useGetUpcomingSessions();
  const { data: alerts, isLoading: loadingAlerts } = useGetDashboardAlerts();
  const { data: stats, isLoading: loadingStats } = useGetProtocolStats();

  return (
    <div className="pw-home -m-4 md:-m-8 p-4 md:p-8 min-h-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="pw-title-serif text-2xl font-bold tracking-tight">Painel de Controle</h1>
          <p className="text-sm text-muted-foreground">Visao geral operacional — Padcon Conect</p>
        </div>
        <div className="hidden md:flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest border border-border px-3 py-1.5 bevel-3d">
          <CalendarIcon className="w-3.5 h-3.5" />
          {format(new Date(), "dd 'de' MMMM, yyyy", { locale: ptBR })}
        </div>
      </div>

      {loadingSummary ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-[6px]" />
          ))}
        </div>
      ) : summary ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: "Sessoes Hoje",
              value: summary.sessionsTodayCount,
              sub: `${summary.sessionsThisWeekCount} esta semana`,
              icon: CalendarIcon,
              color: "hsl(39, 41%, 51%)",
            },
            {
              label: "Protocolos Ativos",
              value: summary.activeProtocols,
              sub: `${summary.totalClients} clientes no total`,
              icon: Activity,
              color: "hsl(214, 54%, 19%)",
            },
            {
              label: "Receita do Mes",
              value: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(summary.revenueThisMonth),
              sub: `${summary.pendingPaymentsCount} pagamentos pendentes`,
              icon: TrendingUp,
              color: "hsl(39, 46%, 41%)",
            },
            {
              label: "Taxa de Conclusao",
              value: `${summary.completionRate.toFixed(1)}%`,
              sub: `${summary.missedSessionsCount} faltas recentes`,
              icon: CheckCircle2,
              color: summary.completionRate >= 70 ? "hsl(142, 71%, 45%)" : "hsl(0, 72%, 51%)",
            },
          ].map((kpi, i) => (
            <Card key={i} className="panel-3d overflow-hidden flex h-full">
              <div className="w-1 shrink-0" style={{ backgroundColor: kpi.color }} />
              <div className="flex-1">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div className="bevel-3d px-2 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                    {kpi.label}
                  </div>
                  <kpi.icon className="h-4 w-4" style={{ color: kpi.color }} />
                </CardHeader>
                <CardContent>
                  <div className="screen-3d p-3 flex flex-col items-center justify-center">
                    <div className="text-2xl font-black tracking-tight text-primary">{kpi.value}</div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground/70 mt-1">{kpi.sub}</p>
                  </div>
                </CardContent>
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      <FilaValidacao />

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-4 panel-3d">
          <CardHeader>
            <div className="bevel-3d pw-title-serif px-3 py-1.5 uppercase tracking-wide text-sm font-semibold inline-flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" /> Sessões Agendadas
            </div>
          </CardHeader>
          <CardContent>
            {loadingSessions ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-[6px]" />
                ))}
              </div>
            ) : sessions?.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground border border-dashed rounded-[6px] concave-3d">
                <CalendarIcon className="mx-auto h-10 w-10 mb-3 opacity-20" />
                <p>Nenhuma sessão agendada para hoje/amanhã.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {sessions?.map((session) => (
                  <div key={session.id} className="panel-3d-sub flex items-center justify-between p-4 neon-hover">
                    <div className="flex items-center gap-4">
                      <div className="screen-3d flex flex-col items-center justify-center p-2 w-16 h-16">
                        <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">{format(new Date(session.scheduledDate), "MMM", { locale: ptBR })}</span>
                        <span className="text-xl font-black text-primary">{format(new Date(session.scheduledDate), "dd")}</span>
                      </div>
                      <div>
                        <p className="pw-client-name text-base tracking-tight">{session.clientName}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <div className="concave-3d flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{session.scheduledTime}</span>
                          </div>
                          <div className="concave-3d px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-primary/70">
                            {formatStatus(session.serviceType)}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-3">
                      <div className={`concave-3d px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${getStatusColor(session.status)}`}>
                        {formatStatus(session.status)}
                      </div>
                      <div className="flex -space-x-2">
                        {session.substanceApplications?.map((app, i) => (
                          <div 
                            key={i} 
                            className="w-6 h-6 rounded-[3px] border-2 border-background flex items-center justify-center shadow-md scale-110"
                            style={{ backgroundColor: app.substanceColor }}
                            title={app.substanceName}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="lg:col-span-3 space-y-6">
          <Card className="panel-3d">
            <CardHeader>
              <div className="bevel-3d pw-title-serif px-3 py-1.5 uppercase tracking-wide text-sm font-semibold inline-flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> Alertas Operacionais
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingAlerts ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-20 rounded-[6px]" />
                  ))}
                </div>
              ) : alerts?.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground border border-dashed rounded-[6px] concave-3d">
                  <CheckCircle2 className="mx-auto h-8 w-8 mb-2 opacity-20 text-green-500" />
                  <p className="text-sm">Tudo em ordem. Sem alertas no momento.</p>
                </div>
              ) : (
                alerts?.map((alert) => (
                  <div 
                    key={alert.id} 
                    className={`paxter-alert p-4 flex gap-3 ${
                      alert.severity === 'critical' ? 'paxter-alert-red bg-red-500/5' : 
                      alert.severity === 'warning' ? 'paxter-alert-amber bg-amber-500/5' : 
                      'panel-3d-sub bg-blue-500/5'
                    }`}
                  >
                    <div className="shrink-0 mt-0.5">
                      {alert.severity === 'critical' ? <AlertTriangle className="h-4 w-4 text-red-600" /> : 
                       alert.severity === 'warning' ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : 
                       <Info className="h-4 w-4 text-blue-600" />}
                    </div>
                    <div className="space-y-1">
                      <div className="text-[11px] font-black uppercase tracking-widest leading-none mb-1">{alert.title}</div>
                      <div className="text-xs text-muted-foreground font-medium leading-relaxed">{alert.message}</div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="panel-3d">
            <CardHeader>
              <div className="bevel-3d pw-title-serif px-3 py-1.5 uppercase tracking-wide text-sm font-semibold inline-flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> Receita Recente
              </div>
            </CardHeader>
            <CardContent>
              {loadingStats ? (
                <Skeleton className="h-[200px] w-full rounded-[6px]" />
              ) : stats?.revenueByMonth && stats.revenueByMonth.length > 0 ? (
                <div className="h-[200px] screen-3d p-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.revenueByMonth}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis 
                        dataKey="month" 
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fontWeight: 'bold', fill: 'hsl(var(--muted-foreground))' }}
                        dy={10}
                      />
                      <YAxis 
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fontWeight: 'bold', fill: 'hsl(var(--muted-foreground))' }}
                        tickFormatter={(val) => `R$${val/1000}k`}
                      />
                      <Tooltip 
                        cursor={{ fill: 'hsl(var(--muted)/0.3)' }}
                        contentStyle={{ borderRadius: '6px', border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                        labelStyle={{ fontWeight: 'bold', marginBottom: '4px', textTransform: 'uppercase', fontSize: '10px' }}
                        formatter={(val: number) => [new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val), 'Receita']}
                      />
                      <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="text-center py-10 text-muted-foreground border border-dashed rounded-[6px] h-[200px] flex items-center justify-center concave-3d">
                  <p>Dados insuficientes para gráfico</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}