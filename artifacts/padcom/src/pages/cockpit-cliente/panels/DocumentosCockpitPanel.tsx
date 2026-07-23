// Painel Documentos do cockpit: DocumentosPanel + ContratosTimelineInline.
// Arquivo separado para lazy loading — não conflita com DocumentosPanel.tsx existente.
import DocumentosPanel from "./DocumentosPanel";
import ContratosTimelineInline from "./ContratosTimelineInline";

interface Props { clientId: number; }

export default function DocumentosCockpitPanel({ clientId }: Props) {
  return (
    <div className="space-y-6">
      <DocumentosPanel clientId={clientId} />
      <ContratosTimelineInline clientId={clientId} />
    </div>
  );
}
