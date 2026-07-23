// EvolucaoPanel — aba Evolução do Cockpit da Consulta.
// Renderiza a planilha de evolução de exames + bloco de procedência unificado.
// Pedido CEO 23/07/2026: motor único ProcedenciaDocumentosBloco abaixo da planilha.

import { MapPin } from "lucide-react";
import EvolucaoExamesPanel from "@/pages/cockpit/panels/EvolucaoExamesPanel";
import ProcedenciaDocumentosBloco from "@/components/ProcedenciaDocumentosBloco";

const NAVY = "#16294a";
const GOLD = "#9a7b32";

interface Props { clientId: number; }

export default function EvolucaoPanel({ clientId }: Props) {
  return (
    <div className="space-y-6">
      {/* Planilha de evolução de exames */}
      <EvolucaoExamesPanel clientId={clientId} />

      {/* ── PROCEDÊNCIA — Motor unificado abaixo da planilha ── */}
      <div className="panel-3d border-none p-0 overflow-hidden">
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{
            background: "linear-gradient(90deg,#1e3668 0%,#16294a 100%)",
            borderBottom: "2px solid rgba(231,205,143,0.22)",
          }}
        >
          <MapPin className="h-4 w-4 shrink-0" style={{ color: GOLD }} />
          <span
            className="text-[11px] font-black uppercase tracking-[0.22em]"
            style={{ color: "#e7cd8f" }}
          >
            Procedência — laudos que originaram estes resultados
          </span>
          <span className="ml-auto text-[10px] text-slate-400">
            Clique em qualquer card para ver os analitos extraídos
          </span>
        </div>
        <div className="p-4">
          <ProcedenciaDocumentosBloco clientId={clientId} comCabecalho />
        </div>
      </div>
    </div>
  );
}
