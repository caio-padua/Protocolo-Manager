import { useMemo } from "react";
import type { Client } from "@workspace/api-client-react";
import { useListClients } from "@workspace/api-client-react";
import { UserRound } from "lucide-react";
import { PaxterClientSelector } from "@/components/PaxterClientSelector";
import ClientIdentity from "./ClientIdentity";
import ActionButtons from "./ActionButtons";

interface CockpitHeaderProps {
  client: Client | null | undefined;
  clientId: number | null;
  sessionScope: string;
  onSelectClient: (id: number | null) => void;
  driveSetupPending: boolean;
  onDriveSetup: () => void;
  onEvolucao: () => void;
  onMensagens: () => void;
  onAgendar?: () => void;
  onBeforeEdit: () => boolean;
}

export default function CockpitHeader({
  client, clientId, sessionScope, onSelectClient, driveSetupPending,
  onDriveSetup, onEvolucao, onMensagens, onAgendar, onBeforeEdit,
}: CockpitHeaderProps) {
  const { data: clients, isError } = useListClients(undefined, {
    query: { queryKey: ["cockpit-clientes", sessionScope], retry: false, gcTime: 0 },
  });
  const opcoes = useMemo(() => {
    const lista = (clients ?? []).map((c) => ({
      id: c.id, name: c.name, cpf: c.cpf, phone: c.phone, photoUrl: c.photoUrl,
    }));
    if (client && !lista.some((item) => item.id === client.id)) {
      lista.unshift({
        id: client.id, name: client.name, cpf: client.cpf,
        phone: client.phone, photoUrl: client.photoUrl,
      });
    }
    return lista;
  }, [clients, client]);
  const confirmado = client != null && client.id === clientId;

  return (
    <header className="cc-header">
      <div className="cc-heading"><span>COCKPIT DA CONSULTA</span></div>
      {confirmado ? (
        <ClientIdentity client={client} onMensagens={onMensagens} />
      ) : (
        <div className="cc-empty-identity">
          <UserRound size={24} aria-hidden="true" />
          <div>
            <strong>{clientId ? "Aguardando confirmação do cliente" : "Nenhum cliente selecionado"}</strong>
            <span>Selecione um cliente para acessar as ferramentas.</span>
          </div>
        </div>
      )}
      <div className="cc-controls" aria-label="Seleção e ações do cliente">
        <div className="cc-selector">
          <span>CLIENTE</span>
          <PaxterClientSelector clientes={opcoes}
            value={confirmado ? clientId : null} onChange={onSelectClient}
            placeholder="Selecionar cliente…" />
          {isError && <small role="alert">Não foi possível carregar a lista de clientes.</small>}
        </div>
        <ActionButtons clientId={confirmado ? clientId : null}
          driveSetupPending={driveSetupPending} onDriveSetup={onDriveSetup}
          onEvolucao={onEvolucao} onAgendar={onAgendar} onBeforeEdit={onBeforeEdit} />
      </div>
    </header>
  );
}
