/**
 * Textos da confirmação do cliente por visita (K8). Funções puras.
 * Regras: vocabulário "cliente"; nenhum dado clínico (só nome, data e hora da visita);
 * a chave só aparece no corpo das mensagens ao cliente, nunca em assunto nem em log.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function firstName(fullName: string | null | undefined): string {
  const first = (fullName ?? "").trim().split(/\s+/)[0] ?? "";
  return first || "cliente";
}

/** "2026-11-09" + "14:30" -> "09/11/2026 às 14:30". */
export function whenLabel(date: string | null | undefined, time: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? "");
  const day = m ? `${m[3]}/${m[2]}/${m[1]}` : (date ?? "data não informada");
  return time ? `${day} às ${time}` : day;
}

function shell(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#0b1f3a;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b1f3a;padding:24px 12px;">
<tr><td align="center"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#13294b;border:1px solid #c9a24b;border-radius:8px;">
<tr><td style="padding:18px 24px;border-bottom:1px solid #c9a24b;color:#c9a24b;font-size:13px;letter-spacing:2px;text-transform:uppercase;">${escapeHtml(title)}</td></tr>
<tr><td style="padding:24px;color:#f2ead7;font-size:15px;line-height:1.55;">${bodyHtml}</td></tr>
</table></td></tr></table></body></html>`;
}

function button(url: string, label: string): string {
  return `<p style="text-align:center;margin:28px 0;"><a href="${escapeHtml(url)}" style="background:#c9a24b;color:#0b1f3a;text-decoration:none;font-weight:bold;padding:14px 28px;border-radius:6px;display:inline-block;">${escapeHtml(label)}</a></p>`;
}

export interface KeyMessage { subject: string; html: string; text: string }

/** Chave de 6 dígitos que o cliente informa à enfermagem. */
export function keyMessage(args: { clientName: string; key: string; minutes: number; when: string }): KeyMessage {
  const name = firstName(args.clientName);
  const text =
    `Olá, ${name}. Sua chave de confirmação da aplicação de ${args.when} é ${args.key}. ` +
    `Informe-a à enfermagem. Ela vale por ${args.minutes} minutos e só pode ser usada uma vez. ` +
    `Não compartilhe com mais ninguém.`;
  const html = shell("Chave de confirmação", `
<p>Olá, ${escapeHtml(name)}.</p>
<p>Sua chave de confirmação da aplicação de <strong>${escapeHtml(args.when)}</strong>:</p>
<p style="text-align:center;font-size:34px;letter-spacing:10px;font-weight:bold;color:#c9a24b;margin:22px 0;">${escapeHtml(args.key)}</p>
<p>Informe esta chave à enfermagem. Ela vale por ${args.minutes} minutos e só pode ser usada uma vez.</p>
<p style="color:#b8ad92;font-size:13px;">Não compartilhe com mais ninguém.</p>`);
  return { subject: "Chave de confirmação da sua aplicação", html, text };
}

/** E-mail ao cliente com o botão de um clique. n = 1, 2 ou 3. */
export function clientConfirmEmail(args: { clientName: string; link: string; when: string; n: number; total: number }): { subject: string; html: string } {
  const name = firstName(args.clientName);
  const lembrete = args.n > 1 ? `<p style="color:#e8c46a;">Lembrete ${args.n} de ${args.total}: ainda falta a sua confirmação.</p>` : "";
  const html = shell("Confirmação da sua aplicação", `
<p>Olá, ${escapeHtml(name)}.</p>
${lembrete}
<p>A enfermagem registrou a sua aplicação de <strong>${escapeHtml(args.when)}</strong>. Para concluir o registro, confirme que ela aconteceu:</p>
${button(args.link, "Abrir e confirmar")}
<p style="color:#b8ad92;font-size:13px;">Ao abrir o link você verá um botão "Confirmo". Só abrir não confirma nada. Se não reconhece esta aplicação, não clique e avise a clínica.</p>`);
  const subject = args.n > 1
    ? `Lembrete ${args.n} de ${args.total}: confirme a sua aplicação`
    : "Confirme a sua aplicação";
  return { subject, html };
}

/** Aviso à gestão (administrador e responsável técnico). */
export function managerEmail(args: {
  kind: "inicio" | "final";
  clientName: string;
  when: string;
  nurseName: string | null;
  origin: string;
  clientHasEmail: boolean;
  emailsSent: number;
  emailsFailed: number;
}): { subject: string; html: string } {
  const common = `<p>Cliente: <strong>${escapeHtml(args.clientName)}</strong><br>Visita: <strong>${escapeHtml(args.when)}</strong></p>`;
  if (args.kind === "inicio") {
    const por = args.origin === "desafio_travado"
      ? "O desafio presencial por dados do cadastro foi travado depois de várias respostas erradas."
      : args.origin === "desafio"
        ? "A validação foi feita no local por dados do cadastro (prova fraca); a confirmação por e-mail continua pendente."
        : `${args.nurseName ? escapeHtml(args.nurseName) : "A enfermagem"} registrou a aplicação sem a chave do cliente.`;
    const semEmail = args.clientHasEmail ? "" : `<p style="color:#e8c46a;"><strong>Atenção:</strong> o cliente não tem e-mail cadastrado, então a confirmação por clique não pode ser enviada. É preciso falar com o cliente.</p>`;
    const html = shell("Confirmação do cliente pendente", `
${common}<p>${por}</p>
<p>O cliente receberá até 3 e-mails de confirmação, um por dia. Se ele não confirmar, você receberá um aviso final.</p>${semEmail}`);
    return { subject: `Confirmação pendente: ${args.clientName}`, html };
  }
  const aceitos = Math.max(0, args.emailsSent - args.emailsFailed);
  const envio = args.emailsFailed === 0
    ? `Os ${args.emailsSent} e-mails de confirmação foram aceitos pelo provedor de envio e o cliente <strong>não confirmou</strong>.`
    : aceitos === 0
      ? `Foram feitas ${args.emailsSent} tentativas de enviar o e-mail de confirmação, mas <strong>nenhuma foi aceita</strong> pelo provedor de envio. O cliente pode nem ter recebido o link.`
      : `Foram feitas ${args.emailsSent} tentativas de enviar o e-mail de confirmação: ${aceitos} aceitas e ${args.emailsFailed} recusadas pelo provedor de envio. O cliente <strong>não confirmou</strong>.`;
  const html = shell("Aplicação NÃO CONFIRMADA pelo cliente", `
${common}
<p>${envio}</p>
<p>Recomendação: entre em contato com o cliente. A aplicação continua registrada pela enfermagem; só a parte do cliente segue sem confirmação.</p>`);
  return { subject: `NÃO CONFIRMADA: ${args.clientName} (${args.when})`, html };
}

/** Página pública (HTML completo). */
export function publicPage(args: { title: string; bodyHtml: string }): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(args.title)}</title></head>
<body style="margin:0;background:#0b1f3a;font-family:Arial,Helvetica,sans-serif;color:#f2ead7;">
<main style="max-width:480px;margin:0 auto;padding:40px 20px;text-align:center;">
<div style="border:1px solid #c9a24b;border-radius:10px;background:#13294b;padding:32px 24px;">
<h1 style="font-size:20px;color:#c9a24b;margin:0 0 18px;">${escapeHtml(args.title)}</h1>
${args.bodyHtml}
</div></main></body></html>`;
}
