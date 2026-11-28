import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Ponto unico para a faixa do topo: cada tela entrega sua frase e seus botoes aqui, sem copiar layout. */
let frase: string | null = null;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());
const assinar = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };

/** Frase com dado vivo da tela (substitui a frase generica do mapa). Sai ao desmontar a tela. */
export function useFraseAba(texto: string | null | undefined) {
  useEffect(() => {
    frase = texto || null;
    avisar();
    return () => { frase = null; avisar(); };
  }, [texto]);
}
export function useFraseAbaAtual() {
  return useSyncExternalStore(assinar, () => frase, () => null);
}

/** Botoes da tela: renderiza na faixa do topo (md+); abaixo de md fica no corpo da tela. */
export function AcoesTopo({ children }: { children: ReactNode }) {
  const alvo = typeof document !== "undefined" ? document.getElementById("aba-acoes") : null;
  const desktop = typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;
  if (alvo && desktop) return createPortal(children, alvo);
  return <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>;
}
