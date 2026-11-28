// Leitura da transcrição conferida (Farmatec, Bio meds, Formédica) — somente leitura de arquivo.
import { readFileSync } from "node:fs";
export const ARQ = "/home/runner/workspace/attached_assets/Pasted-DADOS-EXTRA-DOS-E-CONFERIDOS-DAS-TABELAS-PEDIDAS-Use-es_1794384373497.txt";
const cents = (s) => { const m = /(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})/.exec(s); if (!m) throw new Error("preço " + s); return Number(m[1].replace(/\./g, "")) * 100 + Number(m[2]); };
export function lerFonte() {
  const out = { farmatec: [], bio: [], impl: [], implPrecos: [] };
  let sec = null;
  for (const l of readFileSync(ARQ, "utf8").split(/\r?\n/)) {
    if (l.startsWith("FARMATEC:")) { sec = "farmatec"; continue; }
    if (l.startsWith("BIO MEDS:")) { sec = "bio"; continue; }
    if (l.startsWith("FORMEDICA IMPLANTES, PRE")) { sec = "implPrecos"; continue; }
    if (l.startsWith("FORMEDICA IMPLANTES:")) { sec = "impl"; continue; }
    if (!sec || !/^\d+\s*\|/.test(l)) continue;
    const c = l.split("|").map((x) => x.trim());
    if (sec === "farmatec") {
      const e = /(\d+)\s*(ampolas?|frascos?)/i.exec(c[6]);
      out.farmatec.push({ pagina: +c[0], linha: +c[1], nome: c[2], dose: c[3], volume: c[4], vias: c[5], embOrig: c[6],
        qtd: e ? +e[1] : 1, tipo: e ? (e[2].toLowerCase().startsWith("f") ? "frasco" : "ampola") : "ampola",
        unit: cents(c[7]), caixa: cents(c[8]), texto: l });
    } else if (sec === "bio") {
      const e = /(\d+)\s*(ampolas?|frascos?)/i.exec(c[6]);
      out.bio.push({ pagina: +c[0], nome: c[1], dose: c[2], conc: c[3], volume: c[4], vias: c[5], embOrig: c[6],
        qtd: +e[1], tipo: e[2].toLowerCase().startsWith("f") ? "frasco" : "ampola", caixa: cents(c[7]), conserv: c[8], texto: l });
    } else if (sec === "impl") {
      out.impl.push({ pagina: +c[0], linha: +c[1], nome: c[2], dose: c[3], trocarte: c[4], liberacao: c[5], qtd: c[6], duracao: c[7], texto: l });
    } else out.implPrecos.push({ codigo: c[0], nome: c[1], apres: c[2], via: c[3], preco: c[4], texto: l });
  }
  return out;
}
