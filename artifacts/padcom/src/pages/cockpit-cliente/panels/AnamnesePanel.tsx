import AnamnesePreviaPanel from "./AnamnesePreviaPanel";

interface Props { clientId: number; }

export default function AnamnesePanel({ clientId }: Props) {
  return <AnamnesePreviaPanel clientId={clientId} />;
}
