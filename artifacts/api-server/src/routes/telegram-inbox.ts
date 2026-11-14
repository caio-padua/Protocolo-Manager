/**
 * routes/telegram-inbox.ts
 *
 * Rotas de inbox Telegram do cockpit, extraídas de cockpit.ts para
 * permitir testes de integração com escopo mínimo de dependências.
 *
 * Montado em cockpit.ts via `router.use(inboxRouter)`.
 *
 * Rotas:
 *   GET  /telegram-inbox/badge
 *   GET  /cockpit/:clientId/telegram-inbox
 *   POST /cockpit/:clientId/telegram-inbox/marcar-lidas
 *
 * Cada rota delega a lógica a uma função pura de lib/telegram-inbox-flow.ts,
 * passando deps Drizzle como argumento. Isso permite:
 *   - Testes unitários contra a lib (deps em memória)
 *   - Testes de integração HTTP contra esta rota (deps reais mockadas na camada
 *     da lib pelo vi.mock, sem necessidade de banco real nos testes)
 */

import { Router } from "express";
import {
  db,
  clientsTable,
  telegramInboxTable,
} from "@workspace/db";
import { eq, and, desc, isNull, sql } from "drizzle-orm";
import { requireCollaborator } from "./collaborator";
import { requireMessageClinic } from "../middleware/messageClinic";
import {
  obterBadge,
  listarInbox,
  marcarLidas,
  type MensagemInbox,
} from "../lib/telegram-inbox-flow";

export const inboxRouter = Router();

// Boot migration — adiciona coluna direcao se ainda não existir.
// "entrada" = paciente → bot; "saida" = CEO → paciente. Default entrada.
(async () => {
  try {
    await db.execute(
      sql`ALTER TABLE telegram_inbox_messages ADD COLUMN IF NOT EXISTS direcao TEXT NOT NULL DEFAULT 'entrada'`,
    );
  } catch {
    // coluna já existe ou banco indisponível no boot — ignora silenciosamente
  }
})();

// ── 1) GET /telegram-inbox/badge ─────────────────────────────────────────────
// Conta não-lidas do tenant autorizado. Requer token de colaborador.
// empresaId vem de req.tenantContext — isolamento por tenant da sessão.
inboxRouter.get("/telegram-inbox/badge", requireCollaborator, requireMessageClinic, async (req, res): Promise<void> => {
  const empresaId = req.messageEmpresaId!;

  const result = await obterBadge({ empresaId }, {
    contarNaoLidas: async (eid) => {
      // Filtra direcao='entrada': mensagens de saída (CEO→paciente) são
      // inseridas com lida_em=NOW() e nunca devem inflar o badge.
      const [row] = await db
        .select({ total: sql<number>`COUNT(*)::int` })
        .from(telegramInboxTable)
        .where(and(
          isNull(telegramInboxTable.lidaEm),
          eq(telegramInboxTable.empresaId, eid),
          sql`${telegramInboxTable.direcao} = 'entrada'`,
        ));
      return row?.total ?? 0;
    },
  });

  res.json({ naoLidas: result.naoLidas });
});

// ── 2) GET /cockpit/:clientId/telegram-inbox ──────────────────────────────────
// Lista mensagens Telegram do paciente. Requer token de colaborador.
// Tenant derivado de req.tenantContext — nunca do clientId do chamador.
inboxRouter.get("/cockpit/:clientId/telegram-inbox", requireCollaborator, requireMessageClinic, async (req, res): Promise<void> => {
  const clienteId = Number(req.params.clientId);
  if (!Number.isFinite(clienteId) || clienteId <= 0) {
    res.status(400).json({ error: "clientId invalido" });
    return;
  }

  const empresaId = req.messageEmpresaId!;

  const tamanhoParam = req.query["quantidade"] ?? "20";
  const direcao = req.query["direcao"] ?? "todas";
  if (typeof tamanhoParam !== "string" || !["20", "50", "100"].includes(tamanhoParam)
    || typeof direcao !== "string" || !["todas", "entrada", "saida"].includes(direcao)) {
    res.status(400).json({ error: "Use quantidade 20, 50 ou 100 e direção todas, entrada ou saida." });
    return;
  }
  const tamanhoPagina = Number(tamanhoParam);

  const paginaParam = req.query["pagina"];
  const paginaRaw = typeof paginaParam === "string" && /^\d+$/.test(paginaParam)
    ? Number(paginaParam) : 1;
  // PostgreSQL OFFSET recebe inteiro de 64 bits; impedir valores inseguros
  // também limita consultas acidentalmente excessivas.
  const pagina = Number.isSafeInteger(paginaRaw) && paginaRaw >= 1
    && paginaRaw <= Math.floor(Number.MAX_SAFE_INTEGER / tamanhoPagina) ? paginaRaw : 1;

  const result = await listarInbox(
    { clienteId, empresaId, marcarLidas: req.query["marcar_lidas"] === "1", pagina, tamanhoPagina },
    {
      findClienteNoTenant: async (cid, eid) => {
        const [row] = await db
          .select({ id: clientsTable.id })
          .from(clientsTable)
          .where(and(eq(clientsTable.id, cid), eq(clientsTable.empresaId, eid)))
          .limit(1);
        return row ?? null;
      },
      listMensagens: async (cid, eid, limit, offset): Promise<MensagemInbox[]> => {
        return db
          .select()
          .from(telegramInboxTable)
          .where(and(
            eq(telegramInboxTable.clienteId, cid),
            eq(telegramInboxTable.empresaId, eid),
            direcao === "todas" ? undefined : eq(telegramInboxTable.direcao, direcao),
          ))
          .orderBy(desc(telegramInboxTable.recebidaEm), desc(telegramInboxTable.id))
          .limit(limit)
          .offset(offset);
      },
      marcarComoLidas: async (cid, eid) => {
        await db
          .update(telegramInboxTable)
          .set({ lidaEm: new Date() })
          .where(and(
            eq(telegramInboxTable.clienteId, cid),
            eq(telegramInboxTable.empresaId, eid),
            isNull(telegramInboxTable.lidaEm),
          ));
      },
    },
  );

  if (result.kind === "nao_encontrado") {
    res.status(404).json({ error: "cliente nao encontrado" });
    return;
  }

  // Retira o campo `kind` — o cliente recebe apenas { mensagens, naoLidas }
  const { kind: _kind, ...payload } = result;
  res.json(payload);
});

// ── 3) POST /cockpit/:clientId/telegram-inbox/marcar-lidas ───────────────────
// Marca não-lidas do paciente como lidas. Requer token de colaborador.
// UPDATE é tenant-scoped: empresaId da sessão, nunca do payload.
inboxRouter.post("/cockpit/:clientId/telegram-inbox/marcar-lidas", requireCollaborator, requireMessageClinic, async (req, res): Promise<void> => {
  const clienteId = Number(req.params.clientId);
  if (!Number.isFinite(clienteId) || clienteId <= 0) {
    res.status(400).json({ error: "clientId invalido" });
    return;
  }

  const empresaId = req.messageEmpresaId!;

  const result = await marcarLidas(
    { clienteId, empresaId },
    {
      findClienteNoTenant: async (cid, eid) => {
        const [row] = await db
          .select({ id: clientsTable.id })
          .from(clientsTable)
          .where(and(eq(clientsTable.id, cid), eq(clientsTable.empresaId, eid)))
          .limit(1);
        return row ?? null;
      },
      updateLidas: async (cid, eid) => {
        const resultado = await db
          .update(telegramInboxTable)
          .set({ lidaEm: new Date() })
          .where(and(
            eq(telegramInboxTable.clienteId, cid),
            eq(telegramInboxTable.empresaId, eid),
            isNull(telegramInboxTable.lidaEm),
          ));
        return (resultado as unknown as { rowCount: number }).rowCount ?? 0;
      },
    },
  );

  if (result.kind === "nao_encontrado") {
    res.status(404).json({ error: "cliente nao encontrado" });
    return;
  }

  res.json({ ok: true, marcadas: result.marcadas });
});

// ── 4) GET /telegram-inbox/conversas ─────────────────────────────────────────
// Central da equipe: uma linha por cliente com conversa, da mais recente para a mais antiga.
// Só devolve identificação mínima (id, nome) e a última mensagem; o histórico completo
// continua sendo lido por /cockpit/:clientId/telegram-inbox (mesma regra de clínica).
inboxRouter.get("/telegram-inbox/conversas", requireCollaborator, requireMessageClinic, async (req, res): Promise<void> => {
  const empresaId = req.messageEmpresaId!;
  const busca = typeof req.query["busca"] === "string" ? req.query["busca"].trim().slice(0, 80) : "";
  const apenasNaoLidas = req.query["naoLidas"] === "1";
  const linhas = await db.execute(sql`
    SELECT c.id AS "clienteId", c.name AS nome,
           u.nao_lidas AS "naoLidas", u.total,
           u.ultima_em AS "ultimaEm", m.texto AS "ultimaTexto", m.direcao AS "ultimaDirecao"
    FROM (
      SELECT cliente_id,
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE lida_em IS NULL AND direcao = 'entrada')::int AS nao_lidas,
             MAX(recebida_em) AS ultima_em,
             MAX(id) AS ultimo_id
      FROM telegram_inbox_messages
      WHERE empresa_id = ${empresaId}
      GROUP BY cliente_id
    ) u
    JOIN telegram_inbox_messages m ON m.id = u.ultimo_id
    JOIN clients c ON c.id = u.cliente_id
    WHERE c.empresa_id = ${empresaId}
      ${busca ? sql`AND c.name ILIKE ${"%" + busca.replace(/[%_\\]/g, "\\$&") + "%"}` : sql``}
      ${apenasNaoLidas ? sql`AND u.nao_lidas > 0` : sql``}
    ORDER BY u.ultima_em DESC
    LIMIT 200
  `);
  const itens = (linhas.rows as Array<Record<string, unknown>>).map((r) => ({
    clienteId: Number(r["clienteId"]),
    nome: String(r["nome"]),
    naoLidas: Number(r["naoLidas"]),
    total: Number(r["total"]),
    ultimaEm: new Date(String(r["ultimaEm"])).toISOString(),
    ultimaTexto: String(r["ultimaTexto"]).slice(0, 140),
    ultimaDirecao: String(r["ultimaDirecao"]),
  }));
  res.json({ conversas: itens });
});

// ── 5) GET /telegram-inbox/visitantes ────────────────────────────────────────
// Quem escreve no Telegram sem ser cliente: pedidos de agendamento (para a equipe confirmar) e últimas
// mensagens por conversa. O identificador do chat sai mascarado. Mensagens de visitante ainda não
// carregam clínica própria: valem para a clínica padrão (5), a mesma usada pelo webhook.
inboxRouter.get("/telegram-inbox/visitantes", requireCollaborator, requireMessageClinic, async (req, res): Promise<void> => {
  const empresaId = req.messageEmpresaId!;
  const pedidos = await db.execute(sql`
    SELECT id, nome, telefone, modalidade, oferta, status, criado_em AS "criadoEm"
    FROM telegram_pedidos_agendamento WHERE empresa_id = ${empresaId}
    ORDER BY (status = 'novo') DESC, criado_em DESC LIMIT 100`);
  const conversas = empresaId !== 5 ? { rows: [] } : await db.execute(sql`
    SELECT RIGHT(m.chat_id, 4) AS final, m.direcao, m.texto, m.recebida_em AS "ultimaEm", u.total
    FROM (SELECT chat_id, MAX(id) AS ultimo, COUNT(*)::int AS total FROM telegram_visitante_mensagens GROUP BY chat_id) u
    JOIN telegram_visitante_mensagens m ON m.id = u.ultimo ORDER BY m.recebida_em DESC LIMIT 100`);
  res.json({
    pedidos: (pedidos.rows as Array<Record<string, unknown>>).map((r) => ({
      id: Number(r["id"]), nome: String(r["nome"]), telefone: String(r["telefone"]).replace(/\d(?=\d{4})/g, "•"),
      modalidade: r["modalidade"] ?? null, oferta: r["oferta"] ?? null, status: String(r["status"]),
      criadoEm: new Date(String(r["criadoEm"])).toISOString(),
    })),
    conversas: (conversas.rows as Array<Record<string, unknown>>).map((r) => ({
      final: String(r["final"]), ultimaDirecao: String(r["direcao"]), ultimaTexto: String(r["texto"]).slice(0, 140),
      ultimaEm: new Date(String(r["ultimaEm"])).toISOString(), total: Number(r["total"]),
    })),
  });
});

// ── 6) GET /telegram-inbox/painel-operacional ────────────────────────────────
// Dados reais para o painel da Central de Auditoria. Nunca devolve token, segredo, URL do webhook,
// chat id nem texto de mensagem: só presença, contagens e estados.
inboxRouter.get("/telegram-inbox/painel-operacional", requireCollaborator, requireMessageClinic, async (req, res): Promise<void> => {
  const empresaId = req.messageEmpresaId!;
  const [{ getSecretStatus, getSetting }, { checkWebhookHealth }] = await Promise.all([
    import("../lib/secure-settings.js"), import("../lib/telegram-webhook-guard.js"),
  ]);
  const seguro = async <T,>(f: () => Promise<T>): Promise<T | null> => { try { return await f(); } catch { return null; } };
  const [token, segredo, ativo, webhook] = await Promise.all([
    seguro(() => getSecretStatus("telegram.botToken")), seguro(() => getSecretStatus("telegram.webhookSecret")),
    seguro(() => getSetting("telegram.active")), seguro(() => checkWebhookHealth()),
  ]);
  const cont = async (q: ReturnType<typeof sql>) => {
    try { return ((await db.execute(q)).rows as Array<Record<string, unknown>>).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v]))); } catch { return null; }
  };
  const vinculados = await cont(sql`SELECT COUNT(*)::int AS n FROM clients WHERE empresa_id=${empresaId} AND telegram_chat_id IS NOT NULL AND deleted_at IS NULL`);
  const mensagens = await cont(sql`SELECT direcao, COUNT(*)::int AS n, MAX(recebida_em) AS ultima FROM telegram_inbox_messages WHERE empresa_id=${empresaId} GROUP BY direcao`);
  const atendimento = await cont(sql`SELECT r.estado, COUNT(*)::int AS n FROM telegram_atendimento_respostas r
    JOIN telegram_inbox_messages m ON m.id=r.inbox_message_id WHERE m.empresa_id=${empresaId} GROUP BY r.estado`);
  const humano = await cont(sql`SELECT COUNT(*)::int AS n FROM telegram_atendimento a JOIN clients c ON c.id=a.cliente_id WHERE c.empresa_id=${empresaId} AND a.modo='humano'`);
  const orientacoes = await cont(sql`SELECT status, COUNT(*)::int AS n FROM orientacoes_aprovadas WHERE empresa_id=${empresaId} GROUP BY status`);
  const pedidos = await cont(sql`SELECT COUNT(*) FILTER (WHERE status='novo')::int AS novos, COUNT(*)::int AS total FROM telegram_pedidos_agendamento WHERE empresa_id=${empresaId}`);
  const modoIa = (await seguro(() => getSetting("atendimento.ia.modo")))?.trim().toLowerCase() ?? "desligado";
  const modoLembrete = (await seguro(() => getSetting("lembrete.telegram.modo")))?.trim().toLowerCase() ?? "desligado";
  const lista = async (k: string) => { try { const a: unknown = JSON.parse((await getSetting(k)) ?? "[]"); return Array.isArray(a) ? a.length : 0; } catch { return 0; } };
  res.json({
    token: token ? { definido: token.isSet, origem: token.source } : null,
    segredoWebhook: segredo ? { definido: segredo.isSet } : null,
    canalAtivo: ativo === null ? null : ativo === "true",
    webhook: webhook ? {
      consultado: !webhook.mock && !webhook.fetchError, saudavel: webhook.healthy, pendentes: webhook.pendingUpdateCount,
      ultimoErro: webhook.lastErrorMessage ? "registrado" : null, verificadoEm: webhook.checkedAt,
    } : null,
    vinculados: (vinculados?.[0]?.["n"] as number | undefined) ?? null,
    mensagens: mensagens, atendimento, humano: (humano?.[0]?.["n"] as number | undefined) ?? null,
    orientacoes, pedidos: pedidos?.[0] ?? null,
    modos: { atendimentoIa: modoIa, lembretes: modoLembrete, atendimentoLista: await lista("atendimento.ia.permitidos"), lembretesLista: await lista("lembrete.telegram.permitidos") },
  });
});
