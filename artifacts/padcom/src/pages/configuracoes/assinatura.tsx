import { PenTool } from "lucide-react";
import { ConsoleShell, ExplainRow } from "@/pages/comunicacao/_shared";
import { IntegrationVaultCard } from "@/components/integrations/IntegrationVault";

// Assinatura Eletronica (ZapSign) — Padrao 18 via motor unico. O token de acesso
// fica cifrado no cofre; a tela so mostra a mascara e revela sob o olho.
export default function ConfigAssinatura() {
  return (
    <ConsoleShell
      icon={PenTool}
      title="Assinatura Eletrônica"
      subtitle="Coleta de assinatura eletrônica do cliente via ZapSign. O token fica cifrado no cofre."
    >
      <section className="grid gap-4 lg:grid-cols-2">
        <IntegrationVaultCard
          provider="zapsign"
          icon={PenTool}
          accent="text-cyan-600"
          labelOn="Configurado"
          labelOff="Sem token"
          toggleLabel="Integração ativa"
          description={
            <>
              <ExplainRow noLed>
                Liga/desliga o envio para a <strong>ZapSign</strong>. Sem token, a coleta de
                assinatura remota fica em espera — nunca trava o restante do fluxo.
              </ExplainRow>
            </>
          }
        />
      </section>
    </ConsoleShell>
  );
}
