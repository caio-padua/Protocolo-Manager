import { useEffect, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getCollabToken } from "@/lib/collab-auth";
import { PaxterLogo } from "@/components/branding/PaxterLogo";
import {
  Landmark,
  Loader2,
  Plus,
  Pencil,
  Power,
  Building2,
  User,
  ShieldCheck,
  X,
} from "lucide-react";

const apiBase = import.meta.env.VITE_API_URL || "/api";

interface BankAccount {
  id: number;
  holderName: string;
  personType: "PF" | "PJ";
  document: string;
  bankName: string;
  bankCode: string | null;
  agency: string;
  account: string;
  accountType: string;
  pixKey: string | null;
  pixKeyType: string | null;
  active: boolean;
  note: string | null;
  createdAt: string;
}

interface FormState {
  holderName: string;
  personType: "PF" | "PJ";
  document: string;
  bankName: string;
  agency: string;
  account: string;
  accountType: string;
  pixKey: string;
  note: string;
}

const EMPTY_FORM: FormState = {
  holderName: "",
  personType: "PF",
  document: "",
  bankName: "",
  agency: "",
  account: "",
  accountType: "CONTA_CORRENTE",
  pixKey: "",
  note: "",
};

// Mascara o documento para a lista (mostra so os 4 ultimos digitos).
function maskDoc(d: string): string {
  if (!d) return "—";
  if (d.length <= 4) return "****";
  return `****${d.slice(-4)}`;
}

function authHeaders(): Record<string, string> {
  const token = getCollabToken();
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export default function CadastroBancos() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/asaas/bank-accounts`, { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) throw new Error("Sessão do colaborador expirada. Entre novamente.");
      if (!res.ok) throw new Error(data.error || "Erro ao carregar as contas.");
      setAccounts(data.accounts || []);
    } catch (err) {
      toast({ title: "Erro", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  function openNew() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(a: BankAccount) {
    setForm({
      holderName: a.holderName,
      personType: a.personType,
      document: a.document,
      bankName: a.bankName,
      agency: a.agency,
      account: a.account,
      accountType: a.accountType,
      pixKey: a.pixKey || "",
      note: a.note || "",
    });
    setEditingId(a.id);
    setShowForm(true);
  }

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const docDigits = form.document.replace(/\D/g, "");
  const canSave =
    form.holderName.trim().length > 0 &&
    (docDigits.length === 11 || docDigits.length === 14) &&
    form.bankName.trim().length > 0 &&
    form.agency.trim().length > 0 &&
    form.account.trim().length > 0 &&
    !saving;

  async function save() {
    setSaving(true);
    try {
      const url = editingId
        ? `${apiBase}/asaas/bank-accounts/${editingId}`
        : `${apiBase}/asaas/bank-accounts`;
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          holderName: form.holderName.trim(),
          personType: form.personType,
          document: form.document,
          bankName: form.bankName.trim(),
          agency: form.agency.trim(),
          account: form.account.trim(),
          accountType: form.accountType,
          pixKey: form.pixKey.trim() || undefined,
          note: form.note.trim() || undefined,
          active: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) throw new Error("Sessão do colaborador expirada. Entre novamente.");
      if (!res.ok) throw new Error(data.error || "Erro ao salvar a conta.");
      toast({ title: editingId ? "Conta atualizada" : "Conta cadastrada", description: form.holderName.trim() });
      setShowForm(false);
      await load();
    } catch (err) {
      toast({ title: "Erro", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(a: BankAccount) {
    try {
      if (a.active) {
        const res = await fetch(`${apiBase}/asaas/bank-accounts/${a.id}`, { method: "DELETE", headers: authHeaders() });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Erro ao desativar.");
        toast({ title: "Conta desativada", description: `${a.holderName} saiu da whitelist.` });
      } else {
        // Reativa via PUT (active=true).
        const res = await fetch(`${apiBase}/asaas/bank-accounts/${a.id}`, {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({
            holderName: a.holderName,
            personType: a.personType,
            document: a.document,
            bankName: a.bankName,
            agency: a.agency,
            account: a.account,
            accountType: a.accountType,
            pixKey: a.pixKey || undefined,
            note: a.note || undefined,
            active: true,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Erro ao reativar.");
        toast({ title: "Conta reativada", description: `${a.holderName} voltou à whitelist.` });
      }
      await load();
    } catch (err) {
      toast({ title: "Erro", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* HERO navy com a marca PAXTER */}
      <div className="relative overflow-hidden rounded-[10px] border border-[#26406e] bg-[#16284a] px-6 py-7 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
        <div className="flex flex-col items-center gap-3">
          <PaxterLogo variant="appHeader" tone="dark" />
          <div className="mt-1">
            <h1 className="text-lg font-bold tracking-tight text-[#e9d7a7]">Cadastro de Bancos</h1>
            <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-200/70 mt-0.5">
              Contas autorizadas a receber transferências (whitelist)
            </p>
          </div>
        </div>
      </div>

      {/* AVISO — whitelist */}
      <div className="concave-3d flex items-start gap-2.5 px-4 py-3">
        <ShieldCheck className="w-4 h-4 mt-0.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Só é possível transferir para uma conta cadastrada e <strong>ativa</strong> aqui. Desativar uma
          conta a remove da lista de destinos permitidos, sem apagar o histórico.
        </p>
      </div>

      {/* Acao: nova conta */}
      {!showForm && (
        <div className="flex justify-end">
          <Button onClick={openNew} className="btn-3d h-11 px-5 text-[13px] font-bold uppercase tracking-[0.12em]">
            <Plus className="w-4 h-4 mr-2" /> Nova conta
          </Button>
        </div>
      )}

      {/* FORMULARIO (slot fixo quando aberto) */}
      {showForm && (
        <section className="panel-3d p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-foreground">
              {editingId ? "Editar conta" : "Nova conta"}
            </h2>
            <button type="button" onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Titular</label>
            <Input value={form.holderName} onChange={(e) => set("holderName", e.target.value)} className="bevel-3d h-11" placeholder="Nome do titular" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Tipo</label>
              <Select value={form.personType} onValueChange={(v) => set("personType", v as "PF" | "PJ")}>
                <SelectTrigger className="bevel-3d h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PF">Pessoa Física (PF)</SelectItem>
                  <SelectItem value="PJ">Pessoa Jurídica (PJ)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Documento ({form.personType === "PJ" ? "CNPJ" : "CPF"}) — também é a chave Pix
              </label>
              <Input value={form.document} onChange={(e) => set("document", e.target.value)} className="bevel-3d h-11" placeholder={form.personType === "PJ" ? "00.000.000/0000-00" : "000.000.000-00"} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5 sm:col-span-1">
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Banco</label>
              <Input value={form.bankName} onChange={(e) => set("bankName", e.target.value)} className="bevel-3d h-11" placeholder="Banco" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Agência</label>
              <Input value={form.agency} onChange={(e) => set("agency", e.target.value)} className="bevel-3d h-11" placeholder="0000" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Conta</label>
              <Input value={form.account} onChange={(e) => set("account", e.target.value)} className="bevel-3d h-11" placeholder="00000-0" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Tipo de conta</label>
              <Select value={form.accountType} onValueChange={(v) => set("accountType", v)}>
                <SelectTrigger className="bevel-3d h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CONTA_CORRENTE">Conta corrente</SelectItem>
                  <SelectItem value="CONTA_POUPANCA">Conta poupança</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Chave Pix (opcional — vazio = documento)</label>
              <Input value={form.pixKey} onChange={(e) => set("pixKey", e.target.value)} className="bevel-3d h-11" placeholder="Deixe vazio para usar o documento" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Observação (opcional)</label>
            <Input value={form.note} onChange={(e) => set("note", e.target.value)} className="bevel-3d h-11" placeholder="Texto livre" />
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={!canSave} className="btn-3d flex-1 h-12 text-[13px] font-bold uppercase tracking-[0.14em]">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
              {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Cadastrar conta"}
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)} className="btn-3d-soft h-12 px-5">Cancelar</Button>
          </div>
        </section>
      )}

      {/* LISTA das contas */}
      <section className="space-y-3">
        {loading ? (
          <div className="panel-3d p-8 flex items-center justify-center text-muted-foreground">
            <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Carregando contas...
          </div>
        ) : accounts.length === 0 ? (
          <div className="panel-3d p-8 text-center text-muted-foreground text-[13px]">Nenhuma conta cadastrada ainda.</div>
        ) : (
          accounts.map((a) => (
            <div key={a.id} className={`panel-3d p-4 ${a.active ? "" : "opacity-60"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="bevel-3d w-10 h-10 rounded-[8px] flex items-center justify-center shrink-0">
                    {a.personType === "PJ" ? <Building2 className="w-5 h-5 text-cyan-600 dark:text-cyan-400" /> : <User className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-[14px] text-foreground truncate">{a.holderName}</p>
                      <span className="bevel-3d text-[10px] font-bold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded">{a.personType}</span>
                      <span className={`text-[10px] font-bold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded ${a.active ? "text-emerald-700 bg-emerald-500/15" : "text-slate-500 bg-slate-500/15"}`}>
                        {a.active ? "Ativa" : "Inativa"}
                      </span>
                    </div>
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      {a.bankName} · Ag {a.agency} · Conta {a.account}
                    </p>
                    <p className="text-[12px] text-muted-foreground">
                      Pix {a.pixKeyType || "—"} · {maskDoc(a.document)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button variant="outline" size="sm" className="btn-3d-soft h-8 px-2.5" onClick={() => openEdit(a)} title="Editar">
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="outline" size="sm" className="btn-3d-soft h-8 px-2.5" onClick={() => toggleActive(a)} title={a.active ? "Desativar" : "Reativar"}>
                    <Power className={`w-3.5 h-3.5 ${a.active ? "text-red-500" : "text-emerald-500"}`} />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </section>

      <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <Landmark className="w-3.5 h-3.5" /> {accounts.filter((a) => a.active).length} conta(s) ativa(s) na whitelist
      </div>
    </div>
  );
}
