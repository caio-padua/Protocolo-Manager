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
    query: { enabled: !!id, queryKey: ["protocols", id] }
  });

  const { data: sessions, isLoading: loadingSessions } = useListSessions({ clientId: id }, {
    query: { enabled: !!id, queryKey: ["sessions", id] }
  });

  const { data: payments, isLoading: loadingPayments } = useListPayments({ clientId: id }, {
    query: { enabled: !!id, queryKey: getListPaymentsQueryKey({ clientId: id }) }
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
          <Button className="btn-3d-soft rounded-[4px] h-10 w-10 p-0">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 panel-3d-sub flex items-center justify-center font-black text-2xl text-primary border-none">
              {client.name.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-primary uppercase">{client.name}</h1>
              <div className="flex items-center gap-3 mt-1">
                <div className="concave-3d px-2 py-0.5 text-[10px] font-bold tabular-nums">
                  CPF: {client.cpf}
                </div>
                <Badge variant="outline" className={`rounded-[4px] border-none px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-widest shadow-sm ${getStatusColor(client.status)}`}>
                  {formatStatus(client.status)}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={`/clients/${client.id}/edit`}>
              <Button className="btn-3d-soft">
                <Pencil className="w-4 h-4 mr-2" /> EDITAR
              </Button>
            </Link>
            <Button
              className="btn-3d-soft"
              onClick={() => driveSetup.mutate()}
              disabled={driveSetup.isPending}
            >
              {driveSetup.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FolderOpen className="w-4 h-4 mr-2" />}
              DRIVE
            </Button>
            <Link href={`/protocols/new?clientId=${client.id}`}>
              <Button className="btn-3d"><Activity className="w-4 h-4 mr-2" /> NOVO PROTOCOLO</Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Sidebar Info */}
        <div className="space-y-8">
          <Card className="panel-3d border-none relative overflow-visible">
            <div className="bevel-3d px-3 py-1.5 uppercase tracking-widest text-[10px] font-extrabold inline-flex items-center gap-2 absolute -top-3 left-4">
              <User className="h-3 w-3 text-primary" /> Informações
            </div>
            <CardContent className="pt-8 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Phone className="w-3 h-3 text-primary" /> Celular
                </span>
                <span className="font-bold tabular-nums text-sm">{client.phone}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Mail className="w-3 h-3 text-primary" /> Email
                </span>
                <span className="font-bold text-sm lowercase truncate max-w-[150px]">{client.email}</span>
              </div>
              {client.birthDate && (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Calendar className="w-3 h-3 text-primary" /> Nascimento
                  </span>
                  <span className="font-bold tabular-nums text-sm">{format(new Date(client.birthDate), "dd/MM/yyyy")}</span>
                </div>
              )}
              {client.address && (
                <div className="pt-2 border-t mt-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-2">
                    <MapPin className="w-3 h-3 text-primary" /> Endereço
                  </span>
                  <p className="text-xs font-semibold leading-relaxed text-foreground/80 bg-muted/20 p-2 rounded-[4px] border border-dashed">
                    {client.address}
                  </p>
                </div>
              )}
              
              {client.notes && (
                <div className="pt-4 border-t mt-4">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-2">
                    <FileText className="w-3 h-3 text-primary" /> Observações Clínicas
                  </span>
                  <div className="concave-3d p-3 text-xs font-medium leading-relaxed whitespace-pre-wrap">
                    {client.notes}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="panel-3d border-none relative overflow-visible">
            <div className="bevel-3d px-3 py-1.5 uppercase tracking-widest text-[10px] font-extrabold inline-flex items-center gap-2 absolute -top-3 left-4">
              <DollarSign className="h-3 w-3 text-primary" /> Resumo Financeiro
            </div>
            <CardContent className="pt-8">
              {loadingPayments ? (
                <Skeleton className="h-20" />
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Total Pago</span>
                    <div className="screen-3d px-3 py-1 font-black text-emerald-600 tabular-nums">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                        payments?.filter(p => p.status === 'paid').reduce((acc, p) => acc + p.amount, 0) || 0
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Pendente</span>
                    <div className="concave-3d px-3 py-1 font-black text-amber-600 tabular-nums">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                        payments?.filter(p => p.status === 'pending' || p.status === 'overdue').reduce((acc, p) => acc + p.amount, 0) || 0
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <div className="md:col-span-2">
          <Tabs defaultValue="protocols" className="w-full">
            <TabsList className="w-full justify-start border-none rounded-none h-auto p-0 bg-transparent mb-8 flex gap-3">
              <TabsTrigger value="protocols" className="bevel-3d rounded-none data-[state=active]:panel-3d-active data-[state=active]:text-primary px-6 py-2.5 text-[10px] font-black uppercase tracking-widest shadow-none">Protocolos</TabsTrigger>
              <TabsTrigger value="sessions" className="bevel-3d rounded-none data-[state=active]:panel-3d-active data-[state=active]:text-primary px-6 py-2.5 text-[10px] font-black uppercase tracking-widest shadow-none">Sessões</TabsTrigger>
              <TabsTrigger value="financial" className="bevel-3d rounded-none data-[state=active]:panel-3d-active data-[state=active]:text-primary px-6 py-2.5 text-[10px] font-black uppercase tracking-widest shadow-none">Financeiro</TabsTrigger>
            </TabsList>
            
            <TabsContent value="protocols" className="space-y-6 focus:outline-none">
              {loadingProtocols ? (
                [...Array(2)].map((_, i) => <Skeleton key={i} className="h-32 rounded-lg panel-3d-sub" />)
              ) : protocols?.length === 0 ? (
                <div className="text-center py-16 panel-3d border-none bg-white/50">
                  <Activity className="mx-auto h-12 w-12 text-muted-foreground opacity-20 mb-4" />
                  <p className="text-muted-foreground uppercase font-bold text-sm tracking-widest">Nenhum protocolo cadastrado.</p>
                  <Link href={`/protocols/new?clientId=${client.id}`}>
                    <Button className="btn-3d mt-6">CRIAR PROTOCOLO</Button>
                  </Link>
                </div>
              ) : (
                protocols?.map(protocol => (
                  <Link key={protocol.id} href={`/protocols/${protocol.id}`}>
                    <Card className="panel-3d-sub hover:panel-3d-active neon-hover cursor-pointer transition-all duration-300 border-none group">
                      <CardContent className="p-5">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="text-lg font-black text-primary uppercase tracking-tight group-hover:text-primary transition-colors">{protocol.title}</h3>
                            <div className="flex items-center gap-2 mt-1">
                              <Calendar className="w-3 h-3 text-muted-foreground" />
                              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                Início: {format(new Date(protocol.startDate), "dd/MM/yyyy")}
                              </span>
                            </div>
                          </div>
                          <Badge variant="outline" className={`rounded-[4px] border-none px-2 py-1 text-[9px] font-extrabold uppercase tracking-widest shadow-sm ${getStatusColor(protocol.status)}`}>
                            {formatStatus(protocol.status)}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-6 mt-6">
                          <div className="flex flex-col gap-1">
                            <span className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">Sessões</span>
                            <div className="screen-3d px-3 py-1 font-black tabular-nums text-sm text-center min-w-[80px]">
                              {protocol.completedSessions} <span className="text-muted-foreground/40 font-normal mx-1">/</span> {protocol.totalSessions}
                            </div>
                          </div>
                          <div className="h-10 w-px bg-border/40"></div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">Fórmulas</span>
                            <div className="flex -space-x-1.5 mt-1 pt-1.5">
                              {protocol.items.map((item, i) => (
                                <div 
                                  key={i}
                                  className="w-5 h-5 rounded-[3px] border-2 border-white shadow-sm ring-1 ring-black/5"
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

            <TabsContent value="sessions" className="space-y-6 focus:outline-none">
              {loadingSessions ? (
                <Skeleton className="h-64 rounded-lg panel-3d-sub" />
              ) : sessions?.length === 0 ? (
                <div className="text-center py-16 panel-3d border-none bg-white/50">
                  <Clock className="mx-auto h-12 w-12 text-muted-foreground opacity-20 mb-4" />
                  <p className="text-muted-foreground uppercase font-bold text-sm tracking-widest">Nenhuma sessão registrada.</p>
                </div>
              ) : (
                <div className="panel-3d border-none overflow-hidden">
                  <div className="divide-y divide-border/40">
                    {sessions?.map(session => (
                      <div key={session.id} className="p-5 flex items-center justify-between hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-6">
                          <div className="concave-3d flex flex-col items-center justify-center w-16 h-16 shrink-0 shadow-sm border-none">
                            <div className="text-[10px] uppercase font-black text-muted-foreground/60 leading-none mb-1">
                              {format(new Date(session.scheduledDate), "MMM", { locale: ptBR })}
                            </div>
                            <div className="text-xl font-black text-primary leading-none tabular-nums">
                              {format(new Date(session.scheduledDate), "dd")}
                            </div>
                          </div>
                          <div>
                            <p className="font-bold text-primary flex items-center gap-2 uppercase tracking-tight">
                              <Clock className="w-3.5 h-3.5 text-primary" />
                              {session.scheduledTime}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                              {session.substanceApplications?.map((app, i) => (
                                <Badge key={i} variant="secondary" className="rounded-[4px] bg-muted/50 border-none text-[9px] py-0.5 px-2 font-extrabold uppercase tracking-wider text-muted-foreground shadow-sm">
                                  <div 
                                    className="w-1.5 h-1.5 rounded-[2px] mr-1.5 shadow-sm"
                                    style={{ backgroundColor: app.substanceColor }}
                                  />
                                  {app.substanceName}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                        <Badge variant="outline" className={`rounded-[4px] border-none px-2 py-1 text-[9px] font-extrabold uppercase tracking-widest shadow-sm ${getStatusColor(session.status)}`}>
                          {formatStatus(session.status)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="financial" className="space-y-6 focus:outline-none">
              <div className="flex items-center justify-between mb-2">
                <div className="bevel-3d px-3 py-1.5 uppercase tracking-widest text-[10px] font-extrabold inline-flex items-center gap-2">
                  <DollarSign className="h-3 w-3 text-primary" /> Lançamentos Financeiros
                </div>
                <Button className="btn-3d h-8 text-[10px] font-black" onClick={() => setShowPaymentForm(!showPaymentForm)}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" /> NOVO PAGAMENTO
                </Button>
              </div>

              {showPaymentForm && (
                <Card className="panel-3d border-primary/30 animate-in zoom-in-95 duration-200">
                  <CardContent className="p-6 space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                      <div className="space-y-1.5">
                        <label className="text-[9px] uppercase tracking-[0.2em] font-black text-muted-foreground">Modalidade</label>
                        <div className="concave-3d p-0.5">
                          <Select value={payMethod} onValueChange={setPayMethod}>
                            <SelectTrigger className="border-none bg-transparent shadow-none focus:ring-0 h-9 text-sm font-bold"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pix">PIX</SelectItem>
                              <SelectItem value="credit">Credito</SelectItem>
                              <SelectItem value="debit">Debito</SelectItem>
                              <SelectItem value="boleto">Boleto</SelectItem>
                              <SelectItem value="cash">Dinheiro</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] uppercase tracking-[0.2em] font-black text-muted-foreground">Valor (R$)</label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0,00"
                          className="field-engraved h-10 text-sm font-bold"
                          value={payAmount}
                          onChange={e => setPayAmount(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] uppercase tracking-[0.2em] font-black text-muted-foreground">Data</label>
                        <Input type="date" className="field-engraved h-10 text-sm font-bold" value={payDate} onChange={e => setPayDate(e.target.value)} />
                      </div>
                      {payMethod === "credit" && (
                        <div className="space-y-1.5">
                          <label className="text-[9px] uppercase tracking-[0.2em] font-black text-muted-foreground">Parcelas</label>
                          <div className="concave-3d p-0.5">
                            <Select value={payInstallments} onValueChange={setPayInstallments}>
                              <SelectTrigger className="border-none bg-transparent shadow-none focus:ring-0 h-9 text-sm font-bold"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => (
                                  <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {payMethod === "credit" && (
                        <div className="space-y-1.5">
                          <label className="text-[9px] uppercase tracking-[0.2em] font-black text-muted-foreground">Cartão (identificacao)</label>
                          <Input
                            placeholder="Ex: Nubank, Itau Mastercard..."
                            className="field-engraved h-10 text-sm font-bold"
                            value={payCardLabel}
                            onChange={e => setPayCardLabel(e.target.value)}
                          />
                        </div>
                      )}
                      <div className="space-y-1.5 flex-1">
                        <label className="text-[9px] uppercase tracking-[0.2em] font-black text-muted-foreground">Descrição</label>
                        <Input
                          placeholder="Opcional - ex: Parcela 1/3, PIX ref..."
                          className="field-engraved h-10 text-sm font-bold"
                          value={payDescription}
                          onChange={e => setPayDescription(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                      <Button className="btn-3d-soft" onClick={() => setShowPaymentForm(false)}>CANCELAR</Button>
                      <Button
                        className="btn-3d px-6"
                        onClick={() => createPayment.mutate()}
                        disabled={!payAmount || createPayment.isPending}
                      >
                        {createPayment.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <DollarSign className="w-4 h-4 mr-2" />}
                        REGISTRAR PAGAMENTO
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {loadingPayments ? (
                <Skeleton className="h-64 rounded-lg panel-3d-sub" />
              ) : payments?.length === 0 ? (
                <div className="text-center py-16 panel-3d border-none bg-white/50">
                  <CreditCard className="mx-auto h-12 w-12 text-muted-foreground opacity-20 mb-4" />
                  <p className="text-muted-foreground uppercase font-bold text-sm tracking-widest">Nenhum registro financeiro.</p>
                </div>
              ) : (
                <div className="panel-3d border-none overflow-hidden">
                  <div className="divide-y divide-border/40">
                    {payments?.map(payment => {
                      const methodIcon = {
                        pix: <QrCode className="w-4 h-4" />,
                        credit: <CreditCard className="w-4 h-4" />,
                        debit: <CreditCard className="w-4 h-4" />,
                        boleto: <Receipt className="w-4 h-4" />,
                        cash: <Banknote className="w-4 h-4" />,
                        credit_card: <CreditCard className="w-4 h-4" />,
                        debit_card: <CreditCard className="w-4 h-4" />,
                        transfer: <Banknote className="w-4 h-4" />,
                        insurance: <DollarSign className="w-4 h-4" />,
                      }[payment.method as string] || <DollarSign className="w-4 h-4" />;

                      const methodLabel = {
                        pix: "PIX",
                        credit: "CREDITO",
                        debit: "DEBITO",
                        boleto: "BOLETO",
                        cash: "DINHEIRO",
                        credit_card: "CARTÃO CRÉDITO",
                        debit_card: "CARTÃO DÉBITO",
                        transfer: "TRANSFERÊNCIA",
                        insurance: "CONVÊNIO",
                      }[payment.method as string] || (payment.method as string).toUpperCase();

                      return (
                        <div key={payment.id} className="p-5 flex items-center justify-between hover:bg-muted/30 transition-colors">
                          <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 panel-3d-sub flex items-center justify-center border-none shadow-sm ${payment.status === 'paid' ? 'text-emerald-600' : 'text-amber-600'}`}>
                              {methodIcon}
                            </div>
                            <div>
                              <p className="font-black text-primary flex items-center gap-2 uppercase tracking-tight text-sm">
                                {methodLabel}
                                {(payment as any).installments && (
                                  <span className="concave-3d px-1.5 py-0.5 text-[10px] lowercase text-muted-foreground">{(payment as any).installments}x</span>
                                )}
                                {(payment as any).cardLabel && (
                                  <span className="text-[10px] font-bold text-muted-foreground/60">({(payment as any).cardLabel})</span>
                                )}
                              </p>
                              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">
                                {payment.paidAt ? format(new Date(payment.paidAt), "dd/MM/yyyy") : payment.dueDate ? `Venc: ${format(new Date(payment.dueDate), "dd/MM/yyyy")}` : "-"}
                                {payment.description && <span className="mx-2 opacity-30">|</span>}
                                {payment.description}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="screen-3d px-3 py-1 font-black text-primary tabular-nums">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(payment.amount)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}