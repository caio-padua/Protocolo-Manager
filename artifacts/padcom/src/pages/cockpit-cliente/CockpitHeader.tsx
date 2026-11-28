import { useMemo } from "react";
import type { Client } from "@workspace/api-client-react";
import { useListClients } from "@workspace/api-client-react";
import { UserRound } from "lucide-react";
import { PaxterClientSelector } from "@/components/PaxterClientSelector";
import ClientIdentity from "./ClientIdentity";
import ActionButtons from "./ActionButtons";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import type { ScreenTheme } from "@/components/theme/useScreenTheme";
import { useLocation } from "wouter";

interface CockpitHeaderProps {
  theme: ScreenTheme;
  onToggleTheme: () => void;
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
  theme, onToggleTheme, client, clientId, sessionScope, onSelectClient, driveSetupPending,
  onDriveSetup, onEvolucao, onMensagens, onAgendar, onBeforeEdit,
}: CockpitHeaderProps) {
  const [location, navigate] = useLocation();
  const { data: clients, error, isError, isLoading, isFetching, refetch } = useListClients(undefined, {
    query: { queryKey: ["cockpit-clientes", sessionScope], retry: false, gcTime: 0 },
  });
  const loginNecessario = !!error && typeof error === "object" && "status" in error && error.status === 401;
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
      <div className="cc-heading"><ThemeToggle theme={theme} onToggle={onToggleTheme} className="!h-6 !w-11 !rounded-[4px]" /></div>
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
            placeholder="Selecionar cliente…" disabled={isLoading || isError} />
          {isLoading && <small role="status">Carregando clientes…</small>}
          {isError && <div className="cc-selector-error" role="alert">
            {loginNecessario ? <>
              <span>Seu acesso precisa ser confirmado para selecionar um cliente.</span>
              <button type="button" onClick={() => navigate(`/login?returnTo=${encodeURIComponent(location)}`)}>
                Entrar no sistema
              </button>
            </> : <>
              <span>Não foi possível carregar a lista de clientes.</span>
              <button type="button" disabled={isFetching} onClick={() => void refetch()}>
                {isFetching ? "Tentando novamente…" : "Tentar novamente"}
              </button>
            </>}
          </div>}
        </div>
        <ActionButtons clientId={confirmado ? clientId : null}
          driveSetupPending={driveSetupPending} onDriveSetup={onDriveSetup}
          onEvolucao={onEvolucao} onAgendar={onAgendar} onBeforeEdit={onBeforeEdit} />
      </div>
    </header>
  );
}
