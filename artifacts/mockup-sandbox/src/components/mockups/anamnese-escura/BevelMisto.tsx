import { AnamneseLeva } from "../_shared/levaAnamnese";
import { LinhoTexture } from "../_shared/texturas";

// MODELO C — bevel das perguntas MISTO: navy solido com um leve verniz no topo
// (meio-termo entre solido e vidro). Simbolo solido, etapas grossas, letra serifada.
export default function BevelMisto() {
  return <AnamneseLeva theme="dark" bevel="misto" texture={<LinhoTexture />} />;
}
