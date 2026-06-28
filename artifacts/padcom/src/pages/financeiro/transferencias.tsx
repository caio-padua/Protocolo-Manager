import { useEffect, useMemo, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getCollabToken } from "@/lib/collab-auth";
import { PaxterLogo } from "@/components/branding/PaxterLogo";
import {
  ArrowLeftRight,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Building2,
  User,
  CheckCircle2,
  AlertTriangle,
  Lock,
  ArrowLeft,
} from "lucide-react";

const apiBase = import.meta.env.VITE_API_URL || "/api";

// Trava de seguranca (espelha o backend): maximo por transferencia.
const TRANSFER_MAX = 5000;
const TRANSFER_MIN = 1;

interface BankAccount {
  id: number;
  holderName: string;
  personType: "PF" | "PJ";
  document: string;
  bankName: string;
  agency: string;
  account: string;
  pixKey: string | null;
  pixKeyType: string | null;
  active: boolean;
}

interface TransferResult {
  id: string;
  status: string;
  value: number;
  effectiveDate: string | null;
  transferFee: number | null;
  description: string | null;
}

// Status real do Asaas (honesto: o texto vem do provedor).
const STATUS_UI: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Pendente", cls: "text-cyan-600 dark:text-cyan-400" },
  BANK_PROCESSING: { label: "Processando no banco", cls: "text-cyan-600 dark:text-cyan-400" },
  DONE: { label: "Concluída", cls: "text-emerald-600 dark:text-emerald-400" },
  FAILED: { label: "Falhou", cls: "text-red-600 dark:text-red-400" },
  CANCELLED: { label: "Cancelada", cls: "text-slate-500 dark:text-slate-400" },
};

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function maskDoc(d: string): string {
  if (!d) return "—";
  if (d.length <= 4) return "****";
  return `****${d.slice(-4)}`;
}

function authHeaders(): Record<string, string> {
  const token = getCollabToken();
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

type Step = "form" | "confirm";

export default function Transferencias() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [accountId, setAccountId] = useState<string>("");
  const [value, setValue] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [step, setStep] = useState<Step>("form");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<TransferResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/asaas/bank-accounts`, { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) throw new Error("Sessão do colaborador expirada. Entre novamente.");
      if (!res.ok) throw new Error(data.error || "Erro ao carregar as contas.");
      setAccounts((data.accounts || []).filter((a: BankAccount) => a.active));
    } catch (err) {
      toast({ title: "Erro", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const account = useMemo(() => accounts.find((a) => String(a.id) === accountId) || null, [accounts, accountId]);

  const valueNum = parseFloat(value.replace(",", "."));
  const valueValid = !isNaN(valueNum) && valueNum >= TRANSFER_MIN;
  const overLimit = !isNaN(valueNum) && valueNum > TRANSFER_MAX;
  const canReview = !!account && valueValid && !overLimit && !sending;

  function reset() {
    setStep("form");
    setResult(null);
  }

  function onPickAccount(v: string) {
    setAccountId(v);
    reset();
  }

  async function confirmTransfer() {
    if (!account) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch(`${apiBase}/asaas/transfer`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          bankAccountId: account.id,
          value: valueNum,
          description: description.trim() || undefined,
          confirm: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) throw new Error("Sessão do colaborador expirada. Entre novamente.");
      if (!res.ok) throw new Error(data.error || "Erro ao transferir.");
      setResult(data.transfer as TransferResult);
      setStep("form");
      toast({ title: "Transferência enviada ao Asaas", description: "Confira o status real abaixo." });
    } catch (err) {
      toast({ title: "Erro", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  const statusUi = result ? STATUS_UI[result.status] || { label: result.status, cls: "text-muted-foreground" } : null;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* HERO navy com a marca PAXTER */}
      <div className="relative overflow-hidden rounded-[10px] border border-[#26406e] bg-[#16284a] px-6 py-7 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
        <div className="flex flex-col items-center gap-3">
          <PaxterLogo variant="appHeader" tone="dark" />
          <div className="mt-1">
            <h1 className="text-lg font-bold tracking-tight text-[#e9d7a7]">Transferências</h1>
            <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-200/70 mt-0.5">
              Saldo Asaas → conta autorizada, via Pix, com confirmação
            </p>
          </div>
        </div>
      </div>

      {/* AVISO — trava de seguranca */}
      <div className="concave-3d flex items-start gap-2.5 px-4 py-3">
        <ShieldAlert className="w-4 h-4 mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Transferência só para conta cadastrada e ativa (whitelist). Limite de segurança de{" "}
          <strong className="text-foreground">{brl(TRANSFER_MAX)}</strong> por operação. Toda transferência
          exige confirmação e fica registrada na auditoria.
        </p>
      </div>

      {/* PASSO 1 — FORMULARIO */}
      {step === "form" && (
        <section className="panel-3d p-5 space-y-5">
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Conta de destino (autorizada)</label>
            <Select value={accountId} onValueChange={onPickAccount}>
              <SelectTrigger className="bevel-3d h-11">
                <SelectValue placeholder={loading ? "Carregando contas..." : accounts.length === 0 ? "Nenhuma conta ativa" : "Selecione a conta"} />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.holderName} — {a.bankName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Resumo data-bound da conta escolhida */}
            <div className="concave-3d mt-2 flex items-start gap-3 px-3 py-2.5">
              <div className="bevel-3d w-9 h-9 rounded-[8px] flex items-center justify-center shrink-0">
                {account?.personType === "PJ" ? <Building2 className="w-4.5 h-4.5 text-cyan-600 dark:text-cyan-400" /> : <User className="w-4.5 h-4.5 text-cyan-600 dark:text-cyan-400" />}
              </div>
              <div className="text-[12px]">
                {account ? (
                  <>
                    <p className="font-semibold text-foreground">{account.holderName} <span className="text-muted-foreground font-normal">({account.personType})</span></p>
                    <p className="text-muted-foreground">{account.bankName} · Ag {account.agency} · Conta {account.account}</p>
                    <p className="text-muted-foreground">Pix {account.pixKeyType || "—"} · {maskDoc(account.document)}</p>
                  </>
                ) : (
                  <p className="text-muted-foreground">Nenhuma conta selecionada.</p>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Valor (R$)</label>
              <Input inputMode="decimal" placeholder="0,00" value={value} onChange={(e) => setValue(e.target.value)} className="bevel-3d h-11" />
              {value && !valueValid && !overLimit && (
                <p className="text-[12px] text-red-600 dark:text-red-400">Mínimo de {brl(TRANSFER_MIN)} por transferência.</p>
              )}
              {overLimit && (
                <p className="text-[12px] text-red-600 dark:text-red-400">Acima do limite de segurança de {brl(TRANSFER_MAX)}.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Descrição (opcional)</label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} className="bevel-3d h-11" placeholder="Ex.: Repasse mensal" />
            </div>
          </div>

          <Button onClick={() => setStep("confirm")} disabled={!canReview} className="btn-3d w-full h-12 text-[13px] font-bold uppercase tracking-[0.14em]">
            <ArrowLeftRight className="w-4 h-4 mr-2" /> Revisar transferência
          </Button>
        </section>
      )}

      {/* PASSO 2 — CONFIRMACAO */}
      {step === "confirm" && account && (
        <section className="panel-3d p-5 space-y-5 ring-2 ring-[#c2a05a]/60">
          <div className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5">
            <Lock className="w-4 h-4 text-amber-500" />
            <span className="text-[12px] font-semibold uppercase tracking-[0.12em]">Confirme a transferência</span>
          </div>

          <div className="concave-3d px-4 py-4 space-y-3">
            <div className="text-center">
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Valor a transferir</p>
              <p className="text-3xl font-bold text-[#e9d7a7]">{brl(valueNum)}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 pt-2 border-t border-border/40">
              <div>
                <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Para</p>
                <p className="text-[13px] font-semibold text-foreground">{account.holderName}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Banco / Pix</p>
                <p className="text-[13px] font-semibold text-foreground">{account.bankName} · {account.pixKeyType || "—"} {maskDoc(account.document)}</p>
              </div>
              {description.trim() && (
                <div className="sm:col-span-2">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Descrição</p>
                  <p className="text-[13px] font-semibold text-foreground">{description.trim()}</p>
                </div>
              )}
            </div>
          </div>

          <div className="concave-3d flex items-start gap-2.5 px-4 py-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Esta operação move dinheiro de verdade e é <strong>irreversível</strong>. Confira o destino e o
              valor antes de confirmar.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => setStep("form")} disabled={sending} className="btn-3d-soft h-12 px-5">
              <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
            </Button>
            <Button onClick={confirmTransfer} disabled={sending} className="btn-3d flex-1 h-12 text-[13px] font-bold uppercase tracking-[0.14em]">
              {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
              {sending ? "Transferindo..." : "Confirmar e transferir"}
            </Button>
          </div>
        </section>
      )}

      {/* RESULTADO — status REAL do Asaas */}
      {result && statusUi && (
        <section className="panel-3d p-5 space-y-4">
          <div className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5">
            {result.status === "FAILED" || result.status === "CANCELLED" ? (
              <AlertTriangle className="w-4 h-4 text-red-500" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            )}
            <span className="text-[12px] font-semibold uppercase tracking-[0.12em]">Retorno do Asaas</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="concave-3d px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Status</p>
              <p className={`text-[14px] font-bold ${statusUi.cls}`}>{statusUi.label}</p>
            </div>
            <div className="concave-3d px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Valor</p>
              <p className="text-[14px] font-bold">{brl(result.value)}</p>
            </div>
            <div className="concave-3d px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Id da transferência</p>
              <p className="text-[13px] font-medium break-all">{result.id || "—"}</p>
            </div>
            <div className="concave-3d px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Taxa</p>
              <p className="text-[13px] font-medium">{result.transferFee != null ? brl(result.transferFee) : "—"}</p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
