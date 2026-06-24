import { AnamneseLeva } from "../_shared/levaAnamnese";
import { LinhoTexture } from "../_shared/texturas";

// MODELO 4 — Misto (painel navy mais escuro) + fonte LORA
// (serifa humanista calma e muito legivel; candidata a entrar na skill).
export default function FonteLora() {
  return <AnamneseLeva theme="dark" bevel="misto" qfont="lora" texture={<LinhoTexture />} />;
}
