// ActionButtons — EDITAR · DRIVE · PROTOCOLO
// Estado vazio: botões fantasma (opacity-40, não clicáveis)
// Estado preenchido: botões ativos btn-3d-soft / btn-3d

import { Loader2, Pencil, FolderOpen, Plus } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

interface ActionButtonsProps {
  clientId: number | null;
  driveSetupPending: boolean;
  onDriveSetup: () => void;
}

export default function ActionButtons({ clientId, driveSetupPending, onDriveSetup }: ActionButtonsProps) {
  const ghost = !clientId;

  return (
    <div
      className="flex items-center gap-2 transition-opacity duration-200"
      style={{ opacity: ghost ? 0.38 : 1, pointerEvents: ghost ? "none" : "auto" }}
      aria-disabled={ghost}
    >
      {/* EDITAR */}
      <Link href={clientId ? `/clients/${clientId}/edit` : "#"}>
        <Button
          className="btn-3d-soft h-8 text-[10px] font-black px-3"
          tabIndex={ghost ? -1 : 0}
        >
          <Pencil className="w-3 h-3 mr-1.5" />
          EDITAR
        </Button>
      </Link>

      {/* DRIVE */}
      <Button
        className="btn-3d-soft h-8 text-[10px] font-black px-3"
        onClick={onDriveSetup}
        disabled={driveSetupPending}
        tabIndex={ghost ? -1 : 0}
      >
        {driveSetupPending
          ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
          : <FolderOpen className="w-3 h-3 mr-1.5" />}
        DRIVE
      </Button>

      {/* PROTOCOLO */}
      <Link href={clientId ? `/protocols/new?clientId=${clientId}` : "#"}>
        <Button
          className="btn-3d h-8 text-[10px] font-black px-3"
          tabIndex={ghost ? -1 : 0}
        >
          <Plus className="w-3 h-3 mr-1.5" />
          PROTOCOLO
        </Button>
      </Link>
    </div>
  );
}
