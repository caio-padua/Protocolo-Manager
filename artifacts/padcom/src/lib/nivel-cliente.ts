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

// Cliente cujo nivel antigo nao tem equivalente seguro no modelo novo (migracao 20261125): o valor anterior
// fica preservado como "legado:<valor>" e o cliente aparece como "A REVISAR" ate a equipe escolher o nivel.
export const PREFIXO_NIVEL_LEGADO = "legado:";
export const ROTULO_NIVEL_PENDENTE = "A revisar";

/** Valor anterior preservado (ex.: "ouro"), ou null se o nivel nao e pendente. */
export function nivelLegado(valor: string | null | undefined): string | null {
  return typeof valor === "string" && valor.startsWith(PREFIXO_NIVEL_LEGADO)
    ? valor.slice(PREFIXO_NIVEL_LEGADO.length)
    : null;
}

/** Rotulo exibido; pendente vira "A revisar"; ausente ou desconhecido vira traco, nunca um nivel inventado. */
export function rotuloNivel(valor: string | null | undefined): string {
  if (ehNivelCliente(valor)) return PALETA_NIVEL[valor].nome;
  return nivelLegado(valor) !== null ? ROTULO_NIVEL_PENDENTE : "—";
}

export function fundoNivel(valor: NivelCliente): string {
  const p = PALETA_NIVEL[valor];
  return `linear-gradient(180deg, ${p.fundoDe}, ${p.fundoAte})`;
}
