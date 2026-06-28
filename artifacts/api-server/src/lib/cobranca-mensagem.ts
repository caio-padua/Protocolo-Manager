// Compositor ÚNICO da mensagem de cobrança (uma fonte para os 3 canais).
// E-mail = HTML com a identidade da clínica; WhatsApp/Telegram = texto limpo.
// Sem emoji (linha do CEO: seriedade, sem infantilidades). Valores e datas em
// padrão Brasil (vírgula decimal, DD/MM/AAAA).

const CLINICA = "Instituto Pádua";
const SUBTITULO = "Protocolos Injetáveis";

export interface CobrancaMensagemInput {
  nomeCliente: string;
  valor: number;
  descricao?: string | null;
  vencimento: string; // YYYY-MM-DD
  invoiceUrl: string;
}

export function formatBRL(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatDataBR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Texto limpo para WhatsApp e Telegram. */
export function montarTextoCobranca(input: CobrancaMensagemInput): string {
  const linhas = [
    `${CLINICA} — ${SUBTITULO}`,
    "",
    `Olá, ${input.nomeCliente}. Segue a sua cobrança.`,
    "",
    `Valor: R$ ${formatBRL(input.valor)}`,
  ];
  if (input.descricao && input.descricao.trim()) {
    linhas.push(`Referente a: ${input.descricao.trim()}`);
  }
  linhas.push(`Vencimento: ${formatDataBR(input.vencimento)}`);
  linhas.push("");
  linhas.push("Pague com PIX, cartão ou boleto neste link:");
  linhas.push(input.invoiceUrl);
  linhas.push("");
  linhas.push("Qualquer dúvida, estamos à disposição.");
  return linhas.join("\n");
}

/** Assunto do e-mail. */
export function montarAssuntoCobranca(): string {
  return `${CLINICA} | Cobrança | Link de pagamento`;
}

/** HTML do e-mail (cartão com botão "Pagar agora"). */
export function montarHtmlCobranca(input: CobrancaMensagemInput): string {
  const valor = `R$ ${formatBRL(input.valor)}`;
  const venc = formatDataBR(input.vencimento);
  const ref = input.descricao && input.descricao.trim()
    ? `<tr><td style="padding:4px 0;color:#475569;">Referente a</td><td style="padding:4px 0;text-align:right;color:#0f172a;font-weight:600;">${escapeHtml(input.descricao.trim())}</td></tr>`
    : "";
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f1f5f9;padding:24px;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
      <div style="background:#16284a;padding:20px 24px;">
        <div style="color:#e9d7a7;font-size:20px;font-weight:800;letter-spacing:2px;">PAXTER</div>
        <div style="color:#cbd5e1;font-size:11px;letter-spacing:1px;margin-top:2px;">${CLINICA} — ${SUBTITULO}</div>
      </div>
      <div style="padding:24px;">
        <p style="color:#0f172a;font-size:15px;margin:0 0 16px;">Olá, <strong>${escapeHtml(input.nomeCliente)}</strong>. Segue a sua cobrança.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
          <tr><td style="padding:4px 0;color:#475569;">Valor</td><td style="padding:4px 0;text-align:right;color:#0f172a;font-weight:700;font-size:18px;">${valor}</td></tr>
          ${ref}
          <tr><td style="padding:4px 0;color:#475569;">Vencimento</td><td style="padding:4px 0;text-align:right;color:#0f172a;font-weight:600;">${venc}</td></tr>
        </table>
        <a href="${escapeAttr(input.invoiceUrl)}" style="display:block;text-align:center;background:#16284a;color:#e9d7a7;text-decoration:none;font-weight:700;padding:14px;border-radius:8px;letter-spacing:1px;">PAGAR AGORA</a>
        <p style="color:#64748b;font-size:12px;margin:16px 0 0;text-align:center;">Pague com PIX, cartão ou boleto. Qualquer dúvida, estamos à disposição.</p>
      </div>
      <div style="background:#f8fafc;padding:12px 24px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11px;text-align:center;">
        ${CLINICA} — enviado automaticamente pelo PAXTER.
      </div>
    </div>
  </div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
