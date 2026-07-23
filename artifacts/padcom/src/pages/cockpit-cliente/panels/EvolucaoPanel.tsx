// EvolucaoPanel — aba Evolução do Cockpit da Consulta.
// Planilha de evolução + bloco de procedência (motor único).
// Segue skill-layout-paxter: bevel-3d para título de seção, sem dark-gradient.

import { MapPin } from "lucide-react";
import EvolucaoExamesPanel from "@/pages/cockpit/panels/EvolucaoExamesPanel";
import ProcedenciaDocumentosBloco from "@/components/ProcedenciaDocumentosBloco";

interface Props { clientId: number; }

export default function EvolucaoPanel({ clientId }: Props) {
  return (
    <div className="space-y-6">
      {/* Planilha de evolução de exames */}
      <EvolucaoExamesPanel clientId={clientId} />

      {/* ── Seção de Procedência — título bevel-3d (não dark-gradient) ── */}
      <div className="panel-3d p-4 space-y-4">
        <div className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5 text-[11px]">
          <MapPin className="h-3.5 w-3.5" />
          Procedência — laudos que originaram estes resultados
        </div>
        <p className="text-[11px]" style={{ color: "#647c97" }}>
          Clique em <strong>Abrir no Drive</strong> para conferir o arquivo original ou em{" "}
          <strong>Baixar arquivo</strong> para salvar localmente.
        </p>
        <ProcedenciaDocumentosBloco clientId={clientId} />
      </div>
    </div>
  );
}
