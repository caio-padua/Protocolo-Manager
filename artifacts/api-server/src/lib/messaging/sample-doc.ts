// Documento de AMOSTRA do e-mail/mensagem Paxter. Fonte ÚNICA usada tanto pela
// rota de pré-visualização (GET /api/brand/email-preview) quanto pelo envio de
// teste — assim o que o CEO vê no link é EXATAMENTE o que chega na caixa.
// Dados fictícios, apenas para validar o layout (Art. 68: dado real antes de
// fixture não se aplica aqui — é amostra declarada de layout).
import type { PaxterDoc } from "./types";

export function docAmostraBoasVindas(): PaxterDoc {
  const tabelaProtocolo = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid rgba(201,162,79,.28); border-radius:12px; overflow:hidden; margin:6px 0 4px;">
      <tr style="background:#102043;">
        <td style="padding:10px 14px; color:#c9a24f; font-size:11px; letter-spacing:2px; text-transform:uppercase; font-weight:700;">Substância</td>
        <td style="padding:10px 14px; color:#c9a24f; font-size:11px; letter-spacing:2px; text-transform:uppercase; font-weight:700; text-align:center;">Sessões</td>
        <td style="padding:10px 14px; color:#c9a24f; font-size:11px; letter-spacing:2px; text-transform:uppercase; font-weight:700; text-align:center;">Intervalo</td>
      </tr>
      <tr><td style="padding:9px 14px; color:#dbe4f0; font-size:13px; border-top:1px solid rgba(201,162,79,.14);">Tirzepatida 5mg</td><td style="padding:9px 14px; color:#dbe4f0; font-size:13px; text-align:center; border-top:1px solid rgba(201,162,79,.14);">12</td><td style="padding:9px 14px; color:#dbe4f0; font-size:13px; text-align:center; border-top:1px solid rgba(201,162,79,.14);">7 dias</td></tr>
      <tr><td style="padding:9px 14px; color:#dbe4f0; font-size:13px; border-top:1px solid rgba(201,162,79,.14);">Coenzima Q10</td><td style="padding:9px 14px; color:#dbe4f0; font-size:13px; text-align:center; border-top:1px solid rgba(201,162,79,.14);">4</td><td style="padding:9px 14px; color:#dbe4f0; font-size:13px; text-align:center; border-top:1px solid rgba(201,162,79,.14);">15 dias</td></tr>
      <tr><td style="padding:9px 14px; color:#dbe4f0; font-size:13px; border-top:1px solid rgba(201,162,79,.14);">Testosterona Bioidêntica 200</td><td style="padding:9px 14px; color:#dbe4f0; font-size:13px; text-align:center; border-top:1px solid rgba(201,162,79,.14);">8</td><td style="padding:9px 14px; color:#dbe4f0; font-size:13px; text-align:center; border-top:1px solid rgba(201,162,79,.14);">7 dias</td></tr>
    </table>`;

  return {
    eyebrow: "Olá, Caio",
    titulo: "Seu protocolo foi iniciado",
    paragrafos: [
      "Este é um e-mail de amostra para você conferir o padrão visual PAXTER.",
      "A cada etapa do tratamento (boas-vindas, lembrete pré-sessão, confirmação pós-sessão e documentos), você receberá uma mensagem como esta — com a mesma identidade no e-mail, no WhatsApp e no Telegram.",
      "Abaixo, um resumo do protocolo como exemplo:",
    ],
    blocosHtml: [tabelaProtocolo],
    botao: { label: "Acessar minha área", url: "https://app.paxter.exemplo/area" },
    notaRodape: "Mensagem de AMOSTRA — dados fictícios, apenas para validação do layout.",
    assunto: "PAXTER | Amostra do padrão de e-mail",
  };
}
