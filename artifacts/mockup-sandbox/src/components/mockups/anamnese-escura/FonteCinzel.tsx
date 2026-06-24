import { AnamneseLeva } from "../_shared/levaAnamnese";
import { LinhoTexture } from "../_shared/texturas";

// MODELO 2 — Misto (painel navy mais escuro) + fonte CINZEL
// (serifa de titulacao OFICIAL do wordmark Paxter; a mais imponente da skill).
export default function FonteCinzel() {
  return <AnamneseLeva theme="dark" bevel="misto" qfont="cinzel" texture={<LinhoTexture />} />;
}
