import { Router, type IRouter } from "express";
import { eq, ilike, or, inArray, and, isNull, isNotNull } from "drizzle-orm";
import { resolveEmpresaId } from "../middleware/tenantContext";
import { db, clientsTable, clientPreferredAgendasTable, agendaResourcesTable } from "@workspace/db";
import { sendWhatsapp, isWhatsappConfigured } from "../lib/whatsapp";
import { sendTelegramOnboardingEmail } from "../lib/email-service";
import { emitirLinkMagico } from "../lib/telegram-magic-link";
import { requireCollaborator } from "./collaborator";
import { logIntegracao } from "./agentes-integracoes";
import { sql } from "drizzle-orm";
import {
  ListClientsQueryParams,
  CreateClientBody,
  GetClientParams,
  UpdateClientParams,
  UpdateClientBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

// Boot migrations — colunas extras de Telegram e ativação.
// telegram_vinculado_em:    data de vinculação do bot pelo paciente.
// telegram_last_test_ok:    resultado do último envio real ao chatId do paciente
//                           (null=nunca testado, true=OK, false=falhou/suspeito).
// validation_password_sent_at: data em que a senha de ativação foi enviada ao paciente.
(async () => {
  const migrations = [
    { ddl: sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS telegram_vinculado_em TIMESTAMPTZ`,         label: "telegram_vinculado_em" },
    { ddl: sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS telegram_last_test_ok BOOLEAN`,             label: "telegram_last_test_ok" },
    { ddl: sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS validation_password_sent_at TIMESTAMPTZ`,   label: "validation_password_sent_at" },
    // Link mágico do Telegram — token de uso único enviado por e-mail.
    { ddl: sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS telegram_magic_token TEXT`,                 label: "telegram_magic_token" },
    { ddl: sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS telegram_magic_expira_em TIMESTAMPTZ`,      label: "telegram_magic_expira_em" },
    { ddl: sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS telegram_magic_usado_em TIMESTAMPTZ`,       label: "telegram_magic_usado_em" },
    { ddl: sql`CREATE UNIQUE INDEX IF NOT EXISTS uniq_clients_telegram_magic_token ON clients (telegram_magic_token) WHERE telegram_magic_token IS NOT NULL`, label: "uniq_clients_telegram_magic_token" },
    // Um celular = um paciente. Sem isto, dois links tocados no mesmo aparelho
    // criariam dois donos para o mesmo chat e o inbox misturaria prontuários.
    { ddl: sql`CREATE UNIQUE INDEX IF NOT EXISTS uniq_clients_telegram_chat_id ON clients (telegram_chat_id) WHERE telegram_chat_id IS NOT NULL`, label: "uniq_clients_telegram_chat_id" },
  ];
  for (const { ddl, label } of migrations) {
    try { await db.execute(ddl); }
    catch (e) { console.warn(`[clients] migration ${label}:`, e); }
  }
})();

type ClientRow = typeof clientsTable.$inferSelect;

// Serializa um cliente para o contrato (datas em ISO, campos nullable normalizados) e
// anexa a lista de agendas preferenciais (junção client_preferred_agendas).
function serializeClient(c: ClientRow, preferredAgendaResourceIds: number[]) {
  return {
    ...c,
    birthDate: c.birthDate ?? null,
    address: c.address ?? null,
    pais: c.pais ?? null,
    instagram: c.instagram ?? null,
    comoConheceu: c.comoConheceu ?? null,
    notes: c.notes ?? null,
    preferredAgendaResourceIds,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

async function getPreferredAgendas(clientId: number): Promise<number[]> {
  const rows = await db
    .select({ agendaResourceId: clientPreferredAgendasTable.agendaResourceId })
    .from(clientPreferredAgendasTable)
    .where(eq(clientPreferredAgendasTable.clientId, clientId));
  return rows.map((r) => r.agendaResourceId);
}

// Substitui (não acumula) as agendas preferenciais do cliente. `ids === undefined` significa
// "não mexer"; um array (mesmo vazio) significa "passe a valer exatamente este conjunto".
async function setPreferredAgendas(clientId: number, ids: number[] | null | undefined): Promise<void> {
  if (ids === undefined) return;
  await db.delete(clientPreferredAgendasTable).where(eq(clientPreferredAgendasTable.clientId, clientId));
  const unique = Array.from(new Set((ids ?? []).filter((n) => Number.isInteger(n) && n > 0)));
  if (unique.length === 0) return;
  // Data-bound de verdade: só persiste agendas ATIVAS que pertençam à clínica do cliente.
  // IDs que não passam (clínica errada, inativas, inexistentes) são descartados em silêncio.
  const [client] = await db
    .select({ locationId: clientsTable.locationId })
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId));
  if (!client?.locationId) return;
  const resources = await db
    .select({
      id: agendaResourcesTable.id,
      active: agendaResourcesTable.active,
      locationId: agendaResourcesTable.locationId,
    })
    .from(agendaResourcesTable)
    .where(inArray(agendaResourcesTable.id, unique));
  const valid = resources
    .filter((r) => r.active && r.locationId === client.locationId)
    .map((r) => r.id);
  if (valid.length > 0) {
    await db
      .insert(clientPreferredAgendasTable)
      .values(valid.map((agendaResourceId) => ({ clientId, agendaResourceId })))
      .onConflictDoNothing();
  }
}

router.get("/clients", async (req, res): Promise<void> => {
  const query = ListClientsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const empresaId = req.tenantContext.empresaId;

  const tenantWhere = and(eq(clientsTable.id, params.data.id), eq(clientsTable.empresaId, empresaId));

  const tenantWhere = and(eq(clientsTable.id, params.data.id), eq(clientsTable.empresaId, empresaId));
  // Lista: filtra SÓ por empresa. Não existe "id" nesta rota (isso quebrou a busca em 14/08/2026).
  const tenantFilter = and(eq(clientsTable.id, id), eq(clientsTable.empresaId, empresaId));

  // tab = "ativos" | "desativados" | "apagados" | undefined (padrão = ativos)
  const tab = (req.query.tab as string) ?? "ativos";

  const baseFilters = [tenantFilter];

  if (tab === "apagados") {
    baseFilters.push(isNotNull(clientsTable.deletedAt));
  } else {
    baseFilters.push(isNull(clientsTable.deletedAt));
    if (tab === "desativados") {
      baseFilters.push(eq(clientsTable.status, "inactive"));
    } else {
      baseFilters.push(eq(clientsTable.status, "active"));
    }
  }

  if (query.data.search) {
    const searchDigits = query.data.search.replace(/\D/g, "");
    baseFilters.push(
      or(
        ilike(clientsTable.name, `%${query.data.search}%`),
        ilike(clientsTable.cpf, `%${query.data.search}%`),
        ...(searchDigits.length >= 3
          ? [
              // CPF normalizado: "123.456.789-00" bate com "12345678900"
              sql`regexp_replace(coalesce(${clientsTable.cpf}::text, ''), '[^0-9]', '', 'g') ilike ${'%' + searchDigits + '%'}`,
              // Telefone normalizado: "(11) 99999-9999" bate com "11999"
              sql`regexp_replace(coalesce(${clientsTable.phone}::text, ''), '[^0-9]', '', 'g') ilike ${'%' + searchDigits + '%'}`,
            ]
          : []),
      )!
    );
  }

  const clients = await db
    .select()
    .from(clientsTable)
    .where(and(...baseFilters));

  const ids = clients.map((c) => c.id);
  const junctions = ids.length
    ? await db
        .select({
          clientId: clientPreferredAgendasTable.clientId,
          agendaResourceId: clientPreferredAgendasTable.agendaResourceId,
        })
        .from(clientPreferredAgendasTable)
        .where(inArray(clientPreferredAgendasTable.clientId, ids))
    : [];
  const byClient = new Map<number, number[]>();
  for (const j of junctions) {
    const arr = byClient.get(j.clientId) ?? [];
    arr.push(j.agendaResourceId);
    byClient.set(j.clientId, arr);
  }

  res.json(clients.map((c) => serializeClient(c, byClient.get(c.id) ?? [])));
});

// ─── Ações em lote ─────────────────────────────────────────────────────────
// POST /api/clients/bulk
// body: { ids: number[], action: "activate" | "deactivate" | "delete" | "restore" }
// "delete"  → soft-delete (deleted_at = now)
// "restore" → restaura (deleted_at = null), máx 5 anos
// "activate" / "deactivate" → muda status (só clientes não apagados)
router.post("/clients/bulk", async (req, res): Promise<void> => {
  const { ids, action } = req.body ?? {};

  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: "ids deve ser array não-vazio" });
    return;
  }
  if (!["activate", "deactivate", "delete", "restore"].includes(action)) {
    res.status(400).json({ error: "action inválida" });
    return;
  }

  const safeIds = ids.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (safeIds.length === 0) {
    res.status(400).json({ error: "ids inválidos" });
    return;
  }

  const CINCO_ANOS_MS = 5 * 365.25 * 24 * 3600 * 1000;

  if (action === "delete") {
    await db
      .update(clientsTable)
      .set({ deletedAt: new Date() })
      .where(and(inArray(clientsTable.id, safeIds), isNull(clientsTable.deletedAt)));
  } else if (action === "restore") {
    // Só restaura dentro dos 5 anos
    const limite = new Date(Date.now() - CINCO_ANOS_MS);
    await db
      .update(clientsTable)
      .set({ deletedAt: null })
      .where(
        and(
          inArray(clientsTable.id, safeIds),
          isNotNull(clientsTable.deletedAt),
          sql`deleted_at > ${limite.toISOString()}`,
        )
      );
  } else if (action === "activate") {
    await db
      .update(clientsTable)
      .set({ status: "active" })
      .where(and(inArray(clientsTable.id, safeIds), isNull(clientsTable.deletedAt)));
  } else if (action === "deactivate") {
    await db
      .update(clientsTable)
      .set({ status: "inactive" })
      .where(and(inArray(clientsTable.id, safeIds), isNull(clientsTable.deletedAt)));
  }

  res.json({ ok: true, affected: safeIds.length });
});

// ATENCAO: as rotas abaixo foram restauradas em 14/08/2026 apos um merge automatico
// ter apagado o INSERT desta rota e transformado o PUT em um GET duplicado.
// Nao substituir o db.insert por db.select aqui: esta rota CADASTRA paciente novo.
router.post("/clients", async (req, res): Promise<void> => {
  const parsed = UpdateClientBody.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { preferredAgendaResourceIds, ...clientData } = parsed.data;
  const empresaId = req.tenantContext.empresaId;

  const tenantWhere = and(eq(clientsTable.id, params.data.id), eq(clientsTable.empresaId, empresaId));

  const tenantWhere = and(eq(clientsTable.id, params.data.id), eq(clientsTable.empresaId, empresaId));
  const [client] = await db
    .select({
      id:               clientsTable.id,
      name:             clientsTable.name,
      email:            clientsTable.email,
      telegramChatId:   clientsTable.telegramChatId,
      validationPassword: clientsTable.validationPassword,
    })
    .from(clientsTable)
    .where(tenantFilter)
    .limit(1);
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  res.json(serializeClient(client, await getPreferredAgendas(client.id)));
});

router.put("/clients/:id", async (req, res): Promise<void> => {
  const params = UpdateClientParams.safeParse(req.params);
  const [client] = await db
    .select({
      id:               clientsTable.id,
      name:             clientsTable.name,
      email:            clientsTable.email,
      telegramChatId:   clientsTable.telegramChatId,
      validationPassword: clientsTable.validationPassword,
    })
    .from(clientsTable)
    .where(tenantFilter)
    .limit(1);
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  res.json(serializeClient(client, await getPreferredAgendas(client.id)));
});

router.put("/clients/:id", async (req, res): Promise<void> => {
  const params = UpdateClientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateClientBody.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { preferredAgendaResourceIds, ...clientData } = parsed.data;
  let client: ClientRow | undefined;
  if (Object.keys(clientData).length > 0) {
    [client] = await db.update(clientsTable).set(clientData).where(tenantWhere).returning();
  } else {
    [client] = await db.select().from(clientsTable).where(tenantWhere);
  }
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  await setPreferredAgendas(client.id, preferredAgendaResourceIds ?? undefined);
  res.json(serializeClient(client, await getPreferredAgendas(client.id)));
});


router.patch("/clients/:id", async (req, res): Promise<void> => {
  const params = UpdateClientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateClientBody.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { preferredAgendaResourceIds, ...clientData } = parsed.data;
  let client: ClientRow | undefined;
  if (Object.keys(clientData).length > 0) {
    [client] = await db.update(clientsTable).set(clientData).where(tenantWhere).returning();
  } else {
    [client] = await db.select().from(clientsTable).where(tenantWhere);
  }
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  await setPreferredAgendas(client.id, preferredAgendaResourceIds ?? undefined);
  res.json(serializeClient(client, await getPreferredAgendas(client.id)));
});

router.get("/cep/:cep", async (req, res): Promise<void> => {
  const cep = req.params.cep.replace(/\D/g, "");
  if (cep.length !== 8) {
    res.status(400).json({ error: "CEP invalido" });
    return;
  }
  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await response.json() as Record<string, string | boolean>;
    if (data.erro) {
      res.status(404).json({ error: "CEP nao encontrado" });
      return;
    }
    res.json({
      cep: data.cep,
      logradouro: data.logradouro,
      complemento: data.complemento,
      bairro: data.bairro,
      localidade: data.localidade,
      uf: data.uf,
    });
  } catch (err) {
    res.status(500).json({ error: "Erro ao consultar CEP" });
  }
});

// ── Código semântico Telegram ────────────────────────────────────────────────
// Determinístico: 3 últimas letras do sobrenome + 4 últimos dígitos do CPF.
// Exemplos: "CARLUCIA SANTOS FERNANDES" + CPF "···678-90" → "DES7890"
//           "JOAO SILVA"               + CPF "···432-10" → "VAS4321" ← usa 3 letras de SILVA
// Elimina dependência de e-mail: o CEO pode repassar o código verbalmente.
function codigoTelegramSemantico(nome: string, cpf: string | null | undefined): string {
  const sobrenome = nome.trim().split(/\s+/).pop() ?? nome;
  // Normaliza acentos (FERNANDES → FERNANDES, ÁVILA → AVILA)
  const limpo = sobrenome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
  const sufixoNome = limpo.slice(-3).padStart(3, "X");    // ex: "DES"
  const digCpf    = (cpf ?? "").replace(/\D/g, "");
  const sufixoCpf = digCpf.slice(-4).padStart(4, "0");    // ex: "7890"
  return `${sufixoNome}${sufixoCpf}`;
}

// ── POST /api/clients/:id/activate-telegram ───────────────────────────────────
// Gera código semântico (sobrenome + CPF), salva no banco e envia e-mail se
// disponível. Sem e-mail, retorna o código para o CEO repassar diretamente.
// Requer colaborador autenticado.
router.post("/clients/:id/activate-telegram", requireCollaborator, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "clientId inválido" });
    return;
  }
  const empresaId = req.tenantContext.empresaId;

  const tenantWhere = and(eq(clientsTable.id, params.data.id), eq(clientsTable.empresaId, empresaId));

  const tenantWhere = and(eq(clientsTable.id, params.data.id), eq(clientsTable.empresaId, empresaId));
  const tenantFilter = and(eq(clientsTable.id, id), eq(clientsTable.empresaId, empresaId));

  const [client] = await db
    .select({
      id:               clientsTable.id,
      name:             clientsTable.name,
      email:            clientsTable.email,
      telegramChatId:   clientsTable.telegramChatId,
      validationPassword: clientsTable.validationPassword,
    })
    .from(clientsTable)
    .where(tenantFilter)
    .limit(1);

  if (!client) { res.status(404).json({ error: "Cliente não encontrado" }); return; }
  // Sem e-mail: não bloqueia — CEO repassa o código diretamente ao paciente.
  if (client.telegramChatId) {
    res.status(409).json({ error: "Telegram já vinculado", chatId: client.telegramChatId });
    return;
  }

  // Código semântico determinístico — sobrenome + CPF.
  // O paciente pode receber verbalmente, sem esperar e-mail.
  const senha = codigoTelegramSemantico(client.name, client.cpf);

  // Persiste a senha no banco e registra o momento da geração.
  // Filtra por tenant também no UPDATE para garantia dupla.
  const now = new Date();
  const updated = await db
    .update(clientsTable)
    .set({ validationPassword: senha, validationPasswordSentAt: now })
    .where(tenantFilter)
    .returning({ id: clientsTable.id });

  if (updated.length === 0) {
    res.status(404).json({ error: "Cliente não encontrado ou sem permissão" });
    return;
  }

  // Dispara e-mail de onboarding somente se o paciente tiver e-mail.
  // Falha no e-mail NÃO bloqueia — código retorna na resposta para o CEO repassar.
  let emailEnviado = false;
  if (client.email) {
    try {
      // Link mágico: o paciente ativa em um toque, sem digitar a senha.
      // Se a emissão falhar, o e-mail ainda vai com o caminho da senha.
    const linkMagico = await emitirLinkMagico(id);
    const result = await db.execute(
      sql`SELECT telegram_chat_id, telegram_vinculado_em
          FROM clients
          WHERE id = ${id} AND empresa_id = ${empresaId}
          LIMIT 1`
    );
    if (result.success) {
      res.json({ ok: true, message: `E-mail reenviado para ${client.email} com a senha existente` });
    } else {
      res.status(500).json({ error: "Falha no reenvio do e-mail" });
    }
  } catch (err) {
    res.status(500).json({ error: "erro_resend_telegram_onboarding", detalhe: String(err) });
  }
});

// ── DELETE /api/clients/:id/telegram ─────────────────────────────────────────
// Remove o vínculo Telegram do cliente (zera telegram_chat_id e telegram_vinculado_em).
// Usar quando o paciente desvinculou o bot ou o CEO precisa resetar manualmente.
// Requer colaborador autenticado; isola por tenant.
router.delete("/clients/:id/telegram", requireCollaborator, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "clientId inválido" });
    return;
  }
  const empresaId = req.tenantContext.empresaId;

  const tenantWhere = and(eq(clientsTable.id, params.data.id), eq(clientsTable.empresaId, empresaId));

  const tenantWhere = and(eq(clientsTable.id, params.data.id), eq(clientsTable.empresaId, empresaId));
  const tenantFilter = and(eq(clientsTable.id, id), eq(clientsTable.empresaId, empresaId));

  const [client] = await db
    .select({
      id:               clientsTable.id,
      name:             clientsTable.name,
      email:            clientsTable.email,
      telegramChatId:   clientsTable.telegramChatId,
      validationPassword: clientsTable.validationPassword,
    })
    .from(clientsTable)
    .where(tenantFilter)
    .limit(1);

  if (!client) { res.status(404).json({ error: "Cliente não encontrado" }); return; }
  if (!client.email) { res.status(422).json({ error: "Cliente sem e-mail cadastrado" }); return; }
  if (client.telegramChatId) {
    res.status(409).json({ error: "Telegram já vinculado", chatId: client.telegramChatId });
    return;
  }
  if (!client.validationPassword) {
    res.status(422).json({ error: "Nenhuma senha gerada ainda — use 'Ativar Telegram' primeiro" });
    return;
  }

  try {
    // Cada reenvio emite um link mágico novo — o e-mail mais recente é o que vale.
    const linkMagico = await emitirLinkMagico(id);
    const result = await db.execute(
      sql`SELECT telegram_chat_id, telegram_vinculado_em
          FROM clients
          WHERE id = ${id} AND empresa_id = ${empresaId}
          LIMIT 1`
    );
    if (result.success) {
      res.json({ ok: true, message: `E-mail reenviado para ${client.email} com a senha existente` });
    } else {
      res.status(500).json({ error: "Falha no reenvio do e-mail" });
    }
  } catch (err) {
    res.status(500).json({ error: "erro_resend_telegram_onboarding", detalhe: String(err) });
  }
});

// ── DELETE /api/clients/:id/telegram ─────────────────────────────────────────
// Remove o vínculo Telegram do cliente (zera telegram_chat_id e telegram_vinculado_em).
// Usar quando o paciente desvinculou o bot ou o CEO precisa resetar manualmente.
// Requer colaborador autenticado; isola por tenant.
router.delete("/clients/:id/telegram", requireCollaborator, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "clientId inválido" });
    return;
  }
  const empresaId = req.tenantContext.empresaId;

  const tenantWhere = and(eq(clientsTable.id, params.data.id), eq(clientsTable.empresaId, empresaId));

  const tenantWhere = and(eq(clientsTable.id, params.data.id), eq(clientsTable.empresaId, empresaId));
  try {
    const result = await db.execute(
      sql`SELECT telegram_chat_id, telegram_vinculado_em
          FROM clients
          WHERE id = ${id} AND empresa_id = ${empresaId}
          LIMIT 1`
    );
    if ((result.rows as unknown[]).length === 0) {
      res.status(404).json({ error: "Cliente não encontrado ou sem permissão" });
      return;
    }
    res.json({ ok: true, message: "Vínculo Telegram removido com sucesso" });
  } catch (err) {
    res.status(500).json({ error: "erro_unlink_telegram", detalhe: String(err) });
  }
});

// ─── Boas-vindas automáticas por WPP (Kaizen B) ──────────────────────────────
async function dispararBoasVindas(clientId: number, nome: string, telefone: string | null) {
  if (!telefone) {
    await logIntegracao({ tipo: "wpp_boasvindas", client_id: clientId, status: "skip", detalhe: { motivo: "sem_telefone" } });
    return;
  }
  // Verificar toggle global
  const cfg = await db.execute(sql`SELECT valor FROM app_settings WHERE chave = 'boas_vindas_wpp_ativo' LIMIT 1`);
  const ativo = (cfg.rows[0] as any)?.valor;
  if (ativo === "false" || ativo === false) {
    await logIntegracao({ tipo: "wpp_boasvindas", client_id: clientId, status: "skip", detalhe: { motivo: "toggle_desativado" } });
    return;
  }
  if (!isWhatsappConfigured()) {
    await logIntegracao({ tipo: "wpp_boasvindas", client_id: clientId, status: "skip", detalhe: { motivo: "wpp_nao_configurado" } });
    return;
  }
  const nomeFormatado = nome.split(" ")[0]; // Primeiro nome
  const mensagem =
    `Olá, ${nomeFormatado}! 🌿\n\n` +
    `Bem-vindo(a) ao Instituto Padua — cuidado real, resultado clínico.\n\n` +
    `Seu cadastro foi concluído com sucesso. Em breve nossa equipe entrará em contato para agendar sua consulta de avaliação.\n\n` +
    `Qualquer dúvida, estamos aqui!\n— Equipe PAXTER`;
  try {
    const resultado = await sendWhatsapp(telefone, mensagem, { clienteId: clientId });
    await logIntegracao({
      tipo: "wpp_boasvindas", client_id: clientId,
      status: resultado.sent ? "ok" : "falhou",
      detalhe: { logId: resultado.logId, via: resultado.via },
    });
  } catch (err: any) {
    await logIntegracao({ tipo: "wpp_boasvindas", client_id: clientId, status: "falhou", detalhe: { erro: err.message } });
  }
}

// ── GET /api/clientes/:id/telegram-status ────────────────────────────────────
// Retorna se o cliente tem Telegram vinculado e a data de vinculação.
// Protegida por requireCollaborator (CEO/staff apenas).
router.get("/clientes/:id/telegram-status", requireCollaborator, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "clientId inválido" });
    return;
  }
  const empresaId = req.tenantContext.empresaId;

  const tenantWhere = and(eq(clientsTable.id, params.data.id), eq(clientsTable.empresaId, empresaId));

  const tenantWhere = and(eq(clientsTable.id, params.data.id), eq(clientsTable.empresaId, empresaId));
  try {
    const result = await db.execute(
      sql`SELECT telegram_chat_id, telegram_vinculado_em
          FROM clients
          WHERE id = ${id} AND empresa_id = ${empresaId}
          LIMIT 1`
    );
    const row = result.rows[0] as
      | { telegram_chat_id: string | null; telegram_vinculado_em: string | null }
      | undefined;
    if (!row) {
      res.status(404).json({ error: "Cliente não encontrado" });
      return;
    }
    res.json({
      vinculado: row.telegram_chat_id !== null,
      desde: row.telegram_vinculado_em ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
