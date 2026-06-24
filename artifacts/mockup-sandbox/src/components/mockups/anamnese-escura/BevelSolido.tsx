import { AnamneseLeva } from "../_shared/levaAnamnese";
import { LinhoTexture } from "../_shared/texturas";

// MODELO A — bevel das perguntas em NAVY SOLIDO intenso (chapado + sombreado).
// Simbolo do topo solido, etapas mais grossas, letra serifada, botoes Ouvir/Video/Gravar.
export default function BevelSolido() {
  return <AnamneseLeva theme="dark" bevel="solido" texture={<LinhoTexture />} />;
}
