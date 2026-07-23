import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useListPayments, getListPaymentsQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.VITE_API_URL || "/api";

export function useFinanceiro(clientId: number) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Estado do formulário de pagamento manual ──
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [payMethod, setPayMethod] = useState("pix");
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payInstallments, setPayInstallments] = useState("1");
  const [payCardLabel, setPayCardLabel] = useState("");
  const [payDescription, setPayDescription] = useState("");

  // ── Estado do formulário Asaas ──
  const [showAsaasForm, setShowAsaasForm] = useState(false);
  const [asaasAmount, setAsaasAmount] = useState("");
  const [asaasDesc, setAsaasDesc] = useState("");
  const [asaasDate, setAsaasDate] = useState("");

  const paymentQueryKey = getListPaymentsQueryKey({ clientId });

  // ── Dados ──
  const { data: payments, isLoading: loadingPayments } = useListPayments(
    { clientId },
    { query: { enabled: !!clientId, queryKey: paymentQueryKey } },
  );

  const totalPago = (payments ?? [])
    .filter(p => p.status === "paid")
    .reduce((s, p) => s + p.amount, 0);

  const totalPendente = (payments ?? [])
    .filter(p => p.status === "pending" || p.status === "overdue")
    .reduce((s, p) => s + p.amount, 0);

  // ── Mutation: pagamento manual ──
  const createPayment = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
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
      queryClient.invalidateQueries({ queryKey: paymentQueryKey });
      setShowPaymentForm(false);
      setPayAmount(""); setPayDescription(""); setPayCardLabel(""); setPayInstallments("1");
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  // ── Mutation: Asaas ──
  const createAsaasCharge = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}/asaas/charge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          amount: parseFloat(asaasAmount),
          description: asaasDesc || undefined,
          dueDate: asaasDate || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Cobrança gerada!", description: "Link de pagamento criado no Asaas." });
      queryClient.invalidateQueries({ queryKey: paymentQueryKey });
      setShowAsaasForm(false); setAsaasAmount(""); setAsaasDesc(""); setAsaasDate("");
    },
    onError: (err: Error) => toast({ title: "Erro Asaas", description: err.message, variant: "destructive" }),
  });

  function togglePaymentForm() {
    setShowPaymentForm(v => !v);
    setShowAsaasForm(false);
  }

  function toggleAsaasForm() {
    setShowAsaasForm(v => !v);
    setShowPaymentForm(false);
  }

  return {
    payments, loadingPayments, totalPago, totalPendente,
    showPaymentForm, togglePaymentForm, setShowPaymentForm,
    payMethod, setPayMethod, payAmount, setPayAmount,
    payDate, setPayDate, payInstallments, setPayInstallments,
    payCardLabel, setPayCardLabel, payDescription, setPayDescription,
    createPayment,
    showAsaasForm, toggleAsaasForm, setShowAsaasForm,
    asaasAmount, setAsaasAmount, asaasDesc, setAsaasDesc, asaasDate, setAsaasDate,
    createAsaasCharge,
  };
}
