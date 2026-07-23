import EvolucaoExamesPanel from "@/pages/cockpit/panels/EvolucaoExamesPanel";

interface Props { clientId: number; }

export default function EvolucaoPanel({ clientId }: Props) {
  return <EvolucaoExamesPanel clientId={clientId} />;
}
