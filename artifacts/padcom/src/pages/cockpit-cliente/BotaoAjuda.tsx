import { useState } from "react";
import { DiretrizesDialog } from "./DiretrizesDialog";
import type { TipoReferencia } from "./pulso-referencias";
import "./pulso-niveis.css";

// Quadradinho "?" do canto superior direito: abre a janela com a referência científica. Aberto, vira "!".
export function BotaoAjuda({ aberto, onClick, rotulo }: { aberto: boolean; onClick: () => void; rotulo: string }) {
  return (
    <button type="button" className="btn-3d-soft pn-ajuda" onClick={onClick} aria-pressed={aberto} aria-haspopup="dialog"
      aria-label={`Referência científica: ${rotulo}`} title="Referência científica">
      {aberto ? "!" : "?"}
    </button>
  );
}

// Versão autônoma (guarda o próprio estado), para os gráficos.
export function BotaoAjudaComJanela({ tipo, rotulo, escuro }: { tipo: TipoReferencia; rotulo: string; escuro: boolean }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <BotaoAjuda aberto={aberto} onClick={() => setAberto((a) => !a)} rotulo={rotulo} />
      <DiretrizesDialog tipo={aberto ? tipo : null} escuro={escuro} onClose={() => setAberto(false)} />
    </>
  );
}
