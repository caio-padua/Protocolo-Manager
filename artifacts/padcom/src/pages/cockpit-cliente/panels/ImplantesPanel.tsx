import Injetaveis from "@/pages/cockpit/panels/Injetaveis";

interface Props { clientId: number; }

export default function ImplantesPanel({ clientId }: Props) {
  return <Injetaveis clientId={clientId} filtroProcedimento="implante" />;
}
