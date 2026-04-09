import { useRoute, Link } from "wouter";
import { useGetClient, getGetClientQueryKey, useListProtocols, useListSessions, useListPayments, getListPaymentsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, User, Phone, Mail, MapPin, Calendar, Activity, CreditCard, Clock, FileText, CheckCircle2, FolderOpen, Loader2, Pencil, Plus, DollarSign, Banknote, QrCode, Receipt } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatStatus, getStatusColor } from "@/lib/status";
import { useState } from "react";

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

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const apiBase = import.meta.env.VITE_API_URL || "/api";

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [payMethod, setPayMethod] = useState("pix");
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payInstallments, setPayInstallments] = useState("1");
  const [payCardLabel, setPayCardLabel] = useState("");
  const [payDescription, setPayDescription] = useState("");

  const createPayment = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${apiBase}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: id,
          amount: parseFloat(payAmount),
          method: payMethod,
          status: "paid",
          paidAt: payDate,
          description: payDescription || `${payMethod.toUpperCase()} - ${payDate}`,
          installments: payMethod === "credit" ? parseInt(payInstallments) : null,
          cardLabel: payMethod === "credit" ? payCardLabel : null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Pagamento registrado!" });
      queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey({ clientId: id }) });
      setShowPaymentForm(false);
      setPayAmount("");
      setPayDescription("");
      setPayCardLabel("");
      setPayInstallments("1");
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const driveSetup = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${apiBase}/google-drive/setup-client/${id}`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Google Drive", description: data.message || "Pastas criadas com sucesso!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
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
            <Link href={`/clients/${client.id}/edit`}>
              <Button variant="outline">
                <Pencil className="w-4 h-4 mr-2" /> Editar
              </Button>
            </Link>
            <Button
              variant="outline"
              onClick={() => driveSetup.mutate()}
              disabled={driveSetup.isPending}
            >
              {driveSetup.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FolderOpen className="w-4 h-4 mr-2" />}
              Google Drive
            </Button>
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
              <div className="flex items-center justify-between">
                <h3 className="font-semibold uppercase tracking-wider text-sm">Lancamentos</h3>
                <Button size="sm" onClick={() => setShowPaymentForm(!showPaymentForm)}>
                  <Plus className="w-4 h-4 mr-1" /> Novo Pagamento
                </Button>
              </div>

              {showPaymentForm && (
                <Card className="border-primary/30">
                  <CardContent className="p-4 space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <label className="text-xs uppercase tracking-wider font-medium mb-1 block">Modalidade</label>
                        <Select value={payMethod} onValueChange={setPayMethod}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pix">PIX</SelectItem>
                            <SelectItem value="credit">Credito</SelectItem>
                            <SelectItem value="debit">Debito</SelectItem>
                            <SelectItem value="boleto">Boleto</SelectItem>
                            <SelectItem value="cash">Dinheiro</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs uppercase tracking-wider font-medium mb-1 block">Valor (R$)</label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0,00"
                          value={payAmount}
                          onChange={e => setPayAmount(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-xs uppercase tracking-wider font-medium mb-1 block">Data</label>
                        <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
                      </div>
                      {payMethod === "credit" && (
                        <div>
                          <label className="text-xs uppercase tracking-wider font-medium mb-1 block">Parcelas</label>
                          <Select value={payInstallments} onValueChange={setPayInstallments}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => (
                                <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                    {payMethod === "credit" && (
                      <div>
                        <label className="text-xs uppercase tracking-wider font-medium mb-1 block">Cartao (identificacao)</label>
                        <Input
                          placeholder="Ex: Nubank, Itau Mastercard..."
                          value={payCardLabel}
                          onChange={e => setPayCardLabel(e.target.value)}
                        />
                      </div>
                    )}
                    <div>
                      <label className="text-xs uppercase tracking-wider font-medium mb-1 block">Descricao</label>
                      <Input
                        placeholder="Opcional - ex: Parcela 1/3, PIX ref..."
                        value={payDescription}
                        onChange={e => setPayDescription(e.target.value)}
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setShowPaymentForm(false)}>Cancelar</Button>
                      <Button
                        size="sm"
                        onClick={() => createPayment.mutate()}
                        disabled={!payAmount || createPayment.isPending}
                      >
                        {createPayment.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <DollarSign className="w-4 h-4 mr-1" />}
                        Registrar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

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
                      {payments?.map(payment => {
                        const methodIcon = {
                          pix: <QrCode className="w-4 h-4" />,
                          credit: <CreditCard className="w-4 h-4" />,
                          debit: <CreditCard className="w-4 h-4" />,
                          boleto: <Receipt className="w-4 h-4" />,
                          cash: <Banknote className="w-4 h-4" />,
                        }[payment.method] || <DollarSign className="w-4 h-4" />;

                        const methodLabel = {
                          pix: "PIX",
                          credit: "CREDITO",
                          debit: "DEBITO",
                          boleto: "BOLETO",
                          cash: "DINHEIRO",
                        }[payment.method] || payment.method.toUpperCase();

                        return (
                          <div key={payment.id} className="p-4 flex items-center justify-between hover:bg-muted/30">
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-full ${payment.status === 'paid' ? 'bg-green-100 text-green-600 dark:bg-green-900/30' : 'bg-amber-100 text-amber-600 dark:bg-amber-900/30'}`}>
                                {methodIcon}
                              </div>
                              <div>
                                <p className="font-medium text-sm flex items-center gap-2">
                                  {methodLabel}
                                  {(payment as any).installments && (
                                    <span className="text-xs text-muted-foreground">{(payment as any).installments}x</span>
                                  )}
                                  {(payment as any).cardLabel && (
                                    <span className="text-xs text-muted-foreground">({(payment as any).cardLabel})</span>
                                  )}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {payment.paidAt ? format(new Date(payment.paidAt), "dd/MM/yyyy") : payment.dueDate ? `Venc: ${format(new Date(payment.dueDate), "dd/MM/yyyy")}` : "-"}
                                  {payment.description && ` · ${payment.description}`}
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
                        );
                      })}
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