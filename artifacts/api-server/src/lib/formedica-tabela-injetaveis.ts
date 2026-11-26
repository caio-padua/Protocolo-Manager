import type { LinhaInvalida, LinhaLista } from "./importar-lista-fornecedor";

/**
 * Leitura da "Tabela de preços comercial — medicamento injetável" da Formédica (texto extraído do PDF com pdftotext -layout).
 * Preço do PDF = valor da UNIDADE (ampola ou frasco): entra com quantidade 1 e preço da caixa = preço da unidade.
 * Kits e linhas fora do padrão NÃO são importados: viram "inválidas" com o motivo, nunca adivinhadas.
 */
const num = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));
const centavos = (s: string) => Math.round(num(s) * 100);
const fmt = (n: number) => String(Math.round(n * 1000) / 1000).replace(".", ",");

export function lerFormedicaInjetaveis(texto: string): { linhas: LinhaLista[]; invalidas: LinhaInvalida[] } {
  const linhas: LinhaLista[] = []; const invalidas: LinhaInvalida[] = [];
  let kits = false; let n = 0;
  for (const bruta of texto.split(/\r?\n/)) {
    if (/KITS COM MEDICAMENTOS/i.test(bruta)) kits = true;
    const m = /^(\d{3,6})\s+(.+?)\s{2,}(AMPOLA|FRASCO)\s*(\d+(?:,\d+)?)\s*mL\s*(.*?)\s*R\$\s*([\d.]+,\d{2})\s*$/i.exec(bruta.trim());
    if (!m) continue;
    n += 1;
    const [, codigo, nomeBruto, forma, vol, viasTxt, preco] = m;
    if (kits) { invalidas.push({ linha: n, produto: nomeBruto.trim(), motivo: "Kit com vários medicamentos: não é uma substância simples." }); continue; }
    const volumeMl = num(vol);
    const conc = /(\d[\d.,]*)\s*(mg|mcg|g|UI)\s*\/\s*mL/i.exec(nomeBruto);
    const nome = nomeBruto.replace(/\*+/g, "").replace(/\s+/g, " ").trim();
    const produto = (conc ? nome.slice(0, nome.toLowerCase().indexOf(conc[0].toLowerCase().trim())) : nome).replace(/\s+\d+(?:,\d+)?\s*%\s*$/, "").trim() || nome;
    const vias = (viasTxt.match(/\b(IM|EV|SC|ID)\b/g) ?? []);
    const via = (["IM", "SC", "EV", "ID"] as const).find((v) => vias.includes(v)) ?? null;
    let dose: string; let concentracao: string | null = null;
    if (conc) {
      const c = num(conc[1]); concentracao = `${conc[1]} ${conc[2]}/mL`;
      dose = `${fmt(c * volumeMl)} ${conc[2]}`;
    } else dose = `${fmt(volumeMl)} mL`;
    linhas.push({ linha: Number(codigo), produto, dose, volumeMl, concentracao, forma: forma.toLowerCase() as "ampola" | "frasco", via, categoria: null, quantidadeEmbalagem: 1, precoCaixaCentavos: centavos(preco) });
  }
  return { linhas, invalidas };
}
