import { useGetDashboardSummary, useGetUpcomingSessions, useGetDashboardAlerts, useGetProtocolStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Activity, AlertTriangle, Calendar as CalendarIcon, CheckCircle2, Clock, CreditCard, Info, TrendingUp, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { formatStatus, getStatusColor } from "@/lib/status";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary();
  const { data: sessions, isLoading: loadingSessions } = useGetUpcomingSessions();
  const { data: alerts, isLoading: loadingAlerts } = useGetDashboardAlerts();
  const { data: stats, isLoading: loadingStats } = useGetProtocolStats();

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">Painel de Controle</h1>
          <p className="text-sm text-muted-foreground">Visao geral operacional — Padcon Conect</p>
        </div>
        <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground border border-border px-3 py-1.5" style={{ borderRadius: '4px' }}>
          <CalendarIcon className="w-3.5 h-3.5" />
          {format(new Date(), "dd 'de' MMMM, yyyy", { locale: ptBR })}
        </div>
      </div>

      {loadingSummary ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
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
              color: "hsl(187, 72%, 48%)",
            },
            {
              label: "Protocolos Ativos",
              value: summary.activeProtocols,
              sub: `${summary.totalClients} clientes no total`,
              icon: Activity,
              color: "hsl(180, 30%, 28%)",
            },
            {
              label: "Receita do Mes",
              value: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(summary.revenueThisMonth),
              sub: `${summary.pendingPaymentsCount} pagamentos pendentes`,
              icon: TrendingUp,
              color: "hsl(38, 92%, 50%)",
            },
            {
              label: "Taxa de Conclusao",
              value: `${summary.completionRate.toFixed(1)}%`,
              sub: `${summary.missedSessionsCount} faltas recentes`,
              icon: CheckCircle2,
              color: summary.completionRate >= 70 ? "hsl(142, 71%, 45%)" : "hsl(0, 72%, 51%)",
            },
          ].map((kpi, i) => (
            <Card key={i} className="overflow-hidden">
              <div className="flex h-full">
                <div className="w-1 shrink-0" style={{ backgroundColor: kpi.color }} />
                <div className="flex-1">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{kpi.label}</CardTitle>
                    <kpi.icon className="h-4 w-4" style={{ color: kpi.color }} />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{kpi.value}</div>
                    <p className="text-xs text-muted-foreground mt-1">{kpi.sub}</p>
                  </CardContent>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Sessões Agendadas</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSessions ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-lg" />
                ))}
              </div>
            ) : sessions?.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground border border-dashed rounded-lg">
                <CalendarIcon className="mx-auto h-10 w-10 mb-3 opacity-20" />
                <p>Nenhuma sessão agendada para hoje/amanhã.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {sessions?.map((session) => (
                  <div key={session.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="flex flex-col items-center justify-center bg-muted/50 rounded-md p-2 w-16 h-16">
                        <span className="text-xs text-muted-foreground uppercase">{format(new Date(session.scheduledDate), "MMM", { locale: ptBR })}</span>
                        <span className="text-lg font-bold">{format(new Date(session.scheduledDate), "dd")}</span>
                      </div>
                      <div>
                        <p className="font-medium">{session.clientName}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{session.scheduledTime}</span>
                          <span className="mx-1">•</span>
                          <span>{formatStatus(session.serviceType)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant="outline" className={getStatusColor(session.status)}>
                        {formatStatus(session.status)}
                      </Badge>
                      <div className="flex -space-x-2">
                        {session.substanceApplications?.map((app, i) => (
                          <div 
                            key={i} 
                            className="w-6 h-6 rounded-full border-2 border-background flex items-center justify-center shadow-sm"
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
          <Card>
            <CardHeader>
              <CardTitle>Alertas Operacionais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingAlerts ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-20 rounded-lg" />
                  ))}
                </div>
              ) : alerts?.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground border border-dashed rounded-lg">
                  <CheckCircle2 className="mx-auto h-8 w-8 mb-2 opacity-20 text-green-500" />
                  <p className="text-sm">Tudo em ordem. Sem alertas no momento.</p>
                </div>
              ) : (
                alerts?.map((alert) => (
                  <Alert 
                    key={alert.id} 
                    variant={alert.severity === 'critical' ? 'destructive' : 'default'}
                    className={
                      alert.severity === 'warning' ? 'border-amber-500/50 text-amber-900 dark:text-amber-400 bg-amber-500/10' :
                      alert.severity === 'info' ? 'border-blue-500/50 text-blue-900 dark:text-blue-400 bg-blue-500/10' : ''
                    }
                  >
                    {alert.severity === 'critical' ? <AlertTriangle className="h-4 w-4" /> : 
                     alert.severity === 'warning' ? <AlertTriangle className="h-4 w-4 text-amber-500" /> : 
                     <Info className="h-4 w-4 text-blue-500" />}
                    <AlertTitle>{alert.title}</AlertTitle>
                    <AlertDescription>{alert.message}</AlertDescription>
                  </Alert>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Receita Recente</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingStats ? (
                <Skeleton className="h-[200px] w-full" />
              ) : stats?.revenueByMonth && stats.revenueByMonth.length > 0 ? (
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.revenueByMonth}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis 
                        dataKey="month" 
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                        dy={10}
                      />
                      <YAxis 
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                        tickFormatter={(val) => `R$${val/1000}k`}
                      />
                      <Tooltip 
                        cursor={{ fill: 'hsl(var(--muted)/0.5)' }}
                        contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                        formatter={(val: number) => [new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val), 'Receita']}
                      />
                      <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="text-center py-10 text-muted-foreground border border-dashed rounded-lg h-[200px] flex items-center justify-center">
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