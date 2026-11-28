import { createHash } from "node:crypto";

export type OrigemTranscricao = "farmatec" | "bio-meds" | "formedica-implantes" | "formedica-precos";
export type LinhaTranscricao = {
  origem: OrigemTranscricao;
  chaveFonte: string;
  pagina: number | null;
  linhaNaPagina: number | null;
  campos: string[];
  textoOriginal: string;
  hashTexto: string;
  dataFonte: string | null;
  dataDocumento: string | null;
  custoUnitarioCentavos: number | null;
  custoEmbalagemCentavos: number | null;
  quantidadeEmbalagem: number | null;
  paraConferencia: boolean;
};

function centavos(valor: string): number {
  const match = /^(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})$/.exec(valor.trim());
  if (!match) throw new Error("Preço inválido na transcrição.");
  const inteiro = Number(match[1].replace(/\./g, ""));
  const resultado = inteiro * 100 + Number(match[2]);
  if (!Number.isSafeInteger(resultado)) throw new Error("Preço fora do limite seguro.");
  return resultado;
}

/**
 * Transforma SOMENTE a transcrição fornecida em linhas rastreáveis.
 * Não identifica produtos no banco, não cria registros e não recomenda dose.
 */
export function lerCatalogosTranscritos(texto: string): LinhaTranscricao[] {
  const saida: LinhaTranscricao[] = [];
  const chaves = new Set<string>();
  const indicePagina = new Map<string, number>();
  let origem: OrigemTranscricao | null = null;
  for (const linha of texto.split(/\r?\n/)) {
    if (linha.startsWith("FARMATEC:")) { origem = "farmatec"; continue; }
    if (linha.startsWith("BIO MEDS:")) { origem = "bio-meds"; continue; }
    if (linha.startsWith("FORMEDICA IMPLANTES, PREÇOS")) { origem = "formedica-precos"; continue; }
    if (linha.startsWith("FORMEDICA IMPLANTES:")) { origem = "formedica-implantes"; continue; }
    if (!origem || !/^\d+\s*\|/.test(linha)) continue;
    const campos = linha.split("|").map((parte) => parte.trim());
    const esperado = origem === "formedica-precos" ? 5 : origem === "formedica-implantes" ? 8 : 9;
    if (campos.length !== esperado) throw new Error(`Linha inválida em ${origem}: eram esperados ${esperado} campos.`);
    const pagina = origem === "formedica-precos" ? 5 : Number(campos[0]);
    const contador = `${origem}:${pagina}`;
    const ordem = (indicePagina.get(contador) ?? 0) + 1;
    indicePagina.set(contador, ordem);
    const linhaNaPagina = origem === "farmatec" || origem === "formedica-implantes" ? Number(campos[1]) : null;
    if (linhaNaPagina !== null && (!Number.isSafeInteger(linhaNaPagina) || linhaNaPagina <= 0)) {
      throw new Error(`Identificador de linha inválido em ${origem}.`);
    }
    const chaveFonte = origem === "formedica-precos" ? `${origem}:${campos[0]}`
      : `${origem}:${pagina}:${linhaNaPagina ?? ordem}`;
    if (chaves.has(chaveFonte)) throw new Error(`Linha repetida na fonte: ${chaveFonte}.`);
    chaves.add(chaveFonte);
    let custoUnitarioCentavos: number | null = null;
    let custoEmbalagemCentavos: number | null = null;
    let quantidadeEmbalagem: number | null = null;
    if (origem === "farmatec") {
      const embalagem = /(?:c\/)?\s*(\d+)\s*(?:ampolas?|frascos?)/i.exec(campos[6]);
      if (!embalagem) throw new Error(`Embalagem não identificada: ${chaveFonte}.`);
      quantidadeEmbalagem = Number(embalagem[1]);
      custoUnitarioCentavos = centavos(campos[7]);
      custoEmbalagemCentavos = centavos(campos[8]);
      if (quantidadeEmbalagem * custoUnitarioCentavos !== custoEmbalagemCentavos) {
        throw new Error(`Valores de embalagem divergentes: ${chaveFonte}.`);
      }
    } else if (origem === "bio-meds") {
      custoEmbalagemCentavos = centavos(campos[7]);
      const embalagem = /^(\d+)\s+(?:ampolas?|frascos?)$/i.exec(campos[6]);
      if (!embalagem) throw new Error(`Embalagem não identificada: ${chaveFonte}.`);
      quantidadeEmbalagem = Number(embalagem[1]);
    } else if (origem === "formedica-precos" && campos[4] !== "CONSULTAR") {
      custoUnitarioCentavos = centavos(campos[4].split(" -- ")[0]);
    }
    saida.push({
      origem, chaveFonte, pagina, linhaNaPagina, campos, textoOriginal: linha,
      hashTexto: createHash("sha256").update(linha).digest("hex"),
      dataFonte: origem === "farmatec" ? "2025-09-29" : origem === "formedica-precos" ? "2022-05" : null,
      // Data de criação do arquivo não é data da cotação.
      dataDocumento: origem === "bio-meds" ? "2026-07-16" : origem === "farmatec" ? "2025-09-29"
        : origem === "formedica-precos" ? "2022-05" : null,
      custoUnitarioCentavos, custoEmbalagemCentavos, quantidadeEmbalagem,
      // Nenhuma linha é automaticamente conciliada apenas pela posição ou nome.
      paraConferencia: true,
    });
  }
  if (!saida.length) throw new Error("Nenhuma linha de catálogo reconhecida.");
  return saida;
}
