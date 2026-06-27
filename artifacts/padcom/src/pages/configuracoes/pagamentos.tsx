import { useEffect, useState } from "react";
import {
  useGetPaymentGatewaySettings,
  useUpdatePaymentGatewaySettings,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Save, KeyRound, Webhook, Link as LinkIcon } from "lucide-react";
import { SettingsPanel, FieldRow, SecretBadge } from "@/components/settings/SettingsUI";

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
    </div>
  );
}
