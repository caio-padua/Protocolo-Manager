import type { IssuedDocumentSummary } from "./clinical-document-share";

const terms: Record<string, string[]> = {
  prescricao: ["receita", "receitas", "receituario", "prescricao", "formula", "formulas"],
  pedido_exames: ["exame", "exames"],
  atestado: ["atestado"],
  encaminhamento: ["encaminhamento"],
  protocolo: ["protocolo"],
  ras_fap: ["ras fap", "relatorio"],
  carta_tratamento: ["carta de tratamento", "carta tratamento"],
  documento_assinado: ["documento assinado", "consentimento", "termo assinado"],
};
const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

/** Only narrows the caller's already authorized list; never fetches another person's document. */
export function selectClinicalDocuments(
  docs: IssuedDocumentSummary[],
  text: string,
): IssuedDocumentSummary[] {
  const normalized = normalize(text);
  const padded = ` ${normalized} `;
  const types = Object.keys(terms).filter(type =>
    terms[type].some(term => padded.includes(` ${term} `)));
  const date = text.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/);
  const isoDate = date ? `${date[3]}-${date[2].padStart(2, "0")}-${date[1].padStart(2, "0")}` : null;
  const reference = normalized.match(/\b(?:documento|codigo)\s+(\d+)\b/);
  let candidates = docs.filter(doc =>
    (!types.length || types.includes(doc.documentType)) &&
    (!isoDate || doc.issuedAt.slice(0, 10) === isoDate) &&
    (!reference || doc.documentId === Number(reference[1])));
  if (!types.length && !isoDate && !reference) {
    const labels = candidates.filter(doc => padded.includes(` ${normalize(doc.label)} `));
    if (labels.length) candidates = labels;
  }
  if (/\b(ultimo|ultima|mais recente|recente)\b/.test(normalized) && candidates.length) {
    const newest = candidates.reduce((date, doc) => doc.issuedAt > date ? doc.issuedAt : date, "");
    candidates = candidates.filter(doc => doc.issuedAt === newest);
  }
  return candidates;
}
