import Injetaveis from "@/pages/cockpit/panels/Injetaveis";

interface Props { clientId: number; onNovoProtocolo: () => void; }

export default function InjetaveisPanel({ clientId, onNovoProtocolo }: Props) {
  return <Injetaveis clientId={clientId} filtroProcedimento="injetavel" onNovoProtocolo={onNovoProtocolo} />;
}
