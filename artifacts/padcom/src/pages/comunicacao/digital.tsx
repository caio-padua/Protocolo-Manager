import { useEffect, useState } from "react";
import { Smartphone, MessageCircle, Send, ShieldCheck, ShieldAlert, Loader2, AlertTriangle } from "lucide-react";
import { ConsoleShell, ToolCard, StatusVela, ExplainRow, useComunicacaoStatus, BASE } from "./_shared";
import { getCollabToken } from "@/lib/collab-auth";
import { useToast } from "@/hooks/use-toast";

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
// Hook: info do bot (GET /settings/telegram/bot-info — sem auth)
// ---------------------------------------------------------------------------
interface BotInfo { username: string; firstName: string; mock?: boolean; }

function useTelegramBotInfo() {
  const [data, setData] = useState<BotInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`${BASE}/api/settings/telegram/bot-info`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: BotInfo) => { if (alive) setData(d); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  return { data, loading };
}

// ---------------------------------------------------------------------------
// Editor de nome bidirecional — o que o CEO muda aqui muda no Telegram
// ---------------------------------------------------------------------------
function BotNameEditor({ currentName }: { currentName: string }) {
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const token = getCollabToken();
      const r = await fetch(`${BASE}/api/settings/telegram/set-name`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name: name.trim() }),
      });
      const d = await r.json() as { ok: boolean; error?: string };
      if (d.ok) {
        toast({ title: "Nome do bot atualizado no Telegram" });
      } else {
        toast({ title: `Falha: ${d.error ?? "erro desconhecido"}`, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro de rede ao salvar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-1 flex items-center gap-2">
      <input
        className="flex-1 rounded border border-border bg-background px-2 py-1 text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-sky-500"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nome visível do bot no Telegram"
        onKeyDown={(e) => { if (e.key === "Enter") save(); }}
      />
      <button
        onClick={save}
        disabled={saving || !name.trim()}
        className="rounded bg-amber-600/20 px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-600/30 disabled:opacity-50 dark:text-amber-400"
      >
        {saving ? "Salvando…" : "Salvar"}
      </button>
    </div>
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
  const { data: botInfo, loading: botLoading } = useTelegramBotInfo();

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

        <ToolCard
          icon={Send}
          name="TELEGRAM"
          accent="text-sky-600"
          vela={
            <StatusVela
              on={!!(webhookData && !webhookData.mock && webhookData.healthy)}
              pending={webhookLoading && botLoading}
              error={webhookError}
              labelOn="Bot ativo"
              labelOff="Indisponível"
            />
          }
        >
          {/* Identidade do bot — busca ao vivo via getMe */}
          <ExplainRow noLed>
            {botLoading
              ? "Consultando Telegram…"
              : botInfo?.mock
                ? <>Bot <strong>@Paduaclinica_bot</strong> · token não configurado</>
                : <>Bot <strong>@{botInfo?.username}</strong> · {botInfo?.firstName}</>}
          </ExplainRow>

          {/* Editor de nome bidirecional — o que o CEO muda aqui muda no Telegram */}
          {!botLoading && !botInfo?.mock && botInfo?.firstName && (
            <div className="px-1 pb-1">
              <p className="mb-1 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                Alterar nome visível do bot
              </p>
              <BotNameEditor currentName={botInfo.firstName} />
            </div>
          )}

          {/* Aviso: PADAXOR_TELEGRAM_CHAT_ID ausente — CEO não recebe alertas */}
          {!loading && !error && status?.telegramChatIdConfigurado === false && (
            <div className="concave-3d flex items-start gap-2.5 px-3 py-2.5 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="space-y-0.5">
                <p className="text-[12px] font-semibold uppercase tracking-wide">
                  Chat ID não configurado
                </p>
                <p className="text-[11px] font-normal normal-case tracking-normal text-amber-700/80 dark:text-amber-400/80">
                  <strong>PADAXOR_TELEGRAM_CHAT_ID</strong> ausente — CEO não recebe alertas pelo
                  Telegram. Configure como Replit Secret.
                </p>
              </div>
            </div>
          )}

          {/* Painel de saúde do webhook — detecta polling ativo vs webhook */}
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
        </ToolCard>
      </section>
    </ConsoleShell>
  );
}
