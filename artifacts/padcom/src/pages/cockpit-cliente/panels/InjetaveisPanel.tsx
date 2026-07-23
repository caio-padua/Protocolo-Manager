import Injetaveis from "@/pages/cockpit/panels/Injetaveis";

interface Props { clientId: number; }

export default function InjetaveisPanel({ clientId }: Props) {
  return <Injetaveis clientId={clientId} filtroProcedimento="injetavel" />;
}
