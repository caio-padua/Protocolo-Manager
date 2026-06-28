import { useCallback, useEffect, useState } from "react";
import { Network, MessageCircle, Webhook, KeyRound, Save } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getCollabToken } from "@/lib/collab-auth";
import { SecretBadge } from "@/components/settings/SettingsUI";
import { ConsoleShell, ToolCard, StatusVela, ExplainRow, BASE } from "./_shared";

// Plataforma Gateway de Comunicacao — Twilio e Gupshup, cada um com a luzinha
// de vela (status REAL de configuracao), um toggle (escolha do operador) e os
// CAMPOS de credencial (gravam no cofre cifrado). A luz nunca fica verde sem
// credencial; o toggle persiste de verdade; campo vazio = nao altera.

type GatewayProvider = "twilio" | "gupshup";

type GatewayField = {
  field: string;
  label: string;
  secret: boolean;
  isSet: boolean;
  masked?: string | null;
  source?: string | null;
};

type Gateway = {
  provider: GatewayProvider;
  label: string;
  configured: boolean;
  enabled: boolean;
  missingKeys: string[];
  fields: GatewayField[];
};

// Nome amigavel das chaves que faltam (para o aviso na tela).
const KEY_LABELS: Record<string, string> = {
  TWILIO_ACCOUNT_SID: "Identificador da conta (Account SID)",
  TWILIO_AUTH_TOKEN: "Senha de acesso (Auth Token)",
  TWILIO_WHATSAPP_FROM: "Número remetente do WhatsApp",
  GUPSHUP_API_KEY: "Chave de API (API Key)",
  GUPSHUP_APP_NAME: "Nome do aplicativo (App Name)",
};

function useGateways() {
  const [gateways, setGateways] = useState<Gateway[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [savingProvider, setSavingProvider] = useState<GatewayProvider | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const token = getCollabToken();
    return fetch(`${BASE}/api/comunicacao/gateways`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("gateways"))))
      .then((d) => {
        setGateways(d.gateways as Gateway[]);
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const token = getCollabToken();
    fetch(`${BASE}/api/comunicacao/gateways`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("gateways"))))
      .then((d) => {
        if (!alive) return;
        setGateways(d.gateways as Gateway[]);
        setError(false);
      })
      .catch(() => {
        if (alive) setError(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const toggle = useCallback(
    async (provider: GatewayProvider, enabled: boolean) => {
      setSavingProvider(provider);
      // Atualizacao otimista para resposta imediata do toggle.
      setGateways((prev) =>
        prev ? prev.map((g) => (g.provider === provider ? { ...g, enabled } : g)) : prev,
      );
      try {
        const token = getCollabToken();
        const r = await fetch(`${BASE}/api/comunicacao/gateways/${provider}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ enabled }),
        });
        if (!r.ok) throw new Error("toggle");
        await load();
      } catch {
        // Reverte se falhar e recarrega a verdade do servidor.
        await load();
      } finally {
        setSavingProvider(null);
      }
    },
    [load],
  );

  const saveCredentials = useCallback(
    async (provider: GatewayProvider, values: Record<string, string>) => {
      const token = getCollabToken();
      const r = await fetch(`${BASE}/api/comunicacao/gateways/${provider}/credentials`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(values),
      });
      if (!r.ok) throw new Error("credentials");
      await load();
    },
    [load],
  );

  return { gateways, loading, error, toggle, savingProvider, saveCredentials };
}

// Formulario de credenciais de um gateway — um campo por chave do cofre.
// Campo vazio = mantem o valor atual (nao sobrescreve). Mostra a mascara.
function CredentialsForm({
  gateway,
  onSave,
}: {
  gateway: Gateway;
  onSave: (provider: GatewayProvider, values: Record<string, string>) => Promise<void>;
}) {
  const { toast } = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function submit() {
    const filled = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v.trim() !== ""),
    );
    if (Object.keys(filled).length === 0) {
      toast({ title: "Preencha ao menos um campo para salvar", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await onSave(gateway.provider, filled);
      toast({ title: `Credenciais de ${gateway.label} salvas no cofre` });
      setValues({});
    } catch {
      toast({ title: "Falha ao salvar credenciais", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="concave-3d space-y-3 px-3 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground/80">
        <KeyRound className="h-3.5 w-3.5" />
        Credenciais (cofre cifrado)
      </div>
      {gateway.fields.map((f) => (
        <div key={f.field} className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {f.label}
            </label>
            <SecretBadge isSet={f.isSet} masked={f.masked} source={f.source} />
          </div>
          <Input
            className="field-engraved"
            type={f.secret ? "password" : "text"}
            autoComplete="new-password"
            value={values[f.field] ?? ""}
            onChange={(e) => setValues((prev) => ({ ...prev, [f.field]: e.target.value }))}
            placeholder={f.isSet ? "Deixe em branco para manter" : `Cole: ${f.label}`}
          />
        </div>
      ))}
      <div className="flex justify-end">
        <Button type="button" className="btn-3d" disabled={saving} onClick={submit}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Salvando..." : "Salvar credenciais"}
        </Button>
      </div>
    </div>
  );
}

function GatewayCard({
  gateway,
  icon,
  accent,
  description,
  onToggle,
  onSaveCredentials,
  saving,
  loading,
  error,
}: {
  gateway: Gateway;
  icon: typeof MessageCircle;
  accent: string;
  description: React.ReactNode;
  onToggle: (enabled: boolean) => void;
  onSaveCredentials: (provider: GatewayProvider, values: Record<string, string>) => Promise<void>;
  saving: boolean;
  loading: boolean;
  error: boolean;
}) {
  return (
    <ToolCard
      icon={icon}
      name={gateway.label}
      accent={accent}
      vela={
        <StatusVela
          on={gateway.configured}
          pending={loading}
          error={error}
          labelOn="Configurado"
          labelOff="Sem credenciais"
        />
      }
    >
      {description}

      {/* Toggle do operador — persiste a escolha de usar a plataforma. */}
      <div className="concave-3d flex items-center justify-between gap-3 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-foreground/80">
            Gateway ativo
          </p>
          <p className="text-[11px] text-muted-foreground">
            {gateway.enabled ? "Ligado pelo operador" : "Desligado"}
          </p>
        </div>
        <Switch
          checked={gateway.enabled}
          disabled={saving || loading}
          onCheckedChange={(v) => onToggle(v)}
          aria-label={`Ativar gateway ${gateway.label}`}
        />
      </div>

      {/* Aviso honesto de chaves faltando. */}
      {!gateway.configured && gateway.missingKeys.length > 0 && (
        <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-[12px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-300">
          <div className="mb-1 flex items-center gap-1.5 font-semibold uppercase tracking-wide">
            <KeyRound className="h-3.5 w-3.5" />
            Faltam credenciais no cofre
          </div>
          <ul className="list-disc space-y-0.5 pl-4">
            {gateway.missingKeys.map((k) => (
              <li key={k}>{KEY_LABELS[k] ?? k}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Campos de credencial — gravam no cofre cifrado. */}
      <CredentialsForm gateway={gateway} onSave={onSaveCredentials} />
    </ToolCard>
  );
}

export default function ComunicacaoGateways() {
  const { gateways, loading, error, toggle, savingProvider, saveCredentials } = useGateways();

  const twilio = gateways?.find((g) => g.provider === "twilio");
  const gupshup = gateways?.find((g) => g.provider === "gupshup");

  const fallback: Gateway = { provider: "twilio", label: "—", configured: false, enabled: false, missingKeys: [], fields: [] };

  return (
    <ConsoleShell
      icon={Network}
      title="Plataforma Gateway de Comunicação"
      subtitle="As plataformas que enviam mensagens ao cliente — ligue, desligue e veja o status real de cada uma."
    >
      <section className="grid gap-4 lg:grid-cols-2">
        <GatewayCard
          gateway={twilio ?? { ...fallback, provider: "twilio", label: "Twilio" }}
          icon={MessageCircle}
          accent="text-emerald-600"
          description={
            <>
              <ExplainRow>
                Gateway de <strong>WhatsApp</strong> via Twilio. Já existe motor de envio no
                servidor; basta colar as chaves no cofre para ativar o disparo real.
              </ExplainRow>
              <ExplainRow>
                Usado em lembretes de sessão, prescrição e avisos ao cliente.
              </ExplainRow>
            </>
          }
          onToggle={(v) => toggle("twilio", v)}
          onSaveCredentials={saveCredentials}
          saving={savingProvider === "twilio"}
          loading={loading}
          error={error}
        />

        <GatewayCard
          gateway={gupshup ?? { ...fallback, provider: "gupshup", label: "Gupshup" }}
          icon={Webhook}
          accent="text-sky-600"
          description={
            <>
              <ExplainRow>
                Gateway de <strong>WhatsApp Business</strong> via Gupshup — alternativa ao Twilio.
                Nesta fase, a tela só mostra o status das credenciais (sem envio ainda).
              </ExplainRow>
              <ExplainRow>
                Planejado como segundo caminho de envio, à escolha do operador.
              </ExplainRow>
            </>
          }
          onToggle={(v) => toggle("gupshup", v)}
          onSaveCredentials={saveCredentials}
          saving={savingProvider === "gupshup"}
          loading={loading}
          error={error}
        />
      </section>
    </ConsoleShell>
  );
}
