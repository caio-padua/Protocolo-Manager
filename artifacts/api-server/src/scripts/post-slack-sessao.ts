/**
 * Script único — posta resumo da sessão 12/08/2026 no Slack #padaxor-projeto
 * Executar: npx tsx src/scripts/post-slack-sessao.ts
 */

const CHANNEL_ID = "C0BLW5S7GQL";

async function getSlackToken(): Promise<string> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;
  if (!xReplitToken || !hostname) throw new Error("REPL_IDENTITY ausente");

  const res = await fetch(`https://${hostname}/api/v2/connection?include_secrets=true`, {
    headers: { Accept: "application/json", "X-Replit-Token": xReplitToken },
  });
  const data = await res.json();
  const conn = data.items?.find((i: any) => i.connector_name === "slack");
  const token = conn?.settings?.access_token || conn?.settings?.oauth?.credentials?.access_token;
  if (!token) throw new Error("Slack não conectado — token não encontrado");
  return token;
}

async function postMessage(token: string, text: string) {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ channel: CHANNEL_ID, text }),
  });
  return res.json();
}

async function main() {
  const token = await getSlackToken();

  const texto = `*Dr. Replit Paxter — Sessão 12/08/2026 (encerramento)*

*P0 entregue — Trava de Escassez do Concierge:*
• #74 Trava base (backend + frontend + banco) — commits bd2b0b6, ae44e79 ✅
• #75 Idempotência webhook Asaas — commit b05883f (Task #158) ✅
• #76 Guard backend concierge-request — commit 1b6c747 (Task #159) ✅

*Planilha atualizada:* #74, #75, #76 → CONCLUÍDO

*Arquitetura v2 aprovada pelo Dr. Claude + Dr. Code (equipe acatou):*
• Peso por desfecho: cartão recusado=0,25 / cancela=1,0 / chargeback=2,0 / pago=−1,0
• Suspensão 180d em vez de bloqueio permanente + decaimento −1,0/90d
• Verificação por canal (Telegram/WhatsApp) antes de penalizar CPF
• Fricção por dispositivo (Dr. Manus, #80) + bateria 20 testes (#81)

*Próximo — Dr. Code (desbloqueado):* #77 peso por desfecho → #78 janela/decaimento → #79 verificação por canal
*Próximo — Dr. Manus (desbloqueado após #79):* #80 device-throttle → #81 testes → #83 Inteligência Comercial

*Cartas no GitHub:* cartas/2026-08-12_DR-CODE_* e cartas/2026-08-12_MANUS_*
*Spec Dr. Manus salva:* specs/SPEC-MANUS-80-81-83-concierge-v2.md`;

  const result = await postMessage(token, texto);
  if (result.ok) {
    console.log("✅ Slack postado com sucesso — ts:", result.ts);
  } else {
    console.error("ERRO Slack:", result.error, result);
  }
}

main().catch(err => {
  console.error("ERRO:", err.message);
  process.exit(1);
});
