import { FolderOpen, PencilLine } from "lucide-react";
import "./IdentityActions.css";

export type IdentityAction = "edit" | "drive";

interface IdentityActionsProps {
  clientId: number | null;
  onAction: (action: IdentityAction) => void;
  className?: string;
}

export function IdentityActions({ clientId, onAction, className = "" }: IdentityActionsProps) {
  const disabled = clientId === null;
  return (
    <div className={`identity-actions ${className}`} role="group" aria-label="Ações da prévia do cliente">
      <button
        type="button"
        className="identity-action"
        disabled={disabled}
        onClick={() => onAction("edit")}
        aria-label="Editar cadastro: demonstração sem executar alterações"
      >
        <PencilLine size={15} aria-hidden="true" />
        <span className="identity-action-copy">
          <strong>EDITAR CADASTRO</strong>
          <small>Revisar os dados do cliente</small>
        </span>
      </button>
      <button
        type="button"
        className="identity-action"
        disabled={disabled}
        onClick={() => onAction("drive")}
        aria-label="Preparar pastas no Drive: demonstração sem executar ações"
      >
        <FolderOpen size={15} aria-hidden="true" />
        <span className="identity-action-copy">
          <strong>PASTAS DO DRIVE</strong>
          <small>Preparar a estrutura de pastas</small>
        </span>
      </button>
    </div>
  );
}
