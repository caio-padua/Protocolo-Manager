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
import { anotarTermos } from "./slack-glossario";
import { getGoogleSheetsClient } from "./google-drive";

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

async function slackGet(path: string) {
  const connectors = getSlackConnectors();
  const resp = await connectors.proxy("slack", path, { method: "GET" });
  return resp.json() as Promise<{ ok: boolean; error?: string; channels?: any[]; [k: string]: any }>;
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
  nro:    string;
  item:   string;
  resp:   string;
  estado: string;
  prio:   string;
};

export type MudancaPlanilha = {
  tipo:    "novo" | "estado" | "responsavel";
  nro:     string;
  item:    string;
  de?:     string;
  para?:   string;
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
};

// ---------------------------------------------------------------------------
// Leitura e detecção de mudanças na planilha de produção
// ---------------------------------------------------------------------------
async function lerPlanilha(): Promise<ItemPlanilha[]> {
  try {
    const sheets = await getGoogleSheetsClient();
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: PLANILHA_ID,
      range: "A2:E200",   // Nº | Item | Responsavel | Estado | Prioridade
    });
    return (resp.data.values ?? [])
      .filter(r => r[0] && r[1])
      .map(r => ({
        nro:    String(r[0] ?? ""),
        item:   String(r[1] ?? ""),
        resp:   String(r[2] ?? ""),
        estado: String(r[3] ?? ""),
        prio:   String(r[4] ?? ""),
      }));
  } catch (e) {
    logger.warn({ err: e }, "slack-reporter: falha ao ler planilha Google Sheets");
    return [];
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

  const blocks: object[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "🧠 PADAXOR — Monitor Horário" },
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `📅 ${geradoEmFormatado} (BRT) | ${report.periodo}` }],
    },
    { type: "divider" },
  ];

  // Mudanças da planilha
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
export async function postSlackReport(channelId: string, report: LlmReport): Promise<void> {
  const blocks = formatarRelatorioSlack(report);
  const fallback = `PADAXOR LLMs — ${report.periodo}: ${report.totalChamadas} chamadas, ${usd(report.totalCustoUsd)}`;

  const data = await slackPost("/chat.postMessage", {
    channel: channelId,
    text:    fallback,
    blocks,
  });

  if (!data.ok) {
    throw new Error(`Slack postMessage erro: ${data.error ?? "desconhecido"}`);
  }

  logger.info({ channel: channelId }, "slack-reporter: relatório postado com sucesso");
}
