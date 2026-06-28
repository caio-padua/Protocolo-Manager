import { useEffect, useState } from "react";
import {
  useGetPaymentGatewaySettings,
  useUpdatePaymentGatewaySettings,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Save, KeyRound, Webhook, Link as LinkIcon, Banknote } from "lucide-react";
import { SettingsPanel, FieldRow, SecretBadge } from "@/components/settings/SettingsUI";
import { getCollabToken } from "@/lib/collab-auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type SecretStatus = { isSet: boolean; masked?: string | null; source?: string | null };
type StripePayload = { provider: string; active: boolean; secretKeyStatus: SecretStatus };

// Painel Stripe — guarda a chave secreta (stripe.secretKey) no cofre cifrado
// pela rota PUT /settings/stripe. A tela so mostra a mascara, nunca o valor.
function StripePanel() {
  const { toast } = useToast();
  const [payload, setPayload] = useState<StripePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [secretKey, setSecretKey] = useState("");
  const [active, setActive] = useState(false);
  const [saving, setSaving] = useState(false);

  function load() {
    const t = getCollabToken();
    setLoading(true);
    fetch(`${BASE}/api/settings/stripe`, { headers: t ? { Authorization: `Bearer ${t}` } : {} })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("stripe"))))
      .then((d: StripePayload) => {
        setPayload(d);
        setActive(!!d.active);
      })
      .catch(() => setPayload(null))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function persist() {
    setSaving(true);
    try {
      const t = getCollabToken();
      const body: Record<string, unknown> = { active };
      if (secretKey.trim()) body.secretKey = secretKey.trim();
      const r = await fetch(`${BASE}/api/settings/stripe`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("save");
      toast({ title: "Stripe salvo no cofre" });
      setSecretKey("");
      load();
    } catch {
      toast({ title: "Erro ao salvar Stripe", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Skeleton className="h-64 w-full" />;

  const configured = !!payload?.secretKeyStatus.isSet;

  return (
    <SettingsPanel
      icon={Banknote}
      title="Gateway: STRIPE"
      titleTrailing={
        <span
          className={`paxter-led paxter-led-breathe ${configured ? "paxter-led-green" : "paxter-led-amber"}`}
          aria-label={configured ? "Stripe configurado" : "Stripe nao configurado"}
          title={configured ? "Stripe configurado" : "Stripe nao configurado"}
        />
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          persist();
        }}
      >
        <div className="concave-3d flex items-center justify-between gap-3 px-3 py-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Stripe ativo
          </span>
          <Switch checked={active} onCheckedChange={setActive} />
        </div>

        <div className="panel-3d-sub p-4 space-y-3">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-primary" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em]">Chave secreta (Secret Key)</span>
          </div>
          <SecretBadge
            isSet={configured}
            masked={payload?.secretKeyStatus.masked}
            source={payload?.secretKeyStatus.source}
          />
          <FieldRow label="Nova chave secreta" hint="Comeca com sk_. Deixe em branco para manter a atual.">
            <Input
              className="field-engraved"
              type="password"
              autoComplete="new-password"
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              placeholder="sk_live_..."
            />
          </FieldRow>
        </div>

        <div className="flex justify-end">
          <Button type="submit" className="btn-3d" disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </form>
    </SettingsPanel>
  );
}

export default function ConfigPagamentos() {
  const { toast } = useToast();
  const q = useGetPaymentGatewaySettings();
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [webhookToken, setWebhookToken] = useState("");

  useEffect(() => {
    if (q.data) setBaseUrl(q.data.baseUrl ?? "");
  }, [q.data]);

  const save = useUpdatePaymentGatewaySettings({
    mutation: {
      onSuccess: () => {
        toast({ title: "Porta de pagamento salva" });
        setApiKey("");
        setWebhookToken("");
        q.refetch();
      },
      onError: () => toast({ title: "Erro ao salvar", variant: "destructive" }),
    },
  });

  function persist() {
    save.mutate({
      data: {
        baseUrl: baseUrl.trim() === "" ? null : baseUrl.trim(),
        apiKey: apiKey.trim() === "" ? null : apiKey.trim(),
        webhookToken: webhookToken.trim() === "" ? null : webhookToken.trim(),
      },
    });
  }

  const provider = q.data?.provider ?? "asaas";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Portas de Pagamento</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Credenciais do gateway de cobranca (PIX, boleto, cartao). A chave de API e o token do webhook ficam
          cifrados no cofre — a tela so mostra um trecho mascarado, nunca o valor inteiro.
        </p>
      </header>

      {q.isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <SettingsPanel
          icon={CreditCard}
          title={`Gateway: ${provider.toUpperCase()}`}
          titleTrailing={
            (() => {
              const configured = !!q.data?.apiKeyStatus.isSet;
              return (
                <span
                  className={`paxter-led paxter-led-breathe ${configured ? "paxter-led-green" : "paxter-led-amber"}`}
                  aria-label={configured ? "Gateway configurado" : "Gateway nao configurado"}
                  title={configured ? "Gateway configurado" : "Gateway nao configurado"}
                />
              );
            })()
          }
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              persist();
            }}
          >
            <FieldRow label="URL base da API" hint="Producao do Asaas: https://api.asaas.com/v3">
              <div className="relative">
                <LinkIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input className="field-engraved pl-9" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
              </div>
            </FieldRow>

            <div className="panel-3d-sub p-4 space-y-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-primary" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em]">Chave de API</span>
              </div>
              <SecretBadge isSet={!!q.data?.apiKeyStatus.isSet} masked={q.data?.apiKeyStatus.masked} source={q.data?.apiKeyStatus.source} />
              <FieldRow label="Nova chave de API" hint="Deixe em branco para manter a atual.">
                <Input className="field-engraved" type="password" autoComplete="new-password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Cole a chave de API do gateway" />
              </FieldRow>
            </div>

            <div className="panel-3d-sub p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Webhook className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em]">Token do Webhook</span>
              </div>
              <SecretBadge isSet={!!q.data?.webhookTokenStatus.isSet} masked={q.data?.webhookTokenStatus.masked} source={q.data?.webhookTokenStatus.source} />
              <FieldRow label="Novo token do webhook" hint="Valida que a notificacao recebida veio mesmo do gateway. Deixe em branco para manter.">
                <Input className="field-engraved" type="password" autoComplete="new-password" value={webhookToken} onChange={(e) => setWebhookToken(e.target.value)} placeholder="Cole o token do webhook" />
              </FieldRow>
            </div>

            <div className="flex justify-end">
              <Button type="submit" className="btn-3d" disabled={save.isPending}>
                <Save className="w-4 h-4 mr-2" />
                {save.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </form>
        </SettingsPanel>
      )}

      <StripePanel />
    </div>
  );
}
