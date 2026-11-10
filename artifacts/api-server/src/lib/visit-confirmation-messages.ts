/**
 * Conteúdo das mensagens da confirmação do cliente por visita (K8). Funções puras.
 * Regras: vocabulário "cliente"; nenhum dado clínico (só nome, data e hora da visita);
 * a chave só aparece no corpo das mensagens ao cliente, nunca em assunto nem em log.
 *
 * Código Paxter Art. 66: aqui só vai o CONTEÚDO (PaxterDoc). A marca (casco navy/ouro, banner,
 * botão, legenda de WhatsApp e Telegram) é aplicada pelo motor Hermes (lib/messaging); nenhuma
 * mensagem de marca é montada à mão neste arquivo. A página pública (publicPage) é tela da web,
 * não mensagem enviada, e por isso fica fora do motor.
 */
import type { PaxterDoc } from "./messaging/types";

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

/** Assunto fixo da chave: a chave nunca vai no assunto. */
export const KEY_SUBJECT = "Chave de confirmação da sua aplicação";

/**
 * Chave de 6 dígitos que o cliente informa à enfermagem. A chave é a manchete do documento:
 * aparece grande no e-mail e em negrito no WhatsApp e no Telegram, sem montagem à mão.
 */
export function keyMessage(args: { clientName: string; key: string; minutes: number; when: string }): PaxterDoc {
  const name = firstName(args.clientName);
  return {
    eyebrow: "Chave de confirmação",
    titulo: args.key,
    paragrafos: [
      `Olá, ${name}.`,
      `Esta é a chave da sua aplicação de ${args.when}.`,
      `Informe-a à enfermagem. Ela vale por ${args.minutes} minutos e só pode ser usada uma vez.`,
    ],
    notaRodape: "Não compartilhe esta chave com mais ninguém.",
    assunto: KEY_SUBJECT,
  };
}

/** Assunto fixo do aviso de aplicação realizada (K10). */
export const APPLICATION_DONE_SUBJECT = "Aplicação realizada com sucesso";

/**
 * Aviso imediato ao cliente quando a visita é fechada com aplicação registrada (K10).
 * Os parágrafos (que vão a todos os canais) levam só data, hora e contagem; nomes e doses das
 * substâncias entram apenas no e-mail, por `blocosHtml` (ignorado pelos cartões de WhatsApp e Telegram).
 */
export function applicationDoneMessage(args: {
  clientName: string; when: string; applied: number; due: number; blocosHtml?: string[];
}): PaxterDoc {
  const name = firstName(args.clientName);
  const paragrafos = [
    `Olá, ${name}.`,
    `A enfermagem registrou a sua aplicação de ${args.when}.`,
    `Aplicadas: ${args.applied} de ${args.due}.`,
  ];
  if (args.applied < args.due) paragrafos.push("As demais não foram aplicadas nesta visita.");
  return {
    eyebrow: "Aplicação registrada",
    titulo: APPLICATION_DONE_SUBJECT,
    paragrafos,
    ...(args.blocosHtml && args.blocosHtml.length > 0 ? { blocosHtml: args.blocosHtml } : {}),
    notaRodape: "Se não reconhece esta aplicação, avise a clínica.",
    assunto: APPLICATION_DONE_SUBJECT,
  };
}

/** E-mail ao cliente com o botão de um clique. n = 1, 2 ou 3. */
export function clientConfirmEmail(args: { clientName: string; link: string; when: string; n: number; total: number }): PaxterDoc {
  const name = firstName(args.clientName);
  const lembrete = args.n > 1;
  return {
    eyebrow: lembrete ? `Lembrete ${args.n} de ${args.total}` : "Confirmação da sua aplicação",
    titulo: lembrete ? "Ainda falta a sua confirmação" : "Confirme a sua aplicação",
    paragrafos: [
      `Olá, ${name}.`,
      `A enfermagem registrou a sua aplicação de ${args.when}.`,
      "Para concluir o registro, confirme que ela aconteceu.",
    ],
    botao: { label: "Abrir e confirmar", url: args.link },
    notaRodape: 'Ao abrir o link você verá um botão "Confirmo". Só abrir não confirma nada. '
      + "Se não reconhece esta aplicação, não clique e avise a clínica.",
    assunto: lembrete
      ? `Lembrete ${args.n} de ${args.total}: confirme a sua aplicação`
      : "Confirme a sua aplicação",
  };
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
}): PaxterDoc {
  const identificacao = [`Cliente: ${args.clientName}`, `Visita: ${args.when}`];
  if (args.kind === "inicio") {
    const por = args.origin === "desafio_travado"
      ? "O desafio presencial por dados do cadastro foi travado depois de várias respostas erradas."
      : args.origin === "desafio"
        ? "A validação foi feita no local por dados do cadastro (prova fraca); a confirmação por e-mail continua pendente."
        : `${args.nurseName ?? "A enfermagem"} registrou a aplicação sem a chave do cliente.`;
    const paragrafos = [
      ...identificacao,
      por,
      "O cliente receberá até 3 e-mails de confirmação, um por dia. Se ele não confirmar, você receberá um aviso final.",
    ];
    if (!args.clientHasEmail) {
      paragrafos.push("Atenção: o cliente não tem e-mail cadastrado, então a confirmação por clique não pode ser enviada. É preciso falar com o cliente.");
    }
    return {
      eyebrow: "Gestão da clínica",
      titulo: "Confirmação do cliente pendente",
      paragrafos,
      assunto: `Confirmação pendente: ${args.clientName}`,
    };
  }
  const aceitos = Math.max(0, args.emailsSent - args.emailsFailed);
  const envio = args.emailsFailed === 0
    ? `Os ${args.emailsSent} e-mails de confirmação foram aceitos pelo provedor de envio e o cliente não confirmou.`
    : aceitos === 0
      ? `Foram feitas ${args.emailsSent} tentativas de enviar o e-mail de confirmação, mas nenhuma foi aceita pelo provedor de envio. O cliente pode nem ter recebido o link.`
      : `Foram feitas ${args.emailsSent} tentativas de enviar o e-mail de confirmação: ${aceitos} aceitas e ${args.emailsFailed} recusadas pelo provedor de envio. O cliente não confirmou.`;
  return {
    eyebrow: "Gestão da clínica",
    titulo: "Aplicação NÃO CONFIRMADA pelo cliente",
    paragrafos: [
      ...identificacao,
      envio,
      "Recomendação: entre em contato com o cliente. A aplicação continua registrada pela enfermagem; só a parte do cliente segue sem confirmação.",
    ],
    assunto: `NÃO CONFIRMADA: ${args.clientName} (${args.when})`,
  };
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
