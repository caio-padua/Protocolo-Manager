// CockpitHeader — cabeçalho sticky com 2 estados visuais.
// ESTADO VAZIO: picker centralizado, botões fantasma.
// ESTADO PREENCHIDO: ClientIdentity à esquerda, ActionButtons à direita.
// Remove "Padcon Conect" (ruído de marca) — requisito R-HEADER-2.

import { UserRound } from "lucide-react";
import ClientIdentity from "./ClientIdentity";
import ActionButtons from "./ActionButtons";
import CockpitSearch from "./CockpitSearch";

const GOLD = "#9a7b32";

interface Client {
  id: number;
  name: string;
  birthDate?: string | null;
  photo?: string | null;
}

interface CockpitHeaderProps {
  client: Client | null | undefined;
  clientId: number | null;
  onSelectClient: (id: number | null) => void;
  driveSetupPending: boolean;
  onDriveSetup: () => void;
}

const HEADER_STYLE: React.CSSProperties = {
  background: "linear-gradient(180deg,#1e3668 0%,#16294a 55%,#0f1e3a 100%)",
  borderBottom: "1px solid rgba(231,205,143,0.25)",
  boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
};

export default function CockpitHeader({
  client,
  clientId,
  onSelectClient,
  driveSetupPending,
  onDriveSetup,
}: CockpitHeaderProps) {
  const temCliente = !!client && !!clientId;

  return (
    <header
      className="flex items-center justify-between gap-4 px-5 py-3.5"
      style={HEADER_STYLE}
    >
      {/* LADO ESQUERDO */}
      {temCliente ? (
        // Estado preenchido: identidade do cliente
        <ClientIdentity client={client} alarmColor="green" />
      ) : (
        // Estado vazio: ícone + instrução
        <div className="flex items-center gap-2">
          <div
            className="w-9 h-9 flex items-center justify-center shrink-0 rounded-[6px]"
            style={{
              background: "rgba(154,123,50,0.12)",
              border: "1.5px dashed rgba(154,123,50,0.35)",
            }}
          >
            <UserRound className="w-4 h-4" style={{ color: `${GOLD}80` }} />
          </div>
          <div>
            <div
              className="text-[10px] font-black uppercase tracking-[0.28em]"
              style={{ color: "rgba(255,251,240,0.35)" }}
            >
              COCKPIT DA CONSULTA
            </div>
            <div
              className="text-[11px] font-bold"
              style={{ color: "rgba(255,251,240,0.22)" }}
            >
              Nenhum paciente selecionado
            </div>
          </div>
        </div>
      )}

      {/* LADO DIREITO */}
      <div className="flex items-center gap-3 flex-wrap justify-end">
        {/* Campo de busca — sempre visível */}
        <CockpitSearch
          onSelect={onSelectClient}
          currentName={client?.name}
          placeholder={temCliente ? `Trocar: ${client!.name.split(" ")[0]}…` : "Buscar paciente…"}
        />

        {/* Botões de ação — fantasma quando vazio */}
        <ActionButtons
          clientId={clientId}
          driveSetupPending={driveSetupPending}
          onDriveSetup={onDriveSetup}
        />
      </div>
    </header>
  );
}
