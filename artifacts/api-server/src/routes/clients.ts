import { Router, type IRouter } from "express";
import { eq, ilike, or, inArray, and, isNull, isNotNull } from "drizzle-orm";
import { resolveEmpresaId } from "../middleware/tenantContext";
import { db, clientsTable, clientPreferredAgendasTable, agendaResourcesTable } from "@workspace/db";
import { sendWhatsapp, isWhatsappConfigured } from "../lib/whatsapp";
import { sendTelegramOnboardingEmail } from "../lib/email-service";
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

// Boot migration — coluna de data de vinculação do Telegram.
// Pacientes vinculados antes desta migração terão telegram_vinculado_em = null.
(async () => {
  try {
    await db.execute(
      sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS telegram_vinculado_em TIMESTAMPTZ`
    );
  } catch (e) {
    console.warn("[clients] migration telegram_vinculado_em:", e);
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

  const empresaId = resolveEmpresaId(req);
  const tenantFilter = eq(clientsTable.empresaId, empresaId);

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

router.post("/clients", async (req, res): Promise<void> => {
  const parsed = CreateClientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { preferredAgendaResourceIds, ...clientData } = parsed.data;
  const empresaId = resolveEmpresaId(req);
  const [client] = await db.insert(clientsTable).values({ ...clientData, empresaId }).returning();
  await setPreferredAgendas(client.id, preferredAgendaResourceIds ?? undefined);
  res.status(201).json(serializeClient(client, await getPreferredAgendas(client.id)));
  // Fire-and-forget: boas-vindas por WPP (não bloqueia a resposta)
  dispararBoasVindas(client.id, client.name, client.phone ?? null).catch(() => {});
});

router.get("/clients/:id", async (req, res): Promise<void> => {
  const params = GetClientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, params.data.id));
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

  const parsed = UpdateClientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { preferredAgendaResourceIds, ...clientData } = parsed.data;
  // Se só vieram agendas (nenhuma coluna do cliente), o Drizzle recusa update().set({}).
  // Nesse caso apenas relemos o cliente e tratamos só a junção.
  let client: ClientRow | undefined;
  if (Object.keys(clientData).length > 0) {
    [client] = await db.update(clientsTable).set(clientData).where(eq(clientsTable.id, params.data.id)).returning();
  } else {
    [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, params.data.id));
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
  // Se só vieram agendas (nenhuma coluna do cliente), o Drizzle recusa update().set({}).
  // Nesse caso apenas relemos o cliente e tratamos só a junção.
  let client: ClientRow | undefined;
  if (Object.keys(clientData).length > 0) {
    [client] = await db.update(clientsTable).set(clientData).where(eq(clientsTable.id, params.data.id)).returning();
  } else {
    [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, params.data.id));
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
    const data = await response.json();
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

// ── POST /api/clients/:id/activate-telegram ───────────────────────────────────
// Gera senha de ativação de 6 dígitos, salva no banco e dispara o e-mail de
// onboarding do Telegram. Requer colaborador autenticado.
router.post("/clients/:id/activate-telegram", requireCollaborator, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "clientId inválido" });
    return;
  }

  // Filtra por tenant: usa o empresaId da identidade autenticada, SEM aceitar
  // override por ?empresaId= — rotas de escrita nunca permitem cross-tenant via query.
  const empresaId = req.tenantContext.empresaId;
  const tenantFilter = and(eq(clientsTable.id, id), eq(clientsTable.empresaId, empresaId));

  const [client] = await db
    .select({
      id: clientsTable.id,
      name: clientsTable.name,
      email: clientsTable.email,
      telegramChatId: clientsTable.telegramChatId,
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

  // Gera senha alfanumérica de 6 caracteres (letras maiúsculas + números)
  // Usa crypto seguro para evitar previsibilidade do PRNG padrão.
  const { randomInt } = await import("node:crypto");
  const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // remove O/0/I/1 p/ evitar confusão visual
  const senha = Array.from({ length: 6 }, () => CHARS[randomInt(CHARS.length)]).join("");

  // Persiste a senha no banco — filtra por tenant também no UPDATE para garantia dupla.
  const updated = await db
    .update(clientsTable)
    .set({ validationPassword: senha })
    .where(tenantFilter)
    .returning({ id: clientsTable.id });

  if (updated.length === 0) {
    res.status(404).json({ error: "Cliente não encontrado ou sem permissão" });
    return;
  }

  // Dispara e-mail de onboarding
  try {
    const result = await sendTelegramOnboardingEmail({
      clientName: client.name,
      clientEmail: client.email,
      validationPassword: senha,
    });
    if (result.success) {
      res.json({ ok: true, message: `Senha gerada e e-mail enviado para ${client.email}` });
    } else {
      // Senha foi salva, mas e-mail falhou — informar sem reverter
      res.status(500).json({ error: result.error ?? "Senha gerada, mas falha no envio do e-mail" });
    }
  } catch (err) {
    res.status(500).json({ error: "erro_activate_telegram", detalhe: String(err) });
  }
});

// ── POST /api/clients/:id/resend-telegram-onboarding ─────────────────────────
// Reenvia o e-mail de onboarding do Telegram usando a senha já gravada em
// clients.validationPassword, SEM gerar uma nova senha.
// Útil quando o e-mail caiu em spam ou o paciente perdeu o acesso.
router.post("/clients/:id/resend-telegram-onboarding", requireCollaborator, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "clientId inválido" });
    return;
  }

  const empresaId = req.tenantContext.empresaId;
  const tenantFilter = and(eq(clientsTable.id, id), eq(clientsTable.empresaId, empresaId));

  const [client] = await db
    .select({
      id: clientsTable.id,
      name: clientsTable.name,
      email: clientsTable.email,
      telegramChatId: clientsTable.telegramChatId,
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
    const result = await sendTelegramOnboardingEmail({
      clientName: client.name,
      clientEmail: client.email,
      validationPassword: client.validationPassword,
    });
    if (result.success) {
      res.json({ ok: true, message: `E-mail reenviado para ${client.email} com a senha existente` });
    } else {
      res.status(500).json({ error: result.error ?? "Falha no reenvio do e-mail" });
    }
  } catch (err) {
    res.status(500).json({ error: "erro_resend_telegram_onboarding", detalhe: String(err) });
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
      detalhe: { sid: resultado.sid, via: resultado.via },
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
