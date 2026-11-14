// Niveis de relacionamento do cliente (campo clients.plano), na ordem de progressao.
// Decisao do CEO em 14/11/2026: Prata, Ouro, Platinum e Diamond (substitui Bronze/Prata/Ouro/Platina/Noir).
// Fonte unica de rotulo e paleta: telas nao digitam nome nem cor de nivel por conta propria.

export const NIVEIS_CLIENTE = ["prata", "ouro", "platinum", "diamond"] as const;
export type NivelCliente = (typeof NIVEIS_CLIENTE)[number];

export const NIVEL_ENTRADA: NivelCliente = "prata";

type Paleta = { nome: string; fundoDe: string; fundoAte: string; texto: string };

// Prata = cinza metalico suave; Ouro = dourado elegante; Platinum = branco perolado/gelo;
// Diamond = tons cristalinos azul-diamante. Texto escuro sobre fundo claro: legivel nos dois temas.
export const PALETA_NIVEL: Record<NivelCliente, Paleta> = {
  prata: { nome: "Prata", fundoDe: "#e6eaef", fundoAte: "#b9c1cc", texto: "#38424f" },
  ouro: { nome: "Ouro", fundoDe: "#f3dfa3", fundoAte: "#c9a24f", texto: "#4a3608" },
  platinum: { nome: "Platinum", fundoDe: "#fcfdfe", fundoAte: "#dde4ec", texto: "#3b4a5a" },
  diamond: { nome: "Diamond", fundoDe: "#d9f2fc", fundoAte: "#79cbe9", texto: "#0b3b52" },
};

export function ehNivelCliente(valor: unknown): valor is NivelCliente {
  return typeof valor === "string" && (NIVEIS_CLIENTE as readonly string[]).includes(valor);
}

/** Rotulo exibido; valor ausente ou fora do modelo vira traco, nunca um nivel inventado. */
export function rotuloNivel(valor: string | null | undefined): string {
  return ehNivelCliente(valor) ? PALETA_NIVEL[valor].nome : "—";
}

export function fundoNivel(valor: NivelCliente): string {
  const p = PALETA_NIVEL[valor];
  return `linear-gradient(180deg, ${p.fundoDe}, ${p.fundoAte})`;
}
