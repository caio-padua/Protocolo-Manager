/** Sugere o nome do ato sem transportar dose ou apresentação do produto. */
export function nomeSugeridoProduto(nome: string): string {
  return nome
    .replace(/\s*[-–—:|,]?\s*\d+(?:[.,]\d+)*\s*(?:mg|mcg|µg|μg|ug|g|ui|iu|ml|mililitros?|ampolas?)\b/gi, "")
    .replace(/\s*\d+(?:[.,]\d+)?\s*%/g, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s*[-–—|:;,/]+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function doseSeguraProduto(dose: string | null | undefined): string | null {
  const valor = dose?.trim() ?? "";
  return /^\d+(?:[.,]\d+)?\s*(?:mg|mcg|µg|μg|ug|g|ui|iu)$/i.test(valor) ? valor : null;
}

export type ProdutoComposto = {
  name: string;
  defaultDose?: string | null;
  components?: Array<{ componentName: string; doseValue?: number | null; doseUnit?: string | null }> | null;
};

/** Só sugere uma composição completa, ordenável pelo nome e revisável. */
export function doseSugeridaProduto(produto: ProdutoComposto | undefined): string | null {
  if (!produto) return null;
  const componentes = produto.components ?? [];
  if (componentes.length < 2) return doseSeguraProduto(produto.defaultDose);
  const nome = produto.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const partes: Array<{ posicao: number; dose: string }> = [];
  for (const componente of componentes) {
    const valor = componente.doseValue;
    const unidade = componente.doseUnit?.trim() ?? "";
    if (typeof valor !== "number" || !Number.isFinite(valor) || valor <= 0 ||
        !/^(?:mg|mcg|µg|μg|ug|g|ui|iu)$/i.test(unidade) ||
        !/^\d+(?:\.\d{1,8})?$/.test(String(valor)) ||
        !Number.isSafeInteger(Math.trunc(valor))) return null;
    const nomeComponente = componente.componentName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().split("(")[0].trim();
    const vitamina = /^VITAMINA\s+([A-Z])(\d*)(?:\b|-)/.exec(nomeComponente);
    const chave = vitamina ? vitamina[1] : nomeComponente;
    if (!chave) return null;
    const escaped = chave.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const ocorrencias = [...nome.matchAll(new RegExp(`\\b${escaped}${vitamina ? "(?:\\d+)?" : ""}\\b`, "g"))];
    if (ocorrencias.length !== 1 || ocorrencias[0].index == null) return null;
    if (vitamina) {
      const sufixoNoNome = ocorrencias[0][0].slice(1);
      if (sufixoNoNome && sufixoNoNome !== vitamina[2]) return null;
    }
    partes.push({ posicao: ocorrencias[0].index, dose: `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 8 })} ${unidade}` });
  }
  if (new Set(partes.map((p) => p.posicao)).size !== partes.length) return null;
  return partes.sort((a, b) => a.posicao - b.posicao).map((p) => p.dose).join(" + ");
}

export function duracaoValidaMinutos(valor: number): boolean {
  if (!Number.isFinite(valor) || valor < 1 / 60 || valor > 1440) return false;
  const segundos = valor * 60;
  return Math.abs(segundos - Math.round(segundos)) < 1e-7;
}
