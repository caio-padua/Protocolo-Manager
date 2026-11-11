import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { VariantesSubstanciaConsulta } from "../../artifacts/padcom/src/pages/substances/VariantesSubstanciaConsulta";
import { COLLAB_EVENT } from "../../artifacts/padcom/src/lib/collab-auth";

type Pendente = { resolve: (value: Response) => void };
const pendentes: Pendente[] = [];
(window as any).pendentes = pendentes;
(window as any).responder = (indice: number, fornecedor: string) => {
  const payload = { clinica: "Clínica sintética", variantes: [{ id: indice + 1, doseTotal: "10 mg", forma: "ampola", volumeMl: "2", concentracao: "10 mg / 2 ml", composicao: null, subtipoImplante: null,
    viasFonte: "IM", ofertas: [{ id: indice + 1, fornecedor, quantidadeEmbalagem: 10, custoUnitarioCentavos: 500,
      custoEmbalagemCentavos: 5000, documento: "Fonte sintética", pagina: 1, linha: 1,
      embalagemOriginal: "10 ampolas", fonteDataNomeArquivo: "2025-09-29" }] }] };
  pendentes[indice].resolve(new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } }));
};
window.fetch = () => new Promise<Response>(resolve => pendentes.push({ resolve }));
function Tela() {
  const [id, setId] = useState(1);
  return <><button onClick={() => window.dispatchEvent(new Event(COLLAB_EVENT))}>Trocar sessão</button>
    <button onClick={() => setId(2)}>Trocar ficha</button>
    <VariantesSubstanciaConsulta key={id} substanceId={id}/></>;
}
createRoot(document.getElementById("root")!).render(<Tela />);
