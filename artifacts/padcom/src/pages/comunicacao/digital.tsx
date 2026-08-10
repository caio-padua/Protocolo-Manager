import { useEffect, useState } from "react";
import { Smartphone, MessageCircle, Send, ShieldCheck, ShieldAlert, Loader2 } from "lucide-react";
import { ConsoleShell, ToolCard, StatusVela, ExplainRow, useComunicacaoStatus, BASE } from "./_shared";
import { IntegrationVaultCard } from "@/components/integrations/IntegrationVault";
import { getCollabToken } from "@/lib/collab-auth";

function authHeaders(): Record<string, string> {
  const token = getCollabToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ---------------------------------------------------------------------------
// Hook: estado do webhook do Telegram (consulta /api/telegram/webhook-status)
// ---------------------------------------------------------------------------

interface WebhookStatus {
  healthy: boolean;
  url: string;
  pendingUpdateCount: number;
  lastErrorMessage?: string;
  mock?: boolean;
  fetchError?: string;
  checkedAt: string;
}

function useTelegramWebhookStatus() {
  const [data, setData] = useState<WebhookStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`${BASE}/api/telegram/webhook-status`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (!alive) return;
        setData(d as WebhookStatus);
        setError(false);
      })
      .catch(() => {
        if (alive) setError(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, []);

  return { data, loading, error };
}

// ---------------------------------------------------------------------------
// Badge de saúde do webhook
// ---------------------------------------------------------------------------

function WebhookBadge({ loading, error, data }: {
  loading: boolean;
  error: boolean;
  data: WebhookStatus | null;
}) {
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Verificando webhook…
      </span>
    );
  }
  if (error) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">
        <ShieldAlert className="h-3.5 w-3.5" />
        Indisponível
      </span>
    );
  }
  if (!data) return null;

  if (data.mock) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
        <ShieldAlert className="h-3.5 w-3.5" />
        Token ausente (MOCK)
      </span>
    );
  }
  if (data.healthy) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
        <ShieldCheck className="h-3.5 w-3.5" />
        Webhook Ativo
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">
      <ShieldAlert className="h-3.5 w-3.5" />
      Webhook Inativo
    </span>
  );
}

// ---------------------------------------------------------------------------
// Tela principal
// ---------------------------------------------------------------------------

// Comunicacao Digital — WhatsApp (informativo; credencial mora no Gateway) e
// Telegram (card de credencial Padrao 18 via motor unico). Status reflete o
// estado verdadeiro do servidor.
export default function ComunicacaoDigital() {
  const { status, loading, error } = useComunicacaoStatus();
  const { data: webhookData, loading: webhookLoading, error: webhookError } = useTelegramWebhookStatus();

  return (
    <ConsoleShell
      icon={Smartphone}
      title="Comunicação Digital"
      subtitle="Mensagens diretas ao cliente — WhatsApp e Telegram no mesmo lugar."
    >
      <section className="grid gap-4 lg:grid-cols-2">
        <ToolCard
          icon={MessageCircle}
          name="WhatsApp"
          accent="text-emerald-600"
          vela={
            <StatusVela
              on={!!status?.whatsapp}
              pending={loading}
              error={error}
              labelOn="Conectado"
              labelOff="Não configurado"
            />
          }
        >
          <ExplainRow noLed>
            Envio automático via <strong>Twilio</strong> (servidor). Sem credenciais no cofre, o
            sistema gera um link <strong>wa.me</strong> de apoio — nunca trava o fluxo.
          </ExplainRow>
          <ExplainRow noLed>
            As credenciais do Twilio ficam na tela <strong>Plataforma Gateway de Comunicação</strong>.
          </ExplainRow>
          {!status?.whatsapp && !loading && (
            <p className="text-[12px] text-amber-700 dark:text-amber-400">
              Para ligar o envio direto, cole as credenciais Twilio no Gateway de Comunicação.
            </p>
          )}
        </ToolCard>

        <IntegrationVaultCard
          provider="telegram"
          icon={Send}
          accent="text-sky-600"
          labelOn="Token no cofre"
          labelOff="Sem token"
          toggleLabel="Canal ativo"
          description={
            <>
              <ExplainRow noLed>
                Canal nativo do bot <strong>@Paduaclinica_bot</strong>. O cliente é vinculado por
                <strong> chat_id</strong> (prova de posse via webhook), sem expor telefone.
              </ExplainRow>

              {/* Painel de saúde do webhook — detecta polling ativo */}
              <div className="concave-3d mt-2 flex items-start justify-between gap-2 px-3 py-2">
                <div className="space-y-0.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Saúde do Webhook
                  </p>
                  <p className="text-[11px] text-muted-foreground/70">
                    {webhookLoading
                      ? "Consultando Telegram…"
                      : webhookError
                        ? "Não foi possível verificar"
                        : webhookData?.mock
                          ? "Token ausente — verificação indisponível"
                          : webhookData?.healthy
                            ? `URL registrada · ${webhookData.pendingUpdateCount} updates pendentes`
                            : webhookData?.fetchError
                              ? `Erro de rede: ${webhookData.fetchError}`
                              : "Webhook não registrado — polling pode estar ativo"}
                  </p>
                  {webhookData?.lastErrorMessage && (
                    <p className="text-[11px] text-rose-600 dark:text-rose-400">
                      Último erro: {webhookData.lastErrorMessage}
                    </p>
                  )}
                  {!webhookData?.healthy && !webhookLoading && !webhookError && !webhookData?.mock && (
                    <p className="text-[11px] text-rose-700 dark:text-rose-400 font-medium">
                      Mensagens dos pacientes podem não estar chegando ao CEO.
                    </p>
                  )}
                </div>
                <WebhookBadge loading={webhookLoading} error={webhookError} data={webhookData} />
              </div>
            </>
          }
        />
      </section>
    </ConsoleShell>
  );
}
