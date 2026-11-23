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

import { BOT_USERNAME, BOT_LINK } from "../lib/telegram-magic-link";
import { Router } from "express";
import {
  db,
  clientsTable,
  telegramInboxTable,
  appSettingsTable,
  empresasTable,
} from "@workspace/db";
import { eq, and, desc, isNull, asc, sql } from "drizzle-orm";
import { requireCollaborator } from "./collaborator";
import { requireMessageClinic } from "../middleware/messageClinic";
import { requireCeoInstance, requirePlatformOwner } from "../middleware/tenantContext";
import { vinculoTelegramAtualUnico } from "../lib/telegram-vinculo-atual";
import { podeAtenderAutomatico } from "../lib/mensageria-credito";
import {
  cancelarAcompanhamentosDaClinica,
  chaveIntervaloAcompanhamentoExame,
  lerIntervaloAcompanhamentoExame,
} from "../lib/telegram-exam-followup-store";
import { isValidExamFollowupHours } from "../lib/telegram-exam-followup-state";
import { setSetting } from "../lib/secure-settings";
import {
  obterBadge,
  listarInbox,
  marcarLidas,
  type MensagemInbox,
} from "../lib/telegram-inbox-flow";

export const inboxRouter = Router();

const TELEGRAM_IA_SETTINGS_LOCK = "paxmed.telegram.atendimento.settings";
type TelegramSettingsTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function readAiSettingsTx(tx: TelegramSettingsTx) {
  const result = await tx.select().from(appSettingsTable)
    .where(sql`${appSettingsTable.key} IN ('atendimento.ia.modo','atendimento.ia.permitidos')`);
  const values = new Map(result.map((row) => [row.key, row.value]));
  const rawMode = values.get("atendimento.ia.modo")?.trim().toLowerCase() ?? "desligado";
  if (rawMode !== "desligado" && rawMode !== "lista" && rawMode !== "ligado") {
    throw new Error("configuracao_atendimento_invalida");
  }
  let allowed: number[] = [];
  const rawAllowed = values.get("atendimento.ia.permitidos");
  if (rawAllowed) {
    const parsed: unknown = JSON.parse(rawAllowed);
    if (!Array.isArray(parsed) || parsed.some((value) => !Number.isSafeInteger(value) || value <= 0)) {
      throw new Error("lista_atendimento_invalida");
    }
    allowed = [...new Set(parsed as number[])];
  }
  return { mode: rawMode, allowed };
}

async function saveAllowedClientsTx(tx: TelegramSettingsTx, ids: number[]) {
  const value = JSON.stringify([...ids].sort((a, b) => a - b));
  await tx.insert(appSettingsTable)
    .values({ key: "atendimento.ia.permitidos", value })
    .onConflictDoUpdate({
      target: appSettingsTable.key,
      set: { value },
    });
}

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

  // Retira o campo `kind` e agrega apenas o estado seguro do atendimento; plano e erros internos não saem da API.
  const { kind: _kind, ...payload } = result;
  const ids = payload.mensagens.map((message) => message.id);
  const resultados = ids.length
    ? await db.execute(sql`SELECT inbox_message_id,estado,desfecho,orientacao_id
        FROM telegram_atendimento_respostas
        WHERE inbox_message_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`,`)})`)
    : { rows: [] };
  const porMensagem = new Map((resultados.rows as Array<Record<string, unknown>>).map((row) => [
    Number(row["inbox_message_id"]),
    {
      estado: String(row["estado"] ?? "pendente"),
      desfecho: row["desfecho"] == null ? null : String(row["desfecho"]),
      orientacaoAprovada: row["orientacao_id"] == null ? false : true,
    },
  ]));
  res.json({
    ...payload,
    mensagens: payload.mensagens.map((message) => ({
      ...message,
      ...(porMensagem.has(message.id) ? { atendimento: porMensagem.get(message.id) } : {}),
    })),
  });
});

// Estado individual e operacional da conversa. Não revela o identificador do chat.
inboxRouter.get("/cockpit/:clientId/telegram-inbox/atendimento", requireCollaborator, requireMessageClinic, async (req, res): Promise<void> => {
  const clienteId = Number(req.params.clientId);
  if (!Number.isSafeInteger(clienteId) || clienteId <= 0) {
    res.status(400).json({ error: "Identificador do cliente inválido." });
    return;
  }
  const empresaId = req.messageEmpresaId!;
  try {
    const [cliente] = await db.select({
      id: clientsTable.id,
      chatId: clientsTable.telegramChatId,
      status: clientsTable.status,
      deletedAt: clientsTable.deletedAt,
    }).from(clientsTable).where(and(
      eq(clientsTable.id, clienteId),
      eq(clientsTable.empresaId, empresaId),
    )).limit(1);
    if (!cliente) {
      res.status(404).json({ error: "Cliente não encontrado nesta clínica." });
      return;
    }
    const config = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${TELEGRAM_IA_SETTINGS_LOCK},0))`);
      return readAiSettingsTx(tx);
    });
    const vinculoUnico = Boolean(
      cliente.chatId && cliente.status === "active" && cliente.deletedAt === null &&
      await vinculoTelegramAtualUnico(db, { clienteId, empresaId, chatId: cliente.chatId }),
    );
    const humanoResult = await db.execute(sql`SELECT modo FROM telegram_atendimento WHERE cliente_id=${clienteId} LIMIT 1`);
    const humano = humanoResult.rows[0] as { modo?: string } | undefined;
    const credito = await podeAtenderAutomatico(empresaId);
    const { getSecretStatus, getSetting } = await import("../lib/secure-settings.js");
    const [token, canalAtivoRaw] = await Promise.all([
      getSecretStatus("telegram.botToken"),
      getSetting("telegram.active"),
    ]);
    const botConfigurado = token.isSet;
    const canalAtivo = canalAtivoRaw === "true";
    const autorizadoIndividualmente = config.allowed.includes(clienteId);
    const habilitadoPeloModo = config.mode === "ligado" || (config.mode === "lista" && autorizadoIndividualmente);
    const pausadoParaEquipe = humano?.modo === "humano";
    res.json({
      clienteId,
      vinculado: Boolean(cliente.chatId),
      vinculoUnico,
      modoGlobal: config.mode,
      botConfigurado,
      canalAtivo,
      autorizadoIndividualmente,
      modoPermiteResposta: habilitadoPeloModo,
      pausadoParaEquipe,
      creditoDisponivel: credito.pode,
      creditoMotivo: credito.motivo ?? null,
      respostaAutomaticaAtiva: habilitadoPeloModo && vinculoUnico && !pausadoParaEquipe && credito.pode && botConfigurado && canalAtivo,
      podeAlterarAutorizacaoIndividual: Boolean(
        req.tenantContext?.authenticated && req.tenantContext.isPlatformOwner && config.mode !== "ligado",
      ),
    });
  } catch {
    res.status(503).json({ error: "Não foi possível confirmar o estado atual do atendimento." });
  }
});

inboxRouter.put("/cockpit/:clientId/telegram-inbox/atendimento", requireCollaborator, requireMessageClinic, requirePlatformOwner, async (req, res): Promise<void> => {
  const clienteId = Number(req.params.clientId);
  const autorizado = req.body?.autorizado;
  if (!Number.isSafeInteger(clienteId) || clienteId <= 0 || typeof autorizado !== "boolean") {
    res.status(400).json({ error: "Informe um cliente válido e um estado de autorização." });
    return;
  }
  const empresaId = req.messageEmpresaId!;
  try {
    const resultado = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${TELEGRAM_IA_SETTINGS_LOCK},0))`);
      const config = await readAiSettingsTx(tx);
      if (config.mode === "ligado") return { kind: "modo_global" as const };
      const [cliente] = await tx.select({
        id: clientsTable.id,
        chatId: clientsTable.telegramChatId,
        status: clientsTable.status,
        deletedAt: clientsTable.deletedAt,
      }).from(clientsTable).where(and(
        eq(clientsTable.id, clienteId),
        eq(clientsTable.empresaId, empresaId),
      )).limit(1);
      if (!cliente) return { kind: "nao_encontrado" as const };
      if (autorizado) {
        if (!cliente.chatId || cliente.status !== "active" || cliente.deletedAt !== null ||
            !await vinculoTelegramAtualUnico(tx, { clienteId, empresaId, chatId: cliente.chatId })) {
          return { kind: "vinculo" as const };
        }
      }
      const ids = new Set(config.allowed);
      if (autorizado) ids.add(clienteId);
      else ids.delete(clienteId);
      await saveAllowedClientsTx(tx, [...ids]);
      return { kind: "salvo" as const, autorizado: ids.has(clienteId) };
    });
    if (resultado.kind === "modo_global") {
      res.status(409).json({ error: "O modo global está ligado e ignora a lista individual. Altere o modo global na Central de Auditoria antes de editar este cliente." });
      return;
    }
    if (resultado.kind === "nao_encontrado") {
      res.status(404).json({ error: "Cliente não encontrado nesta clínica." });
      return;
    }
    if (resultado.kind === "vinculo") {
      res.status(409).json({ error: "A autorização exige um vínculo Telegram ativo e único deste cliente." });
      return;
    }
    res.json({ ok: true, autorizado: resultado.autorizado });
  } catch {
    res.status(503).json({ error: "Não foi possível salvar a autorização individual." });
  }
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
    // Dados públicos do bot (o paciente os vê): permitem à tela montar o QR e o texto de convite.
    bot: { usuario: BOT_USERNAME, link: BOT_LINK },
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

// Interruptor do atendimento automatico (CEO). Valor vale para o ambiente inteiro (app_settings).
// "ligado" = responde todo cliente que ja vinculou o Telegram (deu o start); "lista" = so autorizados.
inboxRouter.put("/telegram-inbox/atendimento-modo", requireCollaborator, requireMessageClinic, requirePlatformOwner, async (req, res): Promise<void> => {
  const modo = typeof req.body?.modo === "string" ? req.body.modo.trim().toLowerCase() : "";
  if (modo !== "desligado" && modo !== "lista" && modo !== "ligado") { res.status(400).json({ error: "modo invalido" }); return; }
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${TELEGRAM_IA_SETTINGS_LOCK},0))`);
    await tx.insert(appSettingsTable)
      .values({ key: "atendimento.ia.modo", value: modo })
      .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: modo } });
  });
  console.info(`[atendimento-ia] modo alterado para ${modo} por profissional ${req.collaborator?.professionalId}`);
  res.json({ ok: true, modo });
});

inboxRouter.get("/telegram-inbox/exam-followups/config", requireCollaborator, requireCeoInstance, async (_req, res): Promise<void> => {
  const companies = await db.select({
    empresaId: empresasTable.id,
    nome: empresasTable.nome,
  }).from(empresasTable).where(and(
    eq(empresasTable.ativa, true),
    eq(empresasTable.status, "ATIVO"),
    eq(empresasTable.tipo, "clinic"),
  )).orderBy(asc(empresasTable.nome));
  const intervals = await Promise.all(companies.map(async (company) => ({
    empresaId: company.empresaId,
    intervalHours: await lerIntervaloAcompanhamentoExame(company.empresaId),
  })));
  const byCompany = new Map(intervals.map((item) => [item.empresaId, item.intervalHours]));
  res.setHeader("Cache-Control", "no-store");
  res.json({
    clinicas: companies.map((company) => ({
      empresaId: company.empresaId,
      nome: company.nome,
      intervalHours: byCompany.get(company.empresaId) ?? null,
    })),
  });
});

inboxRouter.put("/telegram-inbox/exam-followups/config", requireCollaborator, requireCeoInstance, async (req, res): Promise<void> => {
  const empresaId = Number(req.body?.empresaId);
  const intervalHours: unknown = req.body?.intervalHours;
  if (!Number.isSafeInteger(empresaId) || empresaId <= 0 ||
      !(intervalHours === null || isValidExamFollowupHours(intervalHours))) {
    res.status(400).json({ error: "Informe uma clínica e um intervalo entre 1 e 72 horas, ou desative o acompanhamento." });
    return;
  }
  const [company] = await db.select({ id: empresasTable.id }).from(empresasTable).where(and(
    eq(empresasTable.id, empresaId),
    eq(empresasTable.ativa, true),
    eq(empresasTable.status, "ATIVO"),
    eq(empresasTable.tipo, "clinic"),
  )).limit(1);
  if (!company) {
    res.status(404).json({ error: "Clínica ativa não encontrada." });
    return;
  }
  await setSetting(
    chaveIntervaloAcompanhamentoExame(empresaId),
    intervalHours === null ? "off" : String(intervalHours),
  );
  if (intervalHours === null) {
    await cancelarAcompanhamentosDaClinica(db, empresaId, "clinic_disabled");
  }
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, empresaId, intervalHours });
});

// Frases do assistente de agendamento (cadastradas no banco; texto editavel pelo CEO).
inboxRouter.get("/telegram-inbox/frases", requireCollaborator, requireMessageClinic, async (_req, res): Promise<void> => {
  const { listarFrases } = await import("../lib/telegram-frases.js");
  const { ramificacaoDoGrupoDeFrase, arvoreParaTela } = await import("../lib/atendimento-taxonomia.js");
  const frases = await listarFrases();
  res.json({
    frases: (frases as Array<Record<string, unknown>>).map((f) => ({ ...f, ...ramificacaoDoGrupoDeFrase(String(f.grupo ?? "")) })),
    arvore: arvoreParaTela(),
  });
});

inboxRouter.put("/telegram-inbox/frases/:chave", requireCollaborator, requireMessageClinic, requireCeoInstance, async (req, res): Promise<void> => {
  const { validarTextoFrase, gravarFrase } = await import("../lib/telegram-frases.js");
  const chave = String(req.params.chave);
  const texto = req.body?.texto;
  const erro = validarTextoFrase(chave, texto);
  if (erro) { res.status(400).json({ error: erro }); return; }
  await gravarFrase(chave, texto as string, req.collaborator?.professionalId ?? null);
  res.json({ ok: true });
});

// Base Global PAXMED: só intenções e variações genéricas. Painel e licenças são do dono da plataforma.
const porDe = (req: any): string => String(req.collaborator?.professionalId ?? "CEO");
inboxRouter.get("/telegram-inbox/base-global", requireCollaborator, requirePlatformOwner, async (_req, res): Promise<void> => {
  const { painelBaseGlobal } = await import("../lib/base-global-intencoes");
  const { arvoreParaTela } = await import("../lib/atendimento-taxonomia");
  res.json({ ...(await painelBaseGlobal()), arvore: arvoreParaTela() });
});
inboxRouter.get("/telegram-inbox/base-global/intencoes/:id/variacoes", requireCollaborator, requirePlatformOwner, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "Identificador inválido." }); return; }
  const { variacoesDaIntencao } = await import("../lib/base-global-intencoes");
  res.json({ variacoes: await variacoesDaIntencao(id) });
});
inboxRouter.post("/telegram-inbox/base-global/intencoes", requireCollaborator, requirePlatformOwner, async (req, res): Promise<void> => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  if (typeof b.chave !== "string" || typeof b.tronco !== "string" || typeof b.ramo !== "string") { res.status(400).json({ error: "Informe chave, tronco e ramificação." }); return; }
  const { criarIntencaoGlobal } = await import("../lib/base-global-intencoes");
  const ok = await criarIntencaoGlobal({ chave: b.chave, tronco: b.tronco, ramo: b.ramo, descricao: typeof b.descricao === "string" ? b.descricao : "", por: porDe(req) });
  if (!ok) { res.status(400).json({ error: "Chave ou ramificação inválida." }); return; }
  res.json({ ok: true });
});
const alterarEstadoGlobalRota = (tipo: "intencao" | "variacao") => async (req: any, res: any): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || typeof req.body?.ativa !== "boolean") { res.status(400).json({ error: "Informe estado ativo ou inativo." }); return; }
  const { alterarEstadoGlobal } = await import("../lib/base-global-intencoes");
  const ok = await alterarEstadoGlobal({ tipo, id, ativa: req.body.ativa, por: porDe(req) });
  if (!ok) { res.status(404).json({ error: "Registro não encontrado." }); return; }
  res.json({ ok: true });
};
inboxRouter.patch("/telegram-inbox/base-global/intencao/:id/estado", requireCollaborator, requirePlatformOwner, alterarEstadoGlobalRota("intencao"));
inboxRouter.patch("/telegram-inbox/base-global/variacao/:id/estado", requireCollaborator, requirePlatformOwner, alterarEstadoGlobalRota("variacao"));
inboxRouter.put("/telegram-inbox/base-global/licencas/:empresaId", requireCollaborator, requirePlatformOwner, async (req, res): Promise<void> => {
  const empresaId = Number(req.params.empresaId);
  if (!Number.isSafeInteger(empresaId) || empresaId <= 0 || typeof req.body?.contribui !== "boolean" || typeof req.body?.consome !== "boolean") {
    res.status(400).json({ error: "Informe contribui e consome." }); return;
  }
  const { definirLicenca } = await import("../lib/base-global-intencoes");
  await definirLicenca({ empresaId, contribui: req.body.contribui, consome: req.body.consome, por: porDe(req) });
  res.json({ ok: true });
});
// Da própria clínica: ver a licença e promover uma pergunta inédita (limpeza recusa se não for segura).
inboxRouter.get("/telegram-inbox/base-global/minha-licenca", requireCollaborator, requireMessageClinic, requireCeoInstance, async (req, res): Promise<void> => {
  const { lerLicenca } = await import("../lib/base-global-intencoes");
  res.json(await lerLicenca(req.messageEmpresaId!));
});
inboxRouter.post("/telegram-inbox/perguntas-ineditas/:id/promover", requireCollaborator, requireMessageClinic, requireCeoInstance, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || typeof req.body?.intencao !== "string") { res.status(400).json({ error: "Informe a intenção global." }); return; }
  const { promoverVariacaoParaBaseGlobal } = await import("../lib/base-global-intencoes");
  const r = await promoverVariacaoParaBaseGlobal({ empresaId: req.messageEmpresaId!, perguntaInedita: id, intencaoChave: req.body.intencao, por: porDe(req) });
  res.status(r.ok ? 200 : 422).json(r.ok ? { ok: true, criada: r.criada } : { ok: false, motivo: r.motivo });
});

// Sinapses: perguntas inéditas não clínicas por Tronco/Ramificação, isoladas pela clínica autenticada.
inboxRouter.get("/telegram-inbox/perguntas-ineditas", requireCollaborator, requireMessageClinic, requireCeoInstance, async (req, res): Promise<void> => {
  const { listarPerguntasIneditas } = await import("../lib/atendimento-aprendizado-whatsapp");
  const { arvoreParaTela } = await import("../lib/atendimento-taxonomia");
  res.json({ itens: await listarPerguntasIneditas(req.messageEmpresaId!), arvore: arvoreParaTela() });
});

inboxRouter.patch("/telegram-inbox/perguntas-ineditas/:id", requireCollaborator, requireMessageClinic, requireCeoInstance, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { estado, tronco, ramo } = (req.body ?? {}) as { estado?: unknown; tronco?: unknown; ramo?: unknown };
  const { ramificacaoValida } = await import("../lib/atendimento-taxonomia");
  const estadoOk = estado === undefined || estado === "pendente" || estado === "curada" || estado === "descartada";
  const ramoOk = (tronco === undefined && ramo === undefined) || (typeof tronco === "string" && typeof ramo === "string" && ramificacaoValida(tronco, ramo));
  if (!Number.isSafeInteger(id) || id <= 0 || !estadoOk || !ramoOk || (estado === undefined && tronco === undefined)) {
    res.status(400).json({ error: "Informe estado válido ou tronco e ramificação existentes." }); return;
  }
  const { alterarPerguntaInedita } = await import("../lib/atendimento-aprendizado-whatsapp");
  const ok = await alterarPerguntaInedita({
    empresaId: req.messageEmpresaId!, id, estado: estado as "pendente" | "curada" | "descartada" | undefined,
    tronco: tronco as string | undefined, ramo: ramo as string | undefined,
  });
  if (!ok) { res.status(404).json({ error: "Pergunta não encontrada nesta clínica." }); return; }
  res.json({ ok: true });
});

// Perguntas comuns aprendidas com orientação aprovada; leitura e escrita ficam no tenant autenticado.
inboxRouter.get("/telegram-inbox/faq/aprendidas", requireCollaborator, requireMessageClinic, requireCeoInstance, async (req, res): Promise<void> => {
  const { listarFaqAprendidas } = await import("../lib/telegram-aprendiz");
  res.json({ itens: await listarFaqAprendidas(req.messageEmpresaId!) });
});

inboxRouter.get("/telegram-inbox/faq/aprendidas/:id/versoes", requireCollaborator, requireMessageClinic, requireCeoInstance, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "Identificador inválido." }); return; }
  const { listarVersoesFaqAprendida } = await import("../lib/telegram-aprendiz");
  res.json({ versoes: await listarVersoesFaqAprendida(req.messageEmpresaId!, id) });
});

inboxRouter.put("/telegram-inbox/faq/aprendidas/:id", requireCollaborator, requireMessageClinic, requireCeoInstance, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const pergunta = req.body?.pergunta;
  const resposta = req.body?.resposta;
  const variacoes = req.body?.variacoes;
  if (!Number.isSafeInteger(id) || id <= 0 || typeof pergunta !== "string" || typeof resposta !== "string" ||
      !Array.isArray(variacoes) || variacoes.some((v: unknown) => typeof v !== "string")) {
    res.status(400).json({ error: "Informe pergunta, resposta e variações válidas." }); return;
  }
  const { editarFaqAprendida } = await import("../lib/telegram-aprendiz");
  try {
    const ok = await editarFaqAprendida({
      empresaId: req.messageEmpresaId!, id, pergunta, resposta, variacoes,
      por: String(req.collaborator?.professionalId ?? "CEO"),
    });
    if (!ok) { res.status(404).json({ error: "Pergunta aprendida não encontrada nesta clínica." }); return; }
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Não foi possível salvar a pergunta." });
  }
});

inboxRouter.patch("/telegram-inbox/faq/aprendidas/:id/estado", requireCollaborator, requireMessageClinic, requireCeoInstance, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || typeof req.body?.ativa !== "boolean") {
    res.status(400).json({ error: "Informe um estado ativo ou inativo." }); return;
  }
  const { alterarEstadoFaqAprendida } = await import("../lib/telegram-aprendiz");
  const ok = await alterarEstadoFaqAprendida({
    empresaId: req.messageEmpresaId!, id, ativa: req.body.ativa,
    por: String(req.collaborator?.professionalId ?? "CEO"),
  });
  if (!ok) { res.status(404).json({ error: "Pergunta aprendida não encontrada nesta clínica." }); return; }
  res.json({ ok: true });
});

inboxRouter.delete("/telegram-inbox/faq/aprendidas/:id", requireCollaborator, requireMessageClinic, requireCeoInstance, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "Identificador inválido." }); return; }
  const { alterarEstadoFaqAprendida } = await import("../lib/telegram-aprendiz");
  const ok = await alterarEstadoFaqAprendida({
    empresaId: req.messageEmpresaId!, id, remover: true,
    por: String(req.collaborator?.professionalId ?? "CEO"),
  });
  if (!ok) { res.status(404).json({ error: "Pergunta aprendida não encontrada nesta clínica." }); return; }
  res.json({ ok: true });
});

// Painel administrativo: custo informado pelo provedor é exibido sem estimativas ou tarifas novas.
inboxRouter.get("/telegram-inbox/painel-ia", requireCollaborator, requireCeoInstance, async (_req, res): Promise<void> => {
  const { painelUsoTelegramAprendiz } = await import("../lib/telegram-aprendiz");
  res.json({ clinicas: await painelUsoTelegramAprendiz() });
});
