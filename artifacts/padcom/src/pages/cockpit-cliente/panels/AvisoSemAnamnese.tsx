import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

const GOLD = "#9a7b32";

export default function AvisoSemAnamnese({ clientId }: { clientId: number }) {
  const [semAnamnese, setSemAnamnese] = useState(false);

  useEffect(() => {
    let ativo = true;
    setSemAnamnese(false);
    fetch(`${import.meta.env.BASE_URL}api/cockpit/${clientId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((dto) => {
        if (!ativo || !dto) return;
        setSemAnamnese((dto?.passado?.respostasAnamnese ?? 0) === 0);
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, [clientId]);

  if (!semAnamnese) return null;

  return (
    <div
      className="bevel-3d flex items-center gap-2 rounded-md px-4 py-2.5 text-[13px] font-semibold"
      style={{
        background: "linear-gradient(180deg,#fff7e0,#fdeec2)",
        color: "#7a5a12",
        border: "1px solid rgba(154,123,50,0.4)",
      }}
    >
      <AlertTriangle className="h-4 w-4 flex-shrink-0" style={{ color: GOLD }} />
      Cliente sem anamnese registrada — você é o cérebro desta consulta.
    </div>
  );
}
