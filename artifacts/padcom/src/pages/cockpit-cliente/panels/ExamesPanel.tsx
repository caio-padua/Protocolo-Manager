import { Upload, FolderSync } from "lucide-react";
import AvisoSemAnamnese from "./AvisoSemAnamnese";
import ExamesEnviadosPanel from "./ExamesEnviadosPanel";
import PedidosExamesPanel from "@/pages/cockpit/panels/PedidosExamesPanel";

const GOLD = "#9a7b32";

interface Props { clientId: number; }

export default function ExamesPanel({ clientId }: Props) {
  return (
    <div className="space-y-4">
      {/* Canais de entrada */}
      <div className="panel-3d border-none p-4">
        <div className="bevel-3d px-3 py-1.5 text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-2 mb-3">
          Canais de entrada de exames
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="concave-3d p-3 flex items-start gap-3">
            <Upload className="w-4 h-4 mt-0.5 shrink-0" style={{ color: GOLD }} />
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                Portal do Cliente
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Arquivo enviado pelo próprio cliente via link de portal. Passa pelo motor de extração automático.
              </p>
            </div>
          </div>
          <div className="concave-3d p-3 flex items-start gap-3">
            <FolderSync className="w-4 h-4 mt-0.5 shrink-0" style={{ color: GOLD }} />
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                Google Drive (automático)
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Drive-watcher verifica a pasta do cliente a cada 4h e importa PDFs novos automaticamente.
              </p>
            </div>
          </div>
        </div>
      </div>

      <AvisoSemAnamnese clientId={clientId} />
      <PedidosExamesPanel clientId={clientId} />
      <ExamesEnviadosPanel clientId={clientId} />
    </div>
  );
}
