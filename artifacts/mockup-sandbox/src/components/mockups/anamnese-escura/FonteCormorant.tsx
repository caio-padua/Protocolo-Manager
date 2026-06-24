import { AnamneseLeva } from "../_shared/levaAnamnese";
import { LinhoTexture } from "../_shared/texturas";

// MODELO 1 — Misto (painel navy mais escuro) + fonte CORMORANT GARAMOND
// (serifa de texto OFICIAL do wordmark Paxter; a mais "elitizada" da skill).
export default function FonteCormorant() {
  return <AnamneseLeva theme="dark" bevel="misto" qfont="cormorant" texture={<LinhoTexture />} />;
}
