import { AnamneseLeva } from "../_shared/levaAnamnese";
import { LinhoTexture } from "../_shared/texturas";

// MODELO B — bevel das perguntas ENVIDRACADO (frosted): o tecido transparece sob
// o vidro. Simbolo do topo solido, etapas mais grossas, letra serifada, botoes.
export default function BevelVidro() {
  return <AnamneseLeva theme="dark" bevel="vidro" texture={<LinhoTexture />} />;
}
