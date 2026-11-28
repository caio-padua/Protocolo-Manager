/** Selo em relevo usado nas telas do Pit Stop (tom só muda a cor do texto; o estado também é dito por extenso). */
export function Selo({ children, tom }: { children: React.ReactNode; tom: "ok" | "aviso" | "erro" | "neutro" }) {
  const cor = { ok: "#1f6b3a", aviso: "#7a5a12", erro: "#8a1c1c", neutro: "#2c3e63" }[tom];
  return <span className="bevel-3d inline-block px-2 py-1 text-[10px] font-black uppercase tracking-widest" style={{ color: cor }}>{children}</span>;
}
