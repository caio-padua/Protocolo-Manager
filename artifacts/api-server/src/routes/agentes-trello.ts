/**
 * PAXTER — Agentes × Trello (Ondas D + E)
 * Cria/lê cards no Trello interno e externo a partir de conversas dos agentes.
 * Graceful degradation: retorna { configurado: false } quando tokens ausentes.
 */

import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import {
  createCard, addComment, listLists, getCard,
} from "../lib/trello";
import { logger } from "../lib/logger";
import { logIntegracao } from "./agentes-integracoes";

const router: IRouter = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function trelloConfigurado(): boolean {
  return !!(
    process.env.TRELLO_API_KEY &&
    process.env.TRELLO_TOKEN &&
    process.env.TRELLO_BOARD_ID
  );
}

function webhookUrl(tipo: "interno" | "externo" = "interno"): string {
  const domain = (process.env.REPLIT_DOMAINS ?? "").split(",")[0]?.trim();
  if (!domain) return "(domínio público não disponível em dev local)";
  const base = domain.startsWith("http") ? domain : `https://${domain}`;
  const path = tipo === "externo" ? "webhook-externo" : "webhook";
  return `${base.replace(/\/$/, "")}/api/agentes-trello/${path}`;
}

async function ensureConfigCols(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE capacidades_agente
    ADD COLUMN IF NOT EXISTS trello_interno_ativo   boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS trello_list_id_default text,
    ADD COLUMN IF NOT EXISTS trello_externo_ativo   boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS wpp_proativo_ativo     boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS email_proativo_ativo   boolean DEFAULT false
  `).catch(() => null);

  await db.execute(sql`
    ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS trello_board_ext_id text,
    ADD COLUMN IF NOT EXISTS agente_atendimento_id integer
  `).catch(() => null);

  // Tabela de cards criados pelos agentes (rastreamento)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS agentes_trello_cards (
      id              serial PRIMARY KEY,
      agente_id       integer NOT NULL,
      conversation_id integer,
      client_id       integer,
      trello_card_id  text NOT NULL UNIQUE,
      trello_list_id  text,
      board_tipo      text DEFAULT 'interno',
      titulo          text,
      created_at      timestamptz DEFAULT now()
    )
  `).catch(() => null);
}

// ─── GET /agentes-trello/status ───────────────────────────────────────────────
router.get("/agentes-trello/status", async (_req, res): Promise<void> => {
  const conf = trelloConfigurado();
  res.json({
    configurado: conf,
    webhook_interno: webhookUrl("interno"),
    webhook_externo: webhookUrl("externo"),
    board_id: conf ? process.env.TRELLO_BOARD_ID : null,
    instrucoes: conf ? null : [
      "1. Acesse trello.com → Power-Ups → Gere sua API Key e Token",
      "2. Copie o ID do board na URL (trello.com/b/[BOARD_ID]/...)",
      "3. Defina os secrets: TRELLO_API_KEY, TRELLO_TOKEN, TRELLO_BOARD_ID",
      "4. Registre o webhook interno no Trello apontando para a URL acima",
    ],
  });
});

// ─── GET /agentes-trello/listas ───────────────────────────────────────────────
router.get("/agentes-trello/listas", async (_req, res): Promise<void> => {
  if (!trelloConfigurado()) {
    res.json({ configurado: false, listas: [] });
    return;
  }
  try {
    const listas = await listLists();
    res.json({ configurado: true, listas });
  } catch (err) {
    logger.error({ err }, "agentes-trello: erro ao listar listas");
    res.status(502).json({ error: "Erro ao consultar Trello", detalhe: String(err) });
  }
});

// ─── GET /agentes-trello/config/:agenteId ────────────────────────────────────
router.get("/agentes-trello/config/:agenteId", async (req, res): Promise<void> => {
  await ensureConfigCols();
  const id = Number(req.params.agenteId);
  const r = await db.execute(sql`
    SELECT trello_interno_ativo, trello_list_id_default,
           trello_externo_ativo, wpp_proativo_ativo, email_proativo_ativo
    FROM capacidades_agente WHERE agente_id = ${id}
  `);
  res.json(r.rows[0] ?? {
    trello_interno_ativo: false, trello_list_id_default: null,
    trello_externo_ativo: false, wpp_proativo_ativo: false, email_proativo_ativo: false,
  });
});

// ─── POST /agentes-trello/config ─────────────────────────────────────────────
router.post("/agentes-trello/config", async (req, res): Promise<void> => {
  await ensureConfigCols();
  const {
    agente_id,
    trello_interno_ativo, trello_list_id_default,
    trello_externo_ativo, wpp_proativo_ativo, email_proativo_ativo,
  } = req.body as {
    agente_id: number;
    trello_interno_ativo?: boolean;
    trello_list_id_default?: string;
    trello_externo_ativo?: boolean;
    wpp_proativo_ativo?: boolean;
    email_proativo_ativo?: boolean;
  };

  if (!agente_id) { res.status(400).json({ error: "agente_id obrigatório" }); return; }

  await db.execute(sql`
    UPDATE capacidades_agente SET
      trello_interno_ativo   = COALESCE(${trello_interno_ativo ?? null}, trello_interno_ativo),
      trello_list_id_default = COALESCE(${trello_list_id_default ?? null}, trello_list_id_default),
      trello_externo_ativo   = COALESCE(${trello_externo_ativo ?? null}, trello_externo_ativo),
      wpp_proativo_ativo     = COALESCE(${wpp_proativo_ativo ?? null}, wpp_proativo_ativo),
      email_proativo_ativo   = COALESCE(${email_proativo_ativo ?? null}, email_proativo_ativo)
    WHERE agente_id = ${agente_id}
  `);

  res.json({ ok: true });
});

// ─── POST /agentes-trello/card — cria card a partir de uma conversa ───────────
router.post("/agentes-trello/card", async (req, res): Promise<void> => {
  const {
    conversation_id, agente_id, client_id, list_id, titulo_extra,
  } = req.body as {
    conversation_id?: number;
    agente_id: number;
    client_id?: number;
    list_id?: string;
    titulo_extra?: string;
  };

  if (!agente_id) { res.status(400).json({ error: "agente_id obrigatório" }); return; }

  if (!trelloConfigurado()) {
    res.status(503).json({
      configurado: false,
      mensagem: "Configure TRELLO_API_KEY, TRELLO_TOKEN e TRELLO_BOARD_ID nos secrets.",
    });
    return;
  }

  await ensureConfigCols();

  // Busca dados do agente e da conversa
  const [agenteR, capR] = await Promise.all([
    db.execute(sql`SELECT nome, emoji, cor_hex FROM catalogo_agentes WHERE id = ${agente_id}`),
    db.execute(sql`SELECT trello_list_id_default FROM capacidades_agente WHERE agente_id = ${agente_id}`),
  ]);

  const agente = agenteR.rows[0] as Record<string, string> | undefined;
  const cap    = capR.rows[0] as Record<string, string>    | undefined;

  if (!agente) { res.status(404).json({ error: "Agente não encontrado" }); return; }

  let resumo = titulo_extra ?? "Nova demanda";
  let msgCount = 0;

  if (conversation_id) {
    const convR = await db.execute(sql`SELECT title FROM agente_conversations WHERE id = ${conversation_id}`);
    const msgR  = await db.execute(sql`
      SELECT content, role FROM agente_messages
      WHERE conversation_id = ${conversation_id}
      ORDER BY created_at ASC LIMIT 6
    `);
    resumo   = (convR.rows[0] as Record<string, string>)?.title ?? resumo;
    msgCount = msgR.rows.length;

    const snippet = (msgR.rows as Array<Record<string, string>>)
      .map(m => `*${m.role === "user" ? "Dr." : agente.nome}:* ${(m.content ?? "").slice(0, 200)}`)
      .join("\n\n");

    const listIdFinal = list_id ?? cap?.trello_list_id_default;
    if (!listIdFinal) {
      res.status(400).json({ error: "list_id não fornecido e agente sem lista padrão configurada" });
      return;
    }

    const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const titulo = `${agente.emoji} ${agente.nome} — ${resumo.slice(0, 55)}`;
    const desc = [
      `## Conversa via Console IA Pro\n`,
      `**Agente:** ${agente.nome}`,
      client_id ? `**Cliente ID:** ${client_id}` : "",
      `**Mensagens:** ${msgCount}`,
      `**Data (BRT):** ${now}`,
      `**Conversa ID:** conv_${conversation_id}`,
      `**Agente ID:** agente_${agente_id}`,
      `\n---\n### Trecho da conversa\n`,
      snippet,
    ].filter(Boolean).join("\n");

    try {
      const card = await createCard({ listId: listIdFinal, name: titulo, desc });

      // Persiste rastreamento
      await db.execute(sql`
        INSERT INTO agentes_trello_cards
          (agente_id, conversation_id, client_id, trello_card_id, trello_list_id, board_tipo, titulo)
        VALUES
          (${agente_id}, ${conversation_id}, ${client_id ?? null}, ${card.id}, ${listIdFinal}, 'interno', ${titulo})
        ON CONFLICT (trello_card_id) DO NOTHING
      `);

      logIntegracao({ tipo: "trello_card", client_id: client_id ?? undefined, status: "ok", detalhe: { card_id: card.id, titulo } }).catch(() => {});
      res.json({ ok: true, card_id: card.id, url: card.url, titulo });
    } catch (err) {
      logger.error({ err }, "agentes-trello: erro ao criar card");
      res.status(502).json({ error: "Erro ao criar card no Trello", detalhe: String(err) });
    }
  } else {
    // Card avulso sem conversa
    const listIdFinal = list_id ?? cap?.trello_list_id_default;
    if (!listIdFinal) {
      res.status(400).json({ error: "list_id não fornecido" });
      return;
    }
    const titulo = `${agente.emoji} ${agente.nome} — ${resumo.slice(0, 55)}`;
    try {
      const card = await createCard({ listId: listIdFinal, name: titulo, desc: titulo_extra ?? "" });
      res.json({ ok: true, card_id: card.id, url: card.url, titulo });
    } catch (err) {
      res.status(502).json({ error: "Erro ao criar card", detalhe: String(err) });
    }
  }
});

// ─── POST /agentes-trello/board-cliente/:clientId ─────────────────────────────
router.post("/agentes-trello/board-cliente/:clientId", async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (!trelloConfigurado()) {
    res.status(503).json({ configurado: false, mensagem: "Trello não configurado." });
    return;
  }
  await ensureConfigCols();

  // Verifica se já tem board
  const clientR = await db.execute(sql`
    SELECT name, trello_board_ext_id FROM clients WHERE id = ${clientId}
  `);
  const client = clientR.rows[0] as Record<string, string> | undefined;
  if (!client) { res.status(404).json({ error: "Cliente não encontrado" }); return; }

  if (client.trello_board_ext_id) {
    res.json({ ok: true, ja_existia: true, board_id: client.trello_board_ext_id });
    return;
  }

  // Cria board via Trello API diretamente (trello.ts não tem createBoard)
  const key   = process.env.TRELLO_API_KEY!;
  const token = process.env.TRELLO_TOKEN!;
  try {
    const boardRes = await fetch(
      `https://api.trello.com/1/boards?key=${key}&token=${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `PAXTER — ${client.name}`,
          defaultLists: false,
          prefs_permissionLevel: "private",
          prefs_comments: "members",
        }),
      }
    );
    if (!boardRes.ok) throw new Error(`Trello ${boardRes.status}`);
    const board = await boardRes.json() as { id: string; url: string };

    // Cria listas padrão no board do cliente
    const listas = ["Meu Protocolo", "Próximas Sessões", "Meus Resultados", "Perguntas & Respostas", "Conquistas"];
    for (const nome of listas.reverse()) {
      await fetch(`https://api.trello.com/1/lists?key=${key}&token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nome, idBoard: board.id }),
      }).catch(() => null);
    }

    // Persiste board_id
    await db.execute(sql`
      UPDATE clients SET trello_board_ext_id = ${board.id} WHERE id = ${clientId}
    `);

    res.json({ ok: true, ja_existia: false, board_id: board.id, url: board.url });
  } catch (err) {
    logger.error({ err }, "agentes-trello: erro ao criar board cliente");
    res.status(502).json({ error: "Erro ao criar board no Trello", detalhe: String(err) });
  }
});

// ─── GET /agentes-trello/board-cliente/:clientId ──────────────────────────────
router.get("/agentes-trello/board-cliente/:clientId", async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  await ensureConfigCols();
  const r = await db.execute(sql`
    SELECT name, trello_board_ext_id FROM clients WHERE id = ${clientId}
  `);
  const c = r.rows[0] as Record<string, string> | undefined;
  if (!c) { res.status(404).json({ error: "Cliente não encontrado" }); return; }
  res.json({
    board_id: c.trello_board_ext_id ?? null,
    client_name: c.name,
    configurado: trelloConfigurado(),
  });
});

// ─── POST /agentes-trello/webhook — webhook INTERNO (sem auth) ────────────────
// IMPORTANTE: esta rota deve ser registrada ANTES do collaboratorGuard
router.post("/agentes-trello/webhook", async (req, res): Promise<void> => {
  // Trello envia HEAD para validar o endpoint — responder 200
  res.status(200).json({ ok: true });

  const action = req.body?.action as Record<string, unknown> | undefined;
  if (!action) return;

  // Só processa comentários novos
  if (action.type !== "commentCard") return;

  try {
    const cardId    = (action.data as Record<string, unknown>)?.card as Record<string, string> | undefined;
    const texto     = ((action.data as Record<string, unknown>)?.text as string) ?? "";
    const memberName= (action.memberCreator as Record<string, string>)?.fullName ?? "Alguém";

    if (!cardId?.id || !texto.trim()) return;

    // Verifica se foi o próprio agente que criou o card (evitar loop)
    if (memberName.toLowerCase().includes("paxter") || texto.startsWith("🤖")) return;

    // Encontra qual agente criou este card
    const atcR = await db.execute(sql`
      SELECT agente_id, conversation_id FROM agentes_trello_cards
      WHERE trello_card_id = ${cardId.id}
    `);
    const atc = atcR.rows[0] as Record<string, number> | undefined;
    if (!atc) return;

    // Busca dados do agente
    const agR = await db.execute(sql`
      SELECT nome, emoji, tom_voz, nao_faz, cargo FROM catalogo_agentes WHERE id = ${atc.agente_id}
    `);
    const ag = agR.rows[0] as Record<string, string> | undefined;
    if (!ag) return;

    // Busca contexto da conversa (últimas 4 mensagens)
    let contexto = "";
    if (atc.conversation_id) {
      const msgsR = await db.execute(sql`
        SELECT role, content FROM agente_messages
        WHERE conversation_id = ${atc.conversation_id}
        ORDER BY created_at DESC LIMIT 4
      `);
      contexto = (msgsR.rows as Array<Record<string, string>>)
        .reverse()
        .map(m => `${m.role === "user" ? "Dr." : ag.nome}: ${m.content}`)
        .join("\n");
    }

    // Gera resposta via Claude
    const system = `Você é ${ag.nome}, ${ag.cargo}. Tom: ${ag.tom_voz}. Você nunca faz: ${ag.nao_faz}.
Está respondendo um comentário num card do Trello interno da clínica. Seja conciso e objetivo.
Contexto da conversa anterior:\n${contexto}`;

    const resp = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 512,
      system,
      messages: [{ role: "user", content: `${memberName} comentou: "${texto}"` }],
    });

    const resposta = (resp.content[0] as { text?: string })?.text ?? "Recebido.";
    await addComment(cardId.id, `🤖 **${ag.emoji} ${ag.nome}:** ${resposta}`);

  } catch (err) {
    logger.error({ err }, "agentes-trello: erro no webhook interno");
  }
});

// ─── POST /agentes-trello/webhook-externo — webhook EXTERNO (sem auth) ────────
router.post("/agentes-trello/webhook-externo", async (req, res): Promise<void> => {
  res.status(200).json({ ok: true });

  const action = req.body?.action as Record<string, unknown> | undefined;
  if (!action || action.type !== "commentCard") return;

  try {
    const cardId = (action.data as Record<string, unknown>)?.card as Record<string, string> | undefined;
    const boardId= (action.data as Record<string, unknown>)?.board as Record<string, string> | undefined;
    const texto  = ((action.data as Record<string, unknown>)?.text as string) ?? "";
    const memberName = (action.memberCreator as Record<string, string>)?.fullName ?? "Cliente";

    if (!cardId?.id || !boardId?.id || !texto.trim()) return;
    if (memberName.toLowerCase().includes("paxter") || texto.startsWith("🤖")) return;

    // Encontra cliente pelo board_id
    await ensureConfigCols();
    const clientR = await db.execute(sql`
      SELECT id, name, agente_atendimento_id FROM clients
      WHERE trello_board_ext_id = ${boardId.id}
    `);
    const client = clientR.rows[0] as Record<string, unknown> | undefined;
    if (!client) return;

    const agenteId = (client.agente_atendimento_id as number) ?? 1;

    const agR = await db.execute(sql`
      SELECT nome, emoji, tom_voz, nao_faz, cargo FROM catalogo_agentes WHERE id = ${agenteId}
    `);
    const ag = agR.rows[0] as Record<string, string> | undefined;
    if (!ag) return;

    const system = `Você é ${ag.nome}, ${ag.cargo} do sistema PAXTER. Tom: ${ag.tom_voz}.
Está respondendo a ${client.name} no board Trello pessoal deste cliente. Seja acolhedor, direto e empático.`;

    const resp = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 512,
      system,
      messages: [{ role: "user", content: `${memberName} perguntou: "${texto}"` }],
    });

    const resposta = (resp.content[0] as { text?: string })?.text ?? "Recebido!";
    await addComment(cardId.id, `🤖 **${ag.emoji} ${ag.nome}:** ${resposta}`);

  } catch (err) {
    logger.error({ err }, "agentes-trello: erro no webhook externo");
  }
});

// Trello valida webhooks com HEAD
router.head("/agentes-trello/webhook", (_req, res) => res.status(200).send());
router.head("/agentes-trello/webhook-externo", (_req, res) => res.status(200).send());

export default router;
