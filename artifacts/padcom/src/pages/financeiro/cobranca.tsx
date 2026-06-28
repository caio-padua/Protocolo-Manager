import { useMemo, useState } from "react";
import { useListClients, type Client } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { PaxterLogo } from "@/components/branding/PaxterLogo";
import {
  Mail,
  MessageCircle,
  Send,
  Zap,
  Loader2,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  CircleDashed,
  Link2,
  Copy,
  User,
} from "lucide-react";

type ChannelKey = "email" | "whatsapp" | "telegram";

interface ChannelResult {
  channel: string;
  status: "sent" | "fallback" | "mock" | "error" | "no_destination";
  detail?: string;
}

interface LaunchResponse {
  id: number;
  asaasChargeId: string;
  invoiceUrl: string;
  status: string;
  amount: number;
  channels: ChannelResult[];
}

const apiBase = import.meta.env.VITE_API_URL || "/api";

// Catalogo dos 3 canais: rotulo, icone e de onde sai o destino no cliente.
const CHANNELS: Array<{
  key: ChannelKey;
  label: string;
  icon: typeof Mail;
  destOf: (c: Client) => string;
  faltaLabel: string;
}> = [
  { key: "email", label: "E-mail", icon: Mail, destOf: (c) => c.email || "", faltaLabel: "sem e-mail no cadastro" },
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle, destOf: (c) => c.phone || "", faltaLabel: "sem telefone no cadastro" },
  { key: "telegram", label: "Telegram", icon: Send, destOf: (c) => (c as any).telegramChatId || "", faltaLabel: "sem Telegram (chat id)" },
];

// Como cada status honesto aparece na tela (cor + rotulo + se pede atencao).
const STATUS_UI: Record<ChannelResult["status"], { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  sent: { label: "Enviado", cls: "text-emerald-600 dark:text-emerald-400", icon: CheckCircle2 },
  fallback: { label: "Link gerado (abrir manual)", cls: "text-amber-600 dark:text-amber-400", icon: Link2 },
  mock: { label: "Simulado (sem token)", cls: "text-slate-500 dark:text-slate-400", icon: CircleDashed },
  no_destination: { label: "Sem destino", cls: "text-slate-500 dark:text-slate-400", icon: CircleDashed },
  error: { label: "Falhou", cls: "text-red-600 dark:text-red-400", icon: AlertTriangle },
};

export default function LancadorCobranca() {
  const { toast } = useToast();
  const { data: clients, isLoading: loadingClients } = useListClients();

  const [clientId, setClientId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");
  const [selected, setSelected] = useState<Record<ChannelKey, boolean>>({
    email: true,
    whatsapp: true,
    telegram: false,
  });

  const [launching, setLaunching] = useState(false);
  const [result, setResult] = useState<LaunchResponse | null>(null);

  const client = useMemo(
    () => (clients || []).find((c) => String(c.id) === clientId) || null,
    [clients, clientId],
  );

  const amountNum = parseFloat(amount.replace(",", "."));
  const amountValid = !isNaN(amountNum) && amountNum >= 5;
  const anyChannel = selected.email || selected.whatsapp || selected.telegram;
  const canLaunch = !!client && amountValid && anyChannel && !launching;

  function toggle(k: ChannelKey) {
    setSelected((s) => ({ ...s, [k]: !s[k] }));
  }

  async function launch() {
    if (!client) return;
    setLaunching(true);
    setResult(null);
    try {
      const res = await fetch(`${apiBase}/asaas/charge/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: client.id,
          amount: amountNum,
          description: description.trim() || undefined,
          dueDate: dueDate || undefined,
          channels: selected,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Erro ao lancar a cobranca.");
      }
      setResult(data as LaunchResponse);
      toast({ title: "Cobranca criada!", description: "Confira o status de cada canal abaixo." });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLaunching(false);
    }
  }

  function copyLink() {
    if (!result?.invoiceUrl) return;
    navigator.clipboard?.writeText(result.invoiceUrl);
    toast({ title: "Link copiado!" });
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* HERO navy com a marca PAXTER (vidro + ouro) */}
      <div className="relative overflow-hidden rounded-[10px] border border-[#26406e] bg-[#16284a] px-6 py-7 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
        <div className="flex flex-col items-center gap-3">
          <PaxterLogo variant="appHeader" tone="dark" />
          <div className="mt-1">
            <h1 className="text-lg font-bold tracking-tight text-[#e9d7a7]">Lançador de Cobrança</h1>
            <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-200/70 mt-0.5">
              Cobre o cliente e envie o link por e-mail, WhatsApp e Telegram
            </p>
          </div>
        </div>
      </div>

      {/* FORMULARIO — todos os campos sempre visiveis (slot fixo) */}
      <section className="panel-3d p-5 space-y-5">
        {/* Cliente */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Cliente</label>
          <Select value={clientId} onValueChange={(v) => { setClientId(v); setResult(null); }}>
            <SelectTrigger className="bevel-3d h-11">
              <SelectValue placeholder={loadingClients ? "Carregando clientes..." : "Selecione o cliente"} />
            </SelectTrigger>
            <SelectContent>
              {(clients || []).map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}{c.cpf ? ` — ${c.cpf}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Resumo do cliente escolhido (contatos que serao usados) */}
          <div className="concave-3d mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-[12px]">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <User className="w-3.5 h-3.5" />
              {client ? client.name : "Nenhum cliente selecionado"}
            </span>
            {client && (
              <>
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Mail className="w-3.5 h-3.5" />{client.email || "—"}
                </span>
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <MessageCircle className="w-3.5 h-3.5" />{client.phone || "—"}
                </span>
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Send className="w-3.5 h-3.5" />{(client as any).telegramChatId || "—"}
                </span>
              </>
            )}
          </div>
          {client && !client.cpf && (
            <p className="text-[12px] text-amber-600 dark:text-amber-400 inline-flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> Cliente sem CPF — o Asaas exige CPF para cobrar. Cadastre antes.
            </p>
          )}
        </div>

        {/* Valor + Vencimento */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Valor (R$)</label>
            <Input
              inputMode="decimal"
              placeholder="Mínimo R$ 5,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="bevel-3d h-11"
            />
            {amount && !amountValid && (
              <p className="text-[12px] text-red-600 dark:text-red-400">O valor mínimo é R$ 5,00.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Vencimento</label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="bevel-3d h-11" />
            <p className="text-[12px] text-muted-foreground">Vazio = amanhã.</p>
          </div>
        </div>

        {/* Descricao */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Descrição (opcional)</label>
          <Input
            placeholder="Ex.: Protocolo injetável — 1ª parcela"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="bevel-3d h-11"
          />
        </div>

        {/* Canais — cards fixos (nada some), desabilita quando falta destino */}
        <div className="space-y-2">
          <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Enviar o link por</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {CHANNELS.map(({ key, label, icon: Icon, destOf, faltaLabel }) => {
              const dest = client ? destOf(client) : "";
              const hasDest = !!dest;
              const on = selected[key];
              const disabled = !client || !hasDest;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => !disabled && toggle(key)}
                  disabled={disabled}
                  aria-pressed={on}
                  className={[
                    "relative flex flex-col items-start gap-1 rounded-[8px] p-3 text-left transition-all",
                    disabled
                      ? "border border-dashed border-border bg-muted/20 opacity-60 cursor-not-allowed"
                      : on
                        ? "panel-3d panel-3d-active ring-2 ring-[#c2a05a]/70"
                        : "bevel-3d hover:brightness-105",
                  ].join(" ")}
                >
                  <span className="inline-flex items-center gap-2 text-[13px] font-semibold">
                    <Icon className="w-4 h-4" /> {label}
                    {on && !disabled && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                  </span>
                  <span className="text-[11px] text-muted-foreground truncate max-w-full">
                    {client ? (hasDest ? dest : faltaLabel) : "selecione o cliente"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Acao */}
        <Button onClick={launch} disabled={!canLaunch} className="btn-3d w-full h-12 text-[13px] font-bold uppercase tracking-[0.14em]">
          {launching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
          {launching ? "Lançando..." : "Lançar Cobrança"}
        </Button>
        {!anyChannel && (
          <p className="text-[12px] text-amber-600 dark:text-amber-400 text-center">Escolha ao menos um canal de envio.</p>
        )}
      </section>

      {/* RESULTADO — link + status honesto por canal */}
      {result && (
        <section className="panel-3d p-5 space-y-4">
          <div className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span className="text-[12px] font-semibold uppercase tracking-[0.12em]">Cobrança criada</span>
          </div>

          <div className="concave-3d flex flex-wrap items-center justify-between gap-3 px-3 py-3">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Link de pagamento</p>
              <p className="truncate text-[13px] font-medium">{result.invoiceUrl}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" className="btn-3d-soft" onClick={copyLink}>
                <Copy className="w-3.5 h-3.5 mr-1.5" /> Copiar
              </Button>
              <Button variant="outline" size="sm" className="btn-3d-soft" onClick={() => window.open(result.invoiceUrl, "_blank")}>
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Abrir
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Status por canal</p>
            {result.channels.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">Nenhum canal foi selecionado.</p>
            ) : (
              <div className="space-y-2">
                {result.channels.map((ch, i) => {
                  const meta = CHANNELS.find((c) => c.key === ch.channel);
                  const ui = STATUS_UI[ch.status];
                  const StatusIcon = ui.icon;
                  const ChIcon = meta?.icon || Mail;
                  return (
                    <div key={i} className="panel-3d-sub flex items-center justify-between gap-3 px-3 py-2.5">
                      <span className="inline-flex items-center gap-2 text-[13px] font-medium">
                        <ChIcon className="w-4 h-4" /> {meta?.label || ch.channel}
                      </span>
                      <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold ${ui.cls}`}>
                        <StatusIcon className="w-3.5 h-3.5" /> {ui.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            {result.channels.some((c) => c.detail && (c.status === "fallback" || c.status === "error")) && (
              <div className="space-y-1 pt-1">
                {result.channels
                  .filter((c) => c.detail && (c.status === "fallback" || c.status === "error"))
                  .map((c, i) => (
                    <p key={i} className="text-[11px] text-muted-foreground break-all">
                      {CHANNELS.find((x) => x.key === c.channel)?.label || c.channel}: {c.detail}
                    </p>
                  ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
