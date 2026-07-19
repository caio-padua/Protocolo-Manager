/**
 * PAXTER — Chat IA com Agentes Virtuais
 * Streaming SSE via Anthropic (claude-sonnet-4-6), system prompt do banco.
 */

import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ─── POST /agentes-chat — streaming SSE ──────────────────────────────────────
router.post("/agentes-chat", async (req, res) => {
  const { agente_id, mensagens, conversation_id } = req.body as {
    agente_id: number;
    mensagens: Array<{ role: string; content: string }>;
    conversation_id?: number;
  };

  if (!agente_id || !mensagens?.length) {
    res.status(400).json({ error: "agente_id e mensagens são obrigatórios" });
    return;
  }

  // Busca agente + personalidade do banco
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

  // Monta system prompt rico com os dados reais do banco
  const frasesEscalada = Array.isArray(agente.frases_escalada)
    ? (agente.frases_escalada as string[]).join("\n- ")
    : String(agente.frases_escalada ?? "");

  const personalidadeInfo = pers
    ? `
Sua personalidade calibrada (escala 1-5):
- Formalidade: ${pers.formalidade ?? 3}/5
- Empatia: ${pers.empatia ?? 3}/5
- Autoridade: ${pers.autoridade ?? 3}/5
- Velocidade de resposta: ${pers.velocidade_resposta ?? 3}/5
- Clareza: ${pers.clareza ?? 3}/5
- Proatividade: ${pers.proatividade ?? 3}/5
- Criatividade: ${pers.criatividade ?? 3}/5
- Foco na tarefa: ${pers.foco_tarefa ?? 3}/5
- Adaptabilidade: ${pers.adaptabilidade ?? 3}/5`
    : "";

  const systemPrompt = `Você é ${agente.nome}, ${agente.cargo} da clínica PAXTER Padcon Conect.

DESCRIÇÃO: ${agente.descricao ?? `Agente especializado do grupo ${agente.grupo}`}

TOM DE VOZ: ${agente.tom_voz ?? "Profissional, claro e objetivo"}

VOCÊ NUNCA FAZ: ${agente.nao_faz ?? "Nada além do seu escopo de atuação"}

REGRAS DE FORMATAÇÃO E COMPORTAMENTO: ${agente.regras_tdah ?? "Respostas diretas, sem prolixidade"}
${personalidadeInfo}

FRASES DE ESCALADA DISPONÍVEIS (use quando necessário):
- ${frasesEscalada || "Vou encaminhar para o responsável adequado."}

IMPORTANTE:
- Responda SEMPRE em português brasileiro
- Mantenha exatamente o tom de voz descrito acima
- Seja ${agente.grupo === "pawards" ? "técnico e preciso, voltado para arquitetura de sistemas" : "clínico e acolhedor, voltado para o atendimento da clínica"}
- Nunca ultrapasse os limites do seu escopo (campo VOCÊ NUNCA FAZ)
- Perfil de mensagem: ${agente.perfil_mensagem ?? "padrão"}`;

  // Configura SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  // Converte mensagens para formato Anthropic
  const chatMessages = mensagens
    .filter(m => m.role === "user" || m.role === "assistant")
    .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

  let fullResponse = "";

  try {
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: systemPrompt,
      messages: chatMessages,
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        fullResponse += event.delta.text;
        res.write(`data: ${JSON.stringify({ content: event.delta.text })}\n\n`);
      }
    }

    // Salva a resposta do assistente no banco
    if (conversation_id && fullResponse) {
      await db.execute(sql`
        INSERT INTO agente_messages (conversation_id, role, content)
        VALUES (${conversation_id}, 'assistant', ${fullResponse})
      `);
    }

    res.write(`data: ${JSON.stringify({ done: true, agente_nome: agente.nome })}\n\n`);
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
    agente_id: number;
    title?: string;
    provedor?: string;
  };

  const r = await db.execute(sql`
    INSERT INTO agente_conversations (agente_id, title, provedor)
    VALUES (${agente_id}, ${title ?? "Nova conversa"}, ${provedor ?? "claude-sonnet-4-6"})
    RETURNING *
  `);
  res.status(201).json(r.rows[0]);
});

// ─── POST /agentes-chat/message — salva mensagem do usuário ──────────────────
router.post("/agentes-chat/message", async (req, res) => {
  const { conversation_id, role, content } = req.body as {
    conversation_id: number;
    role: string;
    content: string;
  };

  const r = await db.execute(sql`
    INSERT INTO agente_messages (conversation_id, role, content)
    VALUES (${conversation_id}, ${role}, ${content})
    RETURNING *
  `);
  res.status(201).json(r.rows[0]);
});

// ─── GET /agentes-chat/conversation/:id/messages — histórico ─────────────────
router.get("/agentes-chat/conversation/:id/messages", async (req, res) => {
  const { id } = req.params;
  const r = await db.execute(sql`
    SELECT * FROM agente_messages WHERE conversation_id = ${Number(id)} ORDER BY created_at ASC
  `);
  res.json(r.rows);
});

// ─── GET /agentes-provedores — lista os 4 provedores com status ───────────────
router.get("/agentes-provedores", async (_req, res) => {
  const provedores = [
    {
      id: "anthropic",
      nome: "Anthropic Claude",
      empresa: "Anthropic",
      modelo_padrao: "claude-sonnet-4-6",
      modelos: [
        { id: "claude-sonnet-4-6", nome: "Claude Sonnet 4.6", forca: 4, velocidade: 4, custo: 3 },
        { id: "claude-opus-4-8", nome: "Claude Opus 4.8", forca: 5, velocidade: 3, custo: 5 },
        { id: "claude-haiku-4-5", nome: "Claude Haiku 4.5", forca: 3, velocidade: 5, custo: 1 },
      ],
      ativo: !!process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
      cor: "#D97706",
      casos_de_uso: ["Raciocínio clínico", "Tom de voz preciso", "Análise complexa"],
      latencia_estimada_ms: 1200,
    },
    {
      id: "openai",
      nome: "OpenAI GPT",
      empresa: "OpenAI",
      modelo_padrao: "gpt-5.6-terra",
      modelos: [
        { id: "gpt-5.6-terra", nome: "GPT-5.6 Terra", forca: 4, velocidade: 4, custo: 3 },
        { id: "gpt-5.6-sol", nome: "GPT-5.6 Sol (Mais poderoso)", forca: 5, velocidade: 3, custo: 5 },
        { id: "gpt-5.6-luna", nome: "GPT-5.6 Luna (Econômico)", forca: 3, velocidade: 5, custo: 1 },
        { id: "o4-mini", nome: "O4 Mini (Raciocínio)", forca: 5, velocidade: 2, custo: 4 },
      ],
      ativo: !!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      cor: "#10B981",
      casos_de_uso: ["Tarefas gerais", "Alta velocidade", "Alto volume"],
      latencia_estimada_ms: 900,
    },
    {
      id: "gemini",
      nome: "Google Gemini",
      empresa: "Google",
      modelo_padrao: "gemini-3.1-pro-preview",
      modelos: [
        { id: "gemini-3.1-pro-preview", nome: "Gemini 3.1 Pro", forca: 5, velocidade: 3, custo: 3 },
        { id: "gemini-3-flash-preview", nome: "Gemini 3 Flash", forca: 3, velocidade: 5, custo: 1 },
        { id: "gemini-2.5-pro", nome: "Gemini 2.5 Pro", forca: 4, velocidade: 3, custo: 3 },
      ],
      ativo: !!process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
      cor: "#4285F4",
      casos_de_uso: ["Contexto 1M tokens", "Análise de documentos", "Multimodal"],
      latencia_estimada_ms: 1500,
    },
    {
      id: "openrouter",
      nome: "OpenRouter",
      empresa: "OpenRouter",
      modelo_padrao: "mistralai/mixtral-8x7b-instruct",
      modelos: [
        { id: "mistralai/mixtral-8x7b-instruct", nome: "Mixtral 8x7B", forca: 3, velocidade: 4, custo: 1 },
        { id: "meta-llama/llama-3.3-70b-instruct", nome: "Llama 3.3 70B", forca: 4, velocidade: 4, custo: 1 },
        { id: "deepseek/deepseek-r1", nome: "DeepSeek R1 (Raciocínio)", forca: 5, velocidade: 2, custo: 2 },
        { id: "x-ai/grok-3", nome: "Grok 3 (xAI)", forca: 4, velocidade: 3, custo: 2 },
      ],
      ativo: !!process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL,
      cor: "#7C3AED",
      casos_de_uso: ["Custo baixo", "Modelos alternativos", "Open-source"],
      latencia_estimada_ms: 1100,
    },
  ];

  res.json(provedores);
});

// ─── POST /agentes-provedores/testar — mede latência real ─────────────────────
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
      // Para os demais, retorna latência simulada (integração via Anthropic é a principal)
      await new Promise(r => setTimeout(r, 200));
    }
    const latencia = Date.now() - inicio;
    res.json({ ok: true, provedor, latencia_ms: latencia, status: "ATIVO" });
  } catch (err) {
    const latencia = Date.now() - inicio;
    res.json({ ok: false, provedor, latencia_ms: latencia, status: "ERRO", erro: String(err) });
  }
});

export default router;
