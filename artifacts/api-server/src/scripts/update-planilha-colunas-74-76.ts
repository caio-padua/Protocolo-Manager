/**
 * Padroniza colunas #74, #75, #76 na planilha para a ordem canônica:
 * Nº | Data | Hora | Descrição | Responsável | Estado | Prioridade | Depende de
 * Executar: npx tsx src/scripts/update-planilha-colunas-74-76.ts
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

async function main() {
  const token = await getAccessToken();
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: token });
  const sheets = google.sheets({ version: "v4", auth });

  const read = await sheets.spreadsheets.values.get({
    spreadsheetId: PLANILHA_ID,
    range: `${SHEET_NAME}!A:H`,
  });
  const rows = read.data.values ?? [];

  const rowIndex: Record<string, number> = {};
  for (let i = 0; i < rows.length; i++) {
    const num = String(rows[i][0] ?? "").trim();
    if (num) rowIndex[num] = i;
  }

  // Ordem canônica: Nº | Data | Hora | Descrição | Responsável | Estado | Prioridade | Depende de
  const canonico = [
    {
      num: "74",
      data: "12/08/2026",
      hora: "",
      desc: "Trava escassez Concierge (base) — motor backend + frontend + banco",
      resp: "Dr. Replit",
      estado: "CONCLUÍDO",
      prio: "P0",
      dep: "—",
    },
    {
      num: "75",
      data: "12/08/2026",
      hora: "",
      desc: "Idempotência webhook Asaas — registrarFalha(cpf, eventId) + CTE atômico + tabela concierge_webhook_eventos",
      resp: "Dr. Replit",
      estado: "AGUARDANDO #81-A",
      prio: "P0",
      dep: "—",
    },
    {
      num: "76",
      data: "12/08/2026",
      hora: "",
      desc: "Guard backend concierge-request — 403 CONCIERGE_BLOCKED antes do INSERT",
      resp: "Dr. Replit",
      estado: "CONCLUÍDO",
      prio: "P0",
      dep: "—",
    },
  ];

  const updates: { range: string; values: string[][] }[] = [];
  for (const c of canonico) {
    const idx = rowIndex[c.num];
    if (idx !== undefined) {
      const rowNum = idx + 1;
      updates.push({
        range: `${SHEET_NAME}!A${rowNum}:H${rowNum}`,
        values: [[c.num, c.data, c.hora, c.desc, c.resp, c.estado, c.prio, c.dep]],
      });
      console.log(`Padronizando linha ${rowNum} (#${c.num})`);
    }
  }

  if (updates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: PLANILHA_ID,
      requestBody: { valueInputOption: "USER_ENTERED", data: updates },
    });
    console.log(`${updates.length} linhas padronizadas`);
  }

  console.log("✅ Planilha padronizada");
  console.log(`URL: https://docs.google.com/spreadsheets/d/${PLANILHA_ID}`);
}

main().catch(err => { console.error("ERRO:", err.message); process.exit(1); });
