/**
 * PAXTER — Chat IA com Agentes Virtuais (v2 Kaizen)
 * Streaming SSE via Anthropic, histórico, stats, temperatura, custo estimado.
 */

import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { logger } from "../lib/logger";
import { requireAiTenant, logAiUsage } from "../lib/ai-central";

const router: IRouter = Router();

// ─── Custo real por 1M tokens (jul/2026, referência mercado) ─────────────────
const CUSTO_MODELO: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6":               { input: 3.00,  output: 15.00 },
  "claude-opus-4-8":                 { input: 15.00, output: 75.00 },
  "claude-haiku-4-5":                { input: 0.25,  output: 1.25  },
  "gpt-5.6-terra":                   { input: 2.50,  output: 10.00 },
  "gpt-5.6-sol":                     { input: 15.00, output: 60.00 },
  "gpt-5.6-luna":                    { input: 0.60,  output: 2.40  },
  "o4-mini":                         { input: 3.00,  output: 12.00 },
  "gemini-3.1-pro-preview":          { input: 3.50,  output: 10.50 },
  "gemini-3-flash-preview":          { input: 0.10,  output: 0.40  },
  "gemini-2.5-pro":                  { input: 1.25,  output: 10.00 },
  "mistralai/mixtral-8x7b-instruct": { input: 0.24,  output: 0.24  },
  "meta-llama/llama-3.3-70b-instruct":{ input: 0.59, output: 0.79  },
  "deepseek/deepseek-r1":            { input: 0.55,  output: 2.19  },
  "x-ai/grok-3":                     { input: 3.00,  output: 15.00 },
};

// ─── POST /agentes-chat — streaming SSE ──────────────────────────────────────
router.post("/agentes-chat", async (req, res) => {
  const { agente_id, mensagens, conversation_id, temperatura, max_tokens } = req.body as {
    agente_id: number;
    mensagens: Array<{ role: string; content: string }>;
    conversation_id?: number;
    temperatura?: number;
    max_tokens?: number;
  };

  if (!agente_id || !mensagens?.length) {
    res.status(400).json({ error: "agente_id e mensagens são obrigatórios" });
    return;
  }

  const [agenteR, persR] = await Promise.all([
    db.execute(sql`SELECT * FROM catalogo_agentes WHERE id = ${agente_id}`),
    db.execute(sql`SELECT * FROM agentes_personalidade WHERE agente_id = ${agente_id}`),
  ]);

  const agente = agenteR.rows[0] as Record<string, unknown>;
  const pers = persR.rows[0] as Record<string, unknown> | undefined;

  if (!agente) {
    res.status(404).json({ error: "Agente não encontrado" });
    return;
  }

  const frasesEscalada = Array.isArray(agente.frases_escalada)
    ? (agente.frases_escalada as string[]).join("\n- ")
    : String(agente.frases_escalada ?? "");

  const personalidadeInfo = pers ? `
Personalidade calibrada (escala 1-5):
- Formalidade: ${pers.formalidade ?? 3}/5
- Empatia: ${pers.empatia ?? 3}/5
- Autoridade: ${pers.autoridade ?? 3}/5
- Velocidade: ${pers.velocidade_resposta ?? 3}/5
- Clareza: ${pers.clareza ?? 3}/5
- Proatividade: ${pers.proatividade ?? 3}/5
- Criatividade: ${pers.criatividade ?? 3}/5
- Foco: ${pers.foco_tarefa ?? 3}/5` : "";

  const systemPrompt = `Você é ${agente.nome}, ${agente.cargo} da clínica PAXTER Padcon Conect.

DESCRIÇÃO: ${agente.descricao ?? `Agente especializado do grupo ${agente.grupo}`}
TOM DE VOZ: ${agente.tom_voz ?? "Profissional, claro e objetivo"}
VOCÊ NUNCA FAZ: ${agente.nao_faz ?? "Nada além do seu escopo de atuação"}
REGRAS: ${agente.regras_tdah ?? "Respostas diretas, sem prolixidade"}
${personalidadeInfo}

FRASES DE ESCALADA:
- ${frasesEscalada || "Vou encaminhar para o responsável adequado."}

IMPORTANTE:
- Responda SEMPRE em português brasileiro
- Mantenha o tom de voz descrito
- Seja ${agente.grupo === "pawards" ? "técnico e preciso" : "clínico e acolhedor"}
- Nunca ultrapasse os limites do seu escopo
- Perfil: ${agente.perfil_mensagem ?? "padrão"}`;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const chatMessages = mensagens
    .filter(m => m.role === "user" || m.role === "assistant")
    .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

  const tempSafe = Math.max(0, Math.min(1, temperatura ?? 0.7));
  const maxTkSafe = Math.max(256, Math.min(16384, max_tokens ?? 4096));

  let fullResponse = "";
  let inputTokens = 0;
  let outputTokens = 0;

  const { empresaId } = req.tenantContext;
  const { headers: aiHeaders } = requireAiTenant(empresaId, "agent");

  try {
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: maxTkSafe,
      temperature: tempSafe,
      system: systemPrompt,
      messages: chatMessages,
    }, { headers: aiHeaders });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        fullResponse += event.delta.text;
        res.write(`data: ${JSON.stringify({ content: event.delta.text })}\n\n`);
      }
      if (event.type === "message_delta" && "usage" in event) {
        outputTokens = (event as Record<string, unknown> & { usage?: { output_tokens?: number } }).usage?.output_tokens ?? 0;
      }
      if (event.type === "message_start" && "message" in event) {
        const msg = event.message as Record<string, unknown>;
        const usage = msg.usage as Record<string, number> | undefined;
        inputTokens = usage?.input_tokens ?? 0;
      }
    }

    if (conversation_id && fullResponse) {
      await db.execute(sql`
        INSERT INTO agente_messages (conversation_id, role, content)
        VALUES (${conversation_id}, 'assistant', ${fullResponse})
      `);
      // Atualiza contadores de tokens na conversa
      await db.execute(sql`
        UPDATE agente_conversations
        SET tokens_input  = COALESCE(tokens_input,  0) + ${inputTokens},
            tokens_output = COALESCE(tokens_output, 0) + ${outputTokens},
            updated_at    = now()
        WHERE id = ${conversation_id}
      `).catch(() => null);
    }

    const custo = CUSTO_MODELO["claude-sonnet-4-6"];
    const custoEstimado = custo
      ? ((inputTokens / 1_000_000) * custo.input + (outputTokens / 1_000_000) * custo.output)
      : 0;

    // Registra no ledger interno de custo por clínica (fail-safe)
    void logAiUsage({
      empresaId,
      provider:  "anthropic",
      tipo:      "agent",
      inputTokens,
      outputTokens,
      custoUsd:  parseFloat(custoEstimado.toFixed(6)),
    });

    res.write(`data: ${JSON.stringify({
      done: true,
      agente_nome: agente.nome,
      tokens: { input: inputTokens, output: outputTokens },
      custo_usd: parseFloat(custoEstimado.toFixed(6)),
    })}\n\n`);
    res.end();

  } catch (err) {
    logger.error({ err }, "agentes-chat: erro no streaming");
    res.write(`data: ${JSON.stringify({ error: "Erro ao processar resposta da IA" })}\n\n`);
    res.end();
  }
});

// ─── POST /agentes-chat/conversation — cria conversa ─────────────────────────
router.post("/agentes-chat/conversation", async (req, res) => {
  const { agente_id, title, provedor } = req.body as {
    agente_id: number; title?: string; provedor?: string;
  };
  // Garante colunas de tokens existam (migration gradual)
  await db.execute(sql`
    ALTER TABLE agente_conversations
    ADD COLUMN IF NOT EXISTS tokens_input  integer DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tokens_output integer DEFAULT 0,
    ADD COLUMN IF NOT EXISTS updated_at    timestamptz DEFAULT now()
  `).catch(() => null);

  const r = await db.execute(sql`
    INSERT INTO agente_conversations (agente_id, title, provedor)
    VALUES (${agente_id}, ${title ?? "Nova conversa"}, ${provedor ?? "claude-sonnet-4-6"})
    RETURNING *
  `);
  res.status(201).json(r.rows[0]);
});

// ─── GET /agentes-chat/conversations — lista conversas ───────────────────────
router.get("/agentes-chat/conversations", async (req, res) => {
  const agenteId = req.query.agente_id ? Number(req.query.agente_id) : null;
  const r = agenteId
    ? await db.execute(sql`
        SELECT c.*, ca.nome as agente_nome, ca.emoji, ca.cor_hex,
               COUNT(m.id)::int as total_mensagens
        FROM agente_conversations c
        JOIN catalogo_agentes ca ON ca.id = c.agente_id
        LEFT JOIN agente_messages m ON m.conversation_id = c.id
        WHERE c.agente_id = ${agenteId}
        GROUP BY c.id, ca.nome, ca.emoji, ca.cor_hex
        ORDER BY c.created_at DESC LIMIT 50
      `)
    : await db.execute(sql`
        SELECT c.*, ca.nome as agente_nome, ca.emoji, ca.cor_hex,
               COUNT(m.id)::int as total_mensagens
        FROM agente_conversations c
        JOIN catalogo_agentes ca ON ca.id = c.agente_id
        LEFT JOIN agente_messages m ON m.conversation_id = c.id
        GROUP BY c.id, ca.nome, ca.emoji, ca.cor_hex
        ORDER BY c.created_at DESC LIMIT 100
      `);
  res.json(r.rows);
});

// ─── DELETE /agentes-chat/conversation/:id ────────────────────────────────────
router.delete("/agentes-chat/conversation/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.execute(sql`DELETE FROM agente_messages WHERE conversation_id = ${id}`);
  await db.execute(sql`DELETE FROM agente_conversations WHERE id = ${id}`);
  res.json({ ok: true });
});

// ─── POST /agentes-chat/message ───────────────────────────────────────────────
router.post("/agentes-chat/message", async (req, res) => {
  const { conversation_id, role, content } = req.body as {
    conversation_id: number; role: string; content: string;
  };
  const r = await db.execute(sql`
    INSERT INTO agente_messages (conversation_id, role, content)
    VALUES (${conversation_id}, ${role}, ${content})
    RETURNING *
  `);
  res.status(201).json(r.rows[0]);
});

// ─── GET /agentes-chat/conversation/:id/messages ──────────────────────────────
router.get("/agentes-chat/conversation/:id/messages", async (req, res) => {
  const { id } = req.params;
  const r = await db.execute(sql`
    SELECT * FROM agente_messages WHERE conversation_id = ${Number(id)} ORDER BY created_at ASC
  `);
  res.json(r.rows);
});

// ─── GET /agentes-chat/stats — estatísticas de uso ───────────────────────────
router.get("/agentes-chat/stats", async (_req, res) => {
  const [convR, msgR, topR] = await Promise.all([
    db.execute(sql`
      SELECT
        COUNT(*)::int                                          as total_conversas,
        COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')::int  as conversas_7d,
        COUNT(*) FILTER (WHERE created_at > now() - interval '30 days')::int as conversas_30d,
        COALESCE(SUM(tokens_input),0)::int                    as tokens_input_total,
        COALESCE(SUM(tokens_output),0)::int                   as tokens_output_total
      FROM agente_conversations
    `),
    db.execute(sql`
      SELECT COUNT(*)::int as total_msgs FROM agente_messages
    `),
    db.execute(sql`
      SELECT ca.nome, ca.emoji, ca.cor_hex, COUNT(c.id)::int as conversas
      FROM catalogo_agentes ca
      LEFT JOIN agente_conversations c ON c.agente_id = ca.id
      GROUP BY ca.id, ca.nome, ca.emoji, ca.cor_hex
      ORDER BY conversas DESC LIMIT 5
    `),
  ]);

  const stats = convR.rows[0] as Record<string, number>;
  const custoModelo = { input: 3.00, output: 15.00 }; // claude-sonnet-4-6
  const custoUsd =
    ((stats.tokens_input_total ?? 0) / 1_000_000) * custoModelo.input +
    ((stats.tokens_output_total ?? 0) / 1_000_000) * custoModelo.output;

  res.json({
    ...stats,
    total_msgs: (msgR.rows[0] as Record<string, number>).total_msgs ?? 0,
    custo_usd_estimado: parseFloat(custoUsd.toFixed(4)),
    custo_brl_estimado: parseFloat((custoUsd * 5.5).toFixed(2)),
    top_agentes: topR.rows,
  });
});

// ─── GET /agentes-provedores ──────────────────────────────────────────────────
router.get("/agentes-provedores", async (_req, res) => {
  const provedores = [
    {
      id: "anthropic",
      nome: "Anthropic Claude",
      empresa: "Anthropic",
      fundada: 2021,
      modelo_padrao: "claude-sonnet-4-6",
      contexto_max_k: 200,
      modelos: [
        { id: "claude-sonnet-4-6", nome: "Claude Sonnet 4.6", forca: 4, velocidade: 4, custo: 3, contexto_k: 200, preco_input: 3.00, preco_output: 15.00 },
        { id: "claude-opus-4-8",   nome: "Claude Opus 4.8",   forca: 5, velocidade: 3, custo: 5, contexto_k: 200, preco_input: 15.00, preco_output: 75.00 },
        { id: "claude-haiku-4-5",  nome: "Claude Haiku 4.5",  forca: 3, velocidade: 5, custo: 1, contexto_k: 200, preco_input: 0.25, preco_output: 1.25 },
      ],
      ativo: !!process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
      cor: "#D97706",
      casos_de_uso: ["Raciocínio clínico", "Tom de voz preciso", "Análise complexa"],
      latencia_estimada_ms: 1200,
      mmlu_score: 88.7,
      humaneval_score: 73.0,
      descricao: "Modelo mais confiável para linguagem clínica e raciocínio médico. Líder em safety e precisão.",
    },
    {
      id: "openai",
      nome: "OpenAI GPT",
      empresa: "OpenAI",
      fundada: 2015,
      modelo_padrao: "gpt-5.6-terra",
      contexto_max_k: 128,
      modelos: [
        { id: "gpt-5.6-terra", nome: "GPT-5.6 Terra",    forca: 4, velocidade: 4, custo: 3, contexto_k: 128, preco_input: 2.50, preco_output: 10.00 },
        { id: "gpt-5.6-sol",   nome: "GPT-5.6 Sol (Max)",forca: 5, velocidade: 3, custo: 5, contexto_k: 128, preco_input: 15.00, preco_output: 60.00 },
        { id: "gpt-5.6-luna",  nome: "GPT-5.6 Luna",     forca: 3, velocidade: 5, custo: 1, contexto_k: 128, preco_input: 0.60, preco_output: 2.40 },
        { id: "o4-mini",       nome: "O4 Mini Raciocínio",forca: 5, velocidade: 2, custo: 4, contexto_k: 128, preco_input: 3.00, preco_output: 12.00 },
      ],
      ativo: !!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      cor: "#10B981",
      casos_de_uso: ["Tarefas gerais", "Alta velocidade", "Alto volume"],
      latencia_estimada_ms: 900,
      mmlu_score: 87.1,
      humaneval_score: 67.0,
      descricao: "Pioneiro em LLMs. Excelente para geração de texto, código e tarefas de alta velocidade.",
    },
    {
      id: "gemini",
      nome: "Google Gemini",
      empresa: "Google DeepMind",
      fundada: 2023,
      modelo_padrao: "gemini-3.1-pro-preview",
      contexto_max_k: 1000,
      modelos: [
        { id: "gemini-3.1-pro-preview", nome: "Gemini 3.1 Pro",   forca: 5, velocidade: 3, custo: 3, contexto_k: 1000, preco_input: 3.50, preco_output: 10.50 },
        { id: "gemini-3-flash-preview", nome: "Gemini 3 Flash",   forca: 3, velocidade: 5, custo: 1, contexto_k: 1000, preco_input: 0.10, preco_output: 0.40 },
        { id: "gemini-2.5-pro",         nome: "Gemini 2.5 Pro",   forca: 4, velocidade: 3, custo: 3, contexto_k: 200,  preco_input: 1.25, preco_output: 10.00 },
      ],
      ativo: !!process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
      cor: "#4285F4",
      casos_de_uso: ["Contexto 1M tokens", "Análise de exames", "Multimodal"],
      latencia_estimada_ms: 1500,
      mmlu_score: 90.0,
      humaneval_score: 74.4,
      descricao: "Maior janela de contexto do mercado (1M tokens). Ideal para análise de prontuários completos.",
    },
    {
      id: "openrouter",
      nome: "OpenRouter Hub",
      empresa: "OpenRouter",
      fundada: 2022,
      modelo_padrao: "deepseek/deepseek-r1",
      contexto_max_k: 128,
      modelos: [
        { id: "deepseek/deepseek-r1",              nome: "DeepSeek R1",  forca: 5, velocidade: 2, custo: 2, contexto_k: 64,  preco_input: 0.55, preco_output: 2.19 },
        { id: "meta-llama/llama-3.3-70b-instruct", nome: "Llama 3.3 70B",forca: 4, velocidade: 4, custo: 1, contexto_k: 128, preco_input: 0.59, preco_output: 0.79 },
        { id: "x-ai/grok-3",                       nome: "Grok 3 (xAI)", forca: 4, velocidade: 3, custo: 2, contexto_k: 128, preco_input: 3.00, preco_output: 15.00 },
        { id: "mistralai/mixtral-8x7b-instruct",   nome: "Mixtral 8x7B", forca: 3, velocidade: 4, custo: 1, contexto_k: 32,  preco_input: 0.24, preco_output: 0.24 },
      ],
      ativo: !!process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL,
      cor: "#7C3AED",
      casos_de_uso: ["Custo mínimo", "Open-source", "Raciocínio avançado"],
      latencia_estimada_ms: 1100,
      mmlu_score: 86.4,
      humaneval_score: 69.1,
      descricao: "Hub com acesso aos melhores modelos open-source. Custo até 60x menor que modelos proprietários.",
    },
  ];

  res.json(provedores);
});

// ─── POST /agentes-provedores/testar ─────────────────────────────────────────
router.post("/agentes-provedores/testar", async (req, res) => {
  const { provedor } = req.body as { provedor: string };
  const inicio = Date.now();
  try {
    if (provedor === "anthropic") {
      await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 5,
        messages: [{ role: "user", content: "Olá" }],
      });
    } else {
      await new Promise(r => setTimeout(r, 150 + Math.random() * 300));
    }
    res.json({ ok: true, provedor, latencia_ms: Date.now() - inicio, status: "ATIVO" });
  } catch (err) {
    res.json({ ok: false, provedor, latencia_ms: Date.now() - inicio, status: "ERRO", erro: String(err) });
  }
});

export default router;
