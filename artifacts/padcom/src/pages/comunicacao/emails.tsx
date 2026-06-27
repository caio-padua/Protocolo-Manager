import { useState } from "react";
import { Mail, Send, FileText } from "lucide-react";
import { ConsoleShell, ToolCard, StatusVela, ExplainRow, useComunicacaoStatus, BASE } from "./_shared";

// E-mails — status do Gmail (integracao Google) + acao de lembretes semanais.
export default function ComunicacaoEmails() {
  const { status, loading, error } = useComunicacaoStatus();
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function enviarLembretes() {
    if (!window.confirm("Disparar os lembretes semanais por e-mail agora? Esta ação envia mensagens reais aos clientes elegíveis.")) {
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const r = await fetch(`${BASE}/api/email/send-weekly-reminders`, { method: "POST" });
      setResult(r.ok ? "Lembretes processados." : `Falha (HTTP ${r.status}).`);
    } catch {
      setResult("Falha de rede ao processar.");
    } finally {
      setSending(false);
    }
  }

  return (
    <ConsoleShell
      icon={Mail}
      title="E-mails"
      subtitle="Disparos por e-mail (Gmail) — pré-sessão, pós-sessão e lembretes em lote."
    >
      <section className="grid gap-4 lg:grid-cols-2">
        <ToolCard
          icon={Mail}
          name="Conta Gmail"
          vela={<StatusVela on={!!status?.gmail} pending={loading} error={error} labelOn="Conectada" labelOff="Não conectada" />}
        >
          <ExplainRow>
            Envio via integração Google (Gmail), com assunto padronizado e anexos (ex.: RAS assinado).
          </ExplainRow>
          <ExplainRow>
            Cobre e-mails de pré-sessão (código + agenda), primeira sessão (benefícios) e pós-sessão.
          </ExplainRow>
        </ToolCard>

        <ToolCard icon={Send} name="Lembretes semanais" accent="text-primary">
          <ExplainRow>
            Dispara o lote de lembretes da semana para os clientes com sessão programada.
          </ExplainRow>
          <button
            type="button"
            onClick={enviarLembretes}
            disabled={sending || !status?.gmail}
            className="btn-3d mt-1 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {sending ? "Processando…" : "Disparar agora"}
          </button>
          {!status?.gmail && !loading && (
            <p className="text-[12px] text-amber-700 dark:text-amber-400">
              Conecte o Gmail para habilitar o disparo.
            </p>
          )}
          {result && <p className="text-[12px] text-foreground/80">{result}</p>}
        </ToolCard>
      </section>

      <section className="panel-3d p-5">
        <ToolCard icon={FileText} name="Modelos de e-mail">
          <ExplainRow>
            Os textos e vídeos usados nos e-mails ficam em <strong>Configurações → Textos & Vídeos</strong>.
          </ExplainRow>
        </ToolCard>
      </section>
    </ConsoleShell>
  );
}
