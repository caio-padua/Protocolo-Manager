/**
 * Limpeza da coluna J (Módulo) para itens #1-#73.
 * Apaga valores herdados de "Esforco" (ex: "feito", "a definir")
 * e preenche o módulo real por bloco de itens.
 * Executar: npx tsx src/scripts/fix-planilha-coluna-modulo.ts
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

// Módulo por número de item — baseado na descrição de cada um.
// Regra: vazio é melhor que mentira. Se o módulo for incerto, deixar em branco.
// Valores inválidos herdados de "Esforco": "feito", "a definir", "nao" → apagar.
const MODULO: Record<string, string> = {
  // Bloco Comunicação Digital / WhatsApp / Telegram (itens ~1-20)
  "1":  "WhatsApp",
  "2":  "WhatsApp",
  "3":  "WhatsApp",
  "4":  "Telegram",
  "5":  "Telegram",
  "6":  "Telegram",
  "7":  "Telegram",
  "8":  "Telegram",
  "9":  "Telegram",
  "10": "Comunicação",
  "11": "Comunicação",
  "12": "Comunicação",
  "13": "Comunicação",
  "14": "Lembretes",
  "15": "Lembretes",
  "16": "Lembretes",
  "17": "Lembretes",
  "18": "Royalty",
  "19": "Royalty",
  "20": "Royalty",
  // Bloco Lembretes / Campanhas (itens ~21-40)
  "21": "Lembretes",
  "22": "Lembretes",
  "23": "Lembretes",
  "24": "Lembretes",
  "25": "Lembretes",
  "26": "Lembretes",
  "27": "Lembretes",
  "28": "Lembretes",
  "29": "Lembretes",
  "30": "Lembretes",
  "31": "Lembretes",
  "32": "Lembretes",
  "33": "Lembretes",
  "34": "Lembretes",
  "35": "Comunicação",
  "36": "Comunicação",
  "37": "Comunicação",
  "38": "Comunicação",
  "39": "Agenda",
  "40": "Agenda",
  // Bloco Radar / Cockpit / Agenda (itens ~41-60)
  "41": "Radar",
  "42": "Radar",
  "43": "Radar",
  "44": "Cockpit",
  "45": "Cockpit",
  "46": "Cockpit",
  "47": "Cockpit",
  "48": "Cockpit",
  "49": "Agenda",
  "50": "Agenda",
  "51": "Agenda",
  "52": "Agenda",
  "53": "Agenda",
  "54": "Agenda",
  "55": "Anamnese",
  "56": "Anamnese",
  "57": "Anamnese",
  "58": "Anamnese",
  "59": "Anamnese",
  "60": "Exames",
  // Bloco Exames / Drive / Receituário (itens ~61-73)
  "61": "Exames",
  "62": "Exames",
  "63": "Exames",
  "64": "Drive",
  "65": "Lembretes",
  "66": "Lembretes",
  "67": "Lembretes",
  "68": "Receituário",
  "69": "Receituário",
  "70": "Receituário",
  "71": "Financeiro",
  "72": "Financeiro",
  "73": "Dicionário",
};

// Lista BRANCA de valores legítimos para a coluna J.
// Qualquer valor fora desta lista é lixo herdado de "Esforco" e será substituído.
const MODULOS_VALIDOS = new Set([
  "concierge", "telegram", "whatsapp", "lembretes", "radar", "anamnese",
  "receituário", "receituario", "cockpit", "drive", "exames", "agenda",
  "financeiro", "comunicação", "comunicacao", "royalty", "padteam",
  "infraestrutura", "dicionário", "dicionario",
]);

async function main() {
  const token = await getAccessToken();
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: token });
  const sheets = google.sheets({ version: "v4", auth });

  // 1. Ler planilha completa
  const read = await sheets.spreadsheets.values.get({
    spreadsheetId: PLANILHA_ID,
    range: `${SHEET_NAME}!A:J`,
  });
  const rows = read.data.values ?? [];
  console.log(`Total de linhas lidas: ${rows.length}`);
  console.log(`Cabeçalho: ${JSON.stringify(rows[0])}`);

  // 2. Mapear número do item → índice de linha (0-based)
  const rowIndex: Record<string, number> = {};
  for (let i = 1; i < rows.length; i++) {
    const num = String(rows[i][0] ?? "").trim();
    if (num) rowIndex[num] = i;
  }

  // 3. Identificar o que está errado e o que precisa ser preenchido
  const updates: { range: string; values: string[][] }[] = [];
  let lixoApagado = 0;
  let moduloPreenchido = 0;
  let moduloJaCorreto = 0;
  let semModulo = 0;

  for (let num = 1; num <= 73; num++) {
    const key = String(num);
    const idx = rowIndex[key];
    if (idx === undefined) {
      console.log(`AVISO: item #${key} não encontrado na planilha`);
      continue;
    }

    const row = rows[idx];
    const rowNum = idx + 1; // Sheets é 1-based
    const colJAtual = String(row[9] ?? "").trim().toLowerCase();
    const moduloNovo = MODULO[key] || "";

    const ehModuloValido = MODULOS_VALIDOS.has(colJAtual);
    if (colJAtual && !ehModuloValido) {
      // Valor existe mas não é um módulo legítimo — lixo herdado de "Esforco"
      const novoValor = moduloNovo || "";
      updates.push({
        range: `${SHEET_NAME}!J${rowNum}`,
        values: [[novoValor]],
      });
      console.log(`#${key.padEnd(3)} linha ${rowNum}: LIXO "${row[9]}" → "${novoValor || "(vazio)"}"`);
      lixoApagado++;
    } else if (!colJAtual && moduloNovo) {
      // Vazio + temos módulo definido → preencher
      updates.push({
        range: `${SHEET_NAME}!J${rowNum}`,
        values: [[moduloNovo]],
      });
      console.log(`#${key.padEnd(3)} linha ${rowNum}: VAZIO → "${moduloNovo}"`);
      moduloPreenchido++;
    } else if (colJAtual && ehModuloValido) {
      // Já tem valor legítimo → não tocar
      console.log(`#${key.padEnd(3)} linha ${rowNum}: OK (mantém "${row[9]}")`);
      moduloJaCorreto++;
    } else {
      // Vazio e sem mapeamento → deixar vazio (vazio é melhor que mentira)
      semModulo++;
    }
  }

  console.log(`\n--- RESUMO ANTES DE GRAVAR ---`);
  console.log(`Lixo a apagar/corrigir : ${lixoApagado}`);
  console.log(`Vazios a preencher     : ${moduloPreenchido}`);
  console.log(`Já corretos (não toca) : ${moduloJaCorreto}`);
  console.log(`Sem módulo definido    : ${semModulo}`);
  console.log(`Total de updates       : ${updates.length}`);

  if (updates.length === 0) {
    console.log("\n✅ Nada a corrigir.");
    return;
  }

  // 4. Gravar em batch
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: PLANILHA_ID,
    requestBody: { valueInputOption: "USER_ENTERED", data: updates },
  });

  console.log(`\n✅ ${updates.length} células atualizadas na coluna J`);
  console.log(`URL: https://docs.google.com/spreadsheets/d/${PLANILHA_ID}`);
}

main().catch(err => { console.error("ERRO:", err.message); process.exit(1); });
