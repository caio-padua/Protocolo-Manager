import Injetaveis from "@/pages/cockpit/panels/Injetaveis";

interface Props { clientId: number; onNovoProtocolo: () => void; }

export default function ImplantesPanel({ clientId, onNovoProtocolo }: Props) {
  return <Injetaveis clientId={clientId} filtroProcedimento="implante" onNovoProtocolo={onNovoProtocolo} />;
}
