/**
 * Adiciona colunas I (Para que serve) e J (Módulo) na planilha de produção.
 * Backfill dos itens #74 a #86 em linguagem do CEO.
 * Executar: npx tsx src/scripts/update-planilha-colunas-contexto.ts
 */
import { google } from "googleapis";

const PLANILHA_ID = "1SW6K2JNUEP4i1I16v_ZYhtwxTpUkT_dx3ERHkj9HQcw";
const SHEET_NAME = "PLANILHA PRODUCAO";

async function getAccessToken(): Promise<string> {
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
  const conn = data.items?.find((i: any) => i.connector_name === "google-drive");
  const token = conn?.settings?.access_token || conn?.settings?.oauth?.credentials?.access_token;
  if (!token) throw new Error("Google Drive não conectado");
  return token;
}

// Para que serve → 1 frase em linguagem do CEO (não técnica)
// Módulo → categoria do sistema
const CONTEXTO: Record<string, { paraQueServe: string; modulo: string }> = {
  "74": {
    paraQueServe:
      "Faz a agenda do Dr. Caio parecer mais distante para pacientes que abandonam a oferta do Concierge sem pagar — preserva a sensação de escassez real do horário.",
    modulo: "Concierge",
  },
  "75": {
    paraQueServe:
      "Garante que o mesmo aviso de cobrança enviado pelo banco duas vezes não penaliza o paciente duas vezes — protege quem tem problema no cartão de sofrer punição dobrada.",
    modulo: "Concierge",
  },
  "76": {
    paraQueServe:
      "Impede que um paciente suspenso consiga agendar pelo Concierge mesmo tentando entrar diretamente pelo link do sistema, sem passar pela tela normal.",
    modulo: "Concierge",
  },
  "77": {
    paraQueServe:
      "Distingue quem cancelou por má-fé de quem teve cartão recusado pelo banco — abandono intencional pesa mais do que problema técnico de pagamento.",
    modulo: "Concierge",
  },
  "78": {
    paraQueServe:
      "Define quanto tempo o paciente fica com a agenda distante e quando ela volta ao normal automaticamente — sem bloqueio permanente, apenas um período de espera proporcional à gravidade.",
    modulo: "Concierge",
  },
  "79": {
    paraQueServe:
      "Antes de punir um CPF, confirma pelo WhatsApp ou Telegram que é realmente aquele paciente — impede que alguém use o CPF de outra pessoa para queimar a agenda dela.",
    modulo: "Concierge",
  },
  "80": {
    paraQueServe:
      "Desacelera quem fica gerando muitas ofertas no mesmo dispositivo sem intenção de agendar — o curioso trava, o paciente legítimo só confirma um código rápido e segue.",
    modulo: "Concierge",
  },
  "81": {
    paraQueServe:
      "Bateria de testes que prova que as regras do Concierge funcionam corretamente antes de abrir para pacientes reais — nenhuma entrega fecha sem essa validação.",
    modulo: "Concierge",
  },
  "82": {
    paraQueServe:
      "Move a tabela de penalidades do Concierge para dentro do sistema de banco de dados oficial — facilita manutenção futura e elimina a exceção técnica histórica.",
    modulo: "Concierge",
  },
  "83": {
    paraQueServe:
      "Painel que mostra para o CEO quantas pessoas abandonaram o Concierge, qual o perfil delas e o que isso representa em receita perdida — inteligência comercial.",
    modulo: "Concierge",
  },
  "84": {
    paraQueServe:
      "Faz a tela de agendamento exibir a mensagem certa quando o sistema pede verificação ou quando o dispositivo está sendo freado — sem tela em branco para o paciente.",
    modulo: "Concierge",
  },
  "85": {
    paraQueServe:
      "Garante que o sistema não confunda um paciente numa rede de escola ou clínica (que compartilha IP com centenas de pessoas) com alguém abusando do sistema.",
    modulo: "Concierge",
  },
  "86": {
    paraQueServe:
      "Revisa o texto de todas as mensagens da trava para soar como critério da clínica, não como punição — o paciente entende que é uma regra do sistema, não que foi castigado.",
    modulo: "Concierge",
  },
};

async function main() {
  const token = await getAccessToken();
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: token });
  const sheets = google.sheets({ version: "v4", auth });

  // 1. Ler planilha para localizar linhas e cabeçalho
  const read = await sheets.spreadsheets.values.get({
    spreadsheetId: PLANILHA_ID,
    range: `${SHEET_NAME}!A:J`,
  });
  const rows = read.data.values ?? [];
  console.log(`Total de linhas lidas: ${rows.length}`);

  // 2. Atualizar cabeçalho (linha 1) para incluir colunas I e J
  const headerRow = rows[0] ?? [];
  if (!headerRow[8] || !headerRow[9]) {
    console.log("Adicionando cabeçalho nas colunas I e J...");
    await sheets.spreadsheets.values.update({
      spreadsheetId: PLANILHA_ID,
      range: `${SHEET_NAME}!I1:J1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [["Para que serve", "Módulo"]] },
    });
    console.log("Cabeçalho adicionado ✅");
  } else {
    console.log(`Cabeçalho já existe: I="${headerRow[8]}" J="${headerRow[9]}"`);
  }

  // 3. Mapear número do item → índice de linha
  const rowIndex: Record<string, number> = {};
  for (let i = 1; i < rows.length; i++) {
    const num = String(rows[i][0] ?? "").trim();
    if (num) rowIndex[num] = i;
  }

  // 4. Backfill colunas I e J para #74–#86
  const updates: { range: string; values: string[][] }[] = [];
  for (const [num, ctx] of Object.entries(CONTEXTO)) {
    const idx = rowIndex[num];
    if (idx !== undefined) {
      const rowNum = idx + 1; // Sheets é 1-based
      updates.push({
        range: `${SHEET_NAME}!I${rowNum}:J${rowNum}`,
        values: [[ctx.paraQueServe, ctx.modulo]],
      });
      console.log(`Preparando #${num} (linha ${rowNum})`);
    } else {
      console.log(`AVISO: item #${num} não encontrado na planilha`);
    }
  }

  if (updates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: PLANILHA_ID,
      requestBody: { valueInputOption: "USER_ENTERED", data: updates },
    });
    console.log(`\n✅ ${updates.length} itens atualizados com contexto e módulo`);
  }

  console.log(`\nURL: https://docs.google.com/spreadsheets/d/${PLANILHA_ID}`);
  console.log("\nRegra nova: todo item novo deve ter 'Para que serve' preenchida em");
  console.log("linguagem do CEO — se não couber em 1 frase, o item está mal especificado.");
}

main().catch(err => { console.error("ERRO:", err.message); process.exit(1); });
