import PainelEncaminhamento, { type TipoDocumento } from "@/components/encaminhamento/PainelEncaminhamento";

/**
 * Mantido por compatibilidade: todas as telas que já usavam o "Reenviar este PDF" passam a mostrar
 * o Painel de Encaminhamento (enviar por vários canais, baixar e guardar na pasta do cliente).
 */
export default function ClinicalDocumentResendForm({ clientId, documentType, documentId }: {
  clientId: number; documentType: TipoDocumento; documentId: number;
}) {
  return <PainelEncaminhamento clientId={clientId} documentType={documentType} documentId={documentId} />;
}
