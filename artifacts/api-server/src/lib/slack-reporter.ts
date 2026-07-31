/**
 * slack-reporter.ts
 * Monitor de atividade de todos os LLMs para o canal #padaxor-projeto.
 *
 * Produz dois blocos por relatório:
 *   TÉCNICO — métricas, tokens, custos, specs ativas, divergências.
 *   LEIGO   — tradução em linguagem simples para o CEO.
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

export type LlmReport = {
  geradoEm: string;
  periodo: string;         // ex: "últimas 24h"
  stats: LlmProviderStats[];
  specsAtivas: string[];
  divergencias: string[];  // specs planejadas sem nenhuma chamada de IA correspondente
  totalCustoUsd: number;
  totalChamadas: number;
};

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
// Montar relatório
// ---------------------------------------------------------------------------
export async function buildLlmReport(horas = 24): Promise<LlmReport> {
  const [stats, specs] = await Promise.all([
    queryAiUsage(horas),
    listSpecsAtivas(),
  ]);

  const totalCustoUsd = stats.reduce((a, r) => a + r.custoUsd, 0);
  const totalChamadas = stats.reduce((a, r) => a + r.chamadas, 0);
  const divergencias = detectarDivergencias(stats, specs);

  return {
    geradoEm: brtNow().toISOString(),
    periodo:  `últimas ${horas}h`,
    stats,
    specsAtivas:   specs,
    divergencias,
    totalCustoUsd,
    totalChamadas,
  };
}

// ---------------------------------------------------------------------------
// Formatar para Slack (Block Kit)
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

function usd(v: number) {
  return `U$ ${v.toFixed(4)}`;
}

function num(v: number) {
  return v.toLocaleString("pt-BR");
}

export function formatarRelatorioSlack(report: LlmReport): object[] {
  const blocoTecnico: string[] = [
    `*🤖 TÉCNICO — Atividade de IA (${report.periodo})*`,
    `Total de chamadas: *${num(report.totalChamadas)}* | Custo total: *${usd(report.totalCustoUsd)}*`,
    "```",
    "PROVIDER            TIPO               CHAMADAS  IN-TOK   OUT-TOK  CUSTO",
    "---",
  ];

  if (report.stats.length === 0) {
    blocoTecnico.push("(nenhuma chamada registrada no período)");
  } else {
    for (const s of report.stats) {
      const prov = (PROVIDER_LABEL[s.provider] ?? s.provider).padEnd(20);
      const tipo = (TIPO_LABEL[s.tipo] ?? s.tipo).padEnd(18);
      blocoTecnico.push(
        `${prov} ${tipo} ${String(s.chamadas).padStart(6)}  ${num(s.inputTokens).padStart(7)}  ${num(s.outputTokens).padStart(7)}  ${usd(s.custoUsd)}`
      );
    }
  }
  blocoTecnico.push("```");

  if (report.specsAtivas.length > 0) {
    blocoTecnico.push(`*📋 Specs ativas (${report.specsAtivas.length}):*`);
    blocoTecnico.push(report.specsAtivas.map(s => `• ${s}`).join("\n"));
  }

  if (report.divergencias.length > 0) {
    blocoTecnico.push(`*⚠️ Divergências detectadas:*`);
    blocoTecnico.push(report.divergencias.map(d => `• ${d}`).join("\n"));
  } else {
    blocoTecnico.push("✅ Sem divergências entre specs planejadas e chamadas registradas.");
  }

  // Bloco leigo
  const blocoLeigo: string[] = [
    "┌──────────────────────────────────────────┐",
    `│  📖 TRADUÇÃO PARA O CEO — ${report.periodo}  │`,
    "└──────────────────────────────────────────┘",
  ];

  if (report.totalChamadas === 0) {
    blocoLeigo.push("Nenhum LLM foi acionado neste período. O sistema ficou em repouso.");
  } else {
    const provedores = [...new Set(report.stats.map(s => PROVIDER_LABEL[s.provider] ?? s.provider))];
    blocoLeigo.push(
      `No período analisado, ${provedores.join(", ")} foram usados.`,
      `Foram feitas *${num(report.totalChamadas)} chamadas* ao todo.`,
      `O custo total estimado foi de *${usd(report.totalCustoUsd)}*.`,
    );

    if (report.specsAtivas.length > 0) {
      blocoLeigo.push(
        `Há *${report.specsAtivas.length} tarefas planejadas* (specs) no repositório.`
      );
    }

    if (report.divergencias.length > 0) {
      blocoLeigo.push(
        `⚠️ *Atenção:* ${report.divergencias.length} tarefa(s) planejada(s) ainda não geraram chamadas de IA.`,
        "Isso pode indicar trabalho pendente ou spec ainda não executada."
      );
    } else {
      blocoLeigo.push("✅ Tudo que foi planejado está sendo executado — sem lacunas detectadas.");
    }
  }

  // Blocos do Slack (Block Kit)
  const blocks: object[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "🧠 PADAXOR — Relatório de LLMs" },
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `Gerado em: ${report.geradoEm} | Período: ${report.periodo}` }],
    },
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: blocoTecnico.join("\n") },
    },
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: blocoLeigo.join("\n") },
    },
  ];

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
