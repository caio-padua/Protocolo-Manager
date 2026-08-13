import { useFinanceiro } from "../hooks/useFinanceiro";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DollarSign, Zap, Plus, Loader2, CreditCard, QrCode,
  Receipt, Banknote, ExternalLink,
} from "lucide-react";
import { format } from "date-fns";

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const METHOD_ICON: Record<string, React.ReactNode> = {
  pix: <QrCode className="w-4 h-4" />,
  credit: <CreditCard className="w-4 h-4" />,
  debit: <CreditCard className="w-4 h-4" />,
  boleto: <Receipt className="w-4 h-4" />,
  cash: <Banknote className="w-4 h-4" />,
  credit_card: <CreditCard className="w-4 h-4" />,
  debit_card: <CreditCard className="w-4 h-4" />,
  transfer: <Banknote className="w-4 h-4" />,
};

const METHOD_LABEL: Record<string, string> = {
  pix: "PIX", credit: "CRÉDITO", debit: "DÉBITO", boleto: "BOLETO",
  cash: "DINHEIRO", credit_card: "CARTÃO CRÉDITO", debit_card: "CARTÃO DÉBITO",
  transfer: "TRANSFERÊNCIA", insurance: "CONVÊNIO", asaas: "ASAAS (LINK)",
};

interface Props { clientId: number; }

export default function FinanceiroPanel({ clientId }: Props) {
  const fin = useFinanceiro(clientId);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4">
        <div className="panel-3d-sub p-5 border-none text-center">
          <div className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-2">Total Pago</div>
          <div
            className="text-3xl font-black"
            style={{ fontFamily: "'EB Garamond', serif", color: "#16a34a", fontVariantNumeric: "lining-nums tabular-nums" }}
          >
            {brl(fin.totalPago)}
          </div>
        </div>
        <div className="panel-3d-sub p-5 border-none text-center">
          <div className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-2">Pendente</div>
          <div
            className="text-3xl font-black"
            style={{ fontFamily: "'EB Garamond', serif", color: fin.totalPendente > 0 ? "#dc2626" : "#6b7280", fontVariantNumeric: "lining-nums tabular-nums" }}
          >
            {brl(fin.totalPendente)}
          </div>
        </div>
      </div>

      {/* Botões de ação */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="bevel-3d px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-widest inline-flex items-center gap-2 flex-1">
          <DollarSign className="h-3 w-3 text-primary" /> Lançamentos Financeiros
        </div>
        <Button className="btn-3d-soft h-8 text-[10px] font-black" onClick={fin.toggleAsaasForm}>
          <Zap className="w-3.5 h-3.5 mr-1.5 text-primary" /> COBRAR PELO ASAAS
        </Button>
        <Button className="btn-3d h-8 text-[10px] font-black" onClick={fin.togglePaymentForm}>
          <Plus className="w-3.5 h-3.5 mr-1.5" /> NOVO PAGAMENTO
        </Button>
      </div>

      {/* Form Asaas */}
      {fin.showAsaasForm && (
        <Card className="panel-3d border-primary/30 animate-in zoom-in-95 duration-200">
          <CardContent className="p-6 space-y-6">
            <div className="bevel-3d px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-widest inline-flex items-center gap-2">
              <Zap className="h-3 w-3 text-primary" /> Cobrança online (PIX / Boleto / Cartão)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-1.5">
                <label className="text-[9px] uppercase tracking-[0.2em] font-black text-muted-foreground">Valor (R$) — mínimo 5,00</label>
                <Input type="number" step="0.01" min="5" placeholder="0,00" className="field-engraved h-10 text-sm font-bold" value={fin.asaasAmount} onChange={e => fin.setAsaasAmount(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] uppercase tracking-[0.2em] font-black text-muted-foreground">Descrição</label>
                <Input placeholder="Opcional" className="field-engraved h-10 text-sm font-bold" value={fin.asaasDesc} onChange={e => fin.setAsaasDesc(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] uppercase tracking-[0.2em] font-black text-muted-foreground">Vencimento (opcional)</label>
                <Input type="date" className="field-engraved h-10 text-sm font-bold" value={fin.asaasDate} onChange={e => fin.setAsaasDate(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button className="btn-3d-soft" onClick={() => fin.setShowAsaasForm(false)}>CANCELAR</Button>
              <Button
                className="btn-3d px-6"
                onClick={() => fin.createAsaasCharge.mutate()}
                disabled={!fin.asaasAmount || parseFloat(fin.asaasAmount) < 5 || fin.createAsaasCharge.isPending}
              >
                {fin.createAsaasCharge.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                GERAR LINK DE PAGAMENTO
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Form pagamento manual */}
      {fin.showPaymentForm && (
        <Card className="panel-3d border-primary/30 animate-in zoom-in-95 duration-200">
          <CardContent className="p-6 space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="space-y-1.5">
                <label className="text-[9px] uppercase tracking-[0.2em] font-black text-muted-foreground">Modalidade</label>
                <div className="concave-3d p-0.5">
                  <Select value={fin.payMethod} onValueChange={fin.setPayMethod}>
                    <SelectTrigger className="border-none bg-transparent shadow-none focus:ring-0 h-9 text-sm font-bold"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="credit">Crédito</SelectItem>
                      <SelectItem value="debit">Débito</SelectItem>
                      <SelectItem value="boleto">Boleto</SelectItem>
                      <SelectItem value="cash">Dinheiro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] uppercase tracking-[0.2em] font-black text-muted-foreground">Valor (R$)</label>
                <Input type="number" step="0.01" placeholder="0,00" className="field-engraved h-10 text-sm font-bold" value={fin.payAmount} onChange={e => fin.setPayAmount(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] uppercase tracking-[0.2em] font-black text-muted-foreground">Data</label>
                <Input type="date" className="field-engraved h-10 text-sm font-bold" value={fin.payDate} onChange={e => fin.setPayDate(e.target.value)} />
              </div>
              {fin.payMethod === "credit" && (
                <div className="space-y-1.5">
                  <label className="text-[9px] uppercase tracking-[0.2em] font-black text-muted-foreground">Parcelas</label>
                  <div className="concave-3d p-0.5">
                    <Select value={fin.payInstallments} onValueChange={fin.setPayInstallments}>
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
              {fin.payMethod === "credit" && (
                <div className="space-y-1.5">
                  <label className="text-[9px] uppercase tracking-[0.2em] font-black text-muted-foreground">Cartão (identificação)</label>
                  <Input placeholder="Ex: Nubank, Itaú Mastercard…" className="field-engraved h-10 text-sm font-bold" value={fin.payCardLabel} onChange={e => fin.setPayCardLabel(e.target.value)} />
                </div>
              )}
              <div className="space-y-1.5 flex-1">
                <label className="text-[9px] uppercase tracking-[0.2em] font-black text-muted-foreground">Descrição</label>
                <Input placeholder="Opcional — ex: Parcela 1/3" className="field-engraved h-10 text-sm font-bold" value={fin.payDescription} onChange={e => fin.setPayDescription(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button className="btn-3d-soft" onClick={() => fin.setShowPaymentForm(false)}>CANCELAR</Button>
              <Button
                className="btn-3d px-6"
                onClick={() => fin.createPayment.mutate()}
                disabled={!fin.payAmount || fin.createPayment.isPending}
              >
                {fin.createPayment.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <DollarSign className="w-4 h-4 mr-2" />}
                REGISTRAR PAGAMENTO
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Histórico */}
      {fin.loadingPayments ? (
        <Skeleton className="h-64 rounded-lg panel-3d-sub" />
      ) : !fin.payments?.length ? (
        <div className="text-center py-16 panel-3d border-none bg-white/50">
          <CreditCard className="mx-auto h-12 w-12 text-muted-foreground opacity-20 mb-4" />
          <p className="text-muted-foreground uppercase font-bold text-sm tracking-widest">Nenhum registro financeiro.</p>
        </div>
      ) : (
        <div className="panel-3d border-none overflow-hidden">
          <div className="divide-y divide-border/40">
            {fin.payments.map(payment => {
              const icon = METHOD_ICON[payment.method as string] ?? <DollarSign className="w-4 h-4" />;
              const label = METHOD_LABEL[payment.method as string] ?? (payment.method as string).toUpperCase();
              const invoiceUrl = (payment as any).asaasInvoiceUrl as string | null;
              return (
                <div key={payment.id} className="p-5 flex items-center justify-between hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-11 h-11 panel-3d-sub flex items-center justify-center border-none shadow-sm ${payment.status === "paid" ? "text-emerald-600" : "text-amber-600"}`}>
                      {icon}
                    </div>
                    <div>
                      <p className="font-black text-primary flex items-center gap-2 uppercase tracking-tight text-sm">
                        {label}
                        {(payment as any).installments && (
                          <span className="concave-3d px-1.5 py-0.5 text-[10px] lowercase text-muted-foreground">{(payment as any).installments}x</span>
                        )}
                        {(payment as any).cardLabel && (
                          <span className="text-[10px] font-bold text-muted-foreground/60">({(payment as any).cardLabel})</span>
                        )}
                      </p>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">
                        {payment.paidAt
                          ? format(new Date(payment.paidAt), "dd/MM/yyyy")
                          : payment.dueDate
                          ? `Venc: ${format(new Date(payment.dueDate), "dd/MM/yyyy")}`
                          : "—"}
                        {payment.description && <span className="mx-2 opacity-30">|</span>}
                        {payment.description}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-3">
                    {invoiceUrl && payment.status !== "paid" && (
                      <Button className="btn-3d h-8 text-[10px] font-black" onClick={() => window.open(invoiceUrl!, "_blank")}>
                        <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> PAGAR
                      </Button>
                    )}
                    <div className="screen-3d px-3 py-1 font-extrabold text-primary tabular-nums" style={{ fontFamily: "'EB Garamond', serif", fontVariantNumeric: "lining-nums tabular-nums" }}>
                      {brl(payment.amount)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
