/**
 * /api/onboarding — Envio do Guia Digital ao paciente.
 *
 * POST /api/onboarding/enviar-guia  — envia o link por WhatsApp/Telegram (protegido)
 * POST /api/onboarding/evento       — registra evento de analytics (público)
 * GET  /api/onboarding/config       — config de UI por tenant (público)
 * GET  /api/onboarding/minha-config — config da empresa do CEO (protegido)
 * GET  /api/onboarding/stats        — estatísticas tenant-scoped (protegido)
 *
 * Quota diária (dia BRT): max QUOTA_DIARIA envios por (clientId, canal).
 * UPSERT condicional no Postgres garante atomicidade sem race condition.
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { db, clientsTable } from "@workspace/db";
import { eq, sql as sqlRaw } from "drizzle-orm";
import { sendWhatsapp } from "../lib/whatsapp.js";
import { sendTelegram } from "../lib/telegram.js";
import { z } from "zod";

export const onboardingRouter = Router();

// Router público — sem auth
export const onboardingPublicRouter = Router();

// ── Boot migration ────────────────────────────────────────────────────────────
(async () => {
  try {
    await db.execute(sqlRaw`
      CREATE TABLE IF NOT EXISTS onboarding_eventos (
        id         SERIAL PRIMARY KEY,
        empresa_id INT,
        device     TEXT,
        secao      TEXT,
        ts         TIMESTAMPTZ DEFAULT now()
      )
    `);
    await db.execute(sqlRaw`ALTER TABLE onboarding_eventos ADD COLUMN IF NOT EXISTS client_id INT`);
    await db.execute(sqlRaw`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS area_url TEXT`);
    await db.execute(sqlRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS empresas_slug_unique
      ON empresas (slug)
      WHERE slug IS NOT NULL AND slug <> ''
    `);
    await db.execute(sqlRaw`
      CREATE TABLE IF NOT EXISTS onboarding_quota (
        client_id  INT  NOT NULL,
        canal      TEXT NOT NULL,
        dia_brt    DATE NOT NULL,
        enviados   INT  NOT NULL DEFAULT 0,
        PRIMARY KEY (client_id, canal, dia_brt)
      )
    `);
    await db.execute(sqlRaw`
      CREATE TABLE IF NOT EXISTS onboarding_envios (
        id          SERIAL PRIMARY KEY,
        client_id   INT  NOT NULL,
        canal       TEXT NOT NULL,
        enviado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sqlRaw`
      CREATE INDEX IF NOT EXISTS idx_onboarding_envios_client_canal
        ON onboarding_envios (client_id, canal, enviado_em)
    `);
  } catch (e) {
    console.warn("[onboarding] migration warning:", e);
  }
})();

// ── Seções canônicas ──────────────────────────────────────────────────────────
const SECOES_VALIDAS = ["iphone", "android", "computador", "login", "telegram"] as const;

// ── Rate limit em memória ─────────────────────────────────────────────────────
const COOLDOWN_MS = 60_000;
const sendCooldowns = new Map<string, number>();
const QUOTA_DIARIA = 3;

// ── Helpers de quota ──────────────────────────────────────────────────────────
async function tentarReservarQuota(
  clientId: number,
  canal: string,
): Promise<{ ok: true; diaBrt: string } | { ok: false; diaBrt: null }> {
  const result = await db.execute(sqlRaw`
    INSERT INTO onboarding_quota (client_id, canal, dia_brt, enviados)
    VALUES (${clientId}, ${canal}, (NOW() AT TIME ZONE 'America/Sao_Paulo')::date, 1)
    ON CONFLICT (client_id, canal, dia_brt)
    DO UPDATE SET enviados = onboarding_quota.enviados + 1
    WHERE onboarding_quota.enviados < ${QUOTA_DIARIA}
    RETURNING dia_brt::text AS dia_brt
  `);
  if (!Array.isArray(result.rows) || result.rows.length === 0) return { ok: false, diaBrt: null };
  return { ok: true, diaBrt: (result.rows[0] as { dia_brt: string }).dia_brt };
}

async function liberarReservaQuota(clientId: number, canal: string, diaBrt: string): Promise<void> {
  try {
    await db.execute(sqlRaw`
      UPDATE onboarding_quota
         SET enviados = GREATEST(0, enviados - 1)
       WHERE client_id = ${clientId} AND canal = ${canal} AND dia_brt = ${diaBrt}::date
    `);
  } catch (e) {
    console.warn("[onboarding] falha ao liberar reserva de quota:", canal, e);
  }
}

// ── POST /api/onboarding/enviar-guia ─────────────────────────────────────────
const bodySchema = z.object({
  clientId: z.number().int().positive(),
  canais:   z.array(z.enum(["WHATSAPP", "TELEGRAM"])).min(1),
  guiaUrl:  z.string().url(),
});

onboardingRouter.post("/enviar-guia", async (req: Request, res: Response): Promise<void> => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "Parâmetros inválidos", details: parsed.error.flatten() });
    return;
  }

  const { clientId, guiaUrl } = parsed.data;
  const canais = [...new Set(parsed.data.canais)];

  const agora = Date.now();
  const canalBloqueado = canais.find((canal) => agora - (sendCooldowns.get(`${clientId}:${canal}`) ?? 0) < COOLDOWN_MS);
  if (canalBloqueado) {
    res.status(429).json({ ok: false, error: "Aguarde 60 segundos antes de reenviar.", motivo: "cooldown", canal: canalBloqueado });
    return;
  }

  const [cliente] = await db
    .select({ id: clientsTable.id, name: clientsTable.name, phone: clientsTable.phone, telegramChatId: clientsTable.telegramChatId })
    .from(clientsTable).where(eq(clientsTable.id, clientId)).limit(1);

  if (!cliente) { res.status(404).json({ ok: false, error: "Paciente não encontrado" }); return; }

  const canaisReservados: { canal: string; diaBrt: string }[] = [];
  for (const canal of canais) {
    const reserva = await tentarReservarQuota(clientId, canal);
    if (!reserva.ok) {
      for (const r of canaisReservados) await liberarReservaQuota(clientId, r.canal, r.diaBrt);
      res.status(429).json({ ok: false, error: "Limite diário atingido para este canal.", motivo: "limite_diario", canal });
      return;
    }
    canaisReservados.push({ canal, diaBrt: reserva.diaBrt });
  }

  for (const canal of canais) sendCooldowns.set(`${clientId}:${canal}`, agora);

  const primeiroNome = cliente.name.split(" ")[0];
  const mensagem = `🏥 *Instituto Pádua — Seu Guia Digital*

Olá, ${primeiroNome}! 👋

Preparamos um passo a passo especial para você instalar o aplicativo no celular e aprender a usar o Telegram.

É bem simples! Clique no link abaixo e siga as instruções na tela:

👉 ${guiaUrl}

Qualquer dúvida, estamos à disposição! 😊`;

  const resultados: { canal: string; ok: boolean; mensagem: string }[] = [];

  if (canais.includes("WHATSAPP")) {
    if (!cliente.phone) {
      resultados.push({ canal: "WHATSAPP", ok: false, mensagem: "Paciente sem telefone cadastrado." });
    } else {
      try {
        const r = await sendWhatsapp(cliente.phone, mensagem);
        resultados.push({ canal: "WHATSAPP", ok: r.sent, mensagem: r.sent ? "Mensagem enviada com sucesso." : (r.error ?? "Erro ao enviar.") });
      } catch (err: unknown) {
        resultados.push({ canal: "WHATSAPP", ok: false, mensagem: String(err instanceof Error ? err.message : err) });
      }
    }
  }

  if (canais.includes("TELEGRAM")) {
    const chatId = cliente.telegramChatId;
    if (!chatId) {
      resultados.push({ canal: "TELEGRAM", ok: false, mensagem: "Paciente não tem Telegram vinculado. Use WhatsApp primeiro." });
    } else {
      try {
        const r = await sendTelegram(chatId, mensagem.replace(/\*/g, ""));
        resultados.push({ canal: "TELEGRAM", ok: r.sent, mensagem: r.sent ? "Mensagem enviada com sucesso." : (r.error ?? "Erro ao enviar.") });
      } catch (err: unknown) {
        resultados.push({ canal: "TELEGRAM", ok: false, mensagem: String(err instanceof Error ? err.message : err) });
      }
    }
  }

  for (const r of resultados) {
    if (!r.ok) {
      const reserva = canaisReservados.find((c) => c.canal === r.canal);
      if (reserva) await liberarReservaQuota(clientId, r.canal, reserva.diaBrt);
    }
  }

  res.json({ ok: resultados.some((r) => r.ok), resultados });
});

// ── POST /api/onboarding/evento ───────────────────────────────────────────────
// Público. tenant resolve empresa_id no servidor:
//   - ausente → fallback empresa 5 (tráfego legado)
//   - presente mas desconhecido → não grava (evita cross-tenant pollution)
//   - client_id validado contra empresa resolvida antes de associar
const eventoSchema = z.object({
  tenant:    z.string().max(80).optional(),   // slug da clínica — resolve empresa_id no servidor
  device:    z.string().max(50),
  secao:     z.enum(SECOES_VALIDAS),
  client_id: z.number().int().positive().optional(),
});

onboardingPublicRouter.post("/evento", async (req: Request, res: Response): Promise<void> => {
  const parsed = eventoSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() }); return; }
  const { tenant, device, secao, client_id } = parsed.data;

  let empresa_id: number | null = null;
  let validatedClientId: number | null = null;

  try {
    if (!tenant) {
      empresa_id = 5;
    } else {
      const tenantRow = await db.execute(sqlRaw`SELECT id FROM empresas WHERE slug = ${tenant} LIMIT 1`);
      const row = tenantRow.rows[0] as { id: number } | undefined;
      if (!row) { res.json({ ok: true, skipped: "tenant_desconhecido" }); return; }
      empresa_id = row.id;
    }

    if (client_id && empresa_id !== null) {
      const clientRow = await db.execute(sqlRaw`SELECT id FROM clients WHERE id = ${client_id} AND empresa_id = ${empresa_id} LIMIT 1`);
      if ((clientRow.rows[0] as { id: number } | undefined)?.id) validatedClientId = client_id;
    }

    await db.execute(sqlRaw`INSERT INTO onboarding_eventos (empresa_id, device, secao, client_id) VALUES (${empresa_id}, ${device}, ${secao}, ${validatedClientId})`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /api/onboarding/config ────────────────────────────────────────────────
// Público — guia do paciente obtém nome e handle do bot da clínica. Parâmetro: ?tenant=<slug>
onboardingPublicRouter.get("/config", async (req: Request, res: Response): Promise<void> => {
  const slug = String(req.query["tenant"] ?? "").trim().toLowerCase();
  if (!slug) { res.status(400).json({ error: "tenant obrigatório" }); return; }
  try {
    const result = await db.execute(sqlRaw`SELECT nome, telegram_bot_username, area_url FROM empresas WHERE slug = ${slug} LIMIT 1`);
    const row = result.rows[0] as { nome: string; telegram_bot_username: string | null; area_url: string | null } | undefined;
    if (!row) { res.status(404).json({ error: "tenant não encontrado" }); return; }
    res.json({ clinicaNome: row.nome, botHandle: row.telegram_bot_username ?? null, areaUrl: row.area_url ?? null });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /api/onboarding/minha-config ─────────────────────────────────────────
onboardingRouter.get("/minha-config", async (req: Request, res: Response): Promise<void> => {
  const empresaId = req.tenantContext?.empresaId ?? 5;
  try {
    const result = await db.execute(sqlRaw`SELECT nome, slug, telegram_bot_username, area_url FROM empresas WHERE id = ${empresaId} LIMIT 1`);
    const row = result.rows[0] as { nome: string; slug: string | null; telegram_bot_username: string | null; area_url: string | null } | undefined;
    if (!row) { res.status(404).json({ error: "Empresa não encontrada" }); return; }
    res.json({ clinicaNome: row.nome, slug: row.slug ?? null, botHandle: row.telegram_bot_username ?? null, areaUrl: row.area_url ?? null });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /api/onboarding/stats ─────────────────────────────────────────────────
// Agrega os últimos 30 dias escopo por empresa do CEO logado.
onboardingRouter.get("/stats", async (req: Request, res: Response): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const empresaId = req.tenantContext?.empresaId ?? 5;
  try {
    const [totalRow, porDevice, porSecao, pacientesRow, pacientesLista] = await Promise.all([
      db.execute(sqlRaw`SELECT COUNT(*)::int AS total FROM onboarding_eventos WHERE ts > NOW() - INTERVAL '30 days' AND empresa_id = ${empresaId}`),
      db.execute(sqlRaw`SELECT device, COUNT(*)::int AS total FROM onboarding_eventos WHERE ts > NOW() - INTERVAL '30 days' AND empresa_id = ${empresaId} GROUP BY device ORDER BY total DESC`),
      db.execute(sqlRaw`SELECT secao, COUNT(*)::int AS total FROM onboarding_eventos WHERE ts > NOW() - INTERVAL '30 days' AND empresa_id = ${empresaId} GROUP BY secao ORDER BY total DESC`),
      db.execute(sqlRaw`SELECT COUNT(DISTINCT client_id)::int AS pacientes_unicos FROM onboarding_eventos WHERE ts > NOW() - INTERVAL '30 days' AND empresa_id = ${empresaId} AND client_id IS NOT NULL`),
      db.execute(sqlRaw`
        SELECT e.client_id, c.name AS nome, MAX(e.ts)::text AS ultimo_acesso
        FROM onboarding_eventos e
        JOIN clients c ON c.id = e.client_id
        WHERE e.ts > NOW() - INTERVAL '30 days'
          AND e.empresa_id = ${empresaId}
          AND e.client_id IS NOT NULL
        GROUP BY e.client_id, c.name
        ORDER BY MAX(e.ts) DESC
        LIMIT 50
      `),
    ]);

    const total = (totalRow.rows?.[0] as { total: number } | undefined)?.total ?? 0;
    const pacientesUnicos = (pacientesRow.rows?.[0] as { pacientes_unicos: number } | undefined)?.pacientes_unicos ?? 0;

    res.json({
      ok: true,
      total,
      pacientesUnicos,
      porDevice:  (porDevice.rows  ?? []) as { device: string; total: number }[],
      porSecao:   (porSecao.rows   ?? []) as { secao:  string; total: number }[],
      pacientes:  (pacientesLista.rows ?? []) as { client_id: number; nome: string; ultimo_acesso: string }[],
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});
