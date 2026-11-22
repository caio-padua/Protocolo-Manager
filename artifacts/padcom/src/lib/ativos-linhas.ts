/**
 * Leitura segura de uma linha de ativo ("Lactase 9000 fcc") em nome, dose e unidade, SEM perder o texto original.
 * Só reconhece dose quando há número seguido de unidade conhecida; qualquer outra linha fica inteira no nome.
 * Reescrever mexe apenas no trecho alterado: o restante da linha volta exatamente como estava.
 */
export const UNIDADES_ATIVO = ["mg", "mcg", "µg", "g", "mL", "UI", "%", "fcc", "fip", "du", "hut", "UFC", "bilhões"] as const;

export type LinhaAtivoPartes = {
  /** Texto antes da dose (nome do ativo), sem espaço final. */
  nome: string;
  /** Espaço original entre nome e dose. */
  folga: string;
  dose: string | null;
  /** Espaço original entre dose e unidade. */
  sepUnidade: string;
  unidade: string | null;
  /** Texto original depois da unidade (ex.: " por cápsula"). */
  resto: string;
};

const RE = /(\d+(?:[.,]\d+)?)(\s*)(mcg|µg|mg|ml|ui|ufc|fcc|fip|hut|du|bilh(?:ões|oes)|g|%)(?![A-Za-zµ])/i;

export function lerPartesAtivo(linha: string): LinhaAtivoPartes {
  const m = RE.exec(linha);
  if (!m || m.index === 0) return { nome: linha, folga: "", dose: null, sepUnidade: "", unidade: null, resto: "" };
  const antes = linha.slice(0, m.index);
  const nome = antes.replace(/\s+$/, "");
  return {
    nome, folga: antes.slice(nome.length), dose: m[1], sepUnidade: m[2], unidade: m[3],
    resto: linha.slice(m.index + m[0].length),
  };
}

export function montarLinhaAtivo(p: LinhaAtivoPartes): string {
  if (p.dose === null || p.unidade === null) return p.nome;
  return `${p.nome}${p.folga}${p.dose}${p.sepUnidade}${p.unidade}${p.resto}`;
}

/** Troca um campo e devolve a linha completa. */
export function alterarAtivo(linha: string, campo: "nome" | "dose" | "unidade" | "resto", valor: string): string {
  const p = lerPartesAtivo(linha);
  if (p.dose === null) return campo === "nome" ? valor : linha;
  return montarLinhaAtivo({ ...p, [campo]: valor });
}
