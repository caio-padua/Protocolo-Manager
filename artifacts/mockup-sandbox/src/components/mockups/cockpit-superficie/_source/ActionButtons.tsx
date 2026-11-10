import { Activity, CalendarDays, FolderOpen, Loader2, PencilLine } from "lucide-react";
import { Link } from "./preview-deps";

interface ActionButtonsProps {
  clientId: number | null;
  driveSetupPending: boolean;
  onDriveSetup: () => void;
  onEvolucao: () => void;
  onAgendar?: () => void;
  onBeforeEdit: () => boolean;
}

export default function ActionButtons({
  clientId, driveSetupPending, onDriveSetup, onEvolucao, onAgendar, onBeforeEdit,
}: ActionButtonsProps) {
  const indisponivel = clientId == null;
  const edicao = (
    <>
      <PencilLine size={16} aria-hidden="true" />
      <span><strong>EDITAR CADASTRO</strong><small>Dados do cliente</small></span>
    </>
  );
  return (
    <div className="cc-actions" role="group" aria-label="Ações do cliente">
      <button type="button" className="cc-action" disabled={indisponivel || !onAgendar}
        title={onAgendar ? "Abrir marcação" : "A passagem segura do cliente para a marcação ainda não está conectada."}
        onClick={onAgendar}>
        <CalendarDays size={16} aria-hidden="true" />
        <span><strong>NOVO AGENDAMENTO</strong><small>{onAgendar ? "Abrir marcação" : "Integração pendente"}</small></span>
      </button>
      <button type="button" className="cc-action" disabled={indisponivel} onClick={onEvolucao}>
        <Activity size={16} aria-hidden="true" />
        <span><strong>EVOLUÇÃO</strong><small>Histórico clínico</small></span>
      </button>
      <button type="button" className="cc-action" disabled={indisponivel || driveSetupPending}
        onClick={onDriveSetup}>
        {driveSetupPending
          ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          : <FolderOpen size={16} aria-hidden="true" />}
        <span><strong>PASTAS DO DRIVE</strong><small>{driveSetupPending ? "Preparando pastas…" : "Preparar pastas"}</small></span>
      </button>
      {clientId == null ? (
        <button type="button" className="cc-action" disabled>{edicao}</button>
      ) : (
        <Link href={`/clients/${clientId}/edit`} className="cc-action"
          onClick={(evento) => { if (!onBeforeEdit()) evento.preventDefault(); }}>
          {edicao}
        </Link>
      )}
    </div>
  );
}
