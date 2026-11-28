import { useEffect, useState } from "react";
import "./_group.css";
import CockpitHeader from "./_source/CockpitHeader";
import CockpitTabs, { type AbaId } from "./_source/CockpitTabs";
import { clientesDeExemplo } from "./_source/preview-deps";

/**
 * Referência visual extraída do cabeçalho e da régua de abas do aplicativo.
 * Consultas, navegação e ações externas foram substituídas por dados isolados.
 */
export function Atual() {
  const [clientId, setClientId] = useState<number | null>(1001);
  const [aba, setAba] = useState<AbaId>("protocolos");
  const [aviso, setAviso] = useState("");
  const client = clientesDeExemplo.find((item) => item.id === clientId) ?? null;

  useEffect(() => {
    const onPreviewAction = (event: Event) => setAviso((event as CustomEvent<string>).detail);
    window.addEventListener("cockpit-preview-action", onPreviewAction);
    return () => window.removeEventListener("cockpit-preview-action", onPreviewAction);
  }, []);

  return (
    <div className="min-h-screen" style={{ background: "hsl(40 33% 96%)", fontFamily: "Inter, sans-serif" }}>
      <div className="bg-[#f3ead1] px-5 py-2 text-xs font-semibold text-[#16294a]">
        VISUAL ATUAL · Dados fictícios · Nenhuma alteração no sistema
      </div>
      <CockpitHeader
        client={client}
        clientId={clientId}
        onSelectClient={setClientId}
        driveSetupPending={false}
        onDriveSetup={() => setAviso("Drive: disponível somente no sistema após a integração.")}
        onNewProtocol={() => setAviso("Protocolo: disponível somente no sistema após a integração.")}
      />
      {client && <CockpitTabs aba={aba} onAba={setAba} />}
      <main className="px-5 py-7">
        <div className="panel-3d-sub p-5">
          <p className="font-semibold text-[#16294a]">Conteúdo da ferramenta selecionada</p>
          <p className="mt-2 text-sm text-[#526579]">
            Esta área representa as ferramentas já existentes, sem executar operações clínicas.
          </p>
          <p className="mt-3 text-xs text-[#526579]">
            Na tela atual, o indicador “sem alarme” é exibido sem confirmação nesta prévia.
          </p>
          {aviso && <p role="status" className="mt-3 text-sm text-[#16294a]">{aviso}</p>}
        </div>
      </main>
    </div>
  );
}
