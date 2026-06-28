import { useCallback, useEffect, useState } from "react";
import { Network, MessageCircle, Webhook, KeyRound } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { getCollabToken } from "@/lib/collab-auth";
import { ConsoleShell, ToolCard, StatusVela, ExplainRow, BASE } from "./_shared";

// Plataforma Gateway de Comunicacao — Twilio e Gupshup, cada um com a luzinha
// de vela (status REAL de configuracao) e um toggle (escolha do operador).
// A luz nunca fica verde sem credencial; o toggle persiste de verdade.

type GatewayProvider = "twilio" | "gupshup";

type Gateway = {
  provider: GatewayProvider;
  label: string;
  configured: boolean;
  enabled: boolean;
  missingKeys: string[];
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
    return fetch(`${BASE}/api/comunicacao/gateways`)
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
    fetch(`${BASE}/api/comunicacao/gateways`)
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

  return { gateways, loading, error, toggle, savingProvider };
}

function GatewayCard({
  gateway,
  icon,
  accent,
  description,
  onToggle,
  saving,
  loading,
  error,
}: {
  gateway: Gateway;
  icon: typeof MessageCircle;
  accent: string;
  description: React.ReactNode;
  onToggle: (enabled: boolean) => void;
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
    </ToolCard>
  );
}

export default function ComunicacaoGateways() {
  const { gateways, loading, error, toggle, savingProvider } = useGateways();

  const twilio = gateways?.find((g) => g.provider === "twilio");
  const gupshup = gateways?.find((g) => g.provider === "gupshup");

  const fallback: Gateway = { provider: "twilio", label: "—", configured: false, enabled: false, missingKeys: [] };

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
          saving={savingProvider === "gupshup"}
          loading={loading}
          error={error}
        />
      </section>
    </ConsoleShell>
  );
}
