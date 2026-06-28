import { Smartphone, MessageCircle, Send } from "lucide-react";
import { ConsoleShell, ToolCard, StatusVela, ExplainRow, useComunicacaoStatus } from "./_shared";
import { IntegrationVaultCard } from "@/components/integrations/IntegrationVault";

// Comunicacao Digital — WhatsApp (informativo; credencial mora no Gateway) e
// Telegram (card de credencial Padrao 18 via motor unico). Status reflete o
// estado verdadeiro do servidor.
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
            </>
          }
        />
      </section>
    </ConsoleShell>
  );
}
