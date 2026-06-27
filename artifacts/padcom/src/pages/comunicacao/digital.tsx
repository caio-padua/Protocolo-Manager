import { Smartphone, MessageCircle, Send } from "lucide-react";
import { ConsoleShell, ToolCard, StatusVela, ExplainRow, useComunicacaoStatus } from "./_shared";

// Comunicacao Digital — WhatsApp e Telegram JUNTOS no mesmo painel
// (decisao do CEO). Status reflete o estado verdadeiro do servidor.
export default function ComunicacaoDigital() {
  const { status, loading, error } = useComunicacaoStatus();

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
            Usado em lembretes de sessão, prescrição e avisos ao cliente.
          </ExplainRow>
          {!status?.whatsapp && !loading && (
            <p className="text-[12px] text-amber-700 dark:text-amber-400">
              Para ligar o envio direto, faltam as credenciais Twilio no cofre deste ambiente.
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
            O envio só funciona com o <strong>TELEGRAM_BOT_TOKEN</strong> no cofre <em>deste</em> repl.
            A luz acima reflete a presença real do token.
          </ExplainRow>
          {!status?.telegram && !loading && (
            <p className="text-[12px] text-amber-700 dark:text-amber-400">
              Aguardando o token no painel de Secrets deste ambiente para concluir o teste real.
            </p>
          )}
        </ToolCard>
      </section>
    </ConsoleShell>
  );
}
