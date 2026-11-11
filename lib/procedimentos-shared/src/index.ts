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
  const parte = /^(\d+(?:[.,]\d+)?)\s*(?:mg|mcg|µg|μg|ug|g|ui|iu)$/i.exec(valor);
  return parte && Number(parte[1].replace(",", ".")) > 0 ? valor : null;
}

/** Cada necessidade usa uma pessoa; os nomes nela são alternativas. */
export function existeCombinacaoDistinta(grupos: number[][], indice = 0, usados = new Set<number>()): boolean {
  if (indice === grupos.length) return true;
  for (const profissional of grupos[indice]) {
    if (usados.has(profissional)) continue;
    usados.add(profissional);
    if (existeCombinacaoDistinta(grupos, indice + 1, usados)) return true;
    usados.delete(profissional);
  }
  return false;
}

export type ProdutoComposto = {
  name: string;
  defaultDose?: string | null;
  concentrationMg?: string | null;
  volumeAmpola?: string | null;
  presentationQuantity?: number | null;
  presentationUnit?: string | null;
  ampouleVolumeMl?: number | null;
  isBlend?: boolean | null;
  composicao?: string | null;
  components?: Array<{ componentName: string; doseValue?: number | null; doseUnit?: string | null }> | null;
};

/** Interpreta uma anotação legada somente quando a apresentação confirma o volume. */
function doseTotalLegada(produto: ProdutoComposto): string | null {
  const dose = produto.defaultDose?.trim() ?? "";
  const match = /^(\d+(?:[.,]\d+)?)\s*(mg|mcg|µg|μg|ug|g|ui|iu)\s*\/\s*(\d+(?:[.,]\d+)?)\s*ml$/i.exec(dose);
  if (!match || produto.presentationQuantity !== 1 ||
      produto.presentationUnit?.trim().toLocaleLowerCase("pt-BR") !== "ampola" ||
      typeof produto.ampouleVolumeMl !== "number" || !Number.isFinite(produto.ampouleVolumeMl)) return null;
  const total = Number(match[1].replace(",", "."));
  const volume = Number(match[3].replace(",", "."));
  if (!(total > 0) || !(volume > 0) || produto.ampouleVolumeMl !== volume) return null;
  if (produto.volumeAmpola) {
    const legado = /^(\d+(?:[.,]\d+)?)\s*ml$/i.exec(produto.volumeAmpola.trim());
    if (!legado || Number(legado[1].replace(",", ".")) !== volume) return null;
  }
  if (produto.concentrationMg) {
    const concentracao = /^(\d+(?:[.,]\d+)?)\s*mg\s*\/\s*ml$/i.exec(produto.concentrationMg.trim());
    if (!concentracao || match[2].toLowerCase() !== "mg" ||
        Math.abs(Number(concentracao[1].replace(",", ".")) * volume - total) > 1e-8) return null;
  }
  return `${match[1]} ${match[2]}`;
}

function volumesCompativeis(produto: ProdutoComposto): boolean {
  if (!produto.volumeAmpola || produto.ampouleVolumeMl == null) return true;
  const legado = /^(\d+(?:[.,]\d+)?)\s*ml$/i.exec(produto.volumeAmpola.trim());
  return !!legado && Number(legado[1].replace(",", ".")) === produto.ampouleVolumeMl;
}

function componenteNome(nome: string): string {
  const normalizado = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().split("(")[0].trim();
  const vitamina = /^VITAMINA\s+([A-Z]\d*)\b/.exec(normalizado);
  return vitamina ? vitamina[1] : normalizado;
}

function numeroClinico(texto: string): number {
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(texto)) return Number(texto.replace(/\./g, "").replace(",", "."));
  return Number(texto.replace(",", "."));
}

function composicaoConfere(produto: ProdutoComposto): boolean {
  const texto = produto.defaultDose?.trim();
  if (!texto) return true;
  let dose = texto;
  const volume = /\s*\/\s*(\d+(?:[.,]\d+)?)\s*ml$/i.exec(dose);
  if (volume) {
    const valor = Number(volume[1].replace(",", "."));
    if (produto.presentationQuantity !== 1 || produto.presentationUnit?.trim().toLowerCase() !== "ampola" ||
        produto.ampouleVolumeMl !== valor || !volumesCompativeis(produto)) return false;
    dose = dose.slice(0, volume.index);
  }
  const partes = dose.split("+").map((p) =>
    /^\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 -]*?)\s+(\d+(?:[.,]\d+)*)\s*(mg|mcg|µg|μg|ug|g|ui|iu)\s*$/i.exec(p));
  const componentes = produto.components ?? [];
  if (partes.length !== componentes.length || partes.some((p) => !p)) return false;
  return componentes.every((c) => {
    const nome = componenteNome(c.componentName);
    const encontrados = partes.filter((p) => p && componenteNome(p[1]) === nome);
    return encontrados.length === 1 && encontrados[0] != null &&
      numeroClinico(encontrados[0][2]) === c.doseValue &&
      encontrados[0][3].toLowerCase() === c.doseUnit?.trim().toLowerCase();
  });
}

/** Só sugere uma composição completa, ordenável pelo nome e revisável. */
export function doseSugeridaProduto(produto: ProdutoComposto | undefined): string | null {
  if (!produto) return null;
  if (typeof produto.name !== "string" ||
      (produto.components != null && (!Array.isArray(produto.components) || produto.components.some(c =>
        !c || typeof c.componentName !== "string")))) return null;
  // Texto livre pode incluir componentes não presentes na lista estruturada.
  if (produto.composicao?.trim()) return null;
  if (!volumesCompativeis(produto)) return null;
  const componentes = produto.components ?? [];
  if (componentes.length < 2) {
    // Uma composição incompleta ou marcada como composta não vira dose simples.
    if (produto.isBlend === true || componentes.length === 1 || produto.composicao?.trim()) return null;
    const simples = doseSeguraProduto(produto.defaultDose);
    if (simples) {
      const quantidade = /^(\d+(?:[.,]\d+)?)\s*mg$/i.exec(simples);
      const concentracao = /^(\d+(?:[.,]\d+)?)\s*mg\s*\/\s*ml$/i.exec(produto.concentrationMg?.trim() ?? "");
      if (produto.concentrationMg?.trim() && (!quantidade || !concentracao ||
          produto.presentationQuantity !== 1 || produto.presentationUnit?.trim().toLowerCase() !== "ampola" ||
          typeof produto.ampouleVolumeMl !== "number" || !Number.isFinite(produto.ampouleVolumeMl))) return null;
      if (quantidade && concentracao && produto.presentationQuantity === 1 &&
          produto.presentationUnit?.trim().toLocaleLowerCase("pt-BR") === "ampola" &&
          typeof produto.ampouleVolumeMl === "number" && Number.isFinite(produto.ampouleVolumeMl) &&
          Math.abs(Number(quantidade[1].replace(",", ".")) -
            Number(concentracao[1].replace(",", ".")) * produto.ampouleVolumeMl) > 1e-8) return null;
      return simples;
    }
    return doseTotalLegada(produto);
  }
  if (produto.isBlend === false || produto.concentrationMg?.trim() || !composicaoConfere(produto)) return null;
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
