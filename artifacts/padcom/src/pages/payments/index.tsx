import { useListPayments, useUpdatePayment } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CreditCard, CheckCircle2, Clock, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
  paid: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800",
  overdue: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
  cancelled: "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  paid: "Pago",
  overdue: "Vencido",
  cancelled: "Cancelado",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pix: "Pix",
  credit_card: "Cartão de Crédito",
  debit_card: "Cartão de Débito",
  cash: "Dinheiro",
  bank_transfer: "Transferência",
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
        <h1 className="text-3xl font-bold tracking-tight">Pagamentos</h1>
        <p className="text-muted-foreground">Controle financeiro por protocolo.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Recebido</span>
            </div>
            <p className="text-2xl font-bold text-green-600">R$ {totalPaid.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-amber-500" />
              <span className="text-sm text-muted-foreground">Pendente</span>
            </div>
            <p className="text-2xl font-bold text-amber-600">R$ {totalPending.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <XCircle className="h-4 w-4 text-red-500" />
              <span className="text-sm text-muted-foreground">Vencido</span>
            </div>
            <p className="text-2xl font-bold text-red-600">R$ {totalOverdue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : !payments?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <CreditCard className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Nenhum pagamento registrado</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader><CardTitle>Histórico de Pagamentos</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {payments.map(payment => (
                <div key={payment.id} className="flex items-center gap-4 p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium">{payment.clientName}</span>
                      <Badge className={`text-xs border ${PAYMENT_STATUS_COLORS[payment.status] ?? ""}`}>
                        {PAYMENT_STATUS_LABELS[payment.status] ?? payment.status}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">{payment.protocolTitle}</div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                      {payment.dueDate && (
                        <span>Vencimento: {format(new Date(payment.dueDate), "dd/MM/yyyy", { locale: ptBR })}</span>
                      )}
                      {payment.paidAt && (
                        <span>Pago em: {format(new Date(payment.paidAt), "dd/MM/yyyy", { locale: ptBR })}</span>
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
                    <span className="text-lg font-bold">R$ {payment.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                    {payment.status === "pending" && (
                      <Button
                        size="sm"
                        variant="outline"
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
