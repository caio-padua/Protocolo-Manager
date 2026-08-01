/**
 * slack-reporter.ts
 * Monitor de atividade de todos os LLMs + planilha de produção para #padaxor-projeto.
 *
 * Produz por relatório:
 *   TÉCNICO — métricas, tokens, custos, specs ativas, divergências.
 *   LEIGO   — tradução em linguagem simples para o CEO.
 *   GLOSSÁRIO — toda palavra técnica desconhecida recebe (*N) e legenda ao final.
 *   PLANILHA — mudanças detectadas desde a última leitura (horária).
 *
 * Uso:
 *   const report = await buildLlmReport();
 *   await postSlackReport(channelId, report);
 */

import { ReplitConnectors } from "@replit/connectors-sdk";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "./logger";
import { brtNow } from "./brt";
import { anotarTermos, GLOSSARIO } from "./slack-glossario";
import { getGoogleSheetsClient } from "./google-drive";
import { sendTelegram } from "./telegram";

// ---------------------------------------------------------------------------
// Slack client — nunca cachear; tokens expiram
// ---------------------------------------------------------------------------
function getSlackConnectors() {
  return new ReplitConnectors();
}

async function slackPost(path: string, body: Record<string, unknown>) {
  const connectors = getSlackConnectors();
  const resp = await connectors.proxy("slack", path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return resp.json() as Promise<{ ok: boolean; error?: string; channels?: any[]; [k: string]: any }>;
}

export async function slackGet(path: string) {
  const connectors = getSlackConnectors();
  const resp = await connectors.proxy("slack", path, { method: "GET" });
  return resp.json() as Promise<{ ok: boolean; error?: string; channels?: any[]; messages?: any[]; [k: string]: any }>;
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------
const PLANILHA_ID  = process.env.PADAXOR_PLANILHA_ID ?? "1SW6K2JNUEP4i1I16v_ZYhtwxTpUkT_dx3ERHkj9HQcw";
const ESTADO_FILE  = path.resolve("/tmp/padaxor-planilha-estado.json");

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
export type LlmProviderStats = {
  provider: string;        // 'anthropic' | 'gemini' | 'openai'
  tipo: string;            // 'agent' | 'extraction' | 'ocr' | ...
  chamadas: number;
  inputTokens: number;
  outputTokens: number;
  custoUsd: number;
};

export type ItemPlanilha = {
  nro:         string;
  data:        string;   // coluna B — DATA de conclusão/atualização (DD/MM/AAAA)
  hora:        string;   // coluna C — HORA de conclusão/atualização (HH:MM)
  item:        string;
  resp:        string;   // agente responsável (ex: "Dr. Replit")
  estado:      string;
  prio:        string;
  hash?:       string;   // coluna H — Depend.de / sessão de referência
  descricao?:  string;   // coluna I — Em linguagem de leigo
  notas?:      string;   // coluna J
  solicitacao?: string;  // coluna K — handoff inter-LLM
  linhaSheet?: number;   // linha real na planilha (para escrita)
};

export type MudancaPlanilha = {
  tipo:    "novo" | "estado" | "responsavel";
  nro:     string;
  item:    string;
  de?:     string;
  para?:   string;
};

export type UltimoPreenchimento = {
  nro:        string;
  item:       string;
  resp:       string;   // agente que preencheu (ex: "Dr. Replit")
  solicitacao?: string; // handoff recebido de outra LLM, se existir
};

export type LlmReport = {
  geradoEm: string;
  periodo: string;         // ex: "últimas 24h"
  stats: LlmProviderStats[];
  specsAtivas: string[];
  divergencias: string[];
  totalCustoUsd: number;
  totalChamadas: number;
  mudancasPlanilha: MudancaPlanilha[];
  totalItensPlanilha: number;
  itensConcluidos:    ItemPlanilha[];          // todos os itens com estado=CONCLUIDO
  ultimoPreenchimento: UltimoPreenchimento | null; // última linha adicionada
};

// ---------------------------------------------------------------------------
// Leitura e detecção de mudanças na planilha de produção
// ---------------------------------------------------------------------------
async function lerPlanilha(): Promise<ItemPlanilha[]> {
  try {
    const sheets = await getGoogleSheetsClient();
    // Nova estrutura (CEO inseriu DATA e HORA nas colunas B e C em 01/08/2026):
    // A=Nº | B=DATA | C=HORA | D=Item | E=Responsável | F=Estado | G=Prioridade
    // H=Depend.de | I=Em linguagem de leigo | J=Notas | K=Solicitacao
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: PLANILHA_ID,
      range: "A2:K200",
    });
    return (resp.data.values ?? [])
      .filter(r => r[0] && r[3])   // Nº (col A) e Item (col D) obrigatórios
      .map((r, idx) => ({
        linhaSheet:  idx + 2,          // +2: linha 1 é cabeçalho; array 0-based
        nro:         String(r[0] ?? ""),
        data:        String(r[1] ?? ""),
        hora:        String(r[2] ?? ""),
        item:        String(r[3] ?? ""),
        resp:        String(r[4] ?? ""),
        estado:      String(r[5] ?? ""),
        prio:        String(r[6] ?? ""),
        hash:        String(r[7] ?? ""),
        descricao:   String(r[8] ?? ""),
        notas:       String(r[9]  ?? ""),
        solicitacao: String(r[10] ?? ""),
      }));
  } catch (e) {
    logger.warn({ err: e }, "slack-reporter: falha ao ler planilha Google Sheets");
    return [];
  }
}

// ---------------------------------------------------------------------------
// Escreve DATA e HORA automáticos na planilha quando estado muda (BRT)
// ---------------------------------------------------------------------------
async function escreverDataHoraSeVazio(
  linhaSheet: number,
  dataAtual: string,
  dataFormatada: string,
  horaFormatada: string,
): Promise<void> {
  // Só escreve se a célula DATA (coluna B) estiver vazia — não sobrescreve datas existentes
  if (dataAtual.trim()) return;
  try {
    const sheets = await getGoogleSheetsClient();
    await sheets.spreadsheets.values.update({
      spreadsheetId: PLANILHA_ID,
      range:         `B${linhaSheet}:C${linhaSheet}`,
      valueInputOption: "RAW",
      requestBody: { values: [[dataFormatada, horaFormatada]] },
    });
    logger.info({ linhaSheet, dataFormatada, horaFormatada }, "slack-reporter: DATA/HORA gravados na planilha");
  } catch (e) {
    logger.warn({ err: e, linhaSheet }, "slack-reporter: falha ao gravar DATA/HORA");
  }
}

async function carregarEstadoAnterior(): Promise<ItemPlanilha[]> {
  try {
    const raw = await fs.readFile(ESTADO_FILE, "utf-8");
    return JSON.parse(raw) as ItemPlanilha[];
  } catch {
    return [];   // primeira execução
  }
}

async function salvarEstado(items: ItemPlanilha[]): Promise<void> {
  try {
    await fs.writeFile(ESTADO_FILE, JSON.stringify(items), "utf-8");
  } catch (e) {
    logger.warn({ err: e }, "slack-reporter: falha ao salvar estado da planilha");
  }
}

function detectarMudancas(anterior: ItemPlanilha[], atual: ItemPlanilha[]): MudancaPlanilha[] {
  const mapAnterior = new Map(anterior.map(i => [i.nro, i]));
  const mudancas: MudancaPlanilha[] = [];

  for (const item of atual) {
    const ant = mapAnterior.get(item.nro);
    if (!ant) {
      mudancas.push({ tipo: "novo", nro: item.nro, item: item.item, para: item.estado });
    } else {
      if (ant.estado !== item.estado) {
        mudancas.push({ tipo: "estado", nro: item.nro, item: item.item, de: ant.estado, para: item.estado });
      }
      if (ant.resp !== item.resp) {
        mudancas.push({ tipo: "responsavel", nro: item.nro, item: item.item, de: ant.resp, para: item.resp });
      }
    }
  }

  return mudancas;
}

// ---------------------------------------------------------------------------
// Coletar dados
// ---------------------------------------------------------------------------
const SPECS_DIR = path.resolve(process.cwd(), "../../specs");

async function listSpecsAtivas(): Promise<string[]> {
  try {
    const files = await fs.readdir(SPECS_DIR);
    return files
      .filter(f => f.endsWith(".md"))
      .sort()
      .slice(0, 20); // limitar a 20 mais recentes
  } catch {
    return [];
  }
}

async function queryAiUsage(horas = 24): Promise<LlmProviderStats[]> {
  try {
    const rows = await db.execute(sql`
      SELECT
        provider,
        tipo,
        COUNT(*)::int          AS chamadas,
        COALESCE(SUM(input_tokens),0)::int   AS input_tokens,
        COALESCE(SUM(output_tokens),0)::int  AS output_tokens,
        COALESCE(SUM(custo_usd),0)::float    AS custo_usd
      FROM ai_usage_log
      WHERE criado_em >= NOW() - INTERVAL '${sql.raw(String(horas))} hours'
      GROUP BY provider, tipo
      ORDER BY custo_usd DESC
    `);
    return (rows.rows as any[]).map(r => ({
      provider:     r.provider ?? "?",
      tipo:         r.tipo ?? "?",
      chamadas:     Number(r.chamadas),
      inputTokens:  Number(r.input_tokens),
      outputTokens: Number(r.output_tokens),
      custoUsd:     Number(r.custo_usd),
    }));
  } catch (e) {
    logger.warn({ err: e }, "slack-reporter: falha ao consultar ai_usage_log");
    return [];
  }
}

function detectarDivergencias(stats: LlmProviderStats[], specs: string[]): string[] {
  // Specs que indicam um tipo de trabalho mas não apareceram no ledger de IA
  const tiposAtivos = new Set(stats.map(s => s.tipo.toLowerCase()));
  const divergencias: string[] = [];

  for (const spec of specs) {
    const nome = spec.replace(/\.md$/, "").toLowerCase();
    if (nome.includes("agent") && !tiposAtivos.has("agent")) {
      divergencias.push(`Spec "${spec}" menciona agentes, mas não há chamadas do tipo 'agent' no período.`);
    }
    if (nome.includes("ocr") && !tiposAtivos.has("ocr")) {
      divergencias.push(`Spec "${spec}" menciona OCR, mas não há chamadas do tipo 'ocr' no período.`);
    }
    if (nome.includes("extraction") && !tiposAtivos.has("extraction")) {
      divergencias.push(`Spec "${spec}" menciona extração de laudo, mas não há chamadas 'extraction' no período.`);
    }
  }

  return divergencias;
}

// ---------------------------------------------------------------------------
// Montar relatório (com detecção de mudanças na planilha)
// ---------------------------------------------------------------------------
export async function buildLlmReport(horas = 1): Promise<LlmReport> {
  const [stats, specs, itensPlanilhaAtual, estadoAnterior] = await Promise.all([
    queryAiUsage(horas),
    listSpecsAtivas(),
    lerPlanilha(),
    carregarEstadoAnterior(),
  ]);

  const totalCustoUsd = stats.reduce((a, r) => a + r.custoUsd, 0);
  const totalChamadas = stats.reduce((a, r) => a + r.chamadas, 0);
  const divergencias  = detectarDivergencias(stats, specs);
  const mudancasPlanilha = detectarMudancas(estadoAnterior, itensPlanilhaAtual);

  // Persistir estado atual para a próxima comparação
  if (itensPlanilhaAtual.length > 0) {
    await salvarEstado(itensPlanilhaAtual);
  }

  // ── AUTO-PREENCHER DATA/HORA quando estado muda (best-effort, não bloqueia) ──
  // Para cada item cujo estado mudou, grava a DATA e HORA BRT nas colunas B e C
  // da planilha — se ainda estiverem vazias (não sobrescreve datas já registradas).
  const agora       = brtNow();
  const dataFmt     = agora.toLocaleDateString("pt-BR");           // "DD/MM/AAAA"
  const horaFmt     = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); // "HH:MM"
  const nrosMudados = new Set(mudancasPlanilha.filter(m => m.tipo === "estado" || m.tipo === "novo").map(m => m.nro));

  for (const item of itensPlanilhaAtual) {
    if (nrosMudados.has(item.nro) && item.linhaSheet) {
      // Fire-and-forget: gravar DATA/HORA sem bloquear o relatório
      void escreverDataHoraSeVazio(item.linhaSheet, item.data, dataFmt, horaFmt);
    }
  }

  // Itens com estado CONCLUIDO — para o bloco emoldurado do Slack
  const itensConcluidos = itensPlanilhaAtual.filter(i => i.estado.toUpperCase() === "CONCLUIDO");

  // Último preenchimento: item com maior nro numérico (foi adicionado mais recentemente)
  const ultimoPreenchimento: UltimoPreenchimento | null = (() => {
    const comNro = itensPlanilhaAtual.filter(i => !isNaN(Number(i.nro)));
    if (comNro.length === 0) return null;
    const ultimo = comNro.reduce((max, cur) =>
      Number(cur.nro) > Number(max.nro) ? cur : max
    );
    return {
      nro:         ultimo.nro,
      item:        ultimo.item,
      resp:        ultimo.resp || "Dr. Replit",
      solicitacao: ultimo.solicitacao || undefined,
    };
  })();

  return {
    geradoEm: brtNow().toISOString(),
    periodo:  `última ${horas}h`,
    stats,
    specsAtivas:        specs,
    divergencias,
    totalCustoUsd,
    totalChamadas,
    mudancasPlanilha,
    totalItensPlanilha: itensPlanilhaAtual.length,
    itensConcluidos,
    ultimoPreenchimento,
  };
}

// ---------------------------------------------------------------------------
// Formatar para Slack (Block Kit) com glossário (*N) e mudanças da planilha
// ---------------------------------------------------------------------------
const PROVIDER_LABEL: Record<string, string> = {
  anthropic: "Anthropic (Claude)",
  gemini:    "Google (Gemini)",
  openai:    "OpenAI (GPT)",
};

const TIPO_LABEL: Record<string, string> = {
  agent:      "Agente de Chat",
  extraction: "Extração de Laudo",
  ocr:        "OCR Clínico",
  chat:       "Chat",
};

const ESTADO_EMOJI: Record<string, string> = {
  CONCLUIDO: "✅",
  "A FAZER":  "⬜",
  AGUARDANDO: "⏳",
  PARCIAL:    "🔶",
};

function usd(v: number) { return `U$ ${v.toFixed(4)}`; }
function num(v: number)  { return v.toLocaleString("pt-BR"); }

// ---------------------------------------------------------------------------
// Helper: word-wrap de texto em coluna de largura fixa (sem cortar palavras)
// ---------------------------------------------------------------------------
function wrapCol(text: string, width: number): string[] {
  const str = String(text ?? "").trim();
  if (str.length === 0) return [" ".repeat(width)];
  if (str.length <= width) return [str.padEnd(width)];

  const lines: string[] = [];
  let remaining = str;
  while (remaining.length > 0) {
    if (remaining.length <= width) {
      lines.push(remaining.padEnd(width));
      break;
    }
    // quebra na última palavra que cabe
    let cut = width;
    const spaceIdx = remaining.lastIndexOf(" ", width - 1);
    if (spaceIdx > Math.floor(width / 3)) cut = spaceIdx;
    lines.push(remaining.slice(0, cut).padEnd(width));
    remaining = remaining.slice(cut).trimStart();
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Helper: tabela monospace de CONCLUÍDOS para Slack (com quebra de linha real)
// ---------------------------------------------------------------------------
function montarTabelaConcluidos(items: ItemPlanilha[]): string {
  if (items.length === 0) return "";

  // Larguras fixas das colunas (chars)
  const W_NRO  = 4;
  const W_DATA = 10;  // "DD/MM/AAAA"
  const W_HORA = 5;   // "HH:MM"
  const W_ITEM = 30;
  const W_RESP = 14;
  const W_SOL  = 22;

  const sep = (w: number) => "═".repeat(w + 2);
  const barTop = `╔${sep(W_NRO)}╤${sep(W_DATA)}╤${sep(W_HORA)}╤${sep(W_ITEM)}╤${sep(W_RESP)}╤${sep(W_SOL)}╗`;
  const barSep = `╠${sep(W_NRO)}╪${sep(W_DATA)}╪${sep(W_HORA)}╪${sep(W_ITEM)}╪${sep(W_RESP)}╪${sep(W_SOL)}╣`;
  const barBot = `╚${sep(W_NRO)}╧${sep(W_DATA)}╧${sep(W_HORA)}╧${sep(W_ITEM)}╧${sep(W_RESP)}╧${sep(W_SOL)}╝`;
  const blank  = (w: number) => " ".repeat(w);

  function montarLinhaMulti(
    nro: string, data: string, hora: string, item: string, resp: string, sol: string,
  ): string[] {
    const nroL  = wrapCol(nro,  W_NRO);
    const dataL = wrapCol(data, W_DATA);
    const horaL = wrapCol(hora, W_HORA);
    const itemL = wrapCol(item, W_ITEM);
    const respL = wrapCol(resp, W_RESP);
    const solL  = wrapCol(sol,  W_SOL);
    const h = Math.max(nroL.length, dataL.length, horaL.length, itemL.length, respL.length, solL.length);
    const out: string[] = [];
    for (let i = 0; i < h; i++) {
      out.push(
        `║ ${nroL[i]  ?? blank(W_NRO)}  │` +
        ` ${dataL[i] ?? blank(W_DATA)} │` +
        ` ${horaL[i] ?? blank(W_HORA)} │` +
        ` ${itemL[i] ?? blank(W_ITEM)} │` +
        ` ${respL[i] ?? blank(W_RESP)} │` +
        ` ${solL[i]  ?? blank(W_SOL)} ║`
      );
    }
    return out;
  }

  // Últimos 10 itens (maior nro = mais recente)
  const MAX_ROWS = 10;
  const itensSorted = [...items].sort((a, b) => Number(b.nro) - Number(a.nro)).slice(0, MAX_ROWS).reverse();
  const omitidos    = items.length - itensSorted.length;

  const rows: string[] = [
    barTop,
    ...montarLinhaMulti("Nº", "Data", "Hora", "Item", "Agente", "Pedido / Handoff"),
    barSep,
  ];

  for (const it of itensSorted) {
    const sol  = it.solicitacao?.trim() || "—";
    const data = it.data?.trim() || "—";
    const hora = it.hora?.trim() || "—";
    rows.push(...montarLinhaMulti(it.nro, data, hora, it.item, it.resp || "Dr. Replit", sol));
  }
  rows.push(barBot);

  let tabela = "```\n" + rows.join("\n") + "\n```";
  if (omitidos > 0) {
    tabela += `\n_... e mais ${omitidos} item(ns) anteriores — ver planilha completa._`;
  }
  return tabela;
}

// ---------------------------------------------------------------------------
// Helper: bloco de handoffs inter-LLM (itens com solicitacao preenchida)
// ---------------------------------------------------------------------------
function montarHandoffs(items: ItemPlanilha[]): string {
  const comHandoff = items.filter(i => i.solicitacao?.trim());
  if (comHandoff.length === 0) return "";

  const linhas = ["*🔄 Handoffs entre agentes:*"];
  for (const it of comHandoff) {
    linhas.push(`• *#${it.nro}* "${it.item}" ← _${it.solicitacao!.trim()}_`);
  }
  return linhas.join("\n");
}

export function formatarRelatorioSlack(report: LlmReport): object[] {
  // ── 1. Bloco de mudanças da planilha ──────────────────────────────────
  const temMudancas = report.mudancasPlanilha.length > 0;
  const linhaMudancas: string[] = [];

  if (temMudancas) {
    linhaMudancas.push(`*📋 Planilha de Produção — ${report.mudancasPlanilha.length} mudança(s) detectada(s):*`);
    for (const m of report.mudancasPlanilha) {
      const emoji = m.tipo === "novo" ? "🆕" : m.tipo === "estado" ? "🔄" : "👤";
      if (m.tipo === "novo") {
        linhaMudancas.push(`${emoji} Item *#${m.nro}* adicionado: "${m.item}" → ${ESTADO_EMOJI[m.para ?? ""] ?? ""} ${m.para}`);
      } else if (m.tipo === "estado") {
        linhaMudancas.push(`${emoji} Item *#${m.nro}* "${m.item}": ${m.de} → ${ESTADO_EMOJI[m.para ?? ""] ?? ""} *${m.para}*`);
      } else {
        linhaMudancas.push(`${emoji} Item *#${m.nro}* "${m.item}": responsável ${m.de} → *${m.para}*`);
      }
    }
  } else {
    linhaMudancas.push(`*📋 Planilha:* ${report.totalItensPlanilha} itens — nenhuma mudança desde a última hora.`);
  }

  // ── 2. Bloco técnico de IA ────────────────────────────────────────────
  const blocoTecnicoRaw: string[] = [
    `*🤖 TÉCNICO — IA (${report.periodo})*`,
    `Chamadas: *${num(report.totalChamadas)}* | Custo: *${usd(report.totalCustoUsd)}*`,
  ];

  if (report.stats.length === 0) {
    blocoTecnicoRaw.push("_(nenhuma chamada de IA neste período)_");
  } else {
    blocoTecnicoRaw.push("```");
    blocoTecnicoRaw.push("PROVIDER            TIPO               CHAM  IN-TOK  OUT-TOK  CUSTO");
    blocoTecnicoRaw.push("---");
    for (const s of report.stats) {
      const prov = (PROVIDER_LABEL[s.provider] ?? s.provider).padEnd(20);
      const tipo = (TIPO_LABEL[s.tipo]         ?? s.tipo).padEnd(18);
      blocoTecnicoRaw.push(
        `${prov} ${tipo} ${String(s.chamadas).padStart(4)}  ${num(s.inputTokens).padStart(6)}  ${num(s.outputTokens).padStart(7)}  ${usd(s.custoUsd)}`
      );
    }
    blocoTecnicoRaw.push("```");
  }

  if (report.divergencias.length > 0) {
    blocoTecnicoRaw.push(`*⚠️ Divergências:*`);
    blocoTecnicoRaw.push(report.divergencias.map(d => `• ${d}`).join("\n"));
  }

  // ── 3. Bloco leigo (com glossário aplicado) ───────────────────────────
  let textoLeigo = "";

  if (report.totalChamadas === 0 && !temMudancas) {
    textoLeigo = "O sistema ficou em repouso nesta hora. Nenhuma IA foi acionada e nada mudou na planilha.";
  } else {
    const partes: string[] = [];

    if (report.totalChamadas > 0) {
      const provedores = [...new Set(report.stats.map(s => PROVIDER_LABEL[s.provider] ?? s.provider))];
      partes.push(`Nesta hora, ${provedores.join(" e ")} foram acionados ${num(report.totalChamadas)} vez(es), com custo estimado de ${usd(report.totalCustoUsd)}.`);
    }

    if (temMudancas) {
      const concluidos = report.mudancasPlanilha.filter(m => m.para === "CONCLUIDO").length;
      const novos      = report.mudancasPlanilha.filter(m => m.tipo === "novo").length;
      if (concluidos > 0) partes.push(`${concluidos} tarefa(s) marcada(s) como CONCLUIDO na planilha de produção.`);
      if (novos      > 0) partes.push(`${novos} item(ns) novo(s) adicionado(s) à planilha.`);
    }

    if (report.divergencias.length > 0) {
      partes.push(`⚠️ ${report.divergencias.length} tarefa(s) planejada(s) ainda sem chamadas de IA correspondentes — pode ser trabalho pendente.`);
    } else if (report.totalChamadas > 0) {
      partes.push("Tudo que foi planejado está sendo executado.");
    }

    textoLeigo = partes.join(" ");
  }

  // Aplicar glossário: marca termos técnicos com (*N) e gera legendas
  const { textoAnotado, legendas } = anotarTermos(textoLeigo);

  // ── 4. Montar blocos Slack (Block Kit) ────────────────────────────────
  const geradoEmFormatado = new Date(report.geradoEm)
    .toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour12: false });

  // ── Linha de "quem preencheu" para o cabeçalho ────────────────────────
  const ultimoTexto = report.ultimoPreenchimento
    ? `✍️ Última entrada: *#${report.ultimoPreenchimento.nro}* "${report.ultimoPreenchimento.item}" · _${report.ultimoPreenchimento.resp}_`
    : null;

  const blocks: object[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "🧠 PADAXOR — Monitor Horário" },
    },
    {
      type: "context",
      elements: [{
        type: "mrkdwn",
        text: [`📅 ${geradoEmFormatado} (BRT) | ${report.periodo}`, ultimoTexto]
          .filter(Boolean).join("   ·   "),
      }],
    },
    { type: "divider" },
  ];

  // ── Tabela emoldurada de CONCLUÍDOS (destaque visual) ─────────────────
  const tabelaConcluidos = montarTabelaConcluidos(report.itensConcluidos);
  if (tabelaConcluidos) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*✅ CONCLUÍDOS — Planilha de Produção (${report.itensConcluidos.length} itens)*\n${tabelaConcluidos}`,
      },
    });
    blocks.push({ type: "divider" });
  }

  // ── Handoffs inter-LLM ────────────────────────────────────────────────
  const handoffTexto = montarHandoffs(report.itensConcluidos);
  if (handoffTexto) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: handoffTexto },
    });
    blocks.push({ type: "divider" });
  }

  // ── Mudanças da planilha (novos/alterados nesta leitura) ─────────────
  if (temMudancas || report.totalItensPlanilha > 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: linhaMudancas.join("\n") },
    });
    blocks.push({ type: "divider" });
  }

  // Bloco técnico de IA (só se houver atividade)
  if (report.totalChamadas > 0 || report.divergencias.length > 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: blocoTecnicoRaw.join("\n") },
    });
    blocks.push({ type: "divider" });
  }

  // Bloco leigo + legendas do glossário
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: [
        "┌─────────────────────────────────────┐",
        "│  📖 TRADUÇÃO PARA O CEO              │",
        "└─────────────────────────────────────┘",
        textoAnotado,
      ].join("\n"),
    },
  });

  // Legendas do glossário (se houver termos marcados)
  if (legendas.length > 0) {
    blocks.push({
      type: "context",
      elements: [{
        type: "mrkdwn",
        text: "*📚 Glossário desta mensagem:*\n" + legendas.join("\n"),
      }],
    });
  }

  // ── Link direto para a planilha de produção (sempre presente) ────────
  blocks.push({ type: "divider" });
  blocks.push({
    type: "context",
    elements: [{
      type: "mrkdwn",
      text: `📊 *Planilha de Produção (ao vivo):* <https://docs.google.com/spreadsheets/d/${PLANILHA_ID}|Abrir no Google Sheets ↗>   ·   _${report.totalItensPlanilha} itens · ${report.itensConcluidos.length} concluídos_`,
    }],
  });

  return blocks;
}

// ---------------------------------------------------------------------------
// Listar canais do Slack
// ---------------------------------------------------------------------------
export async function listarCanaisSlack(): Promise<{ id: string; name: string }[]> {
  const data = await slackGet(
    "/conversations.list?types=public_channel,private_channel&limit=200"
  );
  if (!data.ok) {
    throw new Error(`Slack API erro: ${data.error ?? "desconhecido"}`);
  }
  return (data.channels ?? []).map((c: any) => ({ id: c.id, name: c.name }));
}

// ---------------------------------------------------------------------------
// Postar no Slack
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Persistência de histórico (tabela llm_reports_history)
// ---------------------------------------------------------------------------
export async function salvarHistorico(
  report: LlmReport,
  canal: "slack" | "telegram" | "ambos",
  enviado_ok: boolean,
  erro?: string,
): Promise<void> {
  try {
    const brtStr = new Date(report.geradoEm)
      .toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour12: false });

    await db.execute(sql`
      INSERT INTO llm_reports_history
        (gerado_em_brt, periodo_horas, total_chamadas, total_custo_usd,
         mudancas_planilha, stats_json, divergencias, canal, enviado_ok, erro)
      VALUES (
        ${brtStr},
        ${report.stats.length > 0 ? 1 : 1},
        ${report.totalChamadas},
        ${report.totalCustoUsd},
        ${report.mudancasPlanilha.length},
        ${JSON.stringify(report.stats)}::jsonb,
        ${JSON.stringify(report.divergencias)}::jsonb,
        ${canal},
        ${enviado_ok},
        ${erro ?? null}
      )
    `);
    logger.info({ canal, enviado_ok }, "slack-reporter: histórico salvo");
  } catch (e) {
    // falha no histórico nunca derruba o envio
    logger.warn({ err: (e as Error).message }, "slack-reporter: falha ao salvar histórico (non-fatal)");
  }
}

// ---------------------------------------------------------------------------
// Consulta de histórico para a rota GET /historico
// ---------------------------------------------------------------------------
export async function consultarHistorico(dias = 7): Promise<{
  registros: object[];
  totalChamadas: number;
  totalCustoUsd: number;
  porProvedor: Record<string, { chamadas: number; custoUsd: number }>;
}> {
  const rows = await db.execute(sql`
    SELECT id, gerado_em, gerado_em_brt, periodo_horas,
           total_chamadas, total_custo_usd, mudancas_planilha,
           stats_json, canal, enviado_ok, erro
    FROM llm_reports_history
    WHERE gerado_em >= NOW() - (${dias} || ' days')::interval
    ORDER BY gerado_em DESC
    LIMIT 500
  `);

  const registros = rows.rows as any[];

  const totalChamadas  = registros.reduce((a, r) => a + Number(r.total_chamadas), 0);
  const totalCustoUsd  = registros.reduce((a, r) => a + Number(r.total_custo_usd), 0);

  // Agregação por provedor de IA
  const porProvedor: Record<string, { chamadas: number; custoUsd: number }> = {};
  for (const r of registros) {
    const stats: LlmProviderStats[] = r.stats_json ?? [];
    for (const s of stats) {
      if (!porProvedor[s.provider]) porProvedor[s.provider] = { chamadas: 0, custoUsd: 0 };
      porProvedor[s.provider].chamadas  += s.chamadas;
      porProvedor[s.provider].custoUsd  += s.custoUsd;
    }
  }

  return { registros, totalChamadas, totalCustoUsd, porProvedor };
}

// ---------------------------------------------------------------------------
// Postar no Slack + gravar histórico
// ---------------------------------------------------------------------------
export async function postSlackReport(channelId: string, report: LlmReport): Promise<void> {
  const blocks = formatarRelatorioSlack(report);
  const fallback = `PADAXOR LLMs — ${report.periodo}: ${report.totalChamadas} chamadas, ${usd(report.totalCustoUsd)}`;

  let erro: string | undefined;
  let ok = false;

  try {
    const data = await slackPost("/chat.postMessage", {
      channel: channelId,
      text:    fallback,
      blocks,
    });
    if (!data.ok) throw new Error(`Slack postMessage erro: ${data.error ?? "desconhecido"}`);
    ok = true;
    logger.info({ channel: channelId }, "slack-reporter: relatório postado com sucesso");
  } catch (e) {
    erro = (e as Error).message;
    throw e;   // propaga para o chamador (cron loga, mas não derruba o worker)
  } finally {
    // Grava histórico independente de sucesso ou falha
    await salvarHistorico(report, "slack", ok, erro);
  }
}

// ---------------------------------------------------------------------------
// Formatar para Telegram (HTML condensado) — canal independente do Slack
// ---------------------------------------------------------------------------

/** Escapa caracteres especiais HTML exigidos pelo Telegram em parse_mode=HTML. */
function escHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Anota termos do glossário no texto e retorna legendas em formato HTML
 * (compatível com Telegram parse_mode=HTML).
 * Reutiliza o array GLOSSARIO importado do slack-glossario para garantir
 * números permanentes idênticos ao Slack.
 */
function anotarTermosHtml(texto: string): { textoAnotado: string; legendasHtml: string[] } {
  // Índice permanente de cada termo (posição 1-based no array, nunca muda)
  const numeroPermanente = new Map<string, number>(
    GLOSSARIO.map((entry, i) => [entry.termo.toLowerCase(), i + 1])
  );

  let textoAnotado = texto;
  const encontrados: Array<{ numero: number; termo: string; leigo: string }> = [];
  const jaProcessado = new Set<string>();

  // Varredura do mais longo para o mais curto (evita marcar "cron" antes de "cron job")
  const sorted = [...GLOSSARIO].sort((a, b) => b.termo.length - a.termo.length);

  for (const entry of sorted) {
    const chave = entry.termo.toLowerCase();
    if (jaProcessado.has(chave)) continue;

    const escapado = entry.termo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const testeRegex = new RegExp(`\\b(${escapado})\\b`, "gi");
    if (!testeRegex.test(textoAnotado)) continue;

    const numero = numeroPermanente.get(chave)!;
    jaProcessado.add(chave);
    encontrados.push({ numero, termo: entry.termo, leigo: entry.leigo });

    let primeiraVez = true;
    textoAnotado = textoAnotado.replace(
      new RegExp(`\\b(${escapado})\\b`, "gi"),
      (match) => {
        if (primeiraVez) { primeiraVez = false; return `${match} (*${numero})`; }
        return match;
      },
    );
  }

  encontrados.sort((a, b) => a.numero - b.numero);
  const legendasHtml = encontrados.map(
    ({ numero, termo, leigo }) => `<b>(*${numero}) ${escHtml(termo)}</b> = ${escHtml(leigo)}`
  );

  return { textoAnotado, legendasHtml };
}

/**
 * Formata o relatório como mensagem HTML para Telegram.
 * Produz texto condensado (respeita o limite de 4 096 caracteres do Telegram).
 */
export function formatarRelatorioTelegram(report: LlmReport): string {
  const geradoEmFormatado = new Date(report.geradoEm)
    .toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour12: false });

  const linhas: string[] = [];

  // ── Cabeçalho ───────────────────────────────────────────────────────────
  linhas.push(`<b>🧠 PADAXOR — Monitor Horário</b>`);
  linhas.push(`📅 ${geradoEmFormatado} (BRT) | ${report.periodo}`);
  linhas.push("");

  // ── Planilha de produção ─────────────────────────────────────────────────
  const temMudancas = report.mudancasPlanilha.length > 0;
  if (temMudancas) {
    linhas.push(`<b>📋 Planilha — ${report.mudancasPlanilha.length} mudança(s):</b>`);
    for (const m of report.mudancasPlanilha) {
      const emoji = m.tipo === "novo" ? "🆕" : m.tipo === "estado" ? "🔄" : "👤";
      if (m.tipo === "novo") {
        linhas.push(`${emoji} #${m.nro} adicionado: "${escHtml(m.item)}" → ${escHtml(m.para ?? "")}`);
      } else if (m.tipo === "estado") {
        linhas.push(`${emoji} #${m.nro} "${escHtml(m.item)}": ${escHtml(m.de ?? "")} → <b>${escHtml(m.para ?? "")}</b>`);
      } else {
        linhas.push(`${emoji} #${m.nro} "${escHtml(m.item)}": resp ${escHtml(m.de ?? "")} → <b>${escHtml(m.para ?? "")}</b>`);
      }
    }
  } else {
    linhas.push(`📋 <b>Planilha:</b> ${report.totalItensPlanilha} itens — sem mudanças.`);
  }
  linhas.push("");

  // ── IA: chamadas e custo ────────────────────────────────────────────────
  if (report.totalChamadas > 0) {
    linhas.push(`<b>🤖 IA (${report.periodo})</b>`);
    linhas.push(`Chamadas: <b>${num(report.totalChamadas)}</b> | Custo: <b>${usd(report.totalCustoUsd)}</b>`);
    linhas.push("<pre>");
    linhas.push("PROVIDER        TIPO            CHAM   CUSTO");
    linhas.push("─────────────────────────────────────────");
    for (const s of report.stats) {
      const prov = (PROVIDER_LABEL[s.provider] ?? s.provider).slice(0, 14).padEnd(14);
      const tipo = (TIPO_LABEL[s.tipo]         ?? s.tipo).slice(0, 14).padEnd(14);
      linhas.push(
        `${prov} ${tipo} ${String(s.chamadas).padStart(4)}  ${usd(s.custoUsd)}`
      );
    }
    linhas.push("</pre>");
  } else {
    linhas.push(`🤖 <b>IA:</b> nenhuma chamada neste período.`);
  }

  // ── Divergências ────────────────────────────────────────────────────────
  if (report.divergencias.length > 0) {
    linhas.push("");
    linhas.push(`<b>⚠️ Divergências (${report.divergencias.length}):</b>`);
    for (const d of report.divergencias) {
      linhas.push(`• ${escHtml(d)}`);
    }
  }
  linhas.push("");

  // ── Tradução leigo (com glossário HTML) ─────────────────────────────────
  let textoLeigo = "";
  if (report.totalChamadas === 0 && !temMudancas) {
    textoLeigo = "O sistema ficou em repouso nesta hora. Nenhuma IA foi acionada e nada mudou na planilha.";
  } else {
    const partes: string[] = [];
    if (report.totalChamadas > 0) {
      const provedores = [...new Set(report.stats.map(s => PROVIDER_LABEL[s.provider] ?? s.provider))];
      partes.push(`Nesta hora, ${provedores.join(" e ")} foram acionados ${num(report.totalChamadas)} vez(es), com custo estimado de ${usd(report.totalCustoUsd)}.`);
    }
    if (temMudancas) {
      const concluidos = report.mudancasPlanilha.filter(m => m.para === "CONCLUIDO").length;
      const novos      = report.mudancasPlanilha.filter(m => m.tipo === "novo").length;
      if (concluidos > 0) partes.push(`${concluidos} tarefa(s) marcada(s) como CONCLUIDO na planilha de produção.`);
      if (novos      > 0) partes.push(`${novos} item(ns) novo(s) adicionado(s) à planilha.`);
    }
    if (report.divergencias.length > 0) {
      partes.push(`⚠️ ${report.divergencias.length} tarefa(s) planejada(s) ainda sem chamadas de IA correspondentes.`);
    } else if (report.totalChamadas > 0) {
      partes.push("Tudo que foi planejado está sendo executado.");
    }
    textoLeigo = partes.join(" ");
  }

  const { textoAnotado, legendasHtml } = anotarTermosHtml(textoLeigo);

  linhas.push(`<b>📖 TRADUÇÃO PARA O CEO</b>`);
  linhas.push(escHtml(textoAnotado));

  // ── Glossário HTML ───────────────────────────────────────────────────────
  if (legendasHtml.length > 0) {
    linhas.push("");
    linhas.push(`<b>📚 Glossário:</b>`);
    for (const leg of legendasHtml) {
      linhas.push(leg);
    }
  }

  // Telegram limita 4 096 chars — truncar com aviso se necessário
  const texto = linhas.join("\n");
  if (texto.length > 4000) {
    return texto.slice(0, 3950) + "\n\n<i>... [truncado — relatório excedeu 4 096 chars]</i>";
  }
  return texto;
}

// ---------------------------------------------------------------------------
// Postar no Telegram — fail-safe independente do Slack
// Retry automático: até 3 tentativas (1 inicial + 2 retries) com backoff de 1s e 2s.
// Se todas falharem, posta aviso de fallback no Slack e loga telegramFailed: true.
// ---------------------------------------------------------------------------
const TELEGRAM_MAX_TENTATIVAS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function postTelegramReport(
  chatId: string,
  report: LlmReport,
  fallbackSlackChannelId?: string,
): Promise<void> {
  const texto = formatarRelatorioTelegram(report);
  let ultimoErro: string | undefined;
  let telegramOk = false;

  try {
    for (let tentativa = 1; tentativa <= TELEGRAM_MAX_TENTATIVAS; tentativa++) {
      // Backoff antes das retentativas (1s na 2ª, 2s na 3ª)
      if (tentativa > 1) {
        await sleep((tentativa - 1) * 1000);
        logger.info(
          { chatId, tentativa, totalTentativas: TELEGRAM_MAX_TENTATIVAS },
          "slack-reporter: Telegram retry",
        );
      }

      const resultado = await sendTelegram(chatId, texto);

      if (resultado.mock) {
        logger.info({ chatId }, "slack-reporter: Telegram MOCK (sem token no cofre)");
        telegramOk = true;
        return; // finally roda antes de retornar
      }

      if (resultado.sent) {
        logger.info(
          { chatId, tentativa },
          "slack-reporter: relatório postado no Telegram com sucesso",
        );
        telegramOk = true;
        return; // finally roda antes de retornar
      }

      ultimoErro = resultado.error ?? "desconhecido";
      logger.warn(
        { chatId, tentativa, totalTentativas: TELEGRAM_MAX_TENTATIVAS, erro: ultimoErro },
        `slack-reporter: Telegram falhou (tentativa ${tentativa}/${TELEGRAM_MAX_TENTATIVAS})`,
      );
    }

    // Todas as tentativas falharam — log estruturado + fallback no Slack
    logger.error(
      { chatId, telegramFailed: true, erro: ultimoErro, tentativas: TELEGRAM_MAX_TENTATIVAS },
      "slack-reporter: Telegram offline após todas as tentativas — ativando fallback Slack",
    );

    if (fallbackSlackChannelId) {
      try {
        await slackPost("/chat.postMessage", {
          channel: fallbackSlackChannelId,
          text: [
            `⚠️ *PADAXOR — Telegram offline*`,
            `O relatório horário de LLMs *não pôde ser entregue* ao Telegram após ${TELEGRAM_MAX_TENTATIVAS} tentativas.`,
            `Erro: \`${ultimoErro}\``,
            `Chat ID: \`${chatId}\``,
            `_(O relatório do Slack foi enviado normalmente.)_`,
          ].join("\n"),
        });
        logger.info(
          { fallbackSlackChannelId, telegramFailed: true },
          "slack-reporter: aviso de falha Telegram postado no Slack com sucesso",
        );
      } catch (slackErr) {
        logger.error(
          { err: (slackErr as Error).message, telegramFailed: true },
          "slack-reporter: dupla falha — Telegram offline E aviso no Slack também falhou",
        );
      }
    }

    // Lança para que o chamador saiba que o Telegram falhou
    throw new Error(
      `Telegram sendMessage falhou após ${TELEGRAM_MAX_TENTATIVAS} tentativas: ${ultimoErro}`,
    );
  } finally {
    // Grava histórico independente de sucesso ou falha (espelha postSlackReport)
    await salvarHistorico(report, "telegram", telegramOk, ultimoErro);
  }
}
