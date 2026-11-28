/**
 * Posta correção em thread no post das 23:09 no Slack #padaxor-projeto
 * Executar: npx tsx src/scripts/post-slack-thread-correcao.ts
 */
import { isRecord, loadReplitConnectorAccessToken } from "../lib/replit-connection";

export {};

const CHANNEL_ID = "C0BLW5S7GQL";
// ts do post das 23:09 que disse CONCLUÍDO (informado pelo CEO)
const THREAD_TS = "1786500568.952229";

async function getSlackToken(): Promise<string> {
  return loadReplitConnectorAccessToken("slack");
}

async function main() {
  const token = await getSlackToken();

  const texto = `*CORREÇÃO — esta mensagem contém erro (leia antes)*

O post acima marcou #75 como CONCLUÍDO. Isso estava errado.

Dr. Manus identificou com \`git diff\` que o commit seguinte havia removido a idempotência. A regressão estava viva.

*O que foi corrigido agora (commit \`a9cb27a\`):*
• \`registrarFalha(cpf, eventId)\` — eventId agora OBRIGATÓRIO, sem sobrecarga opcional
• Tabela \`concierge_webhook_eventos\` com \`event_id\` como chave primária
• CTE atômico: INSERT evento ON CONFLICT DO NOTHING → UPSERT penalidade WHERE EXISTS
• Polling linha 789: \`eventId = poll:{row.id}:{asaasChargeId}:{mapped}\`

*Prova de idempotência (saída do teste colada na carta — vide \`cartas/2026-08-12_DR-REPLIT_resposta-CEO-carta.md\`)*

*Status correto:* #75 aguarda bloco #81-A verde do Dr. Manus antes de fechar CONCLUÍDO.
*Fonte única:* \`docs/concierge/ARQUITETURA.md\` commit \`eaeac11\``;

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ channel: CHANNEL_ID, thread_ts: THREAD_TS, text: texto }),
  });
  const result: unknown = await res.json();
  if (isRecord(result) && result.ok === true) {
    console.log("✅ Thread postada — ts:", result.ts);
  } else {
    console.error("ERRO:", isRecord(result) ? result.error : "Resposta inválida do Slack", result);
  }
}

main().catch(err => { console.error("ERRO:", err.message); process.exit(1); });
