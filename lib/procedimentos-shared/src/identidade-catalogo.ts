/** Valores explícitos; nome de catálogo sozinho não prova identidade química. */
export type ComponenteCatalogo = {
  nome: string;
  doseTotal: string;
  unidade: string;
};
export type IdentidadeCatalogo = {
  nome: string | null;
  identidadeConfirmada: boolean;
  forma: string | null;
  subtipoImplante?: "absorvivel" | "nao_absorvivel" | null;
  componentes: ComponenteCatalogo[] | null;
  composicaoCompletaConfirmada: boolean;
  volumeMl: string | null;
  concentracao: string | null;
  vias: string[] | null;
};
export type ComparacaoCatalogo =
  | { ficha: "distinta"; apresentacao: "distinta"; motivo: string }
  | { ficha: "mesma"; apresentacao: "mesma" | "distinta" | "conferir"; motivo: string }
  | { ficha: "conferir"; apresentacao: "conferir"; motivo: string };

const ausentes = new Set(["—", "-", "NÃO INFORMADO", "NAO INFORMADO", "NÃO INFORMADA",
  "NAO INFORMADA", "DESCONHECIDO", "DESCONHECIDA", "N/A", "N/D", "A DEFINIR"]);
const texto = (valor: string | null) => {
  if (typeof valor !== "string" || !valor.trim()) return null;
  const normalizado = valor.trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
  return ausentes.has(normalizado) ? null : normalizado;
};
function decimal(valor: string | null): string | null {
  if (typeof valor !== "string" || valor.trim().length > 24 || !/^\d+(?:[.,]\d+)?$/.test(valor.trim())) return null;
  const [parte, fracao = ""] = valor.trim().replace(",", ".").split(".");
  const inteiro = parte.replace(/^0+(?=\d)/, "");
  const resto = fracao.replace(/0+$/, "");
  if (/^0+$/.test(inteiro) && !resto) return null;
  return resto ? `${inteiro}.${resto}` : inteiro;
}
function componentes(c: ComponenteCatalogo[] | null): Map<string, string> | null {
  if (!Array.isArray(c) || c.length === 0) return null;
  const resultado = new Map<string, string>();
  for (const item of c) {
    const nome = texto(item?.nome ?? null), unidade = texto(item?.unidade ?? null);
    const dose = decimal(item?.doseTotal ?? null);
    if (!nome || !unidade || !["MG", "MCG", "µG", "ΜG", "UG", "G", "UI", "IU"].includes(unidade) ||
        !dose || resultado.has(nome)) return null;
    resultado.set(nome, `${dose}|${unidade}`);
  }
  return resultado;
}
function conjunto(vias: string[] | null): string | null {
  if (!Array.isArray(vias) || !vias.length) return null;
  const nomes = vias.map((v) => texto(v));
  const permitidas = new Set(["IM", "EV", "SC", "ID", "ORAL", "TÓPICA"]);
  if (nomes.some((n) => !n || !permitidas.has(n)) || new Set(nomes).size !== nomes.length) return null;
  return JSON.stringify(nomes.sort());
}

function fracao(valor: string): [bigint, bigint] {
  const [inteiro, decimais = ""] = valor.split(".");
  return [BigInt(inteiro + decimais), 10n ** BigInt(decimais.length)];
}

/** Só aceita rótulo inequívoco e checa a relação matemática com inteiros. */
function concentracaoCompativel(item: IdentidadeCatalogo, dose: Map<string, string>, volume: string): string | null {
  if (dose.size !== 1 || !item.concentracao) return null;
  const match = /^(\d+(?:[.,]\d+)?)\s*(mg|mcg|g|ui)\s*\/\s*ml$/i.exec(item.concentracao.trim());
  const quantidade = match && decimal(match[1]);
  if (!match || !quantidade) return null;
  const [doseValor, doseUnidade] = [...dose.values()][0].split("|");
  if (doseUnidade !== match[2].toUpperCase()) return null;
  const [cn, cd] = fracao(quantidade), [vn, vd] = fracao(volume), [dn, dd] = fracao(doseValor);
  return cn * vn * dd === dn * cd * vd ? `${quantidade}|${doseUnidade}` : null;
}

/** Não grava, não sugere conversões e não trata ausência como igualdade. */
export function compararIdentidadeCatalogo(a: IdentidadeCatalogo, b: IdentidadeCatalogo): ComparacaoCatalogo {
  if (!a || typeof a !== "object" || !b || typeof b !== "object") {
    return { ficha: "conferir", apresentacao: "conferir", motivo: "Dados de origem inválidos." };
  }
  const nomeA = texto(a.nome), nomeB = texto(b.nome);
  if (!nomeA || !nomeB || nomeA !== nomeB || a.identidadeConfirmada !== true || b.identidadeConfirmada !== true) {
    return { ficha: "conferir", apresentacao: "conferir", motivo: "Identidade do produto requer conferência." };
  }
  const formaA = texto(a.forma), formaB = texto(b.forma);
  const formas = new Set(["AMPOLA", "FRASCO", "IMPLANTE", "SERINGA"]);
  if (!formaA || !formaB || !formas.has(formaA) || !formas.has(formaB))
    return { ficha: "conferir", apresentacao: "conferir", motivo: "Forma não informada ou não reconhecida." };
  if (formaA !== formaB) return { ficha: "distinta", apresentacao: "distinta", motivo: "Formas diferentes." };
  if (formaA === "IMPLANTE") {
    const conhecidos = ["absorvivel", "nao_absorvivel"];
    if (!a.subtipoImplante || !b.subtipoImplante || !conhecidos.includes(a.subtipoImplante) || !conhecidos.includes(b.subtipoImplante))
      return { ficha: "conferir", apresentacao: "conferir", motivo: "Tipo de implante não informado." };
    if (a.subtipoImplante !== b.subtipoImplante)
      return { ficha: "distinta", apresentacao: "distinta", motivo: "Tipos de implante diferentes." };
  }
  const dosesA = componentes(a.componentes), dosesB = componentes(b.componentes);
  if (!dosesA || !dosesB || a.composicaoCompletaConfirmada !== true || b.composicaoCompletaConfirmada !== true)
    return { ficha: "conferir", apresentacao: "conferir", motivo: "Dose ou composição incompleta." };
  if (dosesA.size !== dosesB.size || [...dosesA.keys()].some((nome) => !dosesB.has(nome))) {
    return { ficha: "conferir", apresentacao: "conferir", motivo: "Composições diferentes ou não conciliadas." };
  }
  for (const [nome, dose] of dosesA) {
    const outra = dosesB.get(nome)!;
    if (dose.split("|")[1] !== outra.split("|")[1]) {
      return { ficha: "conferir", apresentacao: "conferir", motivo: "Unidades diferentes exigem conferência." };
    }
    if (dose !== outra) return { ficha: "distinta", apresentacao: "distinta", motivo: "Doses totais diferentes." };
  }
  const volumeA = decimal(a.volumeMl), volumeB = decimal(b.volumeMl);
  const concA = texto(a.concentracao), concB = texto(b.concentracao);
  const viasA = conjunto(a.vias), viasB = conjunto(b.vias);
  if (!volumeA || !volumeB || !concA || !concB || !viasA || !viasB) {
    return { ficha: "mesma", apresentacao: "conferir", motivo: "Dados da apresentação incompletos." };
  }
  const concentracaoA = concentracaoCompativel(a, dosesA, volumeA);
  const concentracaoB = concentracaoCompativel(b, dosesB, volumeB);
  if (!concentracaoA || !concentracaoB) {
    return { ficha: "mesma", apresentacao: "conferir", motivo: "Concentração e dose total exigem conferência." };
  }
  if (volumeA !== volumeB || concentracaoA !== concentracaoB || viasA !== viasB) {
    return { ficha: "mesma", apresentacao: "distinta", motivo: "Volume, concentração ou vias diferentes." };
  }
  return { ficha: "mesma", apresentacao: "mesma", motivo: "Atributos explícitos correspondem." };
}
