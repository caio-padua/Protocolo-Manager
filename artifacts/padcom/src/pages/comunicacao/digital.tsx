import { useEffect, useState } from "react";
import { Smartphone, MessageCircle, Send, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getCollabToken } from "@/lib/collab-auth";
import { SecretBadge } from "@/components/settings/SettingsUI";
import { ConsoleShell, ToolCard, StatusVela, ExplainRow, useComunicacaoStatus, BASE } from "./_shared";

type SecretStatus = { isSet: boolean; masked?: string | null; source?: string | null };
type TelegramPayload = {
  provider: string;
  active: boolean;
  tokenStatus: SecretStatus;
  webhookSecretStatus: SecretStatus;
};

// Campo de token do Telegram — grava o segredo no COFRE cifrado (telegram.botToken)
// pela rota PUT /settings/telegram. A tela so mostra a mascara, nunca o valor.
function TelegramTokenField({ onSaved }: { onSaved: () => void }) {
  const { toast } = useToast();
  const [payload, setPayload] = useState<TelegramPayload | null>(null);
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);

  function loadPayload() {
    const t = getCollabToken();
    fetch(`${BASE}/api/settings/telegram`, {
      headers: t ? { Authorization: `Bearer ${t}` } : {},
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("telegram"))))
      .then((d) => setPayload(d as TelegramPayload))
      .catch(() => setPayload(null));
  }

  useEffect(() => {
    loadPayload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    if (!token.trim()) {
      toast({ title: "Cole o token do bot antes de salvar", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const t = getCollabToken();
      const r = await fetch(`${BASE}/api/settings/telegram`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(t ? { Authorization: `Bearer ${t}` } : {}),
        },
        body: JSON.stringify({ token: token.trim() }),
      });
      if (!r.ok) throw new Error("save");
      toast({ title: "Token do Telegram salvo no cofre" });
      setToken("");
      loadPayload();
      onSaved();
    } catch {
      toast({ title: "Falha ao salvar o token", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="concave-3d space-y-2.5 px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground/80">
          Token do bot (BotFather)
        </span>
        <SecretBadge
          isSet={!!payload?.tokenStatus.isSet}
          masked={payload?.tokenStatus.masked}
          source={payload?.tokenStatus.source}
        />
      </div>
      <Input
        className="field-engraved"
        type="password"
        autoComplete="new-password"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder="Cole o token do @BotFather (deixe em branco para manter)"
      />
      <div className="flex justify-end">
        <Button type="button" className="btn-3d" disabled={saving} onClick={save}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Salvando..." : "Salvar token"}
        </Button>
      </div>
    </div>
  );
}

// Comunicacao Digital — WhatsApp e Telegram JUNTOS no mesmo painel
// (decisao do CEO). Status reflete o estado verdadeiro do servidor.
export default function ComunicacaoDigital() {
  const { status, loading, error, refetch } = useComunicacaoStatus();

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
          vela={<StatusVela on={!!status?.whatsapp} pending={loading} error={error} labelOn="Conectado" labelOff="Não configurado" />}
        >
          <ExplainRow>
            Envio automático via <strong>Twilio</strong> (servidor). Quando as credenciais não estão no
            cofre, o sistema gera um link <strong>wa.me</strong> de apoio — nunca trava o fluxo.
          </ExplainRow>
          <ExplainRow>
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
          name="Telegram"
          accent="text-sky-600"
          vela={<StatusVela on={!!status?.telegram} pending={loading} error={error} labelOn="Token no cofre" labelOff="Sem token" />}
        >
          <ExplainRow>
            Canal nativo do bot <strong>@Paduaclinica_bot</strong>. O cliente é vinculado por
            <strong> chat_id</strong> (prova de posse via webhook), sem expor número de telefone.
          </ExplainRow>
          <ExplainRow>
            Cole o <strong>token do bot</strong> abaixo para guardá-lo no cofre cifrado. A luz acima
            reflete a presença real do token.
          </ExplainRow>
          <TelegramTokenField onSaved={refetch} />
        </ToolCard>
      </section>
    </ConsoleShell>
  );
}
