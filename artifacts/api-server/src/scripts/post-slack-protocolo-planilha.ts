/**
 * Posta no Slack #padaxor-projeto o protocolo das novas colunas I e J da planilha.
 * Executar: npx tsx src/scripts/post-slack-protocolo-planilha.ts
 */
import { isRecord, loadReplitConnectorAccessToken } from "../lib/replit-connection";

export {};

const CHANNEL_ID = "C0BLW5S7GQL";

async function getSlackToken(): Promise<string> {
  return loadReplitConnectorAccessToken("slack");
}

async function main() {
  const token = await getSlackToken();
  const texto = `*NOVA REGRA OBRIGATÓRIA — Colunas I e J na planilha de produção*
Aprovada pelo CEO Dr. Caio em 12/08/2026 · commit \`f83a0a1\`

*O problema resolvido:* o CEO relatou que após alguns dias não conseguia lembrar do que se tratava o item lendo só a descrição técnica. Um novo colaborador também ficava perdido.

*O que mudou na planilha:*
• Coluna *I — "Para que serve"*: 1 frase em linguagem do CEO. O problema de negócio, não a solução técnica.
• Coluna *J — "Módulo"*: categoria do sistema (Concierge, Telegram, Radar, etc.)

*Ambas são OBRIGATÓRIAS em qualquer item novo.* Item sem coluna I não está registrado corretamente.

*Como escrever a coluna I:*
❌ "Adicionar eventId obrigatório em registrarFalha + CTE atômico"
✅ "Garante que o mesmo aviso do banco enviado duas vezes não penaliza o paciente duas vezes"

Se não couber em 1 frase → o item está mal especificado. Reescreva.

*Documento normativo completo:* \`docs/PROTOCOLO-PLANILHA.md\` no repositório
*Carta para todos os colaboradores:* \`cartas/2026-08-12_TODOS_protocolo-planilha.md\`
*Planilha:* https://docs.google.com/spreadsheets/d/1SW6K2JNUEP4i1I16v_ZYhtwxTpUkT_dx3ERHkj9HQcw`;

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ channel: CHANNEL_ID, text: texto }),
  });
  const result: unknown = await res.json();
  if (isRecord(result) && result.ok === true) {
    console.log("Slack postado — ts:", result.ts);
  } else {
    console.error("ERRO:", isRecord(result) ? result.error : "Resposta inválida do Slack");
  }
}

main().catch(err => { console.error("ERRO:", err.message); process.exit(1); });
