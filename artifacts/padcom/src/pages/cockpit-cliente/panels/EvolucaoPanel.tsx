// EvolucaoPanel — aba Evolução do Cockpit da Consulta.
// Renderiza a planilha de evolução de exames + bloco autônomo de procedência.
// Pedido CEO 23/07/2026: bloco de procedência visível abaixo da planilha.

import { MapPin } from "lucide-react";
import EvolucaoExamesPanel from "@/pages/cockpit/panels/EvolucaoExamesPanel";
import ExamesEnviadosPanel from "./ExamesEnviadosPanel";

const NAVY = "#16294a";
const GOLD = "#9a7b32";

interface Props { clientId: number; }

export default function EvolucaoPanel({ clientId }: Props) {
  return (
    <div className="space-y-6">
      {/* Planilha de evolução de exames */}
      <EvolucaoExamesPanel clientId={clientId} />

      {/* ── PROCEDÊNCIA — bloco autônomo abaixo da planilha ── */}
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
            Procedência — de onde vieram os resultados
          </span>
        </div>
        <div className="p-4">
          <p className="mb-3 text-[11px]" style={{ color: "#647c97" }}>
            Clientes e arquivos de laudo que originaram os exames deste paciente.
            Abra no Drive ou baixe pelo sistema para conferir a fonte.
          </p>
          <ExamesEnviadosPanel clientId={clientId} />
        </div>
      </div>
    </div>
  );
}
