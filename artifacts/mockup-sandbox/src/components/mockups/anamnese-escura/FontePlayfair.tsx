import { AnamneseLeva } from "../_shared/levaAnamnese";
import { LinhoTexture } from "../_shared/texturas";

// MODELO 3 — Misto (painel navy mais escuro) + fonte PLAYFAIR DISPLAY
// (serifa editorial de alto contraste; candidata a entrar na skill).
export default function FontePlayfair() {
  return <AnamneseLeva theme="dark" bevel="misto" qfont="playfair" texture={<LinhoTexture />} />;
}
