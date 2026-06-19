import { useListPayments, useUpdatePayment } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CreditCard, CheckCircle2, Clock, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  pending: "text-amber-700",
  paid: "text-green-700",
  overdue: "text-red-700",
  cancelled: "text-muted-foreground",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "PENDENTE",
  paid: "PAGO",
  overdue: "VENCIDO",
  cancelled: "CANCELADO",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pix: "PIX",
  credit_card: "CARTÃO CRÉDITO",
  debit_card: "CARTÃO DÉBITO",
  cash: "DINHEIRO",
  bank_transfer: "TRANSFERÊNCIA",
};

export default function Payments() {
  const { data: payments, isLoading, refetch } = useListPayments();
  const { toast } = useToast();

  const updateMutation = useUpdatePayment({
    mutation: {
      onSuccess: () => {
        toast({ title: "Pagamento atualizado!" });
        refetch();
      },
      onError: () => {
        toast({ title: "Erro ao atualizar pagamento", variant: "destructive" });
      }
    }
  });

  const totalPaid = payments?.filter(p => p.status === "paid").reduce((sum, p) => sum + p.amount, 0) ?? 0;
  const totalPending = payments?.filter(p => p.status === "pending").reduce((sum, p) => sum + p.amount, 0) ?? 0;
  const totalOverdue = payments?.filter(p => p.status === "overdue").reduce((sum, p) => sum + p.amount, 0) ?? 0;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-black tracking-tight uppercase">Financeiro</h1>
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">
          Controle financeiro por protocolo.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="panel-3d border-l-4 border-green-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Recebido</span>
            </div>
            <div className="screen-3d px-3 py-2 text-xl font-black text-green-600 tabular-nums">
              R$ {totalPaid.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
        <Card className="panel-3d border-l-4 border-amber-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-amber-500" />
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Pendente</span>
            </div>
            <div className="screen-3d px-3 py-2 text-xl font-black text-amber-600 tabular-nums">
              R$ {totalPending.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
        <Card className="panel-3d border-l-4 border-red-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <XCircle className="h-4 w-4 text-red-500" />
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Vencido</span>
            </div>
            <div className="screen-3d px-3 py-2 text-xl font-black text-red-600 tabular-nums">
              R$ {totalOverdue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 panel-3d-sub" />)}
        </div>
      ) : !payments?.length ? (
        <Card className="panel-3d">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="concave-3d p-6 mb-4">
              <CreditCard className="h-10 w-10 text-muted-foreground opacity-30" />
            </div>
            <p className="text-base font-black uppercase tracking-tight text-primary">Nenhum pagamento registrado</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="panel-3d">
          <CardHeader>
            <CardTitle className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
              Histórico de Pagamentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {payments.map(payment => (
                <div key={payment.id} className="flex items-center gap-4 p-3 panel-3d-sub neon-hover transition-all">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap mb-1">
                      <span className="font-black uppercase tracking-tight text-foreground text-sm">{payment.clientName}</span>
                      <span className={`concave-3d px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${PAYMENT_STATUS_COLORS[payment.status] ?? ""}`}>
                        {PAYMENT_STATUS_LABELS[payment.status] ?? payment.status}
                      </span>
                    </div>
                    <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{payment.protocolTitle}</div>
                    <div className="flex items-center gap-4 text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-1 flex-wrap">
                      {payment.dueDate && (
                        <span>Venc: {format(new Date(payment.dueDate), "dd/MM/yyyy", { locale: ptBR })}</span>
                      )}
                      {payment.paidAt && (
                        <span>Pago: {format(new Date(payment.paidAt), "dd/MM/yyyy", { locale: ptBR })}</span>
                      )}
                      {payment.method && (
                        <span>{PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}</span>
                      )}
                      {payment.installments && payment.installments > 1 && (
                        <span>{payment.installments}x</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="screen-3d px-3 py-1 font-black text-primary tabular-nums text-sm">
                      R$ {payment.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </div>
                    {payment.status === "pending" && (
                      <Button
                        size="sm"
                        className="btn-3d-soft"
                        disabled={updateMutation.isPending}
                        onClick={() => updateMutation.mutate({ id: payment.id, data: { status: "paid", paidAt: new Date().toISOString() } as any })}
                      >
                        Marcar Pago
                      </Button>
                    )}
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
