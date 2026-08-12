/**
 * Script único — atualiza planilha de produção com status dos itens #74–#86
 * Executar: npx tsx src/scripts/update-planilha-concierge.ts
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
  if (!xReplitToken || !hostname) throw new Error("REPL_IDENTITY ou REPLIT_CONNECTORS_HOSTNAME ausente");

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

  // 1. Ler planilha para localizar as linhas #74, #75, #76
  const read = await sheets.spreadsheets.values.get({
    spreadsheetId: PLANILHA_ID,
    range: `${SHEET_NAME}!A:H`,
  });
  const rows = read.data.values ?? [];
  console.log(`Total de linhas lidas: ${rows.length}`);

  // Mapeia numero do item → índice de linha (0-based)
  const rowIndex: Record<string, number> = {};
  for (let i = 0; i < rows.length; i++) {
    const num = String(rows[i][0] ?? "").trim();
    if (num) rowIndex[num] = i;
  }
  console.log("Linhas encontradas para 74/75/76:", {
    "74": rowIndex["74"],
    "75": rowIndex["75"],
    "76": rowIndex["76"],
  });

  // 2. Atualizar #74, #75, #76 para CONCLUÍDO
  const updates: { range: string; values: string[][] }[] = [];

  const concluidos = [
    {
      num: "74",
      item: "Trava escassez Concierge (base)",
      resp: "Dr. Replit",
      status: "CONCLUÍDO",
      prio: "P0",
      dep: "—",
      leigo: "Sistema que afasta datas do Concierge conforme falhas do paciente",
      esforco: "commits: bd2b0b6, ae44e79",
    },
    {
      num: "75",
      item: "Idempotência webhook Asaas",
      resp: "Dr. Replit",
      status: "CONCLUÍDO",
      prio: "P0",
      dep: "—",
      leigo: "Mesmo evento do Asaas não penaliza o paciente duas vezes",
      esforco: "commit: b05883f (Task #158)",
    },
    {
      num: "76",
      item: "Guard backend concierge-request",
      resp: "Dr. Replit",
      status: "CONCLUÍDO",
      prio: "P0",
      dep: "—",
      leigo: "CPF suspenso não consegue criar pedido Concierge nem pela API direta",
      esforco: "commit: 1b6c747 (Task #159)",
    },
  ];

  for (const c of concluidos) {
    const idx = rowIndex[c.num];
    if (idx !== undefined) {
      const row = idx + 1; // Sheets é 1-based
      updates.push({
        range: `${SHEET_NAME}!A${row}:H${row}`,
        values: [[c.num, c.item, c.resp, c.status, c.prio, c.dep, c.leigo, c.esforco]],
      });
      console.log(`Atualizando linha ${row} (#${c.num}) → CONCLUÍDO`);
    } else {
      console.log(`AVISO: Linha #${c.num} não encontrada — será adicionada ao final`);
    }
  }

  // Executar atualizações das linhas existentes
  if (updates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: PLANILHA_ID,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: updates,
      },
    });
    console.log(`${updates.length} linhas atualizadas`);
  }

  // 3. Adicionar #84, #85, #86 ao final (se não existirem)
  const novos = [
    ["84", "Frontend trata throttled — agendar.tsx exibe fricção crescente", "Dr. Code", "A FAZER", "P1", "80", "Paciente vê mensagem adequada ao ser freado por dispositivo", ""],
    ["85", "Caso de teste: fingerprint ausente + 2 dispositivos mesmo IP (CGNAT)", "Dr. Manus", "A FAZER", "P1", "80,81", "Evitar falso positivo em redes compartilhadas (escolas, clínicas)", ""],
    ["86", "Revisão semântica do texto de fricção (não soar como castigo)", "Dr. Manus", "A FAZER", "P2", "84", "Mensagem de espera valoriza o atendimento em vez de punir", ""],
  ];

  const existentes = new Set(Object.keys(rowIndex));
  const paraAdicionar = novos.filter(r => !existentes.has(r[0]));

  if (paraAdicionar.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: PLANILHA_ID,
      range: `${SHEET_NAME}!A:H`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: paraAdicionar },
    });
    console.log(`Adicionados ${paraAdicionar.length} novos itens: ${paraAdicionar.map(r => "#" + r[0]).join(", ")}`);
  } else {
    console.log("Itens #84, #85, #86 já existem na planilha");
  }

  console.log("✅ Planilha atualizada com sucesso");
  console.log(`URL: https://docs.google.com/spreadsheets/d/${PLANILHA_ID}`);
}

main().catch(err => {
  console.error("ERRO:", err.message);
  process.exit(1);
});
