import { CreditCard, Banknote } from "lucide-react";
import { ConsoleShell, ExplainRow } from "@/pages/comunicacao/_shared";
import { IntegrationVaultCard } from "@/components/integrations/IntegrationVault";

// Portas de Pagamento — Asaas (PIX/boleto/cartão nacional) e Stripe (cartão
// internacional). Padrao 18 via motor unico (/api/integrations): cada chave fica
// cifrada no cofre, a tela so mostra a mascara e revela o valor real sob o olho.
export default function ConfigPagamentos() {
  return (
    <ConsoleShell
      icon={CreditCard}
      title="Portas de Pagamento"
      subtitle="Credenciais dos gateways de cobrança. Tudo cifrado no cofre — a tela só mostra um trecho mascarado."
    >
      <section className="grid gap-4 lg:grid-cols-2">
        <IntegrationVaultCard
          provider="asaas"
          icon={CreditCard}
          accent="text-emerald-600"
          labelOn="Configurado"
          labelOff="Sem chave de API"
          description={
            <>
              <ExplainRow noLed>
                Gateway nacional para <strong>PIX, boleto e cartão</strong>. A chave de API e o
                token do webhook ficam cifrados; a URL base aceita produção ou sandbox.
              </ExplainRow>
            </>
          }
        />

        <IntegrationVaultCard
          provider="stripe"
          icon={Banknote}
          accent="text-violet-600"
          labelOn="Configurado"
          labelOff="Sem chave secreta"
          toggleLabel="Stripe ativo"
          description={
            <>
              <ExplainRow noLed>
                Gateway internacional de <strong>cartão</strong>. Guardamos a chave secreta, o
                segredo do webhook e a chave publicável — a fiação de consumo fica pronta.
              </ExplainRow>
            </>
          }
        />
      </section>
    </ConsoleShell>
  );
}
