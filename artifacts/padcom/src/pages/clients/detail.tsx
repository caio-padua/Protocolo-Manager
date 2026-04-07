import { useRoute, Link } from "wouter";
import { useGetClient, getGetClientQueryKey, useListProtocols, useListSessions, useListPayments } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, User, Phone, Mail, MapPin, Calendar, Activity, CreditCard, Clock, FileText, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatStatus, getStatusColor } from "@/lib/status";

export default function ClientDetail() {
  const [, params] = useRoute("/clients/:id");
  const id = parseInt(params?.id || "0", 10);

  const { data: client, isLoading: loadingClient } = useGetClient(id, { 
    query: { enabled: !!id, queryKey: getGetClientQueryKey(id) } 
  });
  
  const { data: protocols, isLoading: loadingProtocols } = useListProtocols({ clientId: id }, {
    query: { enabled: !!id }
  });

  const { data: sessions, isLoading: loadingSessions } = useListSessions({ clientId: id }, {
    query: { enabled: !!id }
  });

  const { data: payments, isLoading: loadingPayments } = useListPayments({ clientId: id }, {
    query: { enabled: !!id }
  });

  if (loadingClient) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 md:col-span-2 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!client) {
    return <div>Cliente não encontrado.</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-4">
        <Link href="/clients">
          <Button variant="outline" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xl">
              {client.name.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{client.name}</h1>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
                <span>CPF: {client.cpf}</span>
                <span>•</span>
                <Badge variant="outline" className={getStatusColor(client.status)}>
                  {formatStatus(client.status)}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href={`/protocols/new?clientId=${client.id}`}>
              <Button><Activity className="w-4 h-4 mr-2" /> Novo Protocolo</Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Sidebar Info */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Informações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 text-sm">
                <Phone className="w-4 h-4 text-muted-foreground" />
                <span>{client.phone}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <span className="break-all">{client.email}</span>
              </div>
              {client.birthDate && (
                <div className="flex items-center gap-3 text-sm">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span>{format(new Date(client.birthDate), "dd/MM/yyyy")}</span>
                </div>
              )}
              {client.address && (
                <div className="flex items-center gap-3 text-sm">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  <span>{client.address}</span>
                </div>
              )}
              
              {client.notes && (
                <div className="pt-4 border-t mt-4">
                  <h4 className="font-medium text-sm mb-2">Observações Clínicas</h4>
                  <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md whitespace-pre-wrap">
                    {client.notes}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Resumo Financeiro</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingPayments ? (
                <Skeleton className="h-20" />
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-sm text-muted-foreground">Total Pago</span>
                    <span className="font-medium text-green-600">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                        payments?.filter(p => p.status === 'paid').reduce((acc, p) => acc + p.amount, 0) || 0
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Pendente</span>
                    <span className="font-medium text-amber-600">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                        payments?.filter(p => p.status === 'pending' || p.status === 'overdue').reduce((acc, p) => acc + p.amount, 0) || 0
                      )}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <div className="md:col-span-2">
          <Tabs defaultValue="protocols">
            <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent mb-6">
              <TabsTrigger value="protocols" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none py-3">Protocolos</TabsTrigger>
              <TabsTrigger value="sessions" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none py-3">Histórico de Sessões</TabsTrigger>
              <TabsTrigger value="financial" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none py-3">Financeiro</TabsTrigger>
            </TabsList>
            
            <TabsContent value="protocols" className="space-y-4">
              {loadingProtocols ? (
                [...Array(2)].map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)
              ) : protocols?.length === 0 ? (
                <div className="text-center py-12 border border-dashed rounded-lg">
                  <Activity className="mx-auto h-8 w-8 text-muted-foreground opacity-20 mb-3" />
                  <p className="text-muted-foreground">Nenhum protocolo cadastrado.</p>
                  <Link href={`/protocols/new?clientId=${client.id}`}>
                    <Button variant="outline" className="mt-4">Criar Protocolo</Button>
                  </Link>
                </div>
              ) : (
                protocols?.map(protocol => (
                  <Link key={protocol.id} href={`/protocols/${protocol.id}`}>
                    <Card className="hover-elevate cursor-pointer transition-colors hover:bg-muted/50">
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <CardTitle className="text-lg">{protocol.title}</CardTitle>
                            <CardDescription>
                              Início: {format(new Date(protocol.startDate), "dd/MM/yyyy")}
                            </CardDescription>
                          </div>
                          <Badge variant="outline" className={getStatusColor(protocol.status)}>
                            {formatStatus(protocol.status)}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-4 text-sm mt-2">
                          <div className="flex flex-col">
                            <span className="text-muted-foreground text-xs">Sessões</span>
                            <span className="font-medium">{protocol.completedSessions}/{protocol.totalSessions}</span>
                          </div>
                          <div className="h-8 w-px bg-border"></div>
                          <div className="flex flex-col">
                            <span className="text-muted-foreground text-xs">Substâncias</span>
                            <div className="flex -space-x-1 mt-1">
                              {protocol.items.map((item, i) => (
                                <div 
                                  key={i}
                                  className="w-4 h-4 rounded-full border-2 border-background"
                                  style={{ backgroundColor: item.substanceColor }}
                                  title={item.substanceName}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))
              )}
            </TabsContent>

            <TabsContent value="sessions" className="space-y-4">
              {loadingSessions ? (
                <Skeleton className="h-64 rounded-xl" />
              ) : sessions?.length === 0 ? (
                <div className="text-center py-12 border border-dashed rounded-lg text-muted-foreground">
                  Nenhuma sessão registrada.
                </div>
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <div className="divide-y">
                      {sessions?.map(session => (
                        <div key={session.id} className="p-4 flex items-center justify-between hover:bg-muted/30">
                          <div className="flex items-center gap-4">
                            <div className="bg-muted rounded p-2 text-center w-14">
                              <div className="text-xs uppercase text-muted-foreground">
                                {format(new Date(session.scheduledDate), "MMM", { locale: ptBR })}
                              </div>
                              <div className="font-bold">
                                {format(new Date(session.scheduledDate), "dd")}
                              </div>
                            </div>
                            <div>
                              <p className="font-medium text-sm flex items-center gap-2">
                                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                                {session.scheduledTime}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                {session.substanceApplications?.map((app, i) => (
                                  <Badge key={i} variant="secondary" className="text-[10px] py-0 px-1.5 h-5 font-normal">
                                    <div 
                                      className="w-1.5 h-1.5 rounded-full mr-1"
                                      style={{ backgroundColor: app.substanceColor }}
                                    />
                                    {app.substanceName}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                          <Badge variant="outline" className={getStatusColor(session.status)}>
                            {formatStatus(session.status)}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="financial" className="space-y-4">
              {loadingPayments ? (
                <Skeleton className="h-64 rounded-xl" />
              ) : payments?.length === 0 ? (
                <div className="text-center py-12 border border-dashed rounded-lg text-muted-foreground">
                  Nenhum registro financeiro.
                </div>
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <div className="divide-y">
                      {payments?.map(payment => (
                        <div key={payment.id} className="p-4 flex items-center justify-between hover:bg-muted/30">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full ${payment.status === 'paid' ? 'bg-green-100 text-green-600 dark:bg-green-900/30' : 'bg-amber-100 text-amber-600 dark:bg-amber-900/30'}`}>
                              <CreditCard className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{payment.description || "Pagamento"}</p>
                              <p className="text-xs text-muted-foreground">
                                Vencimento: {payment.dueDate ? format(new Date(payment.dueDate), "dd/MM/yyyy") : "-"}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(payment.amount)}
                            </p>
                            <Badge variant="outline" className={`text-[10px] ${payment.status === 'paid' ? 'border-green-200 text-green-700' : 'border-amber-200 text-amber-700'}`}>
                              {formatStatus(payment.status)}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}