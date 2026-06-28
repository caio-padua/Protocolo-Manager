// ============================================================================
// FONTE-DA-VERDADE VISUAL do e-mail Paxter (Art. 66 b). Reproduz EXATAMENTE o
// e-mail-modelo do cadastro: fundo navy, card borda ouro, símbolo de vidro +
// wordmark PAXTER + "Clinical Intelligence System", botão dourado bulletproof.
// Qualquer e-mail simples de marca passa por aqui — ninguém remonta o casco.
// ============================================================================
import type { PaxterDoc } from "./types";

const SERIF = "Georgia,'Times New Roman',Times,serif";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Envelopa um corpo (innerHtml já confiável) no casco de marca Paxter.
 * Usado pelo renderPaxterEmail e por e-mails ricos que queiram só o casco.
 */
export function paxterEmailShell(innerHtml: string, baseUrl: string): string {
  const symbolSrc = `${baseUrl}/brand/paxter-symbol.png`;
  const wordmarkSrc = `${baseUrl}/brand/paxter-wordmark.png`;
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark"></head>
<body style="margin:0; padding:0; background:#05080f; font-family:${SANS};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#05080f; padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px; background:#0b1426; border:1px solid rgba(201,162,79,.30); border-radius:18px; overflow:hidden; box-shadow:0 24px 60px rgba(0,0,0,.6);">

        <tr><td style="background:linear-gradient(170deg,#102043 0%,#0a162e 55%,#0b1426 100%); padding:40px 32px 30px; text-align:center;">
          <img src="${symbolSrc}" width="84" alt="" style="display:block; margin:0 auto 18px; width:84px; height:auto; border:1px solid rgba(201,162,79,.45); border-radius:18px; box-shadow:0 8px 22px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.04) inset;">
          <img src="${wordmarkSrc}" width="196" alt="PAXTER" style="display:block; margin:0 auto; width:196px; max-width:74%; height:auto;">
          <div style="color:#c9a24f; font-family:${SERIF}; font-size:11px; letter-spacing:5px; text-transform:uppercase; margin-top:12px;">Clinical Intelligence System</div>
        </td></tr>

        <tr><td style="padding:0 32px;"><div style="height:1px; background:linear-gradient(90deg,rgba(201,162,79,0) 0%,rgba(201,162,79,.6) 50%,rgba(201,162,79,0) 100%);"></div></td></tr>

${innerHtml}

        <tr><td style="background:#070f1f; padding:18px 32px; text-align:center; color:#62748f; font-family:${SERIF}; font-size:10px; letter-spacing:3px; text-transform:uppercase; border-top:1px solid rgba(201,162,79,.16);">
          Paxter — Clinical Intelligence System
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Renderiza um PaxterDoc no e-mail de marca completo. */
export function renderPaxterEmail(doc: PaxterDoc, baseUrl: string): string {
  const para = "margin:0 0 14px; color:#c2cee0; font-size:15px; line-height:1.7;";
  const serif = SERIF;

  const eyebrowHtml = doc.eyebrow
    ? `<div style="color:#c9a24f; font-size:12px; letter-spacing:3px; text-transform:uppercase; margin-bottom:14px;">${escapeHtml(doc.eyebrow)}</div>`
    : "";

  const paras = (doc.paragrafos || [])
    .map((p) => `<p style="${para}">${escapeHtml(p)}</p>`)
    .join("\n          ");

  const botaoHtml = doc.botao
    ? `
        <tr><td align="center" style="padding:30px 40px 8px;">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr><td align="center" bgcolor="#d4ad5c" style="border-radius:12px; background:linear-gradient(135deg,#f0d488 0%,#d4ad5c 48%,#b88a3f 100%); box-shadow:0 10px 24px rgba(184,138,63,.45);">
              <a href="${doc.botao.url}" style="display:inline-block; padding:17px 46px; color:#0a162e; font-family:${serif}; font-size:15px; font-weight:700; letter-spacing:2px; text-transform:uppercase; text-decoration:none;">${escapeHtml(doc.botao.label)}</a>
            </td></tr>
          </table>
        </td></tr>`
    : "";

  // Acessibilidade do botão: quando há botão, mostra o endereço por extenso
  // ("se o botão não abrir, copie e cole") — fidelidade ao e-mail-modelo Hermes.
  const linkFallbackHtml = doc.botao
    ? `
        <tr><td style="padding:22px 40px 0; text-align:center;">
          <p style="margin:0; color:#7e90ab; font-size:12px; line-height:1.6;">
            Se o botão não abrir, copie e cole este endereço:<br>
            <span style="color:#c9a24f; word-break:break-all;">${escapeHtml(doc.botao.url)}</span>
          </p>
        </td></tr>`
    : "";

  const notaTopPad = doc.botao ? "16px" : "22px";
  const rodapeHtml = doc.notaRodape
    ? `
        <tr><td style="padding:${notaTopPad} 40px 0; text-align:center;">
          <p style="margin:0 0 36px; color:#62748f; font-size:11px; line-height:1.6;">${escapeHtml(doc.notaRodape)}</p>
        </td></tr>`
    : `<tr><td style="padding:0 40px 28px;"></td></tr>`;

  const inner = `
        <tr><td style="padding:36px 40px 8px; text-align:center;">
          ${eyebrowHtml}
          <div style="color:#f3ead6; font-family:${serif}; font-size:30px; line-height:1.25; font-weight:400;">${escapeHtml(doc.titulo)}</div>
        </td></tr>

        <tr><td style="padding:18px 40px 4px; text-align:center;">
          ${paras}
        </td></tr>
${botaoHtml}
${linkFallbackHtml}
${rodapeHtml}`;

  return paxterEmailShell(inner, baseUrl);
}

/** Assunto padrão derivado do doc quando o caller não fornece um. */
export function assuntoPadrao(doc: PaxterDoc): string {
  if (doc.assunto) return doc.assunto;
  const prefixo = doc.eyebrow ? `${doc.eyebrow} | ` : "";
  return `${prefixo}${doc.titulo}`.slice(0, 180);
}
