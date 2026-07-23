import PrescricaoFormulasPanel from "@/pages/cockpit/panels/PrescricaoFormulasPanel";

interface Props { clientId: number; }

export default function PrescricaoPanel({ clientId }: Props) {
  return <PrescricaoFormulasPanel clientId={clientId} />;
}
