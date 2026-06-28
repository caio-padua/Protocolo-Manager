// ============================================================================
// Cartões de texto do mesmo PaxterDoc para WhatsApp (markdown) e Telegram (HTML).
// O visual de marca nesses canais vem do BANNER-imagem (banner.ts); aqui é só a
// legenda formatada, derivada do MESMO doc (Art. 66 c). Sem HTML no WhatsApp.
// ============================================================================
import type { PaxterDoc } from "./types";

function escapeTgHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Legenda do WhatsApp: *negrito* nativo do app, sem HTML. */
export function renderWhatsappCaption(doc: PaxterDoc): string {
  const linhas: string[] = [];
  if (doc.eyebrow) linhas.push(doc.eyebrow.toUpperCase());
  linhas.push(`*${doc.titulo}*`);
  linhas.push("");
  for (const p of doc.paragrafos || []) linhas.push(p);
  if (doc.botao) {
    linhas.push("");
    linhas.push(`${doc.botao.label}:`);
    linhas.push(doc.botao.url);
  }
  if (doc.notaRodape) {
    linhas.push("");
    linhas.push(`_${doc.notaRodape}_`);
  }
  linhas.push("");
  linhas.push("— PAXTER · Clinical Intelligence System");
  return linhas.join("\n");
}

/** Legenda do Telegram: HTML escapado, <b> no título; máx. 1024 (limite photo). */
export function renderTelegramCaption(doc: PaxterDoc): string {
  const linhas: string[] = [];
  if (doc.eyebrow) linhas.push(escapeTgHtml(doc.eyebrow.toUpperCase()));
  linhas.push(`<b>${escapeTgHtml(doc.titulo)}</b>`);
  linhas.push("");
  for (const p of doc.paragrafos || []) linhas.push(escapeTgHtml(p));
  if (doc.botao) {
    linhas.push("");
    linhas.push(`<a href="${escapeTgHtml(doc.botao.url)}">${escapeTgHtml(doc.botao.label)}</a>`);
  }
  if (doc.notaRodape) {
    linhas.push("");
    linhas.push(`<i>${escapeTgHtml(doc.notaRodape)}</i>`);
  }
  linhas.push("");
  linhas.push("— PAXTER · Clinical Intelligence System");
  const out = linhas.join("\n");
  return out.length > 1024 ? out.slice(0, 1021) + "..." : out;
}
